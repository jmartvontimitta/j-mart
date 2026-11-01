const express = require('express');
const cors = require('cors');
const SibApiV3Sdk = require('sib-api-v3-sdk');
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');
require('dotenv').config();

// పేమెంట్ రూట్స్ ఫైల్ ని ఇంపోర్ట్ చేయడం
const paymentRoutes = require('./payment');

const app = express();

// CORS ఎనేబుల్ చేయడం (ఫ్రంటెండ్ కనెక్షన్ కోసం ఇది చాలా ముఖ్యం)
app.use(cors());
app.use(express.json());

// Firebase ఇనిషియలైజేషన్
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

// Brevo API సెటప్
const defaultClient = SibApiV3Sdk.ApiClient.instance;
const apiKey = defaultClient.authentications['api-key'];
apiKey.apiKey = process.env.BREVO_API_KEY;

const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

let storedOtp = {};

// 1. Send OTP Route
app.post('/send-otp', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ success: false, message: "ఈమెయిల్ ఇవ్వడం మరచిపోయారు" });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        storedOtp[email] = otp;

        const sendSibiEmail = new SibApiV3Sdk.SendSmtpEmail();
        sendSibiEmail.sender = { name: "J-Mart", email: "jmartvontimitta@gmail.com" };
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
app.post('/verify-otp', (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        return res.status(400).json({ success: false, message: "ఈమెయిల్ లేదా OTP ఇవ్వలేదు" });
    }

    if (storedOtp[email] === otp) {
        delete storedOtp[email]; // విజయవంతంగా వెరిఫై అయ్యాక OTP తొలగించడం
        res.json({ success: true, message: "OTP సరిపోలింది" });
    } else {
        res.status(400).json({ success: false, message: "తప్పు OTP ఎంటర్ చేశారు" });
    }
});

// 3. Save Order & Send Email Route (డేటాబేస్ & ఈమెయిల్ నోటిఫికేషన్)
app.post('/save-order', async (req, res) => {
    const orderDetails = req.body;
    
    try {
        // ఫైర్‌బేస్ డేటాబేస్‌లో ఆర్డర్ సేవ్ చేయడం
        const docRef = await db.collection('orders').add({
            ...orderDetails,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log("Order saved with ID:", docRef.id);

        // అడ్మిన్‌కి ఈమెయిల్ పంపడం
        const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
        sendSmtpEmail.subject = "New Order Received - J-Mart";
        sendSmtpEmail.htmlContent = `
            <h3>కొత్త ఆర్డర్ వచ్చింది!</h3>
            <p><strong>కస్టమర్ పేరు:</strong> ${orderDetails.name || 'N/A'}</p>
            <p><strong>ఫోన్ నెంబర్:</strong> ${orderDetails.phone || 'N/A'}</p>
            <p><strong>అడ్రస్:</strong> ${orderDetails.address || 'N/A'}</p>
            <p><strong>మొత్తం:</strong> ₹${orderDetails.totalAmount || 'N/A'}</p>
        `;
        sendSmtpEmail.sender = { name: "J-Mart", email: "jmartvontimitta@gmail.com" };
        sendSmtpEmail.to = [{ email: "jmartvontimitta@gmail.com" }]; // మీ అడ్మిన్ ఈమెయిల్ ఇక్కడ ఇవ్వండి

        await apiInstance.sendTransacEmail(sendSmtpEmail);
        console.log("Order email sent successfully");

        res.status(200).json({ success: true, message: "ఆర్డర్ సేవ్ అయింది మరియు మెయిల్ పంపబడింది!" });
    } catch (error) {
        console.error("Error saving order or sending email:", error);
        res.status(500).json({ success: false, message: "ఆర్డర్ సేవ్ చేయడంలో లోపం సంభవించింది" });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
