const express = require("express");
const path = require("path");
const fs = require("fs");
const { exportsDir, subtitlesDir } = require("../utils/paths");

const router = express.Router();

router.get("/download/:fileName", (req, res) => {
  const fileName = req.params.fileName;
  const exportPath = path.join(exportsDir, fileName);
  const subtitlePath = path.join(subtitlesDir, fileName);

  if (fs.existsSync(exportPath)) {
    return res.download(exportPath);
  }

  if (fs.existsSync(subtitlePath)) {
    return res.download(subtitlePath);
  }

  return res.status(404).json({ error: "File not found" });
});

module.exports = router;