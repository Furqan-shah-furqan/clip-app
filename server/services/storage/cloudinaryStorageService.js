const fs = require("fs");
const path = require("path");
const { v2: cloudinary } = require("cloudinary");

const {
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET,
} = require("../../config/env");

const LARGE_UPLOAD_THRESHOLD_BYTES = 90 * 1024 * 1024;

function assertCloudinaryReady() {
  const missing = [];

  if (!CLOUDINARY_CLOUD_NAME) missing.push("CLOUDINARY_CLOUD_NAME");
  if (!CLOUDINARY_API_KEY) missing.push("CLOUDINARY_API_KEY");
  if (!CLOUDINARY_API_SECRET) missing.push("CLOUDINARY_API_SECRET");

  if (missing.length) {
    throw new Error(`Missing Cloudinary env values: ${missing.join(", ")}`);
  }
}

function configureCloudinary() {
  assertCloudinaryReady();

  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
    secure: true,
  });
}

function buildSafePublicId(filePath, publicId = "") {
  const fallback = path.basename(filePath, path.extname(filePath));

  return String(publicId || fallback || `clip-${Date.now()}`)
    .replace(/[^\w.-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 90);
}

async function uploadVideoToCloudinary(filePath, options = {}) {
  configureCloudinary();

  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`Cloudinary upload file not found: ${filePath}`);
  }

  const stats = fs.statSync(filePath);
  const safePublicId = buildSafePublicId(filePath, options.publicId);

  const uploadOptions = {
    resource_type: "video",
    folder: options.folder || "clipflow/instagram",
    public_id: safePublicId,
    overwrite: true,
    unique_filename: false,
    type: "upload",
  };

  const result =
    stats.size >= LARGE_UPLOAD_THRESHOLD_BYTES
      ? await cloudinary.uploader.upload_large(filePath, uploadOptions)
      : await cloudinary.uploader.upload(filePath, uploadOptions);

  if (!result?.secure_url) {
    throw new Error("Cloudinary upload completed but no secure_url was returned.");
  }

  return {
    publicId: result.public_id,
    secureUrl: result.secure_url,
    duration: result.duration,
    bytes: result.bytes,
    format: result.format,
    resourceType: result.resource_type,
    raw: result,
  };
}

module.exports = {
  uploadVideoToCloudinary,
};