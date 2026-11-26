require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const SibApiV3Sdk = require('sib-api-v3-sdk');
const { createClient } = require('@supabase/supabase-js');

/* ---------- Required environment variables ---------- */
const REQUIRED = ['BREVO_API_KEY', 'SENDER_EMAIL', 'ADMIN_MAIL', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'JWT_SECRET'];
const missing = REQUIRED.filter(k => !process.env[k]);
if (missing.length) {
  console.error('Missing environment variables: ' + missing.join(', '));
  process.exit(1);
}

const app = express();

/* CORS: set FRONTEND_URL (comma separated) to lock to your site; if empty, allows all */
const origins = (process.env.FRONTEND_URL || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors(origins.length ? { origin: origins } : {}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* Payment screenshot upload: memory, max 5 MB, images only */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\//.test(file.mimetype))
});

/* Brevo */
const defaultClient = SibApiV3Sdk.ApiClient.instance;
defaultClient.authentications['api-key'].apiKey = process.env.BREVO_API_KEY;
const mailApi = new SibApiV3Sdk.TransactionalEmailsApi();

/* Supabase (service role key: server only, never put it in the HTML) */
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const JWT_SECRET = process.env.JWT_SECRET;
const normEmail = e => String(e || '').trim().toLowerCase();
const isEmail = e => /^\S+@\S+\.\S+$/.test(e);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const signToken = (email, name) => jwt.sign({ email, name: name || '' }, JWT_SECRET, { expiresIn: '30d' });

/* ---------- OTP store (in memory: pending OTPs are lost if Render restarts, users just request again) ---------- */
const otpStore = new Map(); // email -> { otp, expires, attempts, name, sentAt }
setInterval(() => { const n = Date.now(); for (const [k, v] of otpStore) if (v.expires < n) otpStore.delete(k); }, 60 * 1000).unref();

/* ---------- Auth middleware ---------- */
function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    res.status(401).json({ success: false, message: 'లాగిన్ అవసరం. మళ్ళీ లాగిన్ అవ్వండి.' });
  }
}

/* 1. Send OTP (signup: {email,name}  |  forgot password: {email}) */
app.post('/api/send-otp', async (req, res) => {
  try {
    const email = normEmail(req.body.email);
    const name = String(req.body.name || '').trim().slice(0, 80);
    if (!isEmail(email)) return res.status(400).json({ success: false, message: 'సరైన ఈమెయిల్ ఇవ్వండి' });

    const { data: user } = await supabase.from('users').select('id').eq('email', email).maybeSingle();
    if (name && user) return res.status(409).json({ success: false, message: 'ఈ ఈమెయిల్‌తో ఖాతా ఇప్పటికే ఉంది. లాగిన్ చేయండి లేదా Forgot password వాడండి.' });
    if (!name && !user) return res.status(404).json({ success: false, message: 'ఈ ఈమెయిల్‌తో ఖాతా లేదు. ముందు Sign Up చేయండి.' });

    const prev = otpStore.get(email);
    if (prev && Date.now() - prev.sentAt < 60 * 1000) {
      return res.status(429).json({ success: false, message: 'ఒక నిమిషం ఆగి మళ్ళీ OTP అడగండి.' });
    }

    const otp = crypto.randomInt(100000, 1000000).toString();
    otpStore.set(email, { otp, expires: Date.now() + 10 * 60 * 1000, attempts: 0, name, sentAt: Date.now() });

    const mail = new SibApiV3Sdk.SendSmtpEmail();
    mail.sender = { name: 'J-Mart', email: process.env.SENDER_EMAIL };
    mail.to = [{ email }];
    mail.subject = 'Your J-Mart OTP code';
    mail.htmlContent = `<p>Your verification code for J-Mart is: <strong>${otp}</strong></p><p>ఈ కోడ్ 10 నిమిషాలు మాత్రమే పనిచేస్తుంది. ఎవరికీ చెప్పకండి.</p>`;
    await mailApi.sendTransacEmail(mail);

    res.json({ success: true, message: 'OTP విజయవంతంగా పంపబడింది!' });
  } catch (error) {
    console.error('Send OTP Error:', error);
    res.status(500).json({ success: false, message: 'OTP పంపడంలో సర్వర్ లోపం' });
  }
});

