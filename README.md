# 🛡️ WhatsApp Debounce Middleware for n8n

> **Stop the chaos.** Handle burst messages from WhatsApp like a pro.

![Deploy with Vercel](https://vercel.com/button)

## 🚨 The Problem

You're building an amazing AI agent with **n8n** and **WhatsApp**. But there's a catch: **Humans don't talk like APIs.**

They send split messages:
> "Hello"
> "I have a question"
> "about your pricing"

To n8n, this looks like **3 separate executions**. Your AI agent gets confused, context is lost, and you burn through execution credits. Race conditions nightmare. 😱

## ✅ The Solution

**wa-debounce-middleware** sits between the WhatsApp Cloud API and your n8n webhook. It acts as a smart buffer.

**Result?** n8n gets **ONE** clean, consolidated message.
> "Hello I have a question about your pricing"

## ✨ Features

- **🧠 Smart Debouncing**: Uses **Redis** (Upstash) to synchronize state across serverless functions.
- **🔐 Secure**: Validates Meta's `X-Hub-Signature-256` to prevent spoofing.
- **🧹 E.164 Sanitization**: Converts messy phone numbers to a clean global format (e.g., `+391234567890`).
- **🚫 Filtering**: Built-in Whitelist/Blacklist for phone numbers.
- **⚡ Serverless Ready**: Built with **Hono** and optimized for **Vercel Functions**.

## 🚀 How to use

### 1. Deploy
Click the button below to deploy your own instance to Vercel for free.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/dylanpatriarchi/wa-debounce-middleware&env=N8N_WEBHOOK_URL,WHATSAPP_VERIFY_TOKEN,WHATSAPP_APP_SECRET,UPSTASH_REDIS_REST_URL,UPSTASH_REDIS_REST_TOKEN,DEBOUNCE_WINDOW_MS)

### 2. Configure Environment Variables

| Variable | Description |
|---|---|
|`WHATSAPP_VERIFY_TOKEN`| Your custom verification token (you set this in Meta App Dashboard) |
|`WHATSAPP_APP_SECRET`| Your Meta App Secret (Basic Settings > App Secret) |
|`N8N_WEBHOOK_URL`| The URL of your n8n Webhook node |
|`UPSTASH_REDIS_REST_URL`| Your Upstash Redis URL |
|`UPSTASH_REDIS_REST_TOKEN`| Your Upstash Redis Token |
|`DEBOUNCE_WINDOW_MS`| (Optional) Time to wait in ms. Default: `2000` |
|`ALLOWED_NUMBERS`| (Optional) Comma-separated list of numbers to whitelist (e.g., `15551234567`) |
|`BLOCKED_NUMBERS`| (Optional) Comma-separated list of numbers to block |

### 3. Connect to Meta
1. Go to your **Facebook Developers App Dashboard**.
2. Select **WhatsApp** > **Configuration**.
3. In the **Webhook** section, click **Edit**.
    - **Callback URL**: `https://your-project-name.vercel.app/webhook`
    - **Verify Token**: The `WHATSAPP_VERIFY_TOKEN` you set above.
4. Click **Verify and Save**.

---
Built with ❤️ using [Hono](https://hono.dev) & [Upstash](https://upstash.com)
