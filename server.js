const express = require('express');
const cors = require('cors');
const SibApiV3Sdk = require('sib-api-v3-sdk');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());

// Brevo (Sendinblue) API Setup
const defaultClient = SibApiV3Sdk.ApiClient.instance;
const apiKey = defaultClient.authentications['api-key'];
apiKey.apiKey = process.env.BREVO_API_KEY;
const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

// Supabase Client Setup
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

let storedOtp = {};

// Send OTP Route
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

// Verify OTP Route
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

// Place Order & Save to Supabase Database Route
app.post('/api/place-order', async (req, res) => {
    const { email, address, items, totalAmount } = req.body;

    try {
        // అడ్రస్ ఆబ్జెక్ట్ లేదా స్ట్రింగ్ సరిగ్గా టెక్స్ట్ ఫార్మాట్‌లోకి మార్చడానికి
        const addressStr = typeof address === 'object' && address !== null
            ? `${address.name || ''}, ${address.phone || ''}, ${address.house || ''}, ${address.street || ''}, ${address.landmark ? address.landmark + ', ' : ''}${address.city || ''} - ${address.pincode || ''}`
            : address;

        // 1. Save order into Supabase 'orders' table
        const { data, error } = await supabase
            .from('orders')
            .insert([
                { 
                    email: email, 
                    address: addressStr, // <--- ఇక్కడ సరిదిద్దబడింది (ఆబ్జెక్ట్ బదులు స్ట్రింగ్ వెళుతుంది)
                    items: items, 
                    total_amount: totalAmount,
                    created_at: new Date()
                }
            ]);

        if (error) {
            console.error("Supabase Error:", error);
            return res.status(500).json({ success: false, error: error.message });
        }

        // 2. Format items for Admin Email
        const itemsListStr = items.map(i => `${i.name} (x${i.quantity}) - ₹${i.price * i.quantity}`).join('<br>');
        
        const orderDetailsHtml = `
            <p><b>Customer Email:</b> ${email}</p>
            <p><b>Delivery Address:</b> ${addressStr}</p>
            <p><b>Items Ordered:</b><br>${itemsListStr}</p>
            <p><b>Total Amount:</b> ₹${totalAmount}</p>
        `;

        // 3. Send Admin Notification Email via Brevo
        await sendOrderEmail(orderDetailsHtml);

        res.status(200).json({ success: true, message: 'Order placed successfully!', data });
    } catch (err) {
        console.error("Place Order Error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/', (req, res) => {
    res.send("J-Mart Backend is running!");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Helper function to send order email to admin
const sendOrderEmail = async (orderDetails) => {
    const sendSibiEmail = new SibApiV3Sdk.SendSmtpEmail();
    sendSibiEmail.sender = { name: "J-Mart", email: process.env.SENDER_EMAIL };
    sendSibiEmail.to = [{ email: process.env.ADMIN_MAIL }]; 
    sendSibiEmail.subject = "New Order Received - J-Mart";
    sendSibiEmail.htmlContent = `<h3>కొత్త ఆర్డర్ వచ్చింది!</h3>${orderDetails}`;

    try {
        await apiInstance.sendTransacEmail(sendSibiEmail);
        console.log("Order email sent successfully to admin");
    } catch (error) {
        console.error("Error sending order email:", error);
    }
};
