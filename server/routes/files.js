const express = require("express");
const path = require("path");
const fs = require("fs");
const { exportsDir, subtitlesDir } = require("../utils/paths");
const { resolveVideoPath, streamVideoFile } = require("../utils/videoStream");

const router = express.Router();

router.get("/download/:fileName", (req, res) => {
  const fileName = req.params.fileName;
  const foundPath = resolveVideoPath(fileName);

  if (foundPath) {
    if (
      foundPath.toLowerCase().endsWith(".mp4") ||
      foundPath.toLowerCase().endsWith(".webm") ||
      foundPath.toLowerCase().endsWith(".mov")
    ) {
      return streamVideoFile(foundPath, req, res);
    }
    return res.sendFile(foundPath, { acceptRanges: true });
  }

  const exportPath = path.join(exportsDir, fileName);
  const subtitlePath = path.join(subtitlesDir, fileName);

  if (fs.existsSync(exportPath)) {
    if (exportPath.toLowerCase().endsWith(".mp4")) {
      return streamVideoFile(exportPath, req, res);
    }
    return res.sendFile(exportPath, { acceptRanges: true });
  }

  if (fs.existsSync(subtitlePath)) {
    return res.sendFile(subtitlePath, { acceptRanges: true });
  }

  return res.status(404).json({ error: "File not found" });
});

module.exports = router;