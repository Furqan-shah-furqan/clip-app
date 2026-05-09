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

const upload = multer({
  storage,
  limits: { fileSize: 1024 * 1024 * 1024 * 2 },
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
  upload.single("video")(req, res, (err) => {
    try {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: `Upload error: ${err.message}` });
      }

      if (err) {
        return res.status(400).json({ error: err.message || "Upload failed" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No video file received" });
      }

      const project = {
        id: Date.now().toString(),
        source: "upload",
        sourceType: "upload",
        originalName: req.file.originalname,
        fileName: req.file.filename,
        filePath: req.file.path,
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