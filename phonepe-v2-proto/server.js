// ============================================================
// ✅ PHONEPE V2 — PRODUCTION READY (PERLYN LIVE BUILD)
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
  MODE,
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
// ✅ AUTH TOKEN
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
  if (!res.ok) throw new Error(data.error_description || "Auth failed");
  console.log("✅ Auth Token fetched successfully");
  return data.access_token;
}

// ============================================================
// ✅ CREATE PAYMENT — Used by /create-payment
// ============================================================
app.post("/create-payment", async (req, res) => {
  try {
    const { amount, orderId } = req.body;
    const token = await getAuthToken();

    const payload = {
      merchantOrderId: orderId,
      amount: amount * 100, // Convert ₹ → paise
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

    const response = await fetch(PAYMENT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `O-Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    let data = {};
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("Invalid JSON response");
    }

    const mercuryUrl =
      data?.redirectUrl || data?.data?.redirectUrl || data?.response?.redirectUrl;

    if (mercuryUrl) {
      console.log("✅ Mercury URL:", mercuryUrl);
      res.json({ success: true, redirectUrl: mercuryUrl });
    } else {
      res.status(400).json({ success: false, error: "No redirect URL", data });
    }
  } catch (err) {
    console.error("❌ Error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================
// ✅ WEBHOOK — Payment Updates
// ============================================================
app.post("/phonepe/webhook", (req, res) => {
  console.log("🔔 Webhook received:", req.body);
  res.status(200).send("Webhook acknowledged");
});

// ============================================================
// ✅ SUCCESS / FAIL PAGES
// ============================================================
app.get("/success/:id", (req, res) => {
  res.send(`
    <html><body style="background:#d1ffd1;text-align:center;font-family:sans-serif;">
      <h2>🎉 Payment Complete!</h2>
      <p>Order ID: ${req.params.id}</p>
      <a href="https://www.perlynbeauty.co">Back to Home</a>
    </body></html>
  `);
});

app.get("/fail", (req, res) => {
  res.send(`
    <html><body style="background:#ffd1d1;text-align:center;font-family:sans-serif;">
      <h2>❌ Payment Failed</h2>
      <p>Please try again or use a different payment method.</p>
      <a href="https://www.perlynbeauty.co">Return to Shop</a>
    </body></html>
  `);
});

// ============================================================
// 🚀 START SERVER
// ============================================================
const port = PORT || 5000;
app.listen(port, () => {
  console.log(`🚀 PhonePe V2 Proto running in ${MODE} mode (port ${port})`);
});
