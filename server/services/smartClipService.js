const path = require("path");
const fs = require("fs");
const { execSync, spawn } = require("child_process");
const { exportsDir, rootDir } = require("../utils/paths");

function getFFmpegPath() {
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) return process.env.FFMPEG_PATH;
  const localBin = path.resolve(__dirname, "../../bin/ffmpeg.exe");
  if (fs.existsSync(localBin)) return localBin;
  try {
    const cmd = process.platform === "win32" ? "where ffmpeg" : "which ffmpeg";
    const p = execSync(cmd).toString().trim().split("\r\n")[0].split("\n")[0];
    if (p && fs.existsSync(p)) return p;
  } catch {}
  return "ffmpeg";
}

function getPythonPath() {
  if (process.env.PYTHON_PATH && (fs.existsSync(process.env.PYTHON_PATH) || process.env.PYTHON_PATH === "python3" || process.env.PYTHON_PATH === "python")) {
    return process.env.PYTHON_PATH;
  }
  const linuxVenv = path.resolve(rootDir, ".venv", "bin", "python");
  if (fs.existsSync(linuxVenv)) return linuxVenv;
  const winVenv = path.resolve(rootDir, ".venv", "Scripts", "python.exe");
  if (fs.existsSync(winVenv)) return winVenv;
  return process.platform === "win32" ? "python" : "python3";
}

function toSeconds(t) {
  const parts = String(t || "0")
    .split(":")
    .map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

function secondsToTime(sec) {
  const s = Math.max(0, Number(sec) || 0);
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = Math.floor(s % 60);
  return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function runFaceTrackingReframe({ inputPath, startTime, endTime, aspectRatio }) {
  return new Promise((resolve, reject) => {
    const pythonBin = getPythonPath();
    const scriptPath = path.resolve(rootDir, "python", "smart_reframe.py");

    const isCmd = pythonBin === "python" || pythonBin === "python3";
    if ((!isCmd && !fs.existsSync(pythonBin)) || !fs.existsSync(scriptPath)) {
      return reject(new Error(`Python (${pythonBin}) or smart_reframe.py not found`));
    }

    const safeStart = typeof startTime === "number" ? secondsToTime(startTime) : (startTime || "00:00:00");
    const safeEnd = typeof endTime === "number" ? secondsToTime(endTime) : (endTime || "00:00:30");
    const ratio = aspectRatio || "9:16";

    const proc = spawn(pythonBin, [
      scriptPath,
      inputPath,
      exportsDir,
      safeStart,
      safeEnd,
      ratio,
    ], { windowsHide: true });

    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => { stdout += d.toString(); });
    proc.stderr.on("data", (d) => { stderr += d.toString(); });

    proc.on("close", (code) => {
      if (code === 0) {
        try {
          const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
          const lastLine = lines[lines.length - 1];
          const parsed = JSON.parse(lastLine || "{}");
          if (parsed.success && parsed.outputPath && fs.existsSync(parsed.outputPath)) {
            return resolve({
              fileName: parsed.fileName || path.basename(parsed.outputPath),
              outputPath: parsed.outputPath,
            });
          }
        } catch (e) {
          return reject(new Error(`Failed to parse smart_reframe output: ${stdout}`));
        }
      }
      reject(new Error(`smart_reframe exited with code ${code}: ${stderr || stdout}`));
    });

    proc.on("error", reject);
  });
}

async function smartGenerateClip({ inputPath, startTime, endTime, aspectRatio }) {
  fs.mkdirSync(exportsDir, { recursive: true });

  // 1. Try AI face-tracking reframe first
  try {
    const faceTracked = await runFaceTrackingReframe({ inputPath, startTime, endTime, aspectRatio });
    return faceTracked;
  } catch (err) {
    console.warn("Face tracking reframe failed, using fallback center crop:", err.message);
  }

  // 2. Fallback: Fast FFmpeg center crop
  return new Promise((resolve, reject) => {
    const ratio = aspectRatio || "9:16";
    const [rW, rH] = ratio.split(":").map(Number);
    const targetW = 720;
    const targetH = Math.round((targetW * (rH || 16)) / (rW || 9));
    const duration = Math.max(1, toSeconds(endTime) - toSeconds(startTime));

    const fileName = `smart_clip_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp4`;
    const outputPath = path.join(exportsDir, fileName);

    const ffmpegPath = getFFmpegPath();

    const args = [
      "-y",
      "-ss",
      String(toSeconds(startTime)),
      "-i",
      inputPath,
      "-t",
      String(duration),
      "-vf",
      `scale=${targetW}:${targetH}:force_original_aspect_ratio=increase,crop=${targetW}:${targetH}`,
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-crf",
      "26",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      "-threads",
      "0",
      outputPath,
    ];

    const child = spawn(ffmpegPath, args, { windowsHide: true });

    let stderr = "";
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });

    child.on("close", (code) => {
      if (code === 0 && fs.existsSync(outputPath)) {
        resolve({ fileName, outputPath });
      } else {
        reject(
          new Error(`FFmpeg failed (code ${code}): ${stderr.slice(-300)}`),
        );
      }
    });

    child.on("error", (err) => {
      reject(new Error(`FFmpeg not found: ${err.message}`));
    });
  });
}

module.exports = { smartGenerateClip };
