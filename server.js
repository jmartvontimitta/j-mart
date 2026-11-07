const express = require('express');
const cors = require('cors');
const SibApiV3Sdk = require('sib-api-v3-sdk');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());

const defaultClient = SibApiV3Sdk.ApiClient.instance;
const apiKey = defaultClient.authentications['api-key'];
apiKey.apiKey = process.env.BREVO_API_KEY;

const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

let storedOtp = {};

// 1. Send OTP Route (Added /api prefix to match frontend)
app.post('/api/send-otp', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ success: false, message: "ఈమెయిల్ ఇవ్వడం మరచిపోయారు" });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        storedOtp[email] = otp;

        const sendSibiEmail = new SibApiV3Sdk.SendSmtpEmail();
        sendSibiEmail.sender = { name: "J-Mart", email: process.env.SENDER_EMAIL };
        sendSibiEmail.to = [{ email: email }];
        sendSibiEmail.subject = "Your J-Mart OTP code";
        sendSibiEmail.htmlContent = `<p>Your verification code for J-Mart is: <strong>${otp}</strong></p>`;

        await apiInstance.sendTransacEmail(sendSibiEmail);

        res.json({ success: true, message: "OTP విజయవంతంగా పంపబడింది!" });
    } catch (error) {
        console.error("Send OTP Error:", error);
        res.status(500).json({ success: false, message: "OTP పంపడంలో సర్వర్ లోపం" });
    }
});

// 2. Verify OTP Route (Added /api prefix)
app.post('/api/verify-otp', (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        return res.status(400).json({ success: false, message: "ఈమెయిల్ లేదా OTP ఇవ్వలేదు" });
    }

    if (storedOtp[email] === otp) {
        delete storedOtp[email];
        res.json({ success: true, message: "OTP సరిపోలింది" });
    } else {
        res.status(400).json({ success: false, message: "తప్పు OTP ఎంటర్ చేశారు" });
    }
});

// 3. Place Order Route (Newly added to handle checkout & send email to admin)
app.post('/api/place-order', async (req, res) => {
    try {
        const { email, address, items, totalAmount } = req.body;

        if (!email || !address || !items || items.length === 0) {
            return res.status(400).json({ success: false, message: "ఆర్డర్ వివరాలు అసంపూర్తిగా ఉన్నాయి" });
        }

        // Format order details for admin email
        let itemsListHtml = items.map(item => `<li>${item.name} - ₹${item.price} × ${item.quantity} = ₹${item.price * item.quantity}</li>`).join('');
        
        const orderDetailsString = `
            <p><b>కస్టమర్ ఈమెయిల్:</b> ${email}</p>
            <p><b>డెలివరీ అడ్రస్:</b><br>
               పేరు: ${address.name}<br>
               ఫోన్: ${address.phone}<br>
               ఇంటి నెం: ${address.house}, వీధి: ${address.street}<br>
               ల్యాండ్‌మార్క్: ${address.landmark || 'లేవు'}<br>
               నగరం: ${address.city} - ${address.pincode}
            </p>
            <p><b>ఆర్డర్ చేసిన వస్తువులు:</b></p>
            <ul>${itemsListHtml}</ul>
            <p><b>మొత్తం బిల్లు:</b> ₹${totalAmount}</p>
        `;

        // Send email to Admin
        const sendSibiEmail = new SibApiV3Sdk.SendSmtpEmail();
        sendSibiEmail.sender = { name: "J-Mart Orders", email: process.env.SENDER_EMAIL };
        sendSibiEmail.to = [{ email: process.env.ADMIN_MAIL }]; 
        sendSibiEmail.subject = "New Order Received - J-Mart";
        sendSibiEmail.htmlContent = `<h3>కొత్త ఆర్డర్ వచ్చింది!</h3>${orderDetailsString}`;

        await apiInstance.sendTransacEmail(sendSibiEmail);

        res.json({ success: true, message: "ఆర్డర్ విజయవంతంగా స్వీకరించబడింది!" });
    } catch (error) {
        console.error("Error placing order:", error);
        res.status(500).json({ success: false, message: "ఆర్డర్ ప్రాసెస్ చేయడంలో సర్వర్ లోపం" });
    }
});

app.get('/', (req, res) => {
    res.send("J-Mart Backend is running!");
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
