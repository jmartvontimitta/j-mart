<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>J-Mart - Checkout & Place Order</title>
    <style>
        * {
            box-sizing: border-box;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }
        body {
            background-color: #f4f7f6;
            margin: 0;
            padding: 20px;
            display: flex;
            justify-content: center;
        }
        .container {
            background: #ffffff;
            max-width: 550px;
            width: 100%;
            padding: 25px;
            border-radius: 12px;
            box-shadow: 0 6px 18px rgba(0,0,0,0.08);
        }
        h2 {
            text-align: center;
            color: #2c3e50;
            margin-top: 0;
            border-bottom: 2px solid #eee;
            padding-bottom: 12px;
        }
        .section-title {
            font-size: 16px;
            font-weight: 700;
            color: #16a085;
            margin: 20px 0 10px 0;
        }
        label {
            display: block;
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 5px;
            color: #444;
        }
        input, textarea, select {
            width: 100%;
            padding: 10px 12px;
            margin-bottom: 12px;
            border: 1px solid #ccc;
            border-radius: 6px;
            font-size: 14px;
        }
        .row {
            display: flex;
            gap: 10px;
        }
        .row > div {
            flex: 1;
        }
        button {
            width: 100%;
            padding: 12px;
            background-color: #16a085;
            color: white;
            font-size: 15px;
            font-weight: bold;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            transition: background 0.2s;
        }
        button:hover {
            background-color: #138a72;
        }
        button:disabled {
            background-color: #95a5a6;
            cursor: not-allowed;
        }
        .btn-secondary {
            background-color: #2980b9;
            margin-bottom: 12px;
        }
        .btn-secondary:hover {
            background-color: #1f6391;
        }
        .status-msg {
            font-size: 14px;
            font-weight: 600;
            padding: 10px;
            border-radius: 6px;
            margin-top: 10px;
            display: none;
            text-align: center;
        }
        .success {
            background-color: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }
        .error {
            background-color: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }
        .item-box {
            background: #f9f9f9;
            padding: 12px;
            border-radius: 8px;
            border: 1px solid #e0e0e0;
            margin-bottom: 12px;
        }
    </style>
</head>
<body>

<div class="container">
    <h2>J-Mart Checkout</h2>

    <!-- STEP 1: EMAIL OTP VERIFICATION (Optional or Required) -->
    <div class="section-title">1. Email Verification (OTP)</div>
    <label for="customerEmail">Customer Email *</label>
    <div class="row">
        <div style="flex: 2;">
            <input type="email" id="customerEmail" placeholder="Enter your email" required>
        </div>
        <div style="flex: 1;">
            <button type="button" class="btn-secondary" id="sendOtpBtn" onclick="sendOtp()">Send OTP</button>
        </div>
    </div>

    <div id="otpSection" style="display: none;">
        <div class="row">
            <div style="flex: 2;">
                <input type="text" id="otpInput" placeholder="Enter 6-digit OTP">
            </div>
            <div style="flex: 1;">
                <button type="button" class="btn-secondary" id="verifyOtpBtn" onclick="verifyOtp()">Verify OTP</button>
            </div>
        </div>
    </div>
    <div id="otpStatus" class="status-msg"></div>

    <!-- STEP 2: CUSTOMER & ADDRESS DETAILS -->
    <form id="orderForm" onsubmit="placeOrder(event)">
        <div class="section-title">2. Customer & Delivery Address</div>
        
        <label for="fullName">Full Name *</label>
        <input type="text" id="fullName" placeholder="Enter customer name" required>

        <label for="phone">Phone Number *</label>
        <input type="tel" id="phone" placeholder="Enter 10-digit mobile number" required>

        <label for="streetAddress">House No / Street / Landmark *</label>
        <textarea id="streetAddress" rows="2" placeholder="Complete delivery address" required></textarea>

        <div class="row">
            <div>
                <label for="city">Town / City *</label>
                <input type="text" id="city" placeholder="e.g., Vontimitta / Kadapa" required>
            </div>
            <div>
                <label for="pincode">Pincode *</label>
                <input type="text" id="pincode" placeholder="e.g., 516213" required>
            </div>
        </div>

        <!-- STEP 3: ORDER ITEMS DETAILS -->
        <div class="section-title">3. Order Details (ఏం ఆర్డర్ చేశారు & ఎన్ని)</div>
        <div class="item-box">
            <label for="itemsList">Items Ordered (వస్తువుల పేర్లు) *</label>
            <textarea id="itemsList" rows="2" placeholder="e.g., Rice 5kg, Oil 2 Liters, Sugar 1kg" required></textarea>

            <div class="row">
                <div>
                    <label for="totalQuantity">Total Quantity (ఎన్ని వస్తువులు) *</label>
                    <input type="number" id="totalQuantity" min="1" value="1" required>
                </div>
                <div>
                    <label for="totalAmount">Total Price (₹) *</label>
                    <input type="number" id="totalAmount" min="1" placeholder="e.g., 450" required>
                </div>
            </div>

            <label for="paymentMethod">Payment Method</label>
            <select id="paymentMethod">
                <option value="Cash on Delivery (COD)">Cash on Delivery (COD)</option>
                <option value="Online Payment / UPI">Online Payment / UPI</option>
            </select>
        </div>

        <button type="submit" id="placeOrderBtn">Place Order Now</button>
        <div id="orderStatus" class="status-msg"></div>
    </form>
