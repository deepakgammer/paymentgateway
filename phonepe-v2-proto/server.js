// ============================================================
// ✅ PHONEPE V2 — FINAL PRODUCTION DEPLOYMENT (PERLYN LIVE BUILD)
// ============================================================

import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// ============================================================
// 🔧 ENV VARIABLES
// ============================================================
const {
  MODE, // "production" or "sandbox"
  CLIENT_ID,
  CLIENT_SECRET,
  CLIENT_VERSION,
  MERCHANT_ID,
  PORT,
} = process.env;

// ============================================================
// 🔗 API ENDPOINTS (per environment)
// ============================================================
const AUTH_URL =
  MODE === "production"
    ? "https://api.phonepe.com/apis/identity-manager/v1/oauth/token"
    : "https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token";

const PAYMENT_URL =
  MODE === "production"
    ? "https://api.phonepe.com/apis/hermes/pg/v1/pay"
    : "https://api-preprod.phonepe.com/apis/pg-sandbox/checkout/v2/pay";

// ============================================================
// ✅ FETCH AUTH TOKEN
// ============================================================
async function getAuthToken() {
  console.log(`\n🔐 Requesting Auth Token from: ${AUTH_URL}`);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    client_version: CLIENT_VERSION,
    grant_type: "client_credentials",
  });

  const res = await fetch(AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    console.error("❌ Invalid JSON response from PhonePe:", text);
    throw new Error("Invalid JSON response");
  }

  if (!res.ok || !data.data?.access_token) {
    console.error("❌ Auth Response:", data);
    throw new Error(data.message || "Auth failed");
  }

  console.log("✅ Auth Token fetched successfully");
  return data.data.access_token;
}

// ============================================================
// ✅ CREATE PAYMENT ENDPOINT
// ============================================================
app.post("/create-payment", async (req, res) => {
  try {
    const { amount, orderId } = req.body;
    if (!amount || !orderId)
      return res
        .status(400)
        .json({ success: false, message: "Missing amount or orderId" });

    const token = await getAuthToken();
    const payload = {
      merchantOrderId: orderId,
      amount: amount * 100, // ₹ → paise
      expireAfter: 1200,
      metaInfo: { udf1: "perlyn_live_payment" },
      paymentFlow: {
        type: "PG_CHECKOUT",
        message: "Perlyn Beauty Payment Gateway",
        merchantUrls: {
          redirectUrl: `https://www.perlynbeauty.co/success/${orderId}`,
        },
      },
    };

    console.log("\n🧾 Payload Sent:");
    console.log(JSON.stringify(payload, null, 2));

    const response = await fetch(PAYMENT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `O-Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    console.log("\n📥 Raw API Response:", text);

    let data = {};
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("Invalid JSON response from payment API");
    }

    const redirectUrl =
      data?.redirectUrl || data?.data?.redirectUrl || data?.response?.redirectUrl;

    if (redirectUrl && redirectUrl.includes("phonepe.com")) {
      console.log("✅ Redirecting user to:", redirectUrl);
      return res.json({ success: true, redirectUrl });
    }

    console.warn("⚠️ No redirect URL found:", data);
    res.status(400).json({ success: false, data });
  } catch (err) {
    console.error("❌ Error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================
// ✅ WEBHOOK (optional verification)
// ============================================================
app.post("/phonepe/webhook", (req, res) => {
  console.log("🔔 Webhook received:", req.body);
  // You can verify signature here when SALT_KEY + SALT_INDEX are provided
  res.status(200).send("Webhook acknowledged");
});

// ============================================================
// ✅ SUCCESS + FAILURE HANDLERS
// ============================================================
app.get("/success/:id", (req, res) => {
  res.send(`
    <html>
      <body style="background:#d1ffd1;text-align:center;font-family:sans-serif;">
        <h2>🎉 Payment Complete!</h2>
        <p>Order ID: ${req.params.id}</p>
        <a href="https://www.perlynbeauty.co" 
           style="display:inline-block;margin-top:10px;padding:10px 20px;background:#b98474;color:white;text-decoration:none;border-radius:6px;">
           Back to Home
        </a>
      </body>
    </html>
  `);
});

app.get("/fail", (req, res) => {
  res.send(`
    <html>
      <body style="background:#ffd1d1;text-align:center;font-family:sans-serif;">
        <h2>❌ Payment Failed</h2>
        <p>Please try again or use another payment method.</p>
        <a href="https://www.perlynbeauty.co"
           style="display:inline-block;margin-top:10px;padding:10px 20px;background:#b98474;color:white;text-decoration:none;border-radius:6px;">
           Return to Shop
        </a>
      </body>
    </html>
  `);
});

// ============================================================
// 🚀 START SERVER
// ============================================================
const port = PORT || 5000;
app.listen(port, () => {
  console.log(`🚀 PhonePe V2 running in ${MODE} mode on port ${port}`);
});
