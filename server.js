const express = require("express");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
require("dotenv").config();

const app = express();
app.use(express.json());

const otps = new Map();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD
  }
});

// Serve the complete webpage
app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>J-Mart Email OTP</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body {
          font-family: Arial;
          background: #f1f5f9;
          display: grid;
          place-items: center;
          min-height: 90vh;
        }
        .box {
          background: white;
          padding: 28px;
          border-radius: 14px;
          width: min(320px, 85vw);
          box-shadow: 0 4px 20px #0002;
        }
        input, button {
          box-sizing: border-box;
          width: 100%;
          padding: 12px;
          margin-top: 12px;
          border-radius: 7px;
        }
        input { border: 1px solid #bbb; }
        button {
          border: 0;
          background: #15803d;
          color: white;
          cursor: pointer;
        }
        #message { overflow-wrap: anywhere; }
      </style>
    </head>
    <body>
      <div class="box">
        <h2>🛒 J-Mart</h2>
        <h3>Email OTP Login</h3>

        <form id="sendForm">
          <input id="email" type="email"
            placeholder="Enter your Gmail address" required>
          <button type="submit">Send OTP</button>
        </form>

        <form id="verifyForm">
          <input id="otp" inputmode="numeric"
            maxlength="6" placeholder="Enter 6-digit OTP" required>
          <button type="submit">Verify OTP</button>
        </form>

        <p id="message" role="status"></p>
      </div>

      <script>
        const message = document.getElementById("message");

        document.getElementById("sendForm").onsubmit = async (e) => {
          e.preventDefault();
          message.textContent = "Sending OTP...";

          try {
            const response = await fetch("/api/send-otp", {
              method: "POST",
              headers: {"Content-Type": "application/json"},
              body: JSON.stringify({
                email: document.getElementById("email").value
              })
            });

            const data = await response.json();
            message.textContent = data.message;
          } catch {
            message.textContent = "Could not connect to server.";
          }
        };

        document.getElementById("verifyForm").onsubmit = async (e) => {
          e.preventDefault();

          try {
            const response = await fetch("/api/verify-otp", {
              method: "POST",
              headers: {"Content-Type": "application/json"},
              body: JSON.stringify({
                email: document.getElementById("email").value,
                otp: document.getElementById("otp").value
              })
            });

            const data = await response.json();
            message.textContent = data.message;
          } catch {
            message.textContent = "Could not connect to server.";
          }
        };
      </script>
    </body>
    </html>
  );
};

// Generate and send OTP
app.post("/api/send-otp", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();

  if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) {
    return res.status(400).json({ message: "Enter a valid email." });
  }

  const previous = otps.get(email);

  if (previous && Date.now() - previous.sentAt < 60000) {
    return res.status(429).json({
      message: "Please wait 60 seconds before requesting another OTP."
    });
  }

  const otp = crypto.randomInt(100000, 1000000).toString();

  otps.set(email, {
    hash: crypto.createHash("sha256").update(otp).digest("hex"),
    expires: Date.now() + 5 * 60 * 1000,
    sentAt: Date.now(),
    attempts: 0
  });

  try {
    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: email,
      subject: "Your J-Mart verification code",
      text: "Your J-Mart OTP is " + otp +
        ". It expires in 5 minutes. Do not share it with anyone."
    });

    res.json({ message: "OTP sent! Check your email inbox." });
  } catch (error) {
    otps.delete(email);
    console.error("Email delivery failed:", error.message);
    res.status(500).json({
      message: "Email sending failed. Check your Gmail configuration."
    });
  }
});

// Verify OTP
app.post("/api/verify-otp", (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const otp = String(req.body.otp || "");
  const record = otps.get(email);

  if (!record || Date.now() > record.expires) {
    otps.delete(email);
    return res.status(400).json({
      message: "OTP expired or not requested. Please request a new one."
    });
  }

  if (record.attempts >= 5) {
    otps.delete(email);
    return res.status(429).json({
      message: "Too many attempts. Request a new OTP."
    });
  }

  record.attempts++;

  const hash = crypto.createHash("sha256").update(otp).digest("hex");

  if (!/^\\d{6}$/.test(otp) || hash !== record.hash) {
    return res.status(400).json({ message: "Incorrect OTP." });
  }

  otps.delete(email);
  res.json({ message: "Email verified successfully!" });
});

app.listen(process.env.PORT || 3000, () => {
  console.log("J-Mart running at http://localhost:3000");
});
