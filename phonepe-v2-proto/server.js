// ============================================================
// ✅ PHONEPE V2 — FINAL PRODUCTION RENDER DEPLOYMENT (PERLYN LIVE BUILD)
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
      return res.status(400).json({ success: false, message: "Missing amount or orderId" });
    }

    // 🔐 Get Access Token
    const { token, type } = await getAuthToken();

    const payload = {
      merchantOrderId: orderId,
      amount: amount * 100, // Convert ₹ → paise
      expireAfter: 1200,
      metaInfo: { udf1: "perlyn_live_payment" },
      paymentFlow: {
        type: "PG_CHECKOUT",
        message: "Perlyn Beauty Payment Gateway",
        merchantUrls: {
          redirectUrl: `https://paymentgateway-uvsq.onrender.com/success/${orderId}`,
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
// ✅ WEBHOOK — Payment Status Updates
// ============================================================
app.post("/phonepe/webhook", (req, res) => {
  console.log("🔔 Webhook received:", req.body);
  // TODO: Verify checksum when SALT_KEY + SALT_INDEX are available
  res.status(200).send("Webhook acknowledged");
});

// ============================================================
// ✅ SUCCESS / FAIL REDIRECT PAGES
// ============================================================
app.get("/success/:id", (req, res) => {
  res.send(`
    <html>
      <body style="background:#d1ffd1;text-align:center;font-family:sans-serif;">
        <h2>🎉 Payment Successful!</h2>
        <p>Order ID: ${req.params.id}</p>
        <p style="color:#555;">Transaction Verified with PhonePe Server.</p>
        <p>Redirecting you to <b>Perlyn Beauty</b>...</p>
        <script>
          setTimeout(() => window.location.href='https://www.perlynbeauty.co/thankyou.html', 4000);
        </script>
      </body>
    </html>
  `);
});

app.get("/fail", (req, res) => {
  res.send(`
    <html>
      <body style="background:#ffd1d1;text-align:center;font-family:sans-serif;">
        <h2>❌ Payment Failed</h2>
        <p>Please try again or use a different payment method.</p>
        <a href="https://www.perlynbeauty.co" 
           style="color:#fff;background:#a14b4b;padding:12px 24px;border-radius:8px;text-decoration:none;">
           Back to Shop</a>
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
