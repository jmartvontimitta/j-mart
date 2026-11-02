
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const SibApiV3Sdk = require('sib-api-v3-sdk');
const crypto = require('crypto');

const app = express();

// =====================================
// MIDDLEWARE
// =====================================

app.use(cors());
app.use(express.json());

// =====================================
// FIREBASE CONFIGURATION
// =====================================

if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT is missing');
}

const serviceAccount = JSON.parse(
    process.env.FIREBASE_SERVICE_ACCOUNT
);

const firebaseApp = admin.apps.length
    ? admin.app()
    : admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });

const db = getFirestore(firebaseApp);

console.log('Firebase connected successfully');

// =====================================
// BREVO EMAIL CONFIGURATION
// =====================================

const defaultClient = SibApiV3Sdk.ApiClient.instance;

const apiKey = defaultClient.authentications['api-key'];

apiKey.apiKey = process.env.BREVO_API_KEY;

const apiInstance =
    new SibApiV3Sdk.TransactionalEmailsApi();

const SENDER_EMAIL = 'jmartvontimitta@gmail.com';

// =====================================
// OTP STORAGE
// =====================================

const storedOtp = new Map();

// =====================================
// SEND EMAIL OTP
// =====================================

app.post('/send-otp', async (req, res) => {
    try {
        const email = req.body.email?.trim().toLowerCase();

        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Please enter your email'
            });
        }

        if (!process.env.BREVO_API_KEY) {
            throw new Error('BREVO_API_KEY is missing');
        }

        const otp = crypto.randomInt(100000, 1000000).toString();

        storedOtp.set(email, {
            code: otp,
            expiresAt: Date.now() + 5 * 60 * 1000
        });

        const sendEmail = new SibApiV3Sdk.SendSmtpEmail();

        sendEmail.sender = {
            name: 'J-Mart',
            email: SENDER_EMAIL
        };

        sendEmail.to = [{ email }];

        sendEmail.subject = 'J-Mart Email Verification';

        sendEmail.htmlContent = `
            <h2>Welcome to J-Mart!</h2>
            <p>Your verification OTP is:</p>
            <h1>${otp}</h1>
            <p>This OTP expires in 5 minutes.</p>
        `;

        await apiInstance.sendTransacEmail(sendEmail);

        res.json({
            success: true,
            message: 'OTP sent successfully!'
        });

    } catch (error) {
        console.error('Send OTP Error:', error);

        res.status(500).json({
            success: false,
            message: 'Unable to send OTP'
        });
    }
});

// =====================================
// VERIFY EMAIL OTP
// =====================================

app.post('/verify-otp', (req, res) => {
    const email = req.body.email?.trim().toLowerCase();
    const otp = String(req.body.otp || '').trim();

    if (!email || !otp) {
        return res.status(400).json({
            success: false,
            message: 'Email or OTP is missing'
        });
    }

    const savedOtp = storedOtp.get(email);

    if (!savedOtp) {
        return res.status(400).json({
            success: false,
            message: 'OTP not found or already used'
        });
    }

    if (Date.now() > savedOtp.expiresAt) {
        storedOtp.delete(email);

        return res.status(400).json({
            success: false,
            message: 'OTP expired. Please request a new OTP.'
        });
    }

    if (savedOtp.code !== otp) {
        return res.status(400).json({
            success: false,
            message: 'Invalid OTP'
        });
    }

    storedOtp.delete(email);

    res.json({
        success: true,
        message: 'Email verified successfully!'
    });
});

// =====================================
// ORDER EMAIL NOTIFICATION
// =====================================

async function sendOrderEmail(orderDetails) {
    try {
        const sendEmail = new SibApiV3Sdk.SendSmtpEmail();

        sendEmail.sender = {
            name: 'J-Mart',
            email: SENDER_EMAIL
        };

        sendEmail.to = [{
            email: SENDER_EMAIL
        }];

        sendEmail.subject = 'New Order Received - J-Mart';

        const safeDetails = String(orderDetails)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        sendEmail.htmlContent = `
            <h2>New Order Received!</h2>
            <p>${safeDetails}</p>
        `;

        await apiInstance.sendTransacEmail(sendEmail);

        console.log('Order email sent successfully');

    } catch (error) {
        console.error('Order Email Error:', error);
    }
}

// =====================================
// HOME ROUTE
// =====================================

app.get('/', (req, res) => {
    res.send('Welcome to J-Mart Backend!');
});

// =====================================
// FIREBASE STATUS
// =====================================

app.get('/firebase-status', async (req, res) => {
    try {
        await db.listCollections();

        res.json({
            success: true,
            message: 'Firebase Firestore connected'
        });

    } catch (error) {
        console.error('Firebase Error:', error);

        res.status(500).json({
            success: false,
            message: 'Firebase connection failed'
        });
    }
});

// =====================================
// START SERVER
// =====================================

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log('================================');
    console.log('J-MART SERVER STARTED');
    console.log('Port:', PORT);
    console.log('Firebase: Connected');
    console.log('Email OTP: Ready');
    console.log('Payment routes: Removed');
    console.log('================================');
});
