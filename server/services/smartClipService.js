const path = require("path");
const ffmpeg = require("fluent-ffmpeg");
const { exportsDir } = require("../utils/paths");

function smartGenerateClip({ inputPath, startTime, endTime, aspectRatio }) {
  return new Promise((resolve, reject) => {
    const ratio = aspectRatio || "9:16";
    const [rW, rH] = ratio.split(":").map(Number);
    const fileName = `smart_clip_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp4`;
    const outputPath = path.join(exportsDir, fileName);

    // Target vertical dimensions
    const targetW = 720;
    const targetH = Math.round((targetW * rH) / rW);

    ffmpeg(inputPath)
      .setStartTime(startTime)
      .setDuration(calcDuration(startTime, endTime))
      .videoFilter([
        `scale=${targetW}:${targetH}:force_original_aspect_ratio=increase`,
        `crop=${targetW}:${targetH}`,
      ])
      .outputOptions(["-c:v libx264", "-c:a aac", "-movflags +faststart"])
      .output(outputPath)
      .on("end", () => resolve({ fileName, outputPath }))
      .on("error", (err) => reject(new Error(`FFmpeg failed: ${err.message}`)))
      .run();
  });
}

function calcDuration(startTime, endTime) {
  const toSec = (t) => {
    const parts = String(t || "0").split(":").map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0] || 0;
  };
  return Math.max(1, toSec(endTime) - toSec(startTime));
}

module.exports = { smartGenerateClip };