const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const SibApiV3Sdk = require('sib-api-v3-sdk');
require('dotenv').config();

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

if (!admin.apps || admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.cert(serviceAccount)
    });
}

const db = admin.firestore();
const app = express();

app.use(cors());
app.use(express.json());

const defaultClient = SibApiV3Sdk.ApiClient.instance;
const apiKey = defaultClient.authentications['api-key'];
apiKey.apiKey = process.env.BREVO_API_KEY;

const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

let storedOtp = {};

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

app.post('/verify-otp', (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        return res.status(400).json({ success: false, message: "ఈమెయిల్ లేదా OTP ఇవ్వలేదు" });
    }

    if (storedOtp[email] === otp) {
        delete storedOtp[email];
        res.json({ success: true, message: "OTP సరిపోలింది" });
    } else {
        res.status(400).json({ success: false, message: "తప్పు OTP ఎంటర్ చేశారు" });
    }
});

const sendOrderEmail = async (orderDetails) => {
    const sendSibiEmail = new SibApiV3Sdk.SendSmtpEmail();
    sendSibiEmail.sender = { name: "J-Mart", email: "jmartvontimitta@gmail.com" };
    sendSibiEmail.to = [{ email: "jmartvontimitta@gmail.com" }];
    sendSibiEmail.subject = "New Order Received - J-Mart";
    sendSibiEmail.htmlContent = `<h3>కొత్త ఆర్డర్ వచ్చింది!</h3><p>${orderDetails}</p>`;

    try {
        await apiInstance.sendTransacEmail(sendSibiEmail);
        console.log("Order email sent successfully to admin");
    } catch (error) {
        console.error("Error sending order email:", error);
    }
};

const paymentRoutes = require('./payment');
app.use('/api/payment', paymentRoutes);

app.get('/', (req, res) => {
    res.send("J-Mart Backend is running!");
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
