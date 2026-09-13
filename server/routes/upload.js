const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { uploadsDir, projectsFile } = require("../utils/paths");
const { smartGenerateClip } = require("../services/smartClipService");

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const safeOriginal = file.originalname.replace(/[^\w.\-]/g, "_");
    cb(null, `${Date.now()}_${safeOriginal}`);
  }
});

const MAX_PORTFOLIO_UPLOAD_BYTES = 100 * 1024 * 1024; // 100 MB portfolio demo limit

const upload = multer({
  storage,
  limits: { fileSize: MAX_PORTFOLIO_UPLOAD_BYTES },
  fileFilter: (req, file, cb) => {
    const allowed = [".mp4", ".mov", ".mkv", ".webm"];
    const ext = path.extname(file.originalname).toLowerCase();

    if (!allowed.includes(ext)) {
      return cb(new Error("Only MP4, MOV, MKV, WEBM files are allowed"));
    }

    cb(null, true);
  }
});

router.post("/upload", (req, res) => {
  upload.single("video")(req, res, async (err) => {
    try {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({
            error: "Free demo uploads currently support videos up to 100 MB. You can use a YouTube URL for longer videos.",
          });
        }
        return res.status(400).json({ error: `Upload error: ${err.message}` });
      }

      if (err) {
        return res.status(400).json({ error: err.message || "Upload failed" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No video file received" });
      }

      // If Cloudinary is configured, store uploaded source durably in the cloud
      let storageUrl = null;
      if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
        try {
          const { uploadVideoToCloudinary } = require("../services/storage/cloudinaryStorageService");
          const cloudRes = await uploadVideoToCloudinary(req.file.path, {
            folder: "clipflow/uploads",
            publicId: `upload_${Date.now()}`,
          });
          storageUrl = cloudRes.secureUrl;
          console.log(`[Upload] Video uploaded durably to Cloudinary: ${storageUrl}`);
        } catch (cloudErr) {
          console.warn("[Upload] Cloudinary upload notice (using local file):", cloudErr.message);
        }
      }

      const project = {
        id: Date.now().toString(),
        source: "upload",
        sourceType: "upload",
        originalName: req.file.originalname,
        fileName: req.file.filename,
        filePath: req.file.path,
        storageUrl,
        size: req.file.size,
        mimeType: req.file.mimetype,
        createdAt: new Date().toISOString()
      };

      saveProject(project);

      return res.json({
        message: "Upload successful",
        project
      });
    } catch (error) {
      console.error("UPLOAD ROUTE ERROR:", error);
      return res.status(500).json({
        error: "Internal upload error",
        details: error.message
      });
    }
  });
});

module.exports = router;