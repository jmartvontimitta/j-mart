const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// Nodemailer Transporter Setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Store OTPs temporarily (In-memory storage)
const otpStorage = {};

// Send OTP Route
app.post('/send-otp', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, message: "దయచేసి ఈమెయిల్ ఎంటర్ చేయండి" });
  }

  // Generate 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  otpStorage[email] = otp;

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'J-Mart Login OTP',
    text: `మీ J-Mart లాగిన్ కోసం వన్-టైమ్ పాస్‌వర్డ్ (OTP): ${otp}`
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`OTP sent successfully to ${email}`);
    res.json({ success: true, message: "OTP విజయవంతంగా పంపబడింది! మీ ఈమెయిల్ చెక్ చేయండి." });
  } catch (error) {
    console.error("Error sending email:", error);
    res.status(500).json({ success: false, message: "OTP పంపడంలో విఫలమైంది. దయచేసి మళ్లీ ప్రయత్నించండి." });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
