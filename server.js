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
        pass: process.env.EMAIL_APP_PASSWORD, 
    },
});

app.post('/api/send-otp', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: "ఈమెయిల్ అందించండి" });

    const otp = crypto.randomInt(100000, 999999).toString();
    const expires = Date.now() + 60000; 
    otps.set(email, { otp, expires });

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'J mart OTP Verification',
        text: `Your OTP is: ${otp}`
    };

    try {
        await transporter.sendMail(mailOptions);
        res.json({ success: true, message: "OTP విజయవంతంగా సృష్టించబడింది మరియు పంపబడింది" });
    } catch (error) {
        res.status(500).json({ success: false, message: "OTP పంపడంలో సమస్య ఏర్పడింది", error });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
