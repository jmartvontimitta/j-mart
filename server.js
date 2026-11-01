const express = require('express');
const SibApiV3Sdk = require('sib-api-v3-sdk');
const app = express();

app.use(express.json());

// Brevo API కాన్ఫిగరేషన్
let defaultClient = SibApiV3Sdk.ApiClient.instance;
let apiKey = defaultClient.authentications['api-key'];
apiKey.apiKey = process.env.BREVO_API_KEY;

// OTP ని తాత్కాలికంగా స్టోర్ చేయడానికి ఆబ్జెక్ట్
let storedOtp = {};

// 1. Send OTP Route
app.post('/send-otp', async (req, res) => {
    try {
        const { email } = req.body;
        const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6 డిజిట్ రాండమ్ OTP
        
        storedOtp[email] = otp;

        let apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
        let sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();

        sendSmtpEmail.subject = "Your J-Mart OTP Code";
        sendSmtpEmail.htmlContent = `<html><body><h1>Your OTP for J-Mart is: ${otp}</h1></body></html>`;
        sendSmtpEmail.sender = { "name": "J-Mart", "email": "your-verified-email@domain.com" };
        sendSmtpEmail.to = [{ "email": email }];

        await apiInstance.sendTransacEmail(sendSmtpEmail);
        res.status(200).json({ success: true, message: "OTP sent successfully" });
    } catch (error) {
        console.error("Error sending email:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 2. Verify OTP Route
app.post('/verify-otp', (req, res) => {
    const { email, otp } = req.body;

    if (storedOtp[email] && storedOtp[email] === otp) {
        delete storedOtp[email]; // OTP మ్యాచ్ అయితే డిలీట్ చేస్తాం
        res.status(200).json({ success: true, message: "OTP verified successfully!" });
    } else {
        res.status(400).json({ success: false, message: "Invalid or expired OTP" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
