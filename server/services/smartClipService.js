const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");
const { exportsDir } = require("../utils/paths");

function getFFmpegPath() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  try {
    const p = execSync("which ffmpeg").toString().trim();
    if (p) return p;
  } catch {}
  return "ffmpeg";
}

function toSeconds(t) {
  const parts = String(t || "0").split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

function smartGenerateClip({ inputPath, startTime, endTime, aspectRatio }) {
  return new Promise((resolve, reject) => {
    const ratio = aspectRatio || "9:16";
    const [rW, rH] = ratio.split(":").map(Number);
    const targetW = 720;
    const targetH = Math.round((targetW * (rH || 16)) / (rW || 9));
    const duration = Math.max(1, toSeconds(endTime) - toSeconds(startTime));

    const fileName = `smart_clip_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp4`;
    const outputPath = path.join(exportsDir, fileName);

    fs.mkdirSync(exportsDir, { recursive: true });

    const ffmpegPath = getFFmpegPath();

    const args = [
      "-y",
      "-ss", String(toSeconds(startTime)),
      "-i", inputPath,
      "-t", String(duration),
      "-vf", `scale=${targetW}:${targetH}:force_original_aspect_ratio=increase,crop=${targetW}:${targetH}`,
      "-c:v", "libx264",
      "-preset", "fast",
      "-crf", "23",
      "-c:a", "aac",
      "-movflags", "+faststart",
      outputPath
    ];

    const { spawn } = require("child_process");
    const child = spawn(ffmpegPath, args, { windowsHide: true });

    let stderr = "";
    child.stderr.on("data", (d) => { stderr += d.toString(); });

    child.on("close", (code) => {
      if (code === 0 && fs.existsSync(outputPath)) {
        resolve({ fileName, outputPath });
      } else {
        reject(new Error(`FFmpeg failed (code ${code}): ${stderr.slice(-300)}`));
      }
    });

    child.on("error", (err) => {
      reject(new Error(`FFmpeg not found: ${err.message}`));
    });
  });
}

module.exports = { smartGenerateClip };