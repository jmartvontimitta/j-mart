<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>J-Mart - Checkout & Place Order</title>
    <style>
        * { box-sizing: border-box; }
        body { background-color: #f4f7f6; margin: 0; padding: 20px; display: flex; justify-content: center; font-family: Arial, sans-serif; }
        .container { background: #ffffff; max-width: 550px; width: 100%; padding: 25px; border-radius: 12px; box-shadow: 0 6px 18px rgba(0,0,0,0.08); }
        h2 { color: #333; }
        .form-group { margin-bottom: 15px; }
        label { display: block; margin-bottom: 5px; font-weight: bold; }
        input { width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 6px; }
        button { background: #007bff; color: white; border: none; padding: 10px 15px; border-radius: 6px; cursor: pointer; width: 100%; font-size: 16px; margin-top: 10px; }
        button:hover { background: #0056b3; }
        .message { margin-top: 10px; font-weight: bold; color: green; }
        .error { color: red; }
    </style>
</head>
<body>
    <div class="container">
        <h2>J-Mart Checkout & Verification</h2>
        
        <!-- Step 1: Send OTP -->
        <div class="form-group">
            <label for="email">Email Address:</label>
            <input type="email" id="email" placeholder="Enter your email">
            <button onclick="sendOtp()">Send OTP</button>
        </div>

        <!-- Step 2: Verify OTP -->
        <div class="form-group">
            <label for="otp">Enter OTP:</label>
            <input type="text" id="otp" placeholder="Enter 6-digit OTP">
            <button onclick="verifyOtp()">Verify OTP & Register</button>
        </div>

        <!-- Step 3: Place Order -->
        <div class="form-group">
            <label for="item">Product / Order Details:</label>
            <input type="text" id="item" placeholder="Enter product name">
            <button onclick="placeOrder()">Place Order</button>
        </div>

        <p id="responseMessage" class="message"></p>
    </div>

    <script>
        // మీ బ్యాకెండ్ లైవ్ URL లేదా లోకల్ URL ఇక్కడ ఇవ్వండి (ఉదాహరణకు: http://localhost:5000 లేదా మీ Render/Heroku URL)
        const BACKEND_URL = ''; 

        async function sendOtp() {
            const email = document.getElementById('email').value;
            const msgEl = document.getElementById('responseMessage');
            
            try {
                const res = await fetch(`${BACKEND_URL}/send-otp`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                });
                const data = await res.json();
                msgEl.innerText = data.message;
                msgEl.className = data.success ? 'message' : 'message error';
            } catch (err) {
                msgEl.innerText = 'Failed to send OTP';
                msgEl.className = 'message error';
            }
        }

        async function verifyOtp() {
            const email = document.getElementById('email').value;
            const otp = document.getElementById('otp').value;
            const msgEl = document.getElementById('responseMessage');
            
            try {
                const res = await fetch(`${BACKEND_URL}/verify-otp`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, otp })
                });
                const data = await res.json();
                msgEl.innerText = data.message;
                msgEl.className = data.success ? 'message' : 'message error';
            } catch (err) {
                msgEl.innerText = 'Failed to verify OTP';
                msgEl.className = 'message error';
            }
        }

        async function placeOrder() {
            const email = document.getElementById('email').value;
            const item = document.getElementById('item').value;
            const msgEl = document.getElementById('responseMessage');
            
            try {
                const res = await fetch(`${BACKEND_URL}/place-order`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, item, status: 'Pending' })
                });
                const data = await res.json();
                if (data.success) {
                    msgEl.innerText = `${data.message} Order ID: ${data.orderId}`;
                    msgEl.className = 'message';
                } else {
                    msgEl.innerText = data.message;
                    msgEl.className = 'message error';
                }
            } catch (err) {
                msgEl.innerText = 'Failed to place order';
                msgEl.className = 'message error';
            }
        }
    </script>
</body>
</html>
