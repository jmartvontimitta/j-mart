const express = require('express');
const app = express();
const admin = require('firebase-admin');
const port = process.env.PORT || 3000;

// Initialize Firebase Admin SDK
// Make sure to provide your service account key file
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>J-Mart - Checkout & Place Order</title>
    <style>
        * { box-sizing: border-box; }
        body { background-color: #f4f7f6; margin: 0; padding: 20px; display: flex; justify-content: center; }
        .container { background: #ffffff; max-width: 550px; width: 100%; padding: 25px; border-radius: 12px; box-shadow: 0 6px 18px rgba(0,0,0,0.08); }
    </style>
</head>
<body>
    <div class="container">
        <h1>Welcome to J-Mart</h1>
    </div>
</body>
</html>`);
});

app.listen(port, () => {
    console.log('Server is running on port ' + port);
});