</div>

<script>
    // ====================================================
    // మీ Render బ్యాకెండ్ URL ఇక్కడ ఇవ్వండి
    // ====================================================
    const BACKEND_URL = 'https://j-mart-de1c.onrender.com';

    let isEmailVerified = false;

    function showMessage(elementId, text, isSuccess) {
        const el = document.getElementById(elementId);
        el.style.display = 'block';
        el.textContent = text;
        el.className = 'status-msg ' + (isSuccess ? 'success' : 'error');
    }

    // 1. SEND OTP FUNCTION
    async function sendOtp() {
        const email = document.getElementById('customerEmail').value.trim();
        const btn = document.getElementById('sendOtpBtn');

        if (!email) {
            showMessage('otpStatus', 'Please enter your email first.', false);
            return;
        }

        btn.disabled = true;
        btn.textContent = 'Sending...';

        try {
            const response = await fetch(`${BACKEND_URL}/send-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });

            const data = await response.json();

            if (data.success) {
                document.getElementById('otpSection').style.display = 'block';
                showMessage('otpStatus', 'OTP sent to your email!', true);
            } else {
                showMessage('otpStatus', data.message || 'Failed to send OTP', false);
            }
        } catch (error) {
            showMessage('otpStatus', 'Server connection error while sending OTP.', false);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Send OTP';
        }
    }

    // 2. VERIFY OTP FUNCTION
    async function verifyOtp() {
        const email = document.getElementById('customerEmail').value.trim();
        const otp = document.getElementById('otpInput').value.trim();
        const btn = document.getElementById('verifyOtpBtn');

        if (!otp) {
            showMessage('otpStatus', 'Please enter the OTP.', false);
            return;
        }

        btn.disabled = true;
        btn.textContent = 'Verifying...';

        try {
            const response = await fetch(`${BACKEND_URL}/verify-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, otp })
            });

            const data = await response.json();

            if (data.success) {
                isEmailVerified = true;
                showMessage('otpStatus', 'Email verified & saved to Firebase users!', true);
                document.getElementById('otpSection').style.display = 'none';
                document.getElementById('customerEmail').readOnly = true;
            } else {
                showMessage('otpStatus', data.message || 'Invalid OTP', false);
            }
        } catch (error) {
            showMessage('otpStatus', 'Error verifying OTP.', false);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Verify OTP';
        }
    }

    // 3. PLACE ORDER FUNCTION (Saves to Firebase 'orders' & Sends Email)
    async function placeOrder(event) {
        event.preventDefault();

        const btn = document.getElementById('placeOrderBtn');
        btn.disabled = true;
        btn.textContent = 'Placing Order...';

        // కస్టమర్ వివరాలు, అడ్రస్ మరియు ఆర్డర్ డేటాను ఒక ఆబ్జెక్ట్‌గా తయారు చేయడం
        const orderPayload = {
            customerDetails: {
                name: document.getElementById('fullName').value.trim(),
                email: document.getElementById('customerEmail').value.trim(),
                phone: document.getElementById('phone').value.trim(),
                emailVerified: isEmailVerified
            },
            deliveryAddress: {
                street: document.getElementById('streetAddress').value.trim(),
                city: document.getElementById('city').value.trim(),
                pincode: document.getElementById('pincode').value.trim()
            },
            orderSummary: {
                itemsOrdered: document.getElementById('itemsList').value.trim(),
                totalQuantity: Number(document.getElementById('totalQuantity').value),
                totalAmount: Number(document.getElementById('totalAmount').value),
                paymentMethod: document.getElementById('paymentMethod').value
            },
            orderStatus: 'Confirmed'
        };

        try {
            // మీ వెబ్‌సైట్ ఇప్పటికే వేరే పేజీలో కార్ట్ (localStorage) వాడుతుంటే ఆ డేటాను కూడా జతచేస్తుంది
            const existingCart = localStorage.getItem('cart') || localStorage.getItem('jmart_cart');
            if (existingCart) {
                orderPayload.cartItemsFromStorage = JSON.parse(existingCart);
            }
        } catch (e) {
            console.log('No localStorage cart found');
        }

        try {
            const response = await fetch(`${BACKEND_URL}/place-order`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(orderPayload)
            });

            const result = await response.json();

            if (result.success) {
                showMessage('orderStatus', `Order Placed Successfully! Order ID: ${result.orderId}`, true);
                document.getElementById('orderForm').reset();
            } else {
                showMessage('orderStatus', result.message || 'Failed to place order.', false);
            }
        } catch (error) {
            console.error('Order Error:', error);
            showMessage('orderStatus', 'Could not connect to server. Please check your Backend URL.', false);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Place Order Now';
        }
    }
</script>

</body>
</html>
