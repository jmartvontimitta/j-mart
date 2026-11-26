require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const nodemailer = require("nodemailer");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = process.env.PORT || 10000;
const JWT_SECRET = process.env.JWT_SECRET || "jmart-super-secret-key-change-in-env";

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Multer for payment screenshot upload (in-memory)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5 MB
});

// Supabase Client (use SERVICE_ROLE_KEY on backend)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

// Optional Email Transporter (Nodemailer / Brevo SMTP)
const mailer =
  process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      })
    : null;

async function sendEmailSafe(to, subject, text, html) {
  if (!mailer || !to) return;
  try {
    await mailer.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to,
      subject,
      text,
      html
    });
  } catch (err) {
    console.error("Email send error:", err.message);
  }
}

function getAuthUser(req) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) return null;
  try {
    return jwt.verify(auth.slice(7), JWT_SECRET);
  } catch {
    return null;
  }
}

// Health check
app.get("/", (_req, res) => {
  res.json({ success: true, message: "J-Mart API is running" });
});

// 1. Send OTP (Sign Up or Forgot Password)
app.post("/api/send-otp", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const name = String(req.body.name || "").trim();

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ success: false, message: "Valid email is required." });
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { data: existing, error: selErr } = await supabase
      .from("customers")
      .select("id, name")
      .ilike("email", email)
      .maybeSingle();

    if (selErr) {
      console.error("Send OTP select error:", selErr);
      return res.status(500).json({ success: false, message: "Database error." });
    }

    if (existing) {
      const updatePayload = {
        otp_code: otp,
        otp_expires_at: expiresAt,
        updated_at: new Date().toISOString()
      };
      if (name) updatePayload.name = name;

      const { error: updErr } = await supabase
        .from("customers")
        .update(updatePayload)
        .eq("id", existing.id);

      if (updErr) {
        console.error("Send OTP update error:", updErr);
        return res.status(500).json({ success: false, message: "Failed to save OTP." });
      }
    } else {
      const { error: insErr } = await supabase.from("customers").insert({
        email,
        name: name || email.split("@")[0],
        otp_code: otp,
        otp_expires_at: expiresAt,
        updated_at: new Date().toISOString()
      });

      if (insErr) {
        console.error("Send OTP insert error:", insErr);
        return res.status(500).json({ success: false, message: "Failed to create customer record." });
      }
    }

    await sendEmailSafe(
      email,
      "J-Mart Verification OTP",
      `Your J-Mart OTP is ${otp}. Valid for 10 minutes.`,
      `<p>Your J-Mart verification OTP is <b>${otp}</b>. It is valid for 10 minutes.</p>`
    );

    return res.json({ success: true, message: "OTP sent to email." });
  } catch (err) {
    console.error("Send OTP error:", err);
    return res.status(500).json({ success: false, message: "Server error while sending OTP." });
  }
});

// 2. Verify OTP
app.post("/api/verify-otp", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const otp = String(req.body.otp || "").trim();

    if (!email || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({ success: false, message: "Valid email and 6-digit OTP required." });
    }

    const { data: user, error } = await supabase
      .from("customers")
      .select("id, email, name, otp_code, otp_expires_at")
      .ilike("email", email)
      .maybeSingle();

    if (error || !user) {
      return res.status(400).json({ success: false, message: "User not found." });
    }

    if (!user.otp_code || String(user.otp_code) !== otp) {
      return res.status(400).json({ success: false, message: "Invalid OTP." });
    }

    if (user.otp_expires_at && new Date(user.otp_expires_at).getTime() < Date.now()) {
      return res.status(400).json({ success: false, message: "OTP expired. Please request a new OTP." });
    }

    await supabase
      .from("customers")
      .update({ otp_code: null, otp_expires_at: null })
      .eq("id", user.id);

    const token = jwt.sign(
      { email: user.email, name: user.name || "" },
      JWT_SECRET,
      { expiresIn: "15m" }
    );

    return res.json({
      success: true,
      token,
      name: user.name || "",
      email: user.email
    });
  } catch (err) {
    console.error("Verify OTP error:", err);
    return res.status(500).json({ success: false, message: "Server error verifying OTP." });
  }
});

