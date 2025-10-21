// ============================================================
// ✅ PHONEPE V2 — FINAL RENDER DEPLOYMENT (PERLYN LIVE BUILD)
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
// 🔧 ENVIRONMENT VARIABLES
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
// 🔗 BASE URLS
// ============================================================
const BASE_URL =
  MODE === "production"
    ? "https://api.phonepe.com/apis/hermes/pg/v1"
    : "https://api-preprod.phonepe.com/apis/pg-sandbox/v1";

const AUTH_URL = `${BASE_URL}/oauth/token`;
const PAYMENT_URL =
  MODE === "production"
    ? "https://api.phonepe.com/apis/hermes/pg/v1/pay"
    : "https://api-preprod.phonepe.com/apis/pg-sandbox/checkout/v2/pay";

// ============================================================
// ✅ AUTH TOKEN GENERATOR
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

  const data = await res.json();
  if (!res.ok) {
    console.error("❌ Auth API Response:", data);
    throw new Error(data.error_description || "Auth failed");
  }

  console.log("✅ Auth Token fetched successfully");
  return data.access_token;
}

// ============================================================
// ✅ CREATE PAYMENT REQUEST (PG CHECKOUT - DYNAMIC)
// ============================================================
// Frontend will call POST /create-payment with { amount, orderId }
app.post("/create-payment", async (req, res) => {
  try {
    const { amount, orderId } = req.body;

    if (!amount || !orderId) {
      return res.status(400).json({ error: "Missing amount or orderId" });
    }

    const token = await getAuthToken();
    const amountPaise = Math.round(amount * 100); // Convert ₹ → paise

    const payload = {
      merchantOrderId: orderId,
      amount: amountPaise,
      expireAfter: 1200,
      metaInfo: { udf1: "perlyn_live_order" },
      paymentFlow: {
        type: "PG_CHECKOUT",
        message: "PhonePe PG Live Payment",
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

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("Invalid JSON response");
    }

    const mercuryUrl =
      data?.redirectUrl ||
      data?.data?.redirectUrl ||
      data?.response?.redirectUrl;

    if (mercuryUrl && mercuryUrl.includes("mercury")) {
      console.log("✅ Mercury URL:", mercuryUrl);
      return res.json({ success: true, redirectUrl: mercuryUrl });
    } else {
      console.warn("⚠️ No Mercury redirect URL found:", data);
      return res.status(400).json({ success: false, data });
    }
  } catch (err) {
    console.error("❌ Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// ✅ WEBHOOK ENDPOINT
// ============================================================
app.post("/phonepe/webhook", (req, res) => {
  console.log("🔔 Webhook received:", req.body);
  // TODO: verify checksum when SALT_KEY + SALT_INDEX available
  res.status(200).send("Webhook acknowledged");
});

// ============================================================
// ✅ SUCCESS PAGE (Fallback)
// ============================================================
app.get("/success/:id", (req, res) => {
  res.send(`
    <html>
      <body style="background:#d1ffd1;text-align:center;font-family:sans-serif;">
        <h2>🎉 Payment Complete!</h2>
        <p>Order ID: ${req.params.id}</p>
        <a href="/">Return to Perlyn</a>
      </body>
    </html>
  `);
});

// ============================================================
// 🚀 START SERVER
// ============================================================
const port = PORT || process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`🚀 PhonePe V2 Proto running live on Render (port ${port})`);
});
