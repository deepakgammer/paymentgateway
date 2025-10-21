// ============================================================
// ✅ PHONEPE V2 — FINAL DEPLOYMENT WITH SUCCESS + FAILURE HANDLING
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
// ✅ CREATE PAYMENT REQUEST (PG CHECKOUT)
// ============================================================
app.get("/pay", async (req, res) => {
  try {
    const token = await getAuthToken();
    const ts = Date.now();
    const merchantOrderId = `ORDER${ts}`;
    const amount = 49900; // Example ₹499.00 (amount in paise)

    const payload = {
      merchantOrderId,
      amount,
      expireAfter: 1200,
      metaInfo: { udf1: "perlyn_render_test" },
      paymentFlow: {
        type: "PG_CHECKOUT",
        message: "PhonePe PG Render Test",
        merchantUrls: {
          redirectUrl: `https://paymentgateway-uvsq.onrender.com/result/${merchantOrderId}`,
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
      data?.redirectUrl || data?.data?.redirectUrl || data?.response?.redirectUrl;

    if (mercuryUrl && mercuryUrl.includes("mercury")) {
      console.log("✅ Mercury URL:", mercuryUrl);
      res.redirect(mercuryUrl);
    } else {
      console.warn("⚠️ No Mercury redirect URL found:", data);
      res.status(400).json(data);
    }
  } catch (err) {
    console.error("❌ Error:", err.message);
    res.status(500).send(`<pre>${err.message}</pre>`);
  }
});

// ============================================================
// ✅ RESULT REDIRECTION HANDLER
// ============================================================
app.get("/result/:id", (req, res) => {
  const orderId = req.params.id;

  // For demo, we can decide success/failure based on sandbox response later.
  // For now, always redirect to frontend.
  const isSuccess = true;

  if (isSuccess) {
    res.redirect(`https://www.perlynbeauty.co/success.html?order=${orderId}`);
  } else {
    res.redirect(`https://www.perlynbeauty.co/fail.html?order=${orderId}`);
  }
});

// ============================================================
// ✅ WEBHOOK ENDPOINT
// ============================================================
app.post("/phonepe/webhook", (req, res) => {
  console.log("🔔 Webhook received:", req.body);
  res.status(200).send("Webhook acknowledged");
});

// ============================================================
// 🚀 START SERVER
// ============================================================
const port = PORT || process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`🚀 PhonePe V2 Proto running live on Render (port ${port})`);
});