/* 2. Verify OTP -> returns a login token */
app.post('/api/verify-otp', async (req, res) => {
  try {
    const email = normEmail(req.body.email);
    const otp = String(req.body.otp || '').trim();
    if (!email || !otp) return res.status(400).json({ success: false, message: 'ఈమెయిల్ లేదా OTP ఇవ్వలేదు' });

    const rec = otpStore.get(email);
    if (!rec || rec.expires < Date.now()) {
      otpStore.delete(email);
      return res.status(400).json({ success: false, message: 'OTP గడువు ముగిసింది. కొత్త OTP అడగండి.' });
    }
    if (++rec.attempts > 5) {
      otpStore.delete(email);
      return res.status(429).json({ success: false, message: 'చాలా తప్పు ప్రయత్నాలు. కొత్త OTP అడగండి.' });
    }
    const ok = rec.otp.length === otp.length && crypto.timingSafeEqual(Buffer.from(rec.otp), Buffer.from(otp));
    if (!ok) return res.status(400).json({ success: false, message: 'తప్పు OTP ఎంటర్ చేశారు' });

    otpStore.delete(email);
    const { data: user } = await supabase.from('users').select('name').eq('email', email).maybeSingle();
    const name = (user && user.name) || rec.name || '';
    res.json({ success: true, message: 'OTP సరిపోలింది', token: signToken(email, name), name });
  } catch (error) {
    console.error('Verify OTP Error:', error);
    res.status(500).json({ success: false, message: 'సర్వర్ లోపం' });
  }
});

/* 3. Set / reset password (needs the token from verify-otp or login). Creates the user if new. */
app.post('/api/set-password', auth, async (req, res) => {
  try {
    const password = String(req.body.password || '');
    if (password.length < 6 || password.length > 100) {
      return res.status(400).json({ success: false, message: 'పాస్‌వర్డ్ కనీసం 6 అక్షరాలు ఉండాలి.' });
    }
    const email = req.user.email;
    const hash = await bcrypt.hash(password, 10);

    const { data: user } = await supabase.from('users').select('id').eq('email', email).maybeSingle();
    let error;
    if (user) ({ error } = await supabase.from('users').update({ password_hash: hash }).eq('id', user.id));
    else ({ error } = await supabase.from('users').insert([{ email, name: req.user.name || '', password_hash: hash }]));
    if (error) throw error;

    res.json({ success: true, message: 'పాస్‌వర్డ్ సేవ్ అయింది' });
  } catch (error) {
    console.error('Set password error:', error);
    res.status(500).json({ success: false, message: 'పాస్‌వర్డ్ సేవ్ చేయడంలో సర్వర్ లోపం' });
  }
});

/* 4. Login with email + password */
app.post('/api/login', async (req, res) => {
  try {
    const email = normEmail(req.body.email);
    const password = String(req.body.password || '');
    if (!isEmail(email) || !password) return res.status(400).json({ success: false, message: 'ఈమెయిల్, పాస్‌వర్డ్ ఇవ్వండి.' });

    const { data: user } = await supabase.from('users').select('name, password_hash').eq('email', email).maybeSingle();
    const ok = user && await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ success: false, message: 'ఈమెయిల్ లేదా పాస్‌వర్డ్ తప్పు.' });

    res.json({ success: true, token: signToken(email, user.name), name: user.name || '' });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'లాగిన్‌లో సర్వర్ లోపం' });
  }
});

