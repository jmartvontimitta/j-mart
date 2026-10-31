const express = require('express');
const cors = require('cors');
require('dotenv').config();
const fetch = require('node-fetch');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.status(200).send('Server is active');
});

app.post('/send-otp', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ success: false, message: "దయచేసి ఈమెయిల్ ఎంటర్ చేయండి" });
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "accept": "application/json",
        "api-key": process.env.EMAIL_PASS,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        sender: { email: process.env.EMAIL_USER },
        to: [{ email: email }],
        subject: "Your J-Mart OTP Code",
        htmlContent: `<p>Your J-Mart OTP: <strong>${otp}</strong></p>`
      })
    });

    if (response.ok) {
      res.status(200).json({ success: true, message: "OTP విజయవంతంగా పంపబడింది!" });
    } else {
      const errorText = await response.text();
      console.error("Brevo API Error:", errorText);
      res.status(500).json({ success: false, message: "OTP పంపడంలో విఫలమైంది." });
    }
  } catch (error) {
    console.error("Server Error:", error);
    res.status(500).json({ success: false, message: "సర్వర్ లోపం సంభవించింది." });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
