const path = require("path");
const fs = require("fs");
const axios = require("axios");
const { execSync, spawn } = require("child_process");
const { exportsDir, uploadsDir, rootDir } = require("../utils/paths");
const { getPrimaryPythonPath } = require("../utils/pythonRuntime");

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
  return getPrimaryPythonPath();
}

function toSeconds(t) {
  if (typeof t === "number" && Number.isFinite(t)) return t;
  const parts = String(t || "0")
    .split(":")
    .map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return Number(parts[0]) || 0;
}

function secondsToTime(sec) {
  const s = Math.max(0, Number(sec) || 0);
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = Math.floor(s % 60);
  return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function extractYouTubeId(url) {
  if (!url || typeof url !== "string") return "";
  const clean = url.trim();
  const regex = /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/|live\/))([a-zA-Z0-9_-]{11})/;
  const match = clean.match(regex);
  if (match && match[1]) return match[1];
  if (/^[a-zA-Z0-9_-]{11}$/.test(clean)) return clean;
  try {
    const parsed = new URL(clean);
    const v = parsed.searchParams.get("v");
    if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
  } catch {}
  return "";
}

function isYouTubeUrl(url) {
  if (!url || typeof url !== "string") return false;
  return Boolean(extractYouTubeId(url));
}

// Map of active child processes per GenerationJob: jobId -> childProcess
const activeJobProcesses = new Map();

function registerJobProcess(jobId, proc) {
  if (!jobId || !proc) return;
  activeJobProcesses.set(String(jobId), proc);
}

function unregisterJobProcess(jobId, proc) {
  if (!jobId) return;
  const current = activeJobProcesses.get(String(jobId));
  if (current === proc || !proc) {
    activeJobProcesses.delete(String(jobId));
  }
}

function terminateJobProcess(jobId) {
  if (!jobId) return false;
  const proc = activeJobProcesses.get(String(jobId));
  if (!proc) return false;

  console.log(`[smartClipService] Terminating active child process for job ${jobId}`);
  activeJobProcesses.delete(String(jobId));

  try {
    proc.kill("SIGTERM");
    const timer = setTimeout(() => {
      try {
        if (proc && !proc.killed) {
          proc.kill("SIGKILL");
        }
      } catch {}
    }, 1500);
    if (timer.unref) timer.unref();
  } catch (err) {
    console.warn(`[smartClipService] Error terminating process for job ${jobId}:`, err.message);
  }
  return true;
}

/**
 * Downloads an individual clip snippet using RapidAPI's trim parameters.
 * Enables long-form podcast clipping (1-2+ hours) without downloading the full video.
 */
