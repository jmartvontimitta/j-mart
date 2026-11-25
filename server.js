const express = require('express');
const cors = require('cors');
const SibApiV3Sdk = require('sib-api-v3-sdk');
const { createClient } = require('@supabase/supabase-js');
const multer = require('multer');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Multer setup for handling file upload in memory storage
const upload = multer({ storage: multer.memoryStorage() });

// Brevo (Sendinblue) API Setup
const defaultClient = SibApiV3Sdk.ApiClient.instance;
const apiKey = defaultClient.authentications['api-key'];
apiKey.apiKey = process.env.BREVO_API_KEY;
const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

// Supabase Client Setup
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Store OTPs with 5-minute expiration
const storedOtp = {};
const OTP_EXPIRY_MS = 5 * 60 * 1000;

// 1. Send OTP Route
app.post('/api/send-otp', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ success: false, message: "ఈమెయిల్ ఇవ్వడం మరచిపోయారు" });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        storedOtp[email] = {
            code: otp,
            expiresAt: Date.now() + OTP_EXPIRY_MS
        };

        const sendSibiEmail = new SibApiV3Sdk.SendSmtpEmail();
        sendSibiEmail.sender = { name: "J-Mart", email: process.env.SENDER_EMAIL };
        sendSibiEmail.to = [{ email: email }];
        sendSibiEmail.subject = "Your J-Mart OTP code";
        sendSibiEmail.htmlContent = `<p>Your verification code for J-Mart is: <strong>${otp}</strong> (Valid for 5 minutes)</p>`;

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

    const record = storedOtp[email];
    if (!record) {
        return res.status(400).json({ success: false, message: "OTP కనుగొనబడలేదు. దయచేసి మళ్లీ పంపండి" });
    }

    if (Date.now() > record.expiresAt) {
        delete storedOtp[email];
        return res.status(400).json({ success: false, message: "OTP గడువు ముగిసింది. కొత్త OTP కోసం ప్రయత్నించండి" });
    }

    if (record.code === otp) {
        delete storedOtp[email];
        res.json({ success: true, message: "OTP సరిపోలింది" });
    } else {
        res.status(400).json({ success: false, message: "తప్పు OTP ఎంటర్ చేశారు" });
    }
});

// 3. Place Order & Save to Supabase & Send Admin Email Route
app.post('/api/place-order', upload.single('paymentProof'), async (req, res) => {
    try {
        const { email, address, items, totalAmount, paymentVerified, paymentMethod } = req.body;
        const proofFile = req.file;

        if (!email || !address || !items) {
            return res.status(400).json({ success: false, message: "ఆర్డర్ వివరాలు అసంపూర్తిగా ఉన్నాయి" });
        }

        let parsedItems, parsedAddress;
        try {
            parsedItems = typeof items === 'string' ? JSON.parse(items) : items;
            parsedAddress = typeof address === 'string' ? JSON.parse(address) : address;
        } catch (parseError) {
            return res.status(400).json({ success: false, message: "చెల్లని ఆర్డర్ డేటా ఫార్మాట్" });
        }

        if (!Array.isArray(parsedItems) || parsedItems.length === 0) {
            return res.status(400).json({ success: false, message: "ఆర్డర్‌లో వస్తువులు లేవు" });
        }

        const isCod = paymentMethod === 'cod';
        const isPaid = paymentVerified === "true" || paymentVerified === true;

        if (!isCod && (!isPaid || !proofFile)) {
            return res.status(400).json({
                success: false,
                message: "పేమెంట్ నిర్ధారణ కాలేదు. దయచేసి చెల్లింపు పూర్తి చేసి స్క్రీన్ షాట్ అప్‌లోడ్ చేయండి."
            });
        }

        const addressStr = typeof parsedAddress === 'object' && parsedAddress !== null
            ? `${parsedAddress.name || ''}, ${parsedAddress.phone || ''}, ${parsedAddress.house || ''}, ${parsedAddress.street || ''}, ${parsedAddress.landmark ? parsedAddress.landmark + ', ' : ''}${parsedAddress.city || ''} - ${parsedAddress.pincode || ''}`
            : address;

        const paymentStatus = isCod ? "Cash on Delivery" : "Verified (Screenshot Attached)";

        // 1. Save order into Supabase 'orders' table
        const { data, error } = await supabase
            .from('orders')
            .insert([
                {
                    email: email,
                    address: addressStr,
                    items: parsedItems,
                    total_amount: Number(totalAmount) || 0,
                    payment_status: paymentStatus,
                    created_at: new Date().toISOString()
                }
            ])
            .select();

        if (error) {
            console.error("Supabase Error:", error);
            return res.status(500).json({ success: false, error: error.message });
        }

        // 2. Format order details for admin email
        const itemsListHtml = parsedItems
            .map(item => `<li>${item.name} - ₹${item.price} × ${item.quantity} = ₹${item.price * item.quantity}</li>`)
            .join('');

        const orderDetailsString = `
            <p><b>కస్టమర్ ఈమెయిల్:</b> ${email}</p>
            <p><b>డెలివరీ అడ్రస్:</b> ${addressStr}</p>
            <p><b>ఆర్డర్ చేసిన వస్తువులు:</b></p>
            <ul>${itemsListHtml}</ul>
            <p><b>మొత్తం బిల్లు:</b> ₹${totalAmount}</p>
            <p><b>పేమెంట్ స్టేటస్:</b> ${paymentStatus}</p>
        `;

        // 3. Send email to Admin via Brevo
        const sendSibiEmail = new SibApiV3Sdk.SendSmtpEmail();
        sendSibiEmail.sender = { name: "J-Mart Orders", email: process.env.SENDER_EMAIL };
        sendSibiEmail.to = [{ email: process.env.ADMIN_MAIL }];
        sendSibiEmail.subject = `New Order Received - J-Mart (${paymentStatus})`;
        sendSibiEmail.htmlContent = `<h3>కొత్త ఆర్డర్ వచ్చింది!</h3>${orderDetailsString}`;

        if (proofFile) {
            sendSibiEmail.attachment = [
                {
                    content: proofFile.buffer.toString('base64'),
                    name: proofFile.originalname || 'payment_proof.jpg'
                }
            ];
        }

        await apiInstance.sendTransacEmail(sendSibiEmail);

        res.json({
            success: true,
            message: "ఆర్డర్ విజయవంతంగా కన్ఫర్మ్ చేయబడింది!",
            order: data ? data[0] : null
        });
    } catch (error) {
        console.error("Error placing order:", error);
        res.status(500).json({ success: false, message: "ఆర్డర్ ప్రాసెస్ చేయడంలో సర్వర్ లోపం" });
    }
});

// 4. Get User Orders Route (for "Your Orders" view)
app.get('/api/orders', async (req, res) => {
    try {
        const { email } = req.query;
        if (!email) {
            return res.status(400).json({ success: false, message: "ఈమెయిల్ అవసరం" });
        }

        const { data, error } = await supabase
            .from('orders')
            .select('*')
            .eq('email', email)
            .order('created_at', { ascending: false });

        if (error) {
            console.error("Supabase Fetch Error:", error);
            return res.status(500).json({ success: false, error: error.message });
        }

        res.json({ success: true, orders: data });
    } catch (error) {
        console.error("Error fetching orders:", error);
        res.status(500).json({ success: false, message: "ఆర్డర్లు తీసుకురావడంలో సర్వర్ లోపం" });
    }
});

app.get('/', (req, res) => {
    res.send("J-Mart Backend is running!");
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
