// ============================================================
// ✅ PHONEPE V2 — FINAL PRODUCTION + REWARD POINTS INTEGRATION
// ============================================================

import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";


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
  SUPABASE_SERVICE_KEY,
} = process.env;

// ============================================================
// 🔗 BASE URLS (Auth + Payment + Status)
// ============================================================
const IS_PROD = MODE === "production";

const AUTH_URL = IS_PROD
  ? "https://api.phonepe.com/apis/identity-manager/v1/oauth/token"
  : "https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token";

const PAYMENT_URL = IS_PROD
  ? "https://api.phonepe.com/apis/pg/checkout/v2/pay"
  : "https://api-preprod.phonepe.com/apis/pg-sandbox/checkout/v2/pay";

const STATUS_BASE = IS_PROD
  ? "https://api.phonepe.com/apis/pg/checkout/v2"
  : "https://api-preprod.phonepe.com/apis/pg-sandbox/checkout/v2";

// ============================================================
// 🧩 SUPABASE CLIENT (SERVER-SIDE)
// ============================================================
const supabase = createClient(
  "https://rlxfpyrzxfheufhuetju.supabase.co",
  SUPABASE_SERVICE_KEY
);

// ============================================================
// 🔐 AUTH TOKEN (with lightweight cache)
// ============================================================
let cachedTokenObj = null;
let tokenExpiryTs = 0;

async function getAuthToken() {
  const now = Date.now();
  if (cachedTokenObj && now < tokenExpiryTs) {
    console.log("♻️ Using cached PhonePe token");
    return cachedTokenObj;
  }

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

  const type = data?.token_type || "Bearer";
  cachedTokenObj = { token, type };

  tokenExpiryTs = now + 14 * 60 * 1000; // cache 14 min
  console.log("✅ Auth Token fetched successfully");
  return cachedTokenObj;
}

