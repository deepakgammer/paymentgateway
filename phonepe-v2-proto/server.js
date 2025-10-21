// ============================================================
// ✅ PHONEPE V2 PRODUCTION - WORKING LIVE SCRIPT (FINAL)
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
  MODE,            // "production" or "sandbox"
  CLIENT_ID,
  CLIENT_SECRET,
  CLIENT_VERSION,
  MERCHANT_ID,
  PORT
} = process.env;

// ============================================================
// 🔗 PRODUCTION / SANDBOX URLs
// ============================================================
const BASE_URL =
  MODE === "production"
    ? "https://api.phonepe.com/apis/hermes/pg/v1"
    : "https://api-preprod.phonepe.com/apis/pg-sandbox/v1";

const AUTH_URL = `${BASE_URL}/oauth/token`;
const PAYMENT_URL =
  MODE === "production"
    ? "https://api.phonepe.com/apis/hermes/pg/v1/pay"
    : "https://api-preprod.phonepe.com/apis/pg-sandbox/checkout/v2/pay"; // ✅ fixed missing quote

// ============================================================
// ✅ AUTH TOKEN FETCHER
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
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
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
// ✅ CREATE PAYMENT (PG CHECKOUT FLOW)
// ============================================================
app.get("/pay", async (req, res) => {
  try {
    const token = await getAuthToken();
    const ts = Date.now();
    const merchantOrderId = `ORDER${ts}`;
    const amount = 1000; // ₹10.00 (in paise)

    // ✅ Payload (matches Postman exactly)
    const payload = {
      merchantOrderId,
      amount,
      expireAfter: 1200,
      metaInfo: {
        udf1: "prod test 1",
        udf2: "live param 2",
        udf3: "info3",
        udf4: "extra field 4",
        udf5: "live info ref"
      },
      paymentFlow: {
        type: "PG_CHECKOUT",
        message: "PhonePe PG Production Test",
        merchantUrls: {
          redirectUrl: `http://localhost:${PORT}/success/${merchantOrderId}`
        }
      }
    };

    console.log("\n🧾 Payload Sent:");
    console.log(JSON.stringify(payload, null, 2));

    // ✅ POST request to PhonePe API
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

      // ✅ Render sandbox confirmation page
      res.send(`
        <html>
        <body style="font-family:sans-serif;text-align:center;background:#f3e4db;color:#4b3b32;">
          <h2>✅ Mercury Sandbox Ready</h2>
          <p>Click below to open the checkout page:</p>
          <a href="${mercuryUrl}" target="_blank"
             style="display:inline-block;background:#b98474;color:#fff;
             padding:12px 24px;border-radius:8px;text-decoration:none;">
             Open Payment Page</a>
          <br><br>
          <small>${mercuryUrl}</small>
        </body>
        </html>
      `);
    } else {
      console.warn("\n⚠️ No Mercury redirect URL found. Full response below:");
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
      <h2>🎉 Payment Complete!</h2>
      <p>Order ID: ${req.params.id}</p>
      <a href="/pay">Start New Payment</a>
    </body>
    </html>
  `);
});

// ============================================================
// 🚀 START SERVER
// ============================================================
app.listen(PORT || 5000, () => {
  console.log(`🚀 PhonePe V2 Proto running at http://localhost:${PORT || 5000}`);
});
