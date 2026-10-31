const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

const otps = {};

app.post('/send-otp', async (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ success: false, message: "దయచేసి ఈమెయిల్ ఇవ్వండి" });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otps[email] = otp;

    try {
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': process.env.EMAIL_PASS,
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                sender: { name: "J-Mart", email: process.env.EMAIL_USER },
                to: [{ email: email }],
                subject: "Your J-Mart OTP Code",
                textContent: `మీ J-Mart లాగిన్ OTP: ${otp}`
            })
        });

        const data = await response.json();

        if (response.ok) {
            res.json({ success: true, message: "OTP విజయవంతంగా పంపబడింది." });
        } else {
            console.error("Brevo Error:", data);
            res.status(500).json({ success: false, message: "OTP పంపడంలో విఫలమైంది." });
        }
    } catch (error) {
        console.error("Server Error:", error);
        res.status(500).json({ success: false, message: "సర్వర్ ఎర్రర్ సంభవించింది." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