/* 5. Place order (login required; COD or UPI with screenshot, UPI stays Pending until you verify) */
app.post('/api/place-order', auth, (req, res, next) => {
  upload.single('paymentProof')(req, res, err => {
    if (err) return res.status(400).json({ success: false, message: 'Screenshot 5 MB కంటే చిన్న ఇమేజ్ అయి ఉండాలి.' });
    next();
  });
}, async (req, res) => {
  try {
    const email = req.user.email; // always from the token, never from the request body
    const customerName = String(req.body.customerName || req.user.name || '').slice(0, 80);
    const paymentMethod = req.body.paymentMethod === 'cod' ? 'cod' : 'upi_pending_review';
    const proofFile = req.file;

    let items, address;
    try {
      items = typeof req.body.items === 'string' ? JSON.parse(req.body.items) : req.body.items;
      address = typeof req.body.address === 'string' ? JSON.parse(req.body.address) : req.body.address;
    } catch (e) {
      return res.status(400).json({ success: false, message: 'ఆర్డర్ వివరాలు తప్పుగా ఉన్నాయి' });
    }
    if (!Array.isArray(items) || !items.length || !address) {
      return res.status(400).json({ success: false, message: 'ఆర్డర్ వివరాలు అసంపూర్తిగా ఉన్నాయి' });
    }
    if (paymentMethod !== 'cod' && !proofFile) {
      return res.status(400).json({ success: false, message: 'UPI payment screenshot అప్‌లోడ్ చేయండి.' });
    }

    items = items.slice(0, 100).map(i => ({
      name: String(i.name || '').slice(0, 120),
      file: i.file || '',
      price: Number(i.price) || 0,
      quantity: Math.max(1, parseInt(i.quantity, 10) || 1)
    }));
    // Total is recalculated here instead of trusting the browser's number
    const total = items.reduce((s, i) => s + i.price * i.quantity, 0);

    const addressStr = typeof address === 'object'
      ? [address.name, address.phone, address.house, address.street, address.landmark, `${address.city || ''} - ${address.pincode || ''}`].filter(Boolean).join(', ')
      : String(address);

    const { data: order, error } = await supabase.from('orders').insert([{
      email,
      customer_name: customerName,
      address: typeof address === 'object' ? JSON.stringify(address) : addressStr,
      items,
      total_amount: total,
      payment_method: paymentMethod,
      payment_status: paymentMethod === 'cod' ? 'Cash on Delivery' : 'Pending verification'
    }]).select().single();

    if (error) {
      console.error('Supabase Error:', error);
      return res.status(500).json({ success: false, message: 'ఆర్డర్ సేవ్ చేయడంలో లోపం' });
    }

    // Admin email: if it fails, the order is still saved, so don't fail the customer
    try {
      const rows = items.map(i => `<li>${esc(i.name)} - ₹${i.price} × ${i.quantity} = ₹${i.price * i.quantity}</li>`).join('');
      const mail = new SibApiV3Sdk.SendSmtpEmail();
      mail.sender = { name: 'J-Mart Orders', email: process.env.SENDER_EMAIL };
      mail.to = [{ email: process.env.ADMIN_MAIL }];
      mail.subject = `New Order #${order.id} - J-Mart (${paymentMethod === 'cod' ? 'COD' : 'UPI - verify screenshot'})`;
      mail.htmlContent = `<h3>కొత్త ఆర్డర్ #${order.id}</h3>
        <p><b>కస్టమర్:</b> ${esc(customerName)} (${esc(email)})</p>
        <p><b>అడ్రస్:</b> ${esc(addressStr)}</p>
        <ul>${rows}</ul>
        <p><b>మొత్తం:</b> ₹${total}</p>
        <p><b>పేమెంట్:</b> ${paymentMethod === 'cod' ? 'Cash on Delivery' : 'UPI - screenshot attached, దయచేసి verify చేయండి'}</p>`;
      if (proofFile) {
        mail.attachment = [{ content: proofFile.buffer.toString('base64'), name: proofFile.originalname || 'payment_proof.jpg' }];
      }
      await mailApi.sendTransacEmail(mail);
    } catch (mailErr) {
      console.error('Admin email failed (order saved):', mailErr);
    }

    res.json({ success: true, message: 'ఆర్డర్ కన్ఫర్మ్ చేయబడింది!', order: { id: order.id, order_number: order.id } });
  } catch (error) {
    console.error('Error placing order:', error);
    res.status(500).json({ success: false, message: 'ఆర్డర్ ప్రాసెస్ చేయడంలో సర్వర్ లోపం' });
  }
});

/* 6. My orders */
app.get('/api/orders', auth, async (req, res) => {
  const { data, error } = await supabase.from('orders').select('*').eq('email', req.user.email).order('created_at', { ascending: false });
  if (error) {
    console.error('Orders error:', error);
    return res.status(500).json({ success: false, message: 'ఆర్డర్లు లోడ్ చేయడంలో లోపం' });
  }
  res.json({ success: true, orders: data || [] });
});

app.get('/', (req, res) => res.send('J-Mart Backend is running!'));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
