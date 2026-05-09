const crypto = require("crypto");
const { TOKEN_ENCRYPTION_KEY } = require("../config/env");

const algorithm = "aes-256-cbc";
const key = crypto.createHash("sha256").update(TOKEN_ENCRYPTION_KEY).digest();

function encryptText(value = "") {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(String(value), "utf8", "hex");
  encrypted += cipher.final("hex");
  return `${iv.toString("hex")}:${encrypted}`;
}

function decryptText(payload = "") {
  const [ivHex, encrypted] = String(payload).split(":");
  if (!ivHex || !encrypted) return "";
  const iv = Buffer.from(ivHex, "hex");
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

module.exports = {
  encryptText,
  decryptText
};