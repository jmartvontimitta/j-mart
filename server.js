const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const bcrypt = require('bcryptjs'); // bcrypt బదులు bcryptjs (బిల్డ్ సమస్యలు లేవు)
const SibApiV3Sdk = require('sib-api-v3-sdk');
const { createClient } = require('@supabase/supabase-js');
const multer = require('multer');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Multer: మెమరీలో ఫైల్ (గరిష్టం 5MB, ఇమేజ్ మాత్రమే)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype && file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('ఇమేజ్ ఫైల్ మాత్రమే అనుమతించబడుతుంది'));
    }
});

// Brevo (Sendinblue) API Setup
const defaultClient = SibApiV3Sdk.ApiClient.instance;
const apiKey = defaultClient.authentications['api-key'];
apiKey.apiKey = process.env.BREVO_API_KEY;
const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

// Supabase Client Setup
const supabaseUrl = process.env.SUPABASE_URL;
// బ్యాకెండ్‌లో service_role key వాడాలి (RLS ఆన్ ఉన్న టేబుల్స్ కోసం). ఇది రహస్యంగా ఉంచాలి.
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// అవసరమైన ఎన్విరాన్‌మెంట్ వేరియబుల్స్ ఉన్నాయో చెక్ (విలువలు ప్రింట్ చేయం)
const ADMIN_MAIL = process.env.ADMIN_MAIL || process.env.ADMIN_EMAIL;
['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'BREVO_API_KEY', 'SENDER_EMAIL'].forEach((name) => {
    if (!process.env[name]) console.warn(`హెచ్చరిక: ${name} సెట్ చేయలేదు`);
});
if (!ADMIN_MAIL) console.warn('హెచ్చరిక: ADMIN_MAIL (లేదా ADMIN_EMAIL) సెట్ చేయలేదు');

const SALT_ROUNDS = 10;
const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 నిమిషాలు
const MAX_OTP_ATTEMPTS = 5;

// OTP నిల్వ: { email: { code, expires, attempts } }
const storedOtp = {};

function generateOtp() {
    return crypto.randomInt(100000, 1000000).toString();
}

function saveOtp(email, code) {
    storedOtp[email] = { code, expires: Date.now() + OTP_EXPIRY_MS, attempts: 0 };
}

// OTP చెక్: "ok" | "invalid" | "expired" | "locked"
function checkOtp(email, otp) {
    const entry = storedOtp[email];
    if (!entry) return 'invalid';
    if (Date.now() > entry.expires) {
        delete storedOtp[email];
        return 'expired';
    }
    if (entry.attempts >= MAX_OTP_ATTEMPTS) {
        delete storedOtp[email];
        return 'locked';
    }
    if (entry.code !== String(otp)) {
        entry.attempts += 1;
        return 'invalid';
    }
    return 'ok';
}

// ఈమెయిల్ HTML లో యూజర్ ఇన్‌పుట్ సురక్షితంగా చూపడానికి
function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// 1. Send OTP Route
app.post('/api/send-otp', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ success: false, message: "ఈమెయిల్ ఇవ్వడం మరచిపోయారు" });
        }

        const otp = generateOtp();
        saveOtp(email, otp);

        const sendSibiEmail = new SibApiV3Sdk.SendSmtpEmail();
        sendSibiEmail.sender = { name: "J-Mart", email: process.env.SENDER_EMAIL };
        sendSibiEmail.to = [{ email: email }];
        sendSibiEmail.subject = "Your J-Mart OTP code";
        sendSibiEmail.htmlContent = `<p>Your verification code for J-Mart is: <strong>${otp}</strong></p>`;

        await apiInstance.sendTransacEmail(sendSibiEmail);

        res.json({ success: true, message: "OTP విజయవంతంగా పంపబడింది!" });
    } catch (error) {
        console.error("Send OTP Error:", error);
        res.status(500).json({ success: false, message: "OTP పంపడంలో సర్వర్ లోపం" });
    }
});

// 2. Verify OTP Route
app.post('/api/verify-otp', (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        return res.status(400).json({ success: false, message: "ఈమెయిల్ లేదా OTP ఇవ్వలేదు" });
    }

    const result = checkOtp(email, otp);

    if (result === 'ok') {
        delete storedOtp[email];
        return res.json({ success: true, message: "OTP సరిపోలింది" });
    }
    if (result === 'expired') {
        return res.status(400).json({ success: false, message: "OTP గడువు ముగిసింది, మళ్ళీ అడగండి" });
    }
    if (result === 'locked') {
        return res.status(429).json({ success: false, message: "చాలా తప్పు ప్రయత్నాలు, కొత్త OTP అడగండి" });
    }
    res.status(400).json({ success: false, message: "తప్పు OTP ఎంటర్ చేశారు" });
});

