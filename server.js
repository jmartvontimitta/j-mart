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

const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
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
// VERIFY EMAIL OTP & SAVE USER TO FIREBASE
// =====================================

app.post('/verify-otp', async (req, res) => {
    try {
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

        // యూజర్ లాగిన్ వివరాలను Firebase Firestore లో సేవ్ చేయడం
        await db.collection('users').doc(email).set({
            email: email,
            verified: true,
            lastLogin: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        res.json({
            success: true,
            message: 'Email verified and saved to database successfully!'
        });

    } catch (error) {
        console.error('Verify OTP / Firebase Save Error:', error);
        res.status(500).json({
            success: false,
            message: 'Error verifying OTP or saving user'
        });
    }
});

// =====================================
// ORDER EMAIL NOTIFICATION & SAVE ORDER
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

// ఆర్డర్ సేవ్ చేయడానికి మరియు మెయిల్ పంపడానికి రూట్
app.post('/place-order', async (req, res) => {
    try {
        const orderData = req.body;

        // ఆర్డర్ ని Firebase లోని 'orders' కలెక్షన్‌లో సేవ్ చేయడం
        const orderRef = await db.collection('orders').add({
            ...orderData,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // మెయిల్ పంపడం
        await sendOrderEmail(JSON.stringify(orderData, null, 2));

        res.json({
            success: true,
            message: 'Order placed successfully!',
            orderId: orderRef.id
        });
    } catch (error) {
        console.error('Place Order Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to place order'
        });
    }
});

// =====================================
// HOME ROUTE
// =====================================

app.get('/', (req, res) => {
    res.send('Welcome to J-Mart Backend!');
});

// =====================================
// FIREBASE STATUS & TEST WRITE
// =====================================

app.get('/firebase-status', async (req, res) => {
    try {
        // డేటాబేస్ పనిచేస్తుందో లేదో చెక్ చేయడానికి ఒక శాంపిల్ డాక్యుమెంట్ రాయడం
        await db.collection('test_connection').doc('status').set({
            connected: true,
            checkedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        res.json({
            success: true,
            message: 'Firebase Firestore connected and test data written!'
        });

    } catch (error) {
        console.error('Firebase Error:', error);

        res.status(500).json({
            success: false,
            message: 'Firebase connection failed',
            error: error.message
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
    console.log('================================');
});
