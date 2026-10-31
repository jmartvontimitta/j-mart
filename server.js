const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// Email transporter setup using Nodemailer
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// OTP Sending Route
app.post('/send-otp', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, message: "దయచేసి ఈమెయిల్ అందించండి" });
  }

  // 6 అంకెల రాండమ్ OTP జనరేట్ చేయడం
  const otp = Math.floor(100000 + Math.random() * 900000);

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'J-Mart OTP Verification',
    text: `Your OTP for J-Mart login/checkout is: ${otp}`
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`OTP sent successfully to ${email}`);
    res.status(200).json({ success: true, message: "OTP విజయవంతంగా పంపబడింది!" });
  } catch (error) {
    console.error("Error sending email:", error);
    res.status(500).json({ success: false, message: "OTP పంపడంలో విఫలమైంది" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