// 3. Place Order & Save to Supabase & Send Admin Email Route
app.post('/api/place-order', upload.single('paymentProof'), async (req, res) => {
    try {
        const { email, address, items, totalAmount, paymentVerified } = req.body;
        const proofFile = req.file;

        if (!email || !address || !items) {
            return res.status(400).json({ success: false, message: "ఆర్డర్ వివరాలు అసంపూర్తిగా ఉన్నాయి" });
        }

        let parsedItems, parsedAddress;
        try {
            parsedItems = typeof items === 'string' ? JSON.parse(items) : items;
            parsedAddress = typeof address === 'string' ? JSON.parse(address) : address;
        } catch (e) {
            // address సాధారణ టెక్స్ట్ అయితే అలాగే వాడతాం
            if (typeof items === 'string') {
                return res.status(400).json({ success: false, message: "ఆర్డర్ వివరాలు చెల్లవు" });
            }
            parsedAddress = address;
        }

        if (!Array.isArray(parsedItems) || parsedItems.length === 0) {
            return res.status(400).json({ success: false, message: "ఆర్డర్‌లో వస్తువులు లేవు" });
        }

        if (paymentVerified !== "true" && paymentVerified !== true) {
            return res.status(400).json({ success: false, message: "పేమెంట్ నిర్ధారణ కాలేదు. దయచేసి చెల్లింపు పూర్తి చేసి స్క్రీన్ షాట్ అప్‌లోడ్ చేయండి." });
        }

        // Address formatting
        const addressStr = typeof parsedAddress === 'object' && parsedAddress !== null
            ? `${parsedAddress.name || ''}, ${parsedAddress.phone || ''}, ${parsedAddress.house || ''}, ${parsedAddress.street || ''}, ${parsedAddress.landmark ? parsedAddress.landmark + ', ' : ''}${parsedAddress.city || ''} - ${parsedAddress.pincode || ''}`
            : String(address);

        // 1. Supabase 'orders' టేబుల్‌లో సేవ్
        const { error } = await supabase
            .from('orders')
            .insert([
                {
                    email: email,
                    address: addressStr,
                    items: parsedItems,
                    total_amount: totalAmount,
                    payment_status: "Verified",
                    created_at: new Date()
                }
            ]);

        if (error) {
            console.error("Supabase Error:", error);
            return res.status(500).json({ success: false, message: "ఆర్డర్ సేవ్ చేయడంలో లోపం", error: error.message });
        }

        // 2. అడ్మిన్ ఈమెయిల్ కోసం వివరాలు
        const itemsListHtml = parsedItems.map(item =>
            `<li>${escapeHtml(item.name)} - ₹${escapeHtml(item.price)} × ${escapeHtml(item.quantity)} = ₹${Number(item.price) * Number(item.quantity)}</li>`
        ).join('');

        const orderDetailsString = `
            <p><b>కస్టమర్ ఈమెయిల్:</b> ${escapeHtml(email)}</p>
            <p><b>డెలివరీ అడ్రస్:</b> ${escapeHtml(addressStr)}</p>
            <p><b>ఆర్డర్ చేసిన వస్తువులు:</b></p>
            <ul>${itemsListHtml}</ul>
            <p><b>మొత్తం బిల్లు:</b> ₹${escapeHtml(totalAmount)}</p>
            <p><b>పేమెంట్ స్టేటస్:</b> చెల్లించబడింది & స్క్రీన్ షాట్ అటాచ్ చేయబడింది (Verified)</p>
        `;

        // 3. Brevo ద్వారా అడ్మిన్‌కి ఈమెయిల్
        const sendSibiEmail = new SibApiV3Sdk.SendSmtpEmail();
        sendSibiEmail.sender = { name: "J-Mart Orders", email: process.env.SENDER_EMAIL };
        sendSibiEmail.to = [{ email: ADMIN_MAIL }];
        sendSibiEmail.subject = "New Order Received - J-Mart (With Payment Proof)";
        sendSibiEmail.htmlContent = `<h3>కొత్త ఆర్డర్ వచ్చింది!</h3>${orderDetailsString}`;

        if (proofFile) {
            sendSibiEmail.attachment = [
                {
                    content: proofFile.buffer.toString('base64'),
                    name: proofFile.originalname || 'payment_proof.jpg'
                }
            ];
        }

        // ఈమెయిల్ విఫలమైనా ఆర్డర్ ఇప్పటికే సేవ్ అయింది, కాబట్టి యూజర్‌కి ఎర్రర్ చూపించం
        try {
            await apiInstance.sendTransacEmail(sendSibiEmail);
        } catch (mailError) {
            console.error("Admin email error:", mailError);
        }

        res.json({ success: true, message: "పేమెంట్ స్క్రీన్ షాట్ అప్‌లోడ్ చేయబడింది, ఆర్డర్ కన్ఫర్మ్ చేయబడింది!" });
    } catch (error) {
        console.error("Error placing order:", error);
        res.status(500).json({ success: false, message: "ఆర్డర్ ప్రాసెస్ చేయడంలో సర్వర్ లోపం" });
    }
});

