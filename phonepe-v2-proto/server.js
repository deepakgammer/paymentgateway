// ============================================================
// ✅ PHONEPE V2 — FINAL PRODUCTION RENDER DEPLOYMENT (PERLYN LIVE BUILD)
// ============================================================

import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";

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
  SALT_KEY,
  SALT_INDEX,
} = process.env;

// ============================================================
// 🔗 BASE URLS (Auth + Payment)
// ============================================================
const AUTH_URL =
  MODE === "production"
    ? "https://api.phonepe.com/apis/identity-manager/v1/oauth/token"
    : "https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token";

const PAYMENT_URL =
  MODE === "production"
    ? "https://api.phonepe.com/apis/pg/checkout/v2/pay"
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

  const text = await res.text();
  console.log("📥 Raw Auth Response:", text);

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON response from PhonePe Auth");
  }

  const token =
    data?.access_token ||
    data?.data?.access_token ||
    data?.token ||
    data?.data?.token;

  if (!token) {
    console.error("❌ Auth failed:", data);
    throw new Error(data.message || "Auth failed — no access_token found");
  }

  console.log("✅ Auth Token fetched successfully");
  console.log(`🔑 Token Type: ${data.token_type || "Bearer"}`);

  return {
    token,
    type: data.token_type || "Bearer",
  };
}

// ============================================================
// ✅ CREATE PAYMENT ENDPOINT
// ============================================================
app.post("/create-payment", async (req, res) => {
  try {
    const { amount, orderId } = req.body;
    if (!amount || !orderId) {
      return res
        .status(400)
        .json({ success: false, message: "Missing amount or orderId" });
    }

    const { token, type } = await getAuthToken();

    const payload = {
      merchantOrderId: orderId,
      amount: amount * 100, // amount in paise
      expireAfter: 1200,
      metaInfo: { udf1: "perlyn_live_payment" },
      paymentFlow: {
        type: "PG_CHECKOUT",
        message: "Perlyn Beauty Payment Gateway",
        merchantUrls: {
          redirectUrl: `https://paymentgateway-uvsq.onrender.com/verify/${orderId}`,
        },
      },
    };

    console.log("\n🧾 Payment Payload:");
    console.log(JSON.stringify(payload, null, 2));

    const response = await fetch(PAYMENT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `${type} ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    console.log("\n📥 Raw Payment Response:", text);

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("Invalid JSON response from PhonePe Payment");
    }

    const mercuryUrl =
      data?.redirectUrl ||
      data?.data?.redirectUrl ||
      data?.response?.redirectUrl;

    if (mercuryUrl) {
      console.log("✅ Mercury Redirect URL:", mercuryUrl);
      res.json({ success: true, redirectUrl: mercuryUrl });
    } else {
      console.warn("⚠️ No redirect URL found in response:", data);
      res.status(400).json({ success: false, data });
    }
  } catch (err) {
    console.error("❌ Error during /create-payment:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================
// ✅ VERIFY PAYMENT STATUS — FINAL PRODUCTION VERSION
// ============================================================
app.get("/verify/:id", async (req, res) => {
  const orderId = req.params.id;
  const merchantId = MERCHANT_ID;
  const saltKey = SALT_KEY;
  const saltIndex = SALT_INDEX || 1;

  try {
    const path = `/v3/transaction/status/${merchantId}/${orderId}`;
    const base64 = Buffer.from("").toString("base64");

    // ✅ Generate X-VERIFY signature
    const xVerify =
      crypto
        .createHash("sha256")
        .update(path + base64 + saltKey)
        .digest("hex") + "###" + saltIndex;

    const statusUrl = `https://api.phonepe.com/apis/hermes${path}`;
    console.log(`\n🔍 Checking Payment Status: ${statusUrl}`);

    const response = await fetch(statusUrl, {
      method: "GET",
      headers: {
        accept: "application/json",
        "Content-Type": "application/json",
        "X-MERCHANT-ID": merchantId,
        "X-VERIFY": xVerify,
      },
    });

    const text = await response.text();
    console.log("📦 Status Response:", text);

    const data = JSON.parse(text);
    const code = data?.code || "UNKNOWN";
    const state = data?.data?.state || "UNKNOWN";

    if (code === "PAYMENT_SUCCESS" || state === "COMPLETED") {
      console.log("✅ Payment confirmed successful!");
      return res.redirect("https://www.perlynbeauty.co/success.html");
    } else {
      console.log("❌ Payment not successful:", code);
      return res.redirect("https://www.perlynbeauty.co/fail.html");
    }
  } catch (err) {
    console.error("⚠️ Error verifying payment:", err.message);
    return res.redirect("https://www.perlynbeauty.co/fail.html");
  }
});

// ============================================================
// ✅ WEBHOOK — Payment Updates (optional)
// ============================================================
app.post("/phonepe/webhook", (req, res) => {
  console.log("🔔 Webhook received:", req.body);
  res.status(200).send("Webhook acknowledged");
});

// ============================================================
// 🚀 START SERVER
// ============================================================
const port = PORT || 5000;
app.listen(port, () => {
  console.log(`🚀 PhonePe V2 running in ${MODE} mode on port ${port}`);
});
