const express = require('express');
const cors = require('cors');
const SibApiV3Sdk = require('sib-api-v3-sdk');

const app = express();

// CORS ని ఎనేబుల్ చేయడం (ఇది GitHub పేజెస్ నుండి వచ్చే రిక్వెస్ట్‌లను అనుమతిస్తుంది)
app.use(cors());
app.use(express.json());

// Brevo API setup
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
            return res.status(400).json({ success: false, message: "ఈమెయిల్ అందించండి" });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        storedOtp[email] = otp;

        const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
        sendSmtpEmail.subject = "Your J-Mart OTP Code";
        sendSmtpEmail.htmlContent = `<p>Your verification code for J-Mart is: <strong>${otp}</strong></p>`;
        sendSmtpEmail.sender = { name: "J-Mart", email: "jmartvontimitta@gmail.com" }; // మీ వెరిఫై చేసిన ఈమెయిల్ ఇక్కడ ఉండాలి
        sendSmtpEmail.to = [{ email: email }];

        await apiInstance.sendTransacEmail(sendSmtpEmail);
        res.json({ success: true, message: "OTP విజయవంతంగా పంపబడింది!" });
    } catch (error) {
        console.error("Send OTP Error:", error);
        res.status(500).json({ success: false, message: "సర్వర్ లోపం వల్ల OTP పంపబడలేదు" });
    }
});

// 2. Verify OTP Route
app.post('/verify-otp', (req, res) => {
    try {
        const { email, otp } = req.body;
        if (!email || !otp) {
            return res.status(400).json({ success: false, message: "ఈమెయిల్ మరియు OTP రెండూ కావాలి" });
        }

        if (storedOtp[email] === otp) {
            delete storedOtp[email]; // వాడిన OTP ని డిలీట్ చేయడం
            res.json({ success: true, message: "OTP వెరిఫికేషన్ విజయవంతమైంది!" });
        } else {
            res.status(400).json({ success: false, message: "తప్పు OTP ఎంటర్ చేశారు" });
        }
    } catch (error) {
        console.error("Verify OTP Error:", error);
        res.status(500).json({ success: false, message: "సర్వర్ లోపం సంభవించింది" });
    }
});

app.get('/', (req, res) => {
    res.send("J-Mart Backend is running!");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