app.get('/', (req, res) => {
    res.send("J-Mart Backend is running!");
});

// 4. Sign Up Route
app.post('/api/signup', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, message: "ఈమెయిల్ మరియు పాస్‌వర్డ్ తప్పనిసరి" });
        }
        if (String(password).length < 6) {
            return res.status(400).json({ success: false, message: "పాస్‌వర్డ్ కనీసం 6 అక్షరాలు ఉండాలి" });
        }

        // డూప్లికేట్ ఈమెయిల్ చెక్
        const { data: existing } = await supabase.from('users').select('email').eq('email', email);
        if (existing && existing.length > 0) {
            return res.status(400).json({ success: false, message: "ఈ ఈమెయిల్ ఇప్పటికే రిజిస్టర్ అయి ఉంది" });
        }

        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

        const { error } = await supabase
            .from('users')
            .insert([{ email, password: hashedPassword }]);

        if (error) return res.status(500).json({ success: false, message: "అకౌంట్ సృష్టించడంలో లోపం", error: error.message });

        res.json({ success: true, message: "అకౌంట్ విజయవంతంగా సృష్టించబడింది!" });
    } catch (error) {
        console.error("Signup Error:", error);
        res.status(500).json({ success: false, message: "సర్వర్ లోపం" });
    }
});

// 5. Login Route
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, message: "ఈమెయిల్ మరియు పాస్‌వర్డ్ ఎంటర్ చేయండి" });
        }

        const { data: users, error } = await supabase
            .from('users')
            .select('*')
            .eq('email', email);

        if (error || !users || users.length === 0) {
            return res.status(400).json({ success: false, message: "యూజర్ కనుగొనబడలేదు" });
        }

        const user = users[0];
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(400).json({ success: false, message: "తప్పు పాస్‌వర్డ్" });
        }

        res.json({ success: true, message: "లాగిన్ విజయవంతమైంది!", user: { email: user.email } });
    } catch (error) {
        console.error("Login Error:", error);
        res.status(500).json({ success: false, message: "లాగిన్ ప్రాసెస్ చేయడంలో లోపం" });
    }
});

// 6. Forgot Password - Send Reset OTP
app.post('/api/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ success: false, message: "ఈమెయిల్ ఇవ్వండి" });
        }

        const { data: users } = await supabase.from('users').select('*').eq('email', email);

        if (!users || users.length === 0) {
            return res.status(400).json({ success: false, message: "ఈ ఈమెయిల్ రిజిస్టర్ అయి లేదు" });
        }

        const resetOtp = generateOtp();
        saveOtp(email, resetOtp);

        const emailSent = new SibApiV3Sdk.SendSmtpEmail();
        emailSent.sender = { name: "J-Mart", email: process.env.SENDER_EMAIL };
        emailSent.to = [{ email }];
        emailSent.subject = "Password Reset Code";
        emailSent.htmlContent = `<p>మీ పాస్‌వర్డ్ రీసెట్ కోడ్: <strong>${resetOtp}</strong></p>`;

        await apiInstance.sendTransacEmail(emailSent);
        res.json({ success: true, message: "రీసెట్ కోడ్ ఈమెయిల్‌కు పంపబడింది" });
    } catch (error) {
        console.error("Forgot Password Error:", error);
        res.status(500).json({ success: false, message: "సర్వర్ లోపం" });
    }
});

// 7. Reset Password Route
app.post('/api/reset-password', async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;

        if (!email || !otp || !newPassword) {
            return res.status(400).json({ success: false, message: "అన్ని వివరాలు ఇవ్వండి" });
        }
        if (String(newPassword).length < 6) {
            return res.status(400).json({ success: false, message: "పాస్‌వర్డ్ కనీసం 6 అక్షరాలు ఉండాలి" });
        }

        if (checkOtp(email, otp) !== 'ok') {
            return res.status(400).json({ success: false, message: "తప్పు లేదా ఎక్స్‌పైర్ అయిన OTP" });
        }

        const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
        const { error } = await supabase.from('users').update({ password: hashedPassword }).eq('email', email);

        if (error) {
            console.error("Reset Password DB Error:", error);
            return res.status(500).json({ success: false, message: "పాస్‌వర్డ్ మార్చడంలో విఫలమైంది" });
        }

        delete storedOtp[email];
        res.json({ success: true, message: "పాస్‌వర్డ్ విజయవంతంగా మార్చబడింది" });
    } catch (error) {
        console.error("Reset Password Error:", error);
        res.status(500).json({ success: false, message: "పాస్‌వర్డ్ మార్చడంలో విఫలమైంది" });
    }
});

// Multer ఎర్రర్స్ (ఫైల్ చాలా పెద్దది / ఇమేజ్ కాదు)
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError || err.message) {
        return res.status(400).json({ success: false, message: err.message });
    }
    next(err);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