// 3. Set / Reset Password
app.post("/api/set-password", async (req, res) => {
  try {
    const password = String(req.body.password || "");
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters." });
    }

    const decoded = getAuthUser(req);
    if (!decoded || !decoded.email) {
      return res.status(401).json({ success: false, message: "Unauthorized or expired OTP token." });
    }

    const email = String(decoded.email).trim().toLowerCase();
    const password_hash = await bcrypt.hash(password, 10);

    const { data: updated, error } = await supabase
      .from("customers")
      .update({ password_hash, updated_at: new Date().toISOString() })
      .ilike("email", email)
      .select("email, name")
      .maybeSingle();

    if (error || !updated) {
      return res.status(500).json({ success: false, message: "Could not save password." });
    }

    const sessionToken = jwt.sign(
      { email: updated.email, name: updated.name || "" },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({
      success: true,
      token: sessionToken,
      name: updated.name || "",
      email: updated.email,
      message: "Password saved successfully."
    });
  } catch (err) {
    console.error("Set password error:", err);
    return res.status(500).json({ success: false, message: "Server error saving password." });
  }
});

// 4. Login with Email & Password
app.post("/api/login", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required." });
    }

    const { data: user, error } = await supabase
      .from("customers")
      .select("id, email, name, password_hash")
      .ilike("email", email)
      .maybeSingle();

    if (error || !user || !user.password_hash) {
      return res.status(401).json({ success: false, message: "Invalid email or password." });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ success: false, message: "Invalid email or password." });
    }

    const token = jwt.sign(
      { email: user.email, name: user.name || "" },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({
      success: true,
      token,
      name: user.name || "",
      email: user.email
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ success: false, message: "Server error during login." });
  }
});

// 5. Place Order
app.post("/api/place-order", upload.single("paymentProof"), async (req, res) => {
  try {
    const authUser = getAuthUser(req);
    const email = String(req.body.email || (authUser && authUser.email) || "")
      .trim()
      .toLowerCase();

    if (!email) {
      return res.status(400).json({ success: false, message: "Customer email is required." });
    }

    let address = req.body.address;
    let items = req.body.items;
    if (typeof address === "string") {
      try { address = JSON.parse(address); } catch { /* keep string */ }
    }
    if (typeof items === "string") {
      try { items = JSON.parse(items); } catch { items = []; }
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: "Cart items cannot be empty." });
    }

    const totalAmount =
      Number(req.body.totalAmount) ||
      items.reduce((sum, i) => sum + (Number(i.price) || 0) * (Number(i.quantity) || 0), 0);

    const paymentMethod = String(req.body.paymentMethod || "cod");
    const orderNumber = "JM" + Date.now().toString().slice(-8);

    const insertRow = {
      order_number: orderNumber,
      email,
      address,
      items,
      total_amount: totalAmount,
      payment_method: paymentMethod,
      payment_status: paymentMethod === "cod" ? "COD" : "Pending Verification",
      order_status: "Order Placed",
      created_at: new Date().toISOString()
    };

    const { data: inserted, error } = await supabase
      .from("orders")
      .insert(insertRow)
      .select()
      .maybeSingle();

    if (error) {
      console.error("Place order DB error:", error);
      return res.status(500).json({ success: false, message: "Failed to save order." });
    }

    const orderObj = inserted || insertRow;

    await sendEmailSafe(
      email,
      `J-Mart Order Confirmed (#${orderObj.order_number})`,
      `Thank you for your order! Total: ₹${totalAmount}`,
      `<p>Thank you for ordering from <b>J-Mart</b>!</p><p><b>Order ID:</b> #${orderObj.order_number}<br><b>Total Amount:</b> ₹${totalAmount}</p>`
    );

    return res.json({
      success: true,
      order: orderObj
    });
  } catch (err) {
    console.error("Place order error:", err);
    return res.status(500).json({ success: false, message: "Server error placing order." });
  }
});

// 6. Get Customer Orders
app.get("/api/orders", async (req, res) => {
  try {
    const authUser = getAuthUser(req);
    const email = String((authUser && authUser.email) || req.query.email || "")
      .trim()
      .toLowerCase();

    if (!email) {
      return res.status(401).json({ success: false, message: "Please login to view orders." });
    }

    const { data: orders, error } = await supabase
      .from("orders")
      .select("*")
      .ilike("email", email)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Get orders error:", error);
      return res.status(500).json({ success: false, message: "Could not fetch orders." });
    }

    return res.json({
      success: true,
      orders: orders || []
    });
  } catch (err) {
    console.error("Orders route error:", err);
    return res.status(500).json({ success: false, message: "Server error loading orders." });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
