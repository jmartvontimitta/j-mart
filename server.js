require('dotenv').config();

const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const crypto = require('crypto');

const app = express();

app.use(cors());
app.use(express.json());

const otps = new Map();

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_APP_PASSWORD
    }
});

// SEND OTP
app.post('/send-otp', async (req, res) => {
    const email = req.body.email?.trim().toLowerCase();

    if (!email) {
        return res.status(400).json({
            success: false,
            message: 'Please enter your email'
        });
    }

    const otp = crypto.randomInt(100000, 1000000).toString();
    const expires = Date.now() + 60000;

    try {
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'J-Mart OTP Verification',
            text: `Your J-Mart OTP is: ${otp}. It expires in 60 seconds.`
        });

        otps.set(email, { otp, expires });

        return res.json({
            success: true,
            message: 'OTP sent successfully'
        });

    } catch (error) {
        console.error('Email Error:', error.message);

        return res.status(500).json({
            success: false,
            message: 'Unable to send OTP. Please try again.'
        });
    }
});

// VERIFY OTP
app.post('/verify-otp', (req, res) => {
    const email = req.body.email?.trim().toLowerCase();
    const enteredOTP = req.body.otp?.toString();

    const savedOTP = otps.get(email);

    if (!savedOTP) {
        return res.status(400).json({
            success: false,
            message: 'Please request a new OTP'
        });
    }

    if (Date.now() > savedOTP.expires) {
        otps.delete(email);

        return res.status(400).json({
            success: false,
            message: 'OTP expired. Please request a new one.'
        });
    }

    if (enteredOTP !== savedOTP.otp) {
        return res.status(400).json({
            success: false,
            message: 'Invalid OTP'
        });
    }

    otps.delete(email);

    return res.json({
        success: true,
        message: 'Email verified successfully'
    });
});

// SERVER
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`J-Mart server running on port ${PORT}`);
});
