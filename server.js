const express = require('express');
const cors = require('cors');
require('dotenv').config();
const SibApiV3Sdk = require('sib-api-v3-sdk');

const app = express();
app.use(express.json());
app.use(cors());

// Brevo API కాన్ఫిగరేషన్
const defaultClient = SibApiV3Sdk.ApiClient.instance;
const apiKey = defaultClient.authentications['api-key'];
apiKey.apiKey = process.env.BREVO_API_KEY;

const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

// OTP Sending Route
app.post('/send-otp', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, message: "దయచేసి ఈమెయిల్ అందించండి" });
  }

  // 6 అంకెల రాండమ్ OTP జనరేట్ చేయడం
  const otp = Math.floor(100000 + Math.random() * 900000);

  const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
  sendSmtpEmail.subject = "J-Mart OTP Verification";
  sendSmtpEmail.htmlContent = `<html><body><h3>Your OTP for J-Mart login/checkout is: <b>${otp}</b></h3></body></html>`;
  sendSmtpEmail.sender = { "name": "J-Mart", "email": process.env.EMAIL_USER };
  sendSmtpEmail.to = [{ "email": email }];

  try {
    await apiInstance.sendTransacEmail(sendSmtpEmail);
    console.log(`OTP sent successfully to ${email}`);
    res.status(200).json({ success: true, message: "OTP విజయవంతంగా పంపబడింది!" });
  } catch (error) {
    console.error("Error sending email via Brevo:", error);
    res.status(500).json({ success: false, message: "OTP పంపడంలో విఫలమైంది" });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