async function downloadTrimmedClipViaRapidApi({
  sourceUrl,
  clip,
  startTime,
  endTime,
  destinationDir = uploadsDir,
  jobId,
}) {
  const cleanId = extractYouTubeId(sourceUrl);
  if (!cleanId) {
    throw new Error(`Invalid YouTube source URL or ID: ${sourceUrl}`);
  }

  // Calculate trim parameters
  const rawStart = clip?.startTime != null ? clip.startTime : startTime;
  const rawEnd = clip?.endTime != null ? clip.endTime : endTime;
  const startSec = toSeconds(rawStart != null ? rawStart : 0);
  const endSec = toSeconds(rawEnd != null ? rawEnd : startSec + 60);

  const trimStart = Math.floor(startSec);
  const trimDuration = Math.max(1, Math.ceil(endSec - startSec));

  const targetDir = destinationDir || uploadsDir;
  fs.mkdirSync(targetDir, { recursive: true });
  const prefix = jobId ? `snippet_${String(jobId).replace(/[^\w-]/g, "_")}` : "snippet";
  const snippetPath = path.join(
    targetDir,
    `${prefix}_${cleanId}_${trimStart}_${Date.now()}.mp4`
  );

  const rapidApiKey = (process.env.RAPIDAPI_KEY || "").trim();
  const host = "youtube-video-fast-downloader-24-7.p.rapidapi.com";

  if (rapidApiKey) {
    const apiUrl = `https://${host}/download_video/${cleanId}?quality=18&trim_start_time=${trimStart}&trim_duration=${trimDuration}`;
    console.log(`[smartClipService] Requesting trimmed clip from RapidAPI: ${apiUrl}`);

    try {
      const response = await axios.get(apiUrl, {
        headers: {
          "x-rapidapi-host": host,
          "x-rapidapi-key": rapidApiKey,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        timeout: 45000,
      });

      const data = response.data;
      const cdnUrl =
        data?.file ||
        data?.link ||
        data?.download_url ||
        data?.downloadUrl ||
        data?.url ||
        data?.video?.file ||
        data?.video?.url;

      if (!cdnUrl) {
        throw new Error(
          `RapidAPI returned no streamable file URL for trimmed clip: ${JSON.stringify(data || {})}`
        );
      }

      console.log(`[smartClipService] RapidAPI returned CDN URL: ${cdnUrl.slice(0, 80)}...`);

      // Poll CDN URL until status 200
      const maxAttempts = 35;
      const pollIntervalMs = 3000;
      let fileReady = false;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const probe = await axios({
            method: "GET",
            url: cdnUrl,
            responseType: "stream",
            timeout: 12000,
            maxRedirects: 5,
            validateStatus: (status) => status === 200 || status === 404,
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            },
          });

          if (probe.status === 200) {
            try { probe.data.destroy(); } catch {}
            fileReady = true;
            break;
          }
          try { probe.data.destroy(); } catch {}
        } catch (probeErr) {}

        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, pollIntervalMs));
        }
      }

      // Stream the 60-second snippet (10-15MB) directly to disk
      console.log(`[smartClipService] Streaming trimmed snippet to disk: ${snippetPath}`);
      const downloadStream = await axios({
        method: "GET",
        url: cdnUrl,
        responseType: "stream",
        timeout: 90000,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      await new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(snippetPath);
        downloadStream.data.pipe(writer);
        writer.on("finish", resolve);
        writer.on("error", (err) => {
          try { if (fs.existsSync(snippetPath)) fs.unlinkSync(snippetPath); } catch {}
          reject(err);
        });
        downloadStream.data.on("error", (err) => {
          try { if (fs.existsSync(snippetPath)) fs.unlinkSync(snippetPath); } catch {}
          reject(err);
        });
      });

      if (fs.existsSync(snippetPath) && fs.statSync(snippetPath).size > 5000) {
        console.log(`[smartClipService] ✅ Successfully downloaded trimmed snippet (${(fs.statSync(snippetPath).size / 1024 / 1024).toFixed(2)} MB): ${snippetPath}`);
        return snippetPath;
      }
    } catch (rapidErr) {
      console.warn(`[smartClipService] RapidAPI trim download failed (${rapidErr.message}). Trying fallback section download...`);
      try { if (fs.existsSync(snippetPath)) fs.unlinkSync(snippetPath); } catch {}
    }
  } else {
    console.log("[smartClipService] RAPIDAPI_KEY not configured. Using direct section downloader...");
  }

  // Fallback: yt-dlp section download (--download-sections) to fetch ONLY the clip section without full-video download
  console.log(`[smartClipService] Fallback: downloading trimmed section ${trimStart}-${trimStart + trimDuration}s via yt-dlp...`);
  const { getYtDlpPath, buildYtDlpBaseArgs, runCommand } = require("./youtubeDownloader");

  const binary = getYtDlpPath();
  const args = buildYtDlpBaseArgs({
    targetUrl: `https://www.youtube.com/watch?v=${cleanId}`,
    targetPath: snippetPath,
    format: "bestvideo*[height<=720]+bestaudio/best[height<=720]/18/best",
    extraArgs: [
      "--download-sections",
      `*${trimStart}-${trimStart + trimDuration}`,
      "--force-keyframes-at-cuts",
    ],
  });

  await runCommand(binary, args, { timeoutMs: 120000 });

  if (fs.existsSync(snippetPath) && fs.statSync(snippetPath).size > 5000) {
    console.log(`[smartClipService] ✅ yt-dlp trimmed section download succeeded: ${snippetPath}`);
    return snippetPath;
  }

  throw new Error(`Failed to download trimmed video segment (${trimStart}s - ${trimStart + trimDuration}s)`);
}

function runFaceTrackingReframe({ inputPath, startTime, endTime, aspectRatio, outputDir, jobId }) {
  return new Promise((resolve, reject) => {
    // Cloud / Render guard: skip OpenCV frame-by-frame on cloud container to run ultrafast FFmpeg center-crop
    if (process.env.RENDER || process.env.IS_RENDER || process.env.DISABLE_OPENCV_REFRAME === "true") {
      return reject(new Error("Cloud environment detected: using high-speed FFmpeg smart crop"));
    }

    const pythonBin = getPythonPath();
    const scriptPath = path.resolve(rootDir, "python", "smart_reframe.py");

    const isCmd = pythonBin === "python" || pythonBin === "python3";
    if ((!isCmd && !fs.existsSync(pythonBin)) || !fs.existsSync(scriptPath)) {
      return reject(new Error(`Python (${pythonBin}) or smart_reframe.py not found`));
    }

    const safeStart = typeof startTime === "number" ? secondsToTime(startTime) : (startTime || "00:00:00");
    const safeEnd = typeof endTime === "number" ? secondsToTime(endTime) : (endTime || "00:00:30");
    const ratio = aspectRatio || "9:16";
    const targetOutDir = outputDir || exportsDir;
    fs.mkdirSync(targetOutDir, { recursive: true });

    const proc = spawn(pythonBin, [
      scriptPath,
      inputPath,
      targetOutDir,
      safeStart,
      safeEnd,
      ratio,
    ], { windowsHide: true });

    if (jobId) registerJobProcess(jobId, proc);

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timeoutMs = Number(process.env.SMART_REFRAME_TIMEOUT_MS) || 25000;
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        try { proc.kill("SIGKILL"); } catch {}
        reject(new Error(`Face tracking reframe timed out (${Math.round(timeoutMs / 1000)}s limit)`));
      }
    }, timeoutMs);

    proc.stdout.on("data", (d) => { stdout += d.toString(); });
    proc.stderr.on("data", (d) => { stderr += d.toString(); });

    proc.on("close", (code) => {
      if (jobId) unregisterJobProcess(jobId, proc);
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
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

    proc.on("error", (err) => {
      if (jobId) unregisterJobProcess(jobId, proc);
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(err);
    });
  });
}

