const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const axios = require("axios");
const { Transform } = require("stream");
const { pipeline } = require("stream/promises");
const { captionsDir } = require("../utils/paths");

function allowedCaptionSource(value) {
  if (typeof value !== "string" || !process.env.CLOUDINARY_CLOUD_NAME) return null;
  try {
    const url = new URL(value);
    const prefix = `/${process.env.CLOUDINARY_CLOUD_NAME}/video/upload/`;
    if (url.protocol !== "https:" || url.hostname !== "res.cloudinary.com" ||
        url.port || url.username || url.password || !url.pathname.startsWith(prefix)) return null;
    url.hash = "";
    return url.href;
  } catch { return null; }
}

async function restoreCaptionSource(value) {
  const url = allowedCaptionSource(value);
  if (!url) throw new Error("Clip source must be a video in the configured Cloudinary account.");
  const key = crypto.createHash("sha256").update(url).digest("hex");
  const destination = path.join(captionsDir, `source-${key}.mp4`);
  if (fs.existsSync(destination) && fs.statSync(destination).size > 0) return destination;
  const temporary = `${destination}.part`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);
  let bytes = 0;
  try {
    // No redirects: the validated host is the only host we contact.
    const response = await axios.get(url, { responseType: "stream", maxRedirects: 0,
      timeout: 120000, signal: controller.signal });
    const limit = new Transform({ transform(chunk, encoding, callback) {
      bytes += chunk.length;
      callback(bytes > 250 * 1024 * 1024 ? new Error("Clip exceeds the 250 MB caption download limit.") : null, chunk);
    }});
    await pipeline(response.data, limit, fs.createWriteStream(temporary), { signal: controller.signal });
    if (!bytes) throw new Error("Cloudinary returned an empty clip.");
    fs.renameSync(temporary, destination);
    return destination;
  } finally {
    clearTimeout(timer);
    fs.rmSync(temporary, { force: true });
  }
}

module.exports = { allowedCaptionSource, restoreCaptionSource };
