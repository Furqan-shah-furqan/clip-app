# 🚀 ClipFlow Studio — Cloud Deployment Guide

This guide walks you through deploying **ClipFlow Studio (`clip-app`)** to the cloud so you can access and use it **from anywhere, anytime, on any device (phone, laptop, tablet)** with a secure public `https://` address.

---

## 🏗 Stack & Architecture Overview

Because ClipFlow Studio processes videos and speech with AI, the production environment packages:
- **Node.js 20 (Express API & Web UI)**
- **Python 3 with `faster-whisper` & `opencv-python-headless`** (AI transcription & smart reframing)
- **FFmpeg & yt-dlp** (video rendering & downloading)
- **PostgreSQL Database** (Prisma ORM for users, clips, and schedules)
- **Redis** (BullMQ background queue for video rendering & publishing)

All of these are containerized in the included [Dockerfile](file:///e:/clip-app/Dockerfile).

---

## 🌟 Method 1: Deploy on Railway.app (Recommended — 5 Minutes)

[Railway.app](https://railway.app) is the easiest and most powerful cloud host for this stack because it provides **1-click PostgreSQL**, **1-click Redis**, **native Docker support**, and **up to 8 GB RAM** (crucial so AI transcription doesn't run out of memory).

### Step 1: Push your latest code to GitHub

In your terminal / PowerShell in `e:\clip-app`, run:

```bash
git add .
git commit -m "Setup cloud deployment with Docker, PostgreSQL, and Redis"
git push origin main
```

---

### Step 2: Create a Project on Railway

1. Go to **[railway.app](https://railway.app)** and log in with your GitHub account.
2. Click **"+ New Project"**.
3. Choose **"Deploy from GitHub repo"**.
4. Select your repository: **`Furqan-shah-furqan/clip-app`**.
5. Railway will automatically detect the [Dockerfile](file:///e:/clip-app/Dockerfile) and start building your web service.

---

### Step 3: Add PostgreSQL and Redis (1 Click Each)

In your Railway project canvas:
1. Click **"+ Create"** (or press `Ctrl + K` / `Cmd + K`).
2. Select **"Database"** ➔ **"Add PostgreSQL"**.
3. Click **"+ Create"** again ➔ Select **"Database"** ➔ **"Add Redis"**.

Railway will provision managed PostgreSQL and Redis instances instantly inside the same project.

---

### Step 4: Configure Environment Variables

1. In the Railway dashboard, click on your **`clip-app`** web service.
2. Go to the **"Variables"** tab.
3. Railway allows you to reference variables from your attached database services:
   - Add variable `DATABASE_URL` ➔ Click **"Add Reference"** and select `Postgres.DATABASE_URL`.
   - Add variable `REDIS_URL` ➔ Click **"Add Reference"** and select `Redis.REDIS_URL`.
4. Add the following additional environment variables:

| Variable | Value / Description |
| :--- | :--- |
| `PORT` | `3000` |
| `NODE_ENV` | `production` |
| `APP_URL` | Your Railway public URL (generated in Step 5 below) |
| `TOKEN_ENCRYPTION_KEY` | Any random 32-character secure secret string |
| `CLOUDINARY_CLOUD_NAME` | Your Cloudinary Cloud Name (from your `.env`) |
| `CLOUDINARY_API_KEY` | Your Cloudinary API Key |
| `CLOUDINARY_API_SECRET` | Your Cloudinary API Secret |
| `YOUTUBE_API_KEY` | Optional: Your YouTube Data v3 API Key |
| `GOOGLE_CLIENT_ID` | Your Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | Your Google OAuth Client Secret |
| `INSTAGRAM_APP_ID` | Your Meta/Instagram App ID |
| `INSTAGRAM_APP_SECRET` | Your Meta/Instagram App Secret |

---

### Step 5: Generate Public HTTPS Domain

1. In your **`clip-app`** service in Railway, go to the **"Settings"** tab.
2. Scroll to the **"Networking"** section.
3. Click **"Generate Domain"** (or connect your own custom domain).
4. You will receive a free permanent URL, for example:
   ```
   https://clip-app-production.up.railway.app
   ```
5. Copy this URL and set it as the value for `APP_URL` in the **Variables** tab.

Railway will automatically redeploy. Your database tables are automatically initialized on startup by `docker-entrypoint.sh`!

---

### Step 6: Update OAuth Redirect URIs

Because you are no longer on `localhost:3000`, you must register your new public URL with Google and Meta:

#### 1. Google Cloud Console (YouTube Uploads):
1. Go to [Google Cloud Console Credentials](https://console.cloud.google.com/apis/credentials).
2. Click on your **OAuth 2.0 Client ID**.
3. Under **Authorized JavaScript origins**, add:
   ```
   https://clip-app-production.up.railway.app
   ```
4. Under **Authorized redirect URIs**, add:
   ```
   https://clip-app-production.up.railway.app/api/auth/youtube/callback
   ```
5. Click **Save**.

#### 2. Meta for Developers (Instagram Reels):
1. Go to [Meta for Developers App Dashboard](https://developers.facebook.com/apps/).
2. Select your Instagram / Facebook Login product settings.
3. In **Valid OAuth Redirect URIs**, add:
   ```
   https://clip-app-production.up.railway.app/api/auth/instagram/callback
   ```
4. Click **Save Changes**.

---

## 🐳 Method 2: Deploy on an Ubuntu Cloud VPS (DigitalOcean / Hetzner / AWS)

If you prefer a virtual private server:

1. Rent any Ubuntu 22.04 / 24.04 VPS (minimum 2 GB RAM recommended).
2. Install Docker and Docker Compose:
   ```bash
   sudo apt-get update
   sudo apt-get install -y docker.io docker-compose-plugin
   ```
3. Clone your repository:
   ```bash
   git clone https://github.com/Furqan-shah-furqan/clip-app.git
   cd clip-app
   ```
4. Create your production `.env` file:
   ```bash
   cp .env.example .env  # Or nano .env and paste your credentials
   ```
5. Start the full stack with Docker Compose:
   ```bash
   docker compose up -d --build
   ```
6. (Optional) Setup Nginx with Let's Encrypt SSL:
   Point your domain DNS `A` record to your VPS IP, and run `certbot --nginx -d yourdomain.com`.

---

## ⚡ Method 3: Deploy on Render.com

1. Go to **[render.com](https://render.com)** and create a new **Web Service**.
2. Connect your GitHub repository: `Furqan-shah-furqan/clip-app`.
3. Choose **Docker** as the runtime environment.
4. Instance Type: Select **Starter** (minimum 1GB RAM so Whisper AI can process audio without Out-Of-Memory errors).
5. Create a PostgreSQL Database on Render (free tier or starter) and copy the Internal Database URL into your Web Service environment variables as `DATABASE_URL`.
6. Add Redis from [Upstash.com](https://upstash.com) (free serverless Redis) or Render Redis and paste `REDIS_URL`.
7. Add your Cloudinary and OAuth variables.
8. **Fix YouTube Bot Blocks (`cookies.txt` Secret File)**:
   Because cloud servers (Render, AWS) share datacenter IP ranges, YouTube blocks automated downloads without cookies ("Sign in to confirm you’re not a bot").
   To permanently enable YouTube downloads on Render:
   - In your Render Web Service dashboard, go to the **"Environment"** tab.
   - Scroll down to the **"Secret Files"** section and click **"Add Secret File"**.
   - **Filename**: `cookies.txt`
   - **Contents**: Upload your exported `cookies.txt` file (or paste its contents).
   - Click **"Save Changes"**.
   Render will automatically mount your cookies at `/etc/secrets/cookies.txt` and redeploy. All YouTube downloads will now succeed without bot errors!

---

## ✅ Deployment Checklist

- [ ] Repository committed and pushed to GitHub (`git push origin main`).
- [ ] Docker container built successfully.
- [ ] PostgreSQL service provisioned and connected via `DATABASE_URL`.
- [ ] Redis service provisioned and connected via `REDIS_URL`.
- [ ] `APP_URL` set to the live `https://...` address.
- [ ] Google Cloud Console OAuth redirect URI updated with `https://.../api/auth/youtube/callback`.
- [ ] Meta Developer Console OAuth redirect URI updated with `https://.../api/auth/instagram/callback`.

---

🎉 **You're ready!** You can now open your phone or laptop browser, bookmark your live URL, and create, transcribe, style, and schedule clips anywhere in the world!