/**
 * Main smart clip generator.
 * Downloads trimmed snippet (if YouTube) and processes it with FFmpeg / face tracking reframe.
 */
async function smartGenerateClip({
  inputPath,
  sourceUrl,
  clip,
  startTime,
  endTime,
  aspectRatio,
  outputDir,
  jobId,
}) {
  const targetDir = outputDir || exportsDir;
  fs.mkdirSync(targetDir, { recursive: true });

  const rawSource = sourceUrl || inputPath;
  const isYouTube = Boolean(
    rawSource &&
      isYouTubeUrl(rawSource) &&
      (!inputPath || !fs.existsSync(inputPath) || isYouTubeUrl(inputPath))
  );

  let effectiveInputPath = inputPath;
  let isTempSnippet = false;
  let reframeStartTime = startTime;
  let reframeEndTime = endTime;

  // If source is a YouTube video, download ONLY the trimmed snippet via RapidAPI trim parameters
  if (isYouTube) {
    console.log(`[smartClipService] Downloading trimmed segment for YouTube source: ${rawSource}`);
    const downloadedSnippet = await downloadTrimmedClipViaRapidApi({
      sourceUrl: rawSource,
      clip,
      startTime,
      endTime,
      destinationDir: targetDir,
      jobId,
    });

    effectiveInputPath = downloadedSnippet;
    isTempSnippet = true;

    // The downloaded snippet is ALREADY cut to the exact clip window.
    // Therefore, within the snippet, the video starts at 0!
    const startSec = clip?.startTime != null ? Number(clip.startTime) : toSeconds(startTime);
    const endSec = clip?.endTime != null ? Number(clip.endTime) : toSeconds(endTime);
    const clipDuration = Math.max(1, Math.ceil(endSec - startSec));

    reframeStartTime = "00:00:00";
    reframeEndTime = secondsToTime(clipDuration);
  }

  if (!effectiveInputPath || !fs.existsSync(effectiveInputPath)) {
    throw new Error(`Video source file not found for smart clipping: ${effectiveInputPath}`);
  }

  try {
    // 1. Try AI face-tracking reframe first (if enabled and non-cloud)
    try {
      const faceTracked = await runFaceTrackingReframe({
        inputPath: effectiveInputPath,
        startTime: reframeStartTime,
        endTime: reframeEndTime,
        aspectRatio,
        outputDir: targetDir,
        jobId,
      });
      return faceTracked;
    } catch (err) {
      console.warn("Face tracking reframe failed, using fallback center crop:", err.message);
    }

    // 2. Fallback: Fast FFmpeg center crop
    return await new Promise((resolve, reject) => {
      const ratio = aspectRatio || "9:16";
      const [rW, rH] = ratio.split(":").map(Number);
      const targetW = 720;
      const targetH = Math.round((targetW * (rH || 16)) / (rW || 9));
      const duration = Math.max(1, toSeconds(reframeEndTime) - toSeconds(reframeStartTime));

      const prefix = jobId ? `smart_clip_${String(jobId).replace(/[^\w-]/g, "_")}` : "smart_clip";
      const fileName = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp4`;
      const outputPath = path.join(targetDir, fileName);

      const ffmpegPath = getFFmpegPath();

      const args = [
        "-y",
        "-ss",
        String(toSeconds(reframeStartTime)),
        "-i",
        effectiveInputPath,
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
      if (jobId) registerJobProcess(jobId, child);

      let stderr = "";
      child.stderr.on("data", (d) => {
        stderr += d.toString();
      });

      child.on("close", (code) => {
        if (jobId) unregisterJobProcess(jobId, child);
        if (code === 0 && fs.existsSync(outputPath)) {
          resolve({ fileName, outputPath });
        } else {
          reject(
            new Error(`FFmpeg failed (code ${code}): ${stderr.slice(-300)}`)
          );
        }
      });

      child.on("error", (err) => {
        if (jobId) unregisterJobProcess(jobId, child);
        reject(new Error(`FFmpeg not found: ${err.message}`));
      });
    });
  } finally {
    // Clean up temporary snippet file
    if (isTempSnippet && effectiveInputPath && fs.existsSync(effectiveInputPath)) {
      try {
        fs.unlinkSync(effectiveInputPath);
      } catch (cleanupErr) {
        console.warn(`[smartClipService] Failed to clean up temp snippet ${effectiveInputPath}:`, cleanupErr.message);
      }
    }
  }
}

module.exports = {
  smartGenerateClip,
  downloadTrimmedClipViaRapidApi,
  runFaceTrackingReframe,
  registerJobProcess,
  unregisterJobProcess,
  terminateJobProcess,
  extractYouTubeId,
  isYouTubeUrl,
};
