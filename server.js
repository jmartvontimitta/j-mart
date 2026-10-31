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

// సర్వర్ స్టేటస్ చెక్ చేయడానికి (Render నిద్రపోకుండా ఉండటానికి ఇది ఉపయోగపడుతుంది)
app.get('/', (req, res) => {
    res.send('J-Mart Server is running successfully!');
});

// SEND OTP
app.post('/send-otp', async (req, res) => {
    const email = req.body.email?.trim()?.toLowerCase();

    if (!email) {
        return res.status(400).json({
            success: false,
            message: "Please enter your email"
        });
    }

    const otp = crypto.randomInt(100000, 1000000).toString();
    const expires = Date.now() + 60000;

    otps.set(email, { otp, expires });

    try {
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'J-Mart OTP Verification',
            text: `Your T-Mart OTP is ${otp}. It expires in 60 seconds.`
        });

        res.json({ success: true, message: "OTP sent successfully" });
    } catch (error) {
        console.error("Mail Error:", error);
        res.status(500).json({ success: false, message: "Failed to send OTP. Please try again." });
    }
});

// VERIFY OTP
app.post('/verify-otp', (req, res) => {
    const { email, otp } = req.body;
    const record = otps.get(email?.trim()?.toLowerCase());

    if (!record) {
        return res.status(400).json({
            success: false,
            message: "Please request a new OTP"
        });
    }

    if (Date.now() > record.expires) {
        otps.delete(email);
        return res.status(400).json({
            success: false,
            message: "OTP expired. Please request a new one."
        });
    }

    if (record.otp !== otp) {
        return res.status(400).json({
            success: false,
            message: "Invalid OTP"
        });
    }

    otps.delete(email);
    res.json({
        success: true,
        message: "Email verified successfully"
    });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`J-Mart server running on port ${PORT}`);
});