// ============================================================
// 🪙 ADD REWARD POINTS FUNCTION
// ============================================================
async function addRewardPoints(userId, amount, orderId) {
  try {
    const pointsToAdd = Math.floor(amount / 10); // 10 points per ₹100 spent

    // Increment user reward total
    const { error } = await supabase.rpc("increment_reward_points", {
      uid: userId,
      points_to_add: pointsToAdd,
    });

    if (error) throw error;
    console.log(`🎯 Added ${pointsToAdd} points for user ${userId}`);

    // Optional: Insert reward history
    await supabase.from("reward_history").insert([
      {
        user_id: userId,
        order_id: orderId,
        points_added: pointsToAdd,
      },
    ]);

    return pointsToAdd;
  } catch (err) {
    console.error("⚠️ Reward update failed:", err.message);
    return 0;
  }
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
      amount: Math.round(Number(amount) * 100),
      expireAfter: 1200,
      metaInfo: { udf1: "perlyn_live_payment" },
      paymentFlow: {
        type: "PG_CHECKOUT",
        message: "Perlyn Beauty Payment Gateway",
        merchantUrls: {
          redirectUrl: `https://paymentgateway-uvsq.onrender.com/verify/${orderId}`,
          callbackUrl: `https://paymentgateway-uvsq.onrender.com/phonepe/webhook`,
        },
      },
    };

    console.log("\n🧾 Payment Payload:", JSON.stringify(payload, null, 2));

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

    if (!response.ok) {
      console.error("❌ Payment API HTTP error:", response.status);
      return res
        .status(400)
        .json({ success: false, message: "Payment API Error" });
    }

    const data = JSON.parse(text);
    if (data.code && data.code !== "SUCCESS") {
      console.warn("⚠️ PhonePe init failed:", data.code);
      return res
        .status(400)
        .json({ success: false, message: data.message || "PhonePe Error", data });
    }

    const mercuryUrl =
      data?.redirectUrl ||
      data?.data?.redirectUrl ||
      data?.response?.redirectUrl;

    if (mercuryUrl) {
      console.log("✅ Mercury Redirect URL:", mercuryUrl);
      return res.json({ success: true, redirectUrl: mercuryUrl });
    }

    console.warn("⚠️ No redirect URL found in response");
    return res.status(400).json({ success: false, data });
  } catch (err) {
    console.error("❌ Error during /create-payment:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});
//verify id 
app.get("/verify/:id", async (req, res) => {
  const orderId = req.params.id;

  try {
    const { token, type } = await getAuthToken();
    const statusUrl = `${STATUS_BASE}/order/${encodeURIComponent(orderId)}/status`;
    console.log(`\n🔍 Verifying order status: ${statusUrl}`);

    const statusResponse = await fetch(statusUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `${type} ${token}`,
      },
    });

    const text = await statusResponse.text();
    console.log("📦 Status Response:", text);

    const data = JSON.parse(text);
    const state = data?.state || data?.data?.state || "UNKNOWN";
    const amount = (data?.amount || data?.data?.amount || 0) / 100;

    // ✅ SUCCESS CASE — only here we save order + add rewards
    if (state === "COMPLETED" || state === "SUCCESS") {
      console.log("✅ Payment verified as SUCCESSFUL");

      // Save only if successful
      try {
        await fetch("https://perlynbeauty.co/order-save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId,
            amount,
            payment_status: "COMPLETED",
            verifiedAt: new Date().toISOString(),
          }),
        });
      } catch (saveErr) {
        console.warn("⚠️ Order save failed:", saveErr.message);
      }

      // ✅ Reward + Email + SMS
      try {
        const { data: orderData } = await supabase
          .from("orders")
          .select("user_id, phone")
          .eq("order_id", orderId)
          .maybeSingle();

        if (orderData?.user_id) {
          const { data: existing } = await supabase
            .from("reward_history")
            .select("id")
            .eq("order_id", orderId)
            .limit(1);

          if (!existing?.length) {
            const added = await addRewardPoints(orderData.user_id, amount, orderId);
            console.log(`✅ Reward points (${added}) added for user ${orderData.user_id}`);
          }

          const { data: userData } = await supabase
            .from("profiles")
            .select("email, full_name")
            .eq("id", orderData.user_id)
            .maybeSingle();

          if (userData?.email)
            await sendOrderEmail(userData.email, userData.full_name, orderId, amount);

          if (orderData.phone)
            await sendSMS(orderData.phone, orderId);
        }
      } catch (err) {
        console.error("⚠️ Reward/email process error:", err.message);
      }

      return res.redirect(
        `https://www.perlynbeauty.co/success.html?orderId=${encodeURIComponent(orderId)}`
      );
    }

    // ❌ FAILED / CANCELLED / PENDING CASE — do NOT save
    console.log(`❌ Payment not successful (State: ${state})`);
    return res.redirect(
      `https://www.perlynbeauty.co/fail.html?orderId=${encodeURIComponent(orderId)}`
    );

  } catch (err) {
    console.error("⚠️ Error verifying payment:", err.message);
    return res.redirect(
      `https://www.perlynbeauty.co/fail.html?orderId=${encodeURIComponent(orderId)}`
    );
  }
});
// ============================================================
// 🧾 SAVE ORDER STATUS TO SUPABASE (CALLED AFTER PAYMENT VERIFY)
// ============================================================
app.post("/order-save", async (req, res) => {
  try {
    const { orderId, amount, payment_status, verifiedAt } = req.body;

    if (!orderId) {
      return res.status(400).json({ success: false, message: "Missing orderId" });
    }

    // 🔍 Check if order already exists
    const { data: existingOrder } = await supabase
      .from("orders")
      .select("id")
      .eq("order_id", orderId)
      .maybeSingle();

    if (existingOrder) {
      // ✅ Update order status to completed
      const { error: updateError } = await supabase
        .from("orders")
        .update({
          payment_status: payment_status || "COMPLETED",
          status: "Confirmed",
          total_amount: amount || 0,
          updated_at: verifiedAt || new Date().toISOString(),
        })
        .eq("order_id", orderId);

      if (updateError) throw updateError;
      console.log(`✅ Updated existing order: ${orderId}`);
    } else {
      // 🆕 If not found, create a new record
      const { error: insertError } = await supabase.from("orders").insert([
        {
          order_id: orderId,
          total_amount: amount || 0,
          payment_status: payment_status || "COMPLETED",
          status: "Confirmed",
          created_at: verifiedAt || new Date().toISOString(),
        },
      ]);
      if (insertError) throw insertError;
      console.log(`✅ Inserted new order: ${orderId}`);
    }

    return res.json({ success: true, message: "Order saved successfully" });
  } catch (err) {
    console.error("❌ /order-save error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================
// 💌 Send Order Confirmation Email
// ============================================================
async function sendOrderEmail(to, name, orderId, amount) {
  try {
    if (!process.env.PERLYN_EMAIL || !process.env.PERLYN_APP_PASSWORD) {
      console.warn("⚠️ Email credentials missing — skipping email");
      return;
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.PERLYN_EMAIL,
        pass: process.env.PERLYN_APP_PASSWORD,
      },
    });

    const html = `
      <div style="font-family:'Cormorant Garamond',serif;background:#fff6f0;padding:25px;border-radius:14px;color:#4b3b32">
        <h2>✨ Order Placed Successfully!</h2>
        <p>Hi <b>${name || "Customer"}</b>,</p>
        <p>Thank you for shopping with <b>Perlyn Beauty</b>.</p>
        <p>Your order <b>#${orderId}</b> has been placed successfully.</p>
        <p>It will be <b>dispatched within 3 days</b> and delivered within <b>5–7 days</b> after dispatch.</p>
        <p><b>Amount:</b> ₹${amount}</p>
        <p style="color:#b98474;margin-top:12px">We’ll notify you once your package ships 🚚</p>
        <br><p>With love, <b>Team Perlyn Beauty 💖</b></p>
      </div>
    `;

    await transporter.sendMail({
      from: `"Perlyn Beauty" <${process.env.PERLYN_EMAIL}>`,
      to,
      subject: `Your Perlyn Order #${orderId} — Confirmed`,
      html,
    });

    console.log(`📧 Email sent to ${to}`);
  } catch (err) {
    console.error("❌ Email send failed:", err.message);
  }
}

// ============================================================
// 📱 Send SMS Confirmation (optional via Fast2SMS)
// ============================================================
async function sendSMS(phone, orderId) {
  try {
    if (!process.env.FAST2SMS_KEY) return;
    const msg = `Order #${orderId} confirmed! Dispatched in 3 days, delivery in 5–7 days. - Perlyn Beauty 💖`;

    await fetch("https://www.fast2sms.com/dev/bulkV2", {
      method: "POST",
      headers: { authorization: process.env.FAST2SMS_KEY },
      body: new URLSearchParams({
        route: "v3",
        sender_id: "PERLYN",
        message: msg,
        language: "english",
        numbers: phone,
      }),
    });

    console.log(`📱 SMS sent to ${phone}`);
  } catch (err) {
    console.error("⚠️ SMS failed:", err.message);
  }
}


// ============================================================
// ✅ WEBHOOK — Payment Update Notifications
// ============================================================
app.post("/phonepe/webhook", (req, res) => {
  console.log("🔔 Webhook received:", req.body);
  res.status(200).send("Webhook acknowledged");
});

// ============================================================
// 🩺 HEALTH / ROOT
// ============================================================
app.get("/", (req, res) => {
  res.send("💄 Perlyn Beauty Payment Gateway + Rewards is running successfully!");
});

// ============================================================
// 🚀 START SERVER
// ============================================================
const port = PORT || 5000;
app.listen(port, () => {
  console.log(`🚀 PhonePe V2 running in ${MODE} mode on port ${port}`);
});


