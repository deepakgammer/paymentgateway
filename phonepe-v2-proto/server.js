// ============================================================
// ✅ PHONEPE V2 PRODUCTION + SANDBOX READY (FINAL PERLYN BUILD)
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
// Add these in Railway's Variables section:
// MODE="sandbox" or "production"
// CLIENT_ID="YOUR_CLIENT_ID"
// CLIENT_SECRET="YOUR_CLIENT_SECRET"
// CLIENT_VERSION="1"
// MERCHANT_ID="M23DQ1ZV3KCPW"  (yours)
// PORT=5000
const {
  MODE,
  CLIENT_ID,
  CLIENT_SECRET,
  CLIENT_VERSION,
  MERCHANT_ID,
  PORT
} = process.env;

// ============================================================
// 🔗 API BASE URLs
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
// ✅ AUTH TOKEN FETCH
// ============================================================
async function getAuthToken() {
  console.log(`\n🔐 Requesting Auth Token from: ${AUTH_URL}`);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    client_version: CLIENT_VERSION,
    grant_type: "client_credentials"
  });

  const res = await fetch(AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params
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
// ✅ PAYMENT CREATION ENDPOINT
// ============================================================
app.get("/pay", async (req, res) => {
  try {
    const token = await getAuthToken();
    const ts = Date.now();
    const merchantOrderId = `ORDER${ts}`;
    const amount = 1000; // ₹10.00 in paise

    // ✅ Payload exactly as per API docs
    const payload = {
      merchantOrderId,
      amount,
      expireAfter: 1200,
      metaInfo: {
        udf1: "perlyn_test_1",
        udf2: "param_2",
        udf3: "param_3",
        udf4: "param_4",
        udf5: "param_5"
      },
      paymentFlow: {
        type: "PG_CHECKOUT",
        message: "Payment message for Perlyn checkout",
        merchantUrls: {
          redirectUrl: `https://www.perlynbeauty.co/success/${merchantOrderId}`
        }
      }
    };

    console.log("\n🧾 Payload Sent:");
    console.log(JSON.stringify(payload, null, 2));

    const response = await fetch(PAYMENT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `O-Bearer ${token}`,
        Accept: "application/json"
      },
      body: JSON.stringify(payload)
    });

    const text = await response.text();
    console.log("\n📥 Raw Payment API Response:", text);

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("Invalid JSON in PhonePe response");
    }

    const mercuryUrl =
      data?.redirectUrl ||
      data?.data?.redirectUrl ||
      data?.response?.redirectUrl;

    if (mercuryUrl && mercuryUrl.includes("mercury")) {
      console.log("\n✅ Mercury Payment URL Found:");
      console.log(mercuryUrl);

      res.send(`
        <html>
          <body style="font-family:sans-serif;text-align:center;background:#f3e4db;color:#4b3b32;">
            <h2>✅ Mercury Sandbox Ready</h2>
            <p>Click below to open the checkout page:</p>
            <a href="${mercuryUrl}" target="_blank"
               style="display:inline-block;background:#b98474;color:#fff;
               padding:12px 24px;border-radius:8px;text-decoration:none;">
               Open Payment Page</a>
            <br><br><small>${mercuryUrl}</small>
          </body>
        </html>
      `);
    } else {
      console.warn("\n⚠️ No Mercury redirect URL found. Full response:");
      console.log(JSON.stringify(data, null, 2));

      res.status(400).send(`
        <h2>⚠️ Payment Creation Failed</h2>
        <pre>${JSON.stringify(data, null, 2)}</pre>
      `);
    }
  } catch (err) {
    console.error("❌ Error:", err.message);
    res.status(500).send(`<h2>Error:</h2><pre>${err.message}</pre>`);
  }
});


// ============================================================
// ✅ SUCCESS PAGE
// ============================================================
app.get("/success/:id", (req, res) => {
  res.send(`
    <html>
      <body style="background:#d1ffd1;text-align:center;font-family:sans-serif;">
        <h2>🎉 Payment Simulation Complete!</h2>
        <p>Order ID: ${req.params.id}</p>
        <a href="/pay">Start New Payment</a>
      </body>
    </html>
  `);
});


// ============================================================
// ✅ WEBHOOK ENDPOINT (REQUIRED FOR LIVE APPROVAL)
// ============================================================
app.post("/phonepe/webhook", (req, res) => {
  console.log("📩 Webhook received:", req.body);
  // TODO: verify signature once SALT_KEY & SALT_INDEX are provided
  res.status(200).send("Webhook acknowledged");
});


// ============================================================
// 🚀 START SERVER (Railway Auto PORT)
// ============================================================
const port = PORT || process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`🚀 PhonePe V2 Proto running at http://localhost:${port}`);
});
