const fs = require("fs");
const path = require("path");
const { v2: cloudinary } = require("cloudinary");

const {
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET,
} = require("../../config/env");

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

function withTimeout(promise, ms, label = "Operation") {
  let timer;

  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new Error(`${label} timed out after ${Math.round(ms / 1000)} seconds`)
      );
    }, ms);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function uploadVideoStream(filePath, uploadOptions) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(result);
      }
    );

    fs.createReadStream(filePath)
      .on("error", reject)
      .pipe(uploadStream);
  });
}

function getCloudinaryErrorMessage(error) {
  return (
    error?.error?.message ||
    error?.message ||
    error?.response?.data?.error?.message ||
    error?.response?.data?.message ||
    "Cloudinary upload failed."
  );
}

function getCloudinaryErrorCode(error) {
  return (
    error?.error?.http_code ||
    error?.http_code ||
    error?.response?.status ||
    null
  );
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
    timeout: 300000,
  };

  let result;

  try {
    console.log("CLOUDINARY UPLOAD START:", {
      filePath,
      sizeMB: (stats.size / 1024 / 1024).toFixed(2),
      publicId: safePublicId,
      cloudName: CLOUDINARY_CLOUD_NAME,
    });

    result = await withTimeout(
      uploadVideoStream(filePath, uploadOptions),
      300000,
      "Cloudinary upload"
    );

    console.log("CLOUDINARY RAW RESULT:", JSON.stringify(result, null, 2));

    if (!result || typeof result !== "object") {
      throw new Error("Cloudinary returned an empty upload response.");
    }

    if (!result.secure_url) {
      throw new Error(
        `Cloudinary upload completed but no secure_url was returned. Raw result: ${JSON.stringify(
          result
        )}`
      );
    }

    console.log("CLOUDINARY UPLOAD DONE:", {
      publicId: result.public_id,
      secureUrl: result.secure_url,
      bytes: result.bytes,
      duration: result.duration,
      format: result.format,
    });

    return {
      publicId: result.public_id,
      secureUrl: result.secure_url,
      duration: result.duration,
      bytes: result.bytes,
      format: result.format,
      resourceType: result.resource_type,
      raw: result,
    };
  } catch (error) {
    const message = getCloudinaryErrorMessage(error);
    const httpCode = getCloudinaryErrorCode(error);

    console.error("CLOUDINARY UPLOAD FAILED:", {
      message,
      httpCode,
      name: error?.error?.name || error?.name,
      raw: error,
    });

    throw new Error(`Cloudinary upload failed: ${message}`);
  }
}

module.exports = {
  uploadVideoToCloudinary,
};