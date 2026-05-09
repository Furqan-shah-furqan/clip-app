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

module.exports = {
  PORT: Number(process.env.PORT || 3000),
  APP_URL: required("APP_URL"),
  DATABASE_URL: required("DATABASE_URL"),
  REDIS_URL: required("REDIS_URL"),
  TOKEN_ENCRYPTION_KEY: required("TOKEN_ENCRYPTION_KEY"),

  GOOGLE_CLIENT_ID: required("GOOGLE_CLIENT_ID"),
  GOOGLE_CLIENT_SECRET: required("GOOGLE_CLIENT_SECRET"),
  GOOGLE_REDIRECT_URI: required("GOOGLE_REDIRECT_URI"),

  INSTAGRAM_APP_ID: optional("INSTAGRAM_APP_ID"),
  INSTAGRAM_APP_SECRET: optional("INSTAGRAM_APP_SECRET"),
  INSTAGRAM_REDIRECT_URI: optional(
    "INSTAGRAM_REDIRECT_URI",
    "https://germicide-udder-dense.ngrok-free.dev/api/auth/instagram/callback",
  ),
  INSTAGRAM_GRAPH_BASE_URL: optional(
    "INSTAGRAM_GRAPH_BASE_URL",
    "https://graph.facebook.com/v23.0",
  ),

  CLOUDINARY_CLOUD_NAME: optional("CLOUDINARY_CLOUD_NAME"),
  CLOUDINARY_API_KEY: optional("CLOUDINARY_API_KEY"),
  CLOUDINARY_API_SECRET: optional("CLOUDINARY_API_SECRET"),
};