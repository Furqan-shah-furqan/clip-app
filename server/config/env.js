const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

function required(name, fallback = "") {
  const value = process.env[name] ?? fallback;

  if (value === undefined || value === null || value === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function optional(name, fallback = "") {
  return process.env[name] ?? fallback;
}

// Render supplies the live origin; do not reuse a previous Render service's callback.
const renderOrigin = process.env.RENDER_EXTERNAL_URL?.replace(/\/$/, "");
const configuredOrigin = process.env.APP_URL?.replace(/\/$/, "");
const appOrigin = configuredOrigin && !/\.onrender\.com$/.test(new URL(configuredOrigin).hostname)
  ? configuredOrigin : renderOrigin || configuredOrigin || "http://localhost:3000";
function oauthCallback(name, platform) {
  const fallback = `${appOrigin}/api/auth/${platform}/callback`;
  const configured = process.env[name]?.trim();
  if (!configured) return fallback;
  const url = new URL(configured);
  if (renderOrigin && url.hostname.endsWith(".onrender.com") && url.origin !== new URL(appOrigin).origin) {
    console.warn(`${name} refers to a previous Render service; using ${fallback}`);
    return fallback;
  }
  return configured;
}

module.exports = {
  PORT: Number(process.env.PORT || 3000),
  APP_URL: appOrigin,
  DATABASE_URL: required("DATABASE_URL"),
  REDIS_URL: required("REDIS_URL"),
  TOKEN_ENCRYPTION_KEY: optional(
    "TOKEN_ENCRYPTION_KEY",
    "default_32_char_secret_encryption_key"
  ),

  GOOGLE_CLIENT_ID: optional("GOOGLE_CLIENT_ID"),
  GOOGLE_CLIENT_SECRET: optional("GOOGLE_CLIENT_SECRET"),
  GOOGLE_REDIRECT_URI: oauthCallback("GOOGLE_REDIRECT_URI", "youtube"),

  INSTAGRAM_APP_ID: optional("INSTAGRAM_APP_ID"),
  INSTAGRAM_APP_SECRET: optional("INSTAGRAM_APP_SECRET"),
  INSTAGRAM_REDIRECT_URI: oauthCallback("INSTAGRAM_REDIRECT_URI", "instagram"),
  INSTAGRAM_GRAPH_BASE_URL: optional(
    "INSTAGRAM_GRAPH_BASE_URL",
    "https://graph.facebook.com/v23.0",
  ),

  CLOUDINARY_CLOUD_NAME: optional("CLOUDINARY_CLOUD_NAME"),
  CLOUDINARY_API_KEY: optional("CLOUDINARY_API_KEY"),
  CLOUDINARY_API_SECRET: optional("CLOUDINARY_API_SECRET"),
  RAPIDAPI_KEY: optional("RAPIDAPI_KEY"),
  RAPIDAPI_HOST: optional("RAPIDAPI_HOST", "youtube-video-fast-downloader-24-7.p.rapidapi.com"),
  YOUTUBE_API_KEY: optional("YOUTUBE_API_KEY"),
};