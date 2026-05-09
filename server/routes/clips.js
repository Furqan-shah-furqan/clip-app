const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const {
  rootDir,
  uploadsDir,
  captionsDir,
  projectsFile,
} = require("../utils/paths");
const { smartGenerateClip } = require("../services/smartClipService");
const { findSmartClipMoments } = require("../services/smartClipRanker");

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const safeOriginal = file.originalname.replace(/[^\w.\-]/g, "_");
    cb(null, `${Date.now()}_${safeOriginal}`);
  },
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
  },
});
function cleanSmartClipError(error) {
  const raw = String(error?.message || error || "");

  if (
    raw.includes("PO Token") ||
    raw.includes("challenge solving failed") ||
    raw.includes("HTTP Error 403") ||
    raw.includes("Some formats may be missing") ||
    raw.includes("Sign in to confirm") ||
    raw.includes("not a bot")
  ) {
    return "YouTube blocked this video from being downloaded. Try another YouTube video or use Upload instead.";
  }

  if (
    raw.includes("Failed to resolve") ||
    raw.includes("getaddrinfo failed") ||
    raw.includes("ENOTFOUND")
  ) {
    return "Internet/DNS failed while downloading the YouTube video. Check your connection and try again.";
  }

  if (raw.includes("ffmpeg exited")) {
    return "Video processing failed. Try another video or upload the source file directly.";
  }

  const cleanLine = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => {
      return (
        line.startsWith("ERROR:") ||
        line.includes("HTTP Error") ||
        line.includes("failed") ||
        line.includes("blocked")
      );
    });

  return (
    cleanLine ||
    "Smart clipping failed. Try another video or upload the source file directly."
  );
}

function isValidYouTubeUrl(url) {
  return /^https?:\/\/(www\.)?(youtube\.com\/(watch\?|shorts\/|live\/)|youtu\.be\/)/.test(
    url,
  );
}

function timeToSeconds(timeStr) {
  if (!timeStr) return 0;
  const parts = String(timeStr).split(":").map(Number);

  if (parts.some((n) => Number.isNaN(n) || n < 0)) return NaN;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return NaN;
}
function formatSectionTime(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  return safe.toFixed(3);
}

function secondsToTime(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const hrs = String(Math.floor(s / 3600)).padStart(2, "0");
  const mins = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const secs = String(s % 60).padStart(2, "0");
  return `${hrs}:${mins}:${secs}`;
}

function ensureValidClipWindow(startTime, endTime) {
  const startSec = timeToSeconds(startTime);
  const endSec = timeToSeconds(endTime);

  if (Number.isNaN(startSec) || Number.isNaN(endSec)) {
    throw new Error("Invalid start or end time format");
  }

  if (endSec <= startSec) {
    throw new Error("End time must be greater than start time");
  }

  return {
    startSec,
    endSec,
    durationSec: endSec - startSec,
  };
}

function saveProject(project) {
  let projects = [];
  try {
    if (fs.existsSync(projectsFile)) {
      const raw = fs.readFileSync(projectsFile, "utf8");
      projects = raw ? JSON.parse(raw) : [];
    }
  } catch {
    projects = [];
  }

  projects.push(project);
  fs.writeFileSync(projectsFile, JSON.stringify(projects, null, 2), "utf8");
}

function runCommand(command, args = [], options = {}) {
  const timeoutMs = Number(options.timeoutMs || 180000);

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;

      settled = true;

      try {
        if (process.platform === "win32") {
          spawn("taskkill", ["/pid", String(child.pid), "/f", "/t"], {
            windowsHide: true,
            stdio: "ignore",
          });
        } else {
          child.kill("SIGKILL");
        }
      } catch {
        // ignore kill errors
      }

      reject(
        new Error(
          `${command} timed out after ${Math.round(timeoutMs / 1000)} seconds`,
        ),
      );
    }, timeoutMs);

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("error", (error) => {
      if (settled) return;

      settled = true;
      clearTimeout(timeout);
      reject(error);
    });

    child.on("close", (code) => {
      if (settled) return;

      settled = true;
      clearTimeout(timeout);

      if (code === 0) {
        resolve({
          stdout,
          stderr,
        });
        return;
      }

      reject(
        new Error(stderr || stdout || `${command} exited with code ${code}`),
      );
    });
  });
}

function detectJsRuntime() {
  const nodePath = "C:\\Program Files\\nodejs\\node.exe";

  if (fs.existsSync(nodePath)) {
    return `node:${nodePath}`;
  }

  try {
    const result = spawnSync("node", ["-v"], {
      windowsHide: true,
      encoding: "utf8",
    });

    if (result.status === 0) {
      return "node";
    }
  } catch {
    // ignore
  }

  try {
    const result = spawnSync("deno", ["--version"], {
      windowsHide: true,
      encoding: "utf8",
    });

    if (result.status === 0) {
      return "deno";
    }
  } catch {
    // ignore
  }

  return null;
}

const TRANSCRIBE_SCRIPT = path.join(rootDir, "python", "transcribe_whisper.py");

function safeTranscriptBase(value = "source") {
  return path
    .basename(String(value || "source").replace(/[^\w.\-]/g, "_"))
    .replace(/\.[^.]+$/, "");
}

function resolveSmartInputVideo(inputPath = "") {
  if (!inputPath) return null;
  const raw = String(inputPath).trim();
  const base = path.basename(raw);
  const candidates = [
    raw,
    path.isAbsolute(raw) ? raw : path.join(rootDir, raw),
    path.join(uploadsDir, base),
  ];
  for (const candidate of candidates) {
    if (
      candidate &&
      fs.existsSync(candidate) &&
      fs.statSync(candidate).isFile()
    )
      return candidate;
  }
  return null;
}

async function extractSmartAudioToWav(videoPath, wavPath) {
  await runCommand("ffmpeg", [
    "-y",
    "-i",
    videoPath,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-c:a",
    "pcm_s16le",
    wavPath,
  ]);
}

async function runSmartPythonTranscription(wavPath) {
  const pythonCandidates = [process.env.PYTHON_PATH, "python", "py"].filter(
    Boolean,
  );
  let lastError = null;
  for (const candidate of pythonCandidates) {
    try {
      const { stdout } = await runCommand(candidate, [
        TRANSCRIBE_SCRIPT,
        wavPath,
      ]);
      const parsed = JSON.parse(stdout || "{}");
      return Array.isArray(parsed.segments) ? parsed.segments : [];
    } catch (error) {
      lastError = error;
    }
  }
  throw (
    lastError ||
    new Error("No working Python runtime found for smart transcript")
  );
}

async function getLocalSmartTranscript(inputPath) {
  const videoPath = resolveSmartInputVideo(inputPath);
  if (!videoPath)
    throw new Error("Input video file not found for smart clipping");
  fs.mkdirSync(captionsDir, { recursive: true });
  const stat = fs.statSync(videoPath);
  const base = safeTranscriptBase(videoPath);
  const stamp = `${stat.size}_${Math.round(stat.mtimeMs)}`
    .replace(/\W/g, "")
    .slice(0, 18);
  const jsonPath = path.join(captionsDir, `${base}-smart-${stamp}.json`);
  const wavPath = path.join(captionsDir, `${base}-smart-${stamp}.wav`);
  if (fs.existsSync(jsonPath)) {
    try {
      const cached = JSON.parse(fs.readFileSync(jsonPath, "utf8") || "{}");
      if (Array.isArray(cached.segments) && cached.segments.length)
        return cached.segments;
    } catch {}
  }
  await extractSmartAudioToWav(videoPath, wavPath);
  const segments = await runSmartPythonTranscription(wavPath);
  try {
    if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath);
  } catch {}
  fs.writeFileSync(jsonPath, JSON.stringify({ segments }, null, 2), "utf8");
  return segments;
}

function vttTimeToSeconds(value = "") {
  const clean = String(value || "")
    .replace(",", ".")
    .trim();
  const parts = clean.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return Number(clean) || 0;
}

function parseTranscriptVtt(vttText = "") {
  const segments = [];
  const lines = String(vttText || "").split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.includes("-->")) continue;
    const [startRaw, endRawFull] = line.split("-->");
    const endRaw = String(endRawFull || "")
      .trim()
      .split(/\s+/)[0];
    const start = vttTimeToSeconds(startRaw);
    const end = vttTimeToSeconds(endRaw);
    const textLines = [];
    i += 1;
    while (i < lines.length && lines[i].trim()) {
      textLines.push(lines[i].replace(/<[^>]+>/g, " ").trim());
      i += 1;
    }
    const text = textLines.join(" ").replace(/\s+/g, " ").trim();
    if (text && end > start) segments.push({ start, end, text });
  }
  return segments;
}

async function getYouTubeSmartTranscript(sourceUrl) {
  if (!sourceUrl || !isValidYouTubeUrl(sourceUrl))
    throw new Error("Valid YouTube source URL is required for smart clipping");
  fs.mkdirSync(captionsDir, { recursive: true });
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const outputBase = path.join(captionsDir, `youtube-smart-${stamp}`);
  const args = [
    ...buildYtDlpCommonArgs(),
    "--skip-download",
    "--write-auto-subs",
    "--write-subs",
    "--sub-langs",
    "en.*",
    "--sub-format",
    "vtt",
    "-o",
    `${outputBase}.%(ext)s`,
    sourceUrl,
  ];
  await runCommand("yt-dlp", args);
  const files = fs
    .readdirSync(captionsDir)
    .filter(
      (file) =>
        file.startsWith(`youtube-smart-${stamp}`) &&
        file.toLowerCase().endsWith(".vtt"),
    )
    .map((file) => path.join(captionsDir, file));
  if (!files.length)
    throw new Error("No English YouTube transcript found for smart clipping");
  const vttText = fs.readFileSync(files[0], "utf8");
  return parseTranscriptVtt(vttText);
}

function buildYtDlpCommonArgs() {
  return [
    "--no-playlist",
    "--force-ipv4",
    "--no-check-certificates",
    "--no-warnings",
    "--user-agent",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "--add-header",
    "Accept-Language:en-US,en;q=0.9",
  ];
}

function cleanCommandError(message = "") {
  const text = String(message || "");

  const importantLine = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => {
      return (
        line.includes("ERROR:") ||
        line.includes("HTTP Error") ||
        line.includes("Sign in") ||
        line.includes("blocked") ||
        line.includes("failed")
      );
    });

  return (
    importantLine ||
    "Video download failed. Try another video or upload the file directly."
  );
}

function cleanSmartClipError(error) {
  const raw = String(error?.message || error || "");

  if (
    raw.includes("challenge solving failed") ||
    raw.includes("PO Token") ||
    raw.includes("HTTP Error 403") ||
    raw.includes("Sign in to confirm") ||
    raw.includes("not a bot")
  ) {
    return "This YouTube video could not be downloaded by yt-dlp. Try Upload, or update yt-dlp and try again.";
  }

  if (
    raw.includes("Failed to resolve") ||
    raw.includes("getaddrinfo failed") ||
    raw.includes("ENOTFOUND")
  ) {
    return "Internet/DNS failed while downloading the YouTube video. Check your connection and try again.";
  }

  if (raw.includes("ffmpeg exited")) {
    return "Video processing failed. Try another video or upload the source file directly.";
  }

  const cleanLine = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => {
      return (
        line.startsWith("ERROR:") ||
        line.includes("HTTP Error") ||
        line.includes("failed") ||
        line.includes("blocked")
      );
    });

  return (
    cleanLine ||
    "Smart clipping failed. Try another video or upload the source file directly."
  );
}

function findDownloadedSmartSource(clipStamp) {
  const possibleFiles = fs
    .readdirSync(uploadsDir)
    .filter((file) => file.startsWith(`yt_smart_source_${clipStamp}`))
    .map((file) => path.join(uploadsDir, file))
    .filter((fullPath) => fs.existsSync(fullPath))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

  const mp4File = possibleFiles.find((fullPath) => {
    return fullPath.toLowerCase().endsWith(".mp4");
  });

  return mp4File || possibleFiles[0] || null;
}

async function tryDownloadYouTubeSource({
  sourceUrl,
  outputTemplate,
  format,
  extraArgs = [],
}) {
  const args = [
    ...buildYtDlpCommonArgs(),
    ...extraArgs,
    "-f",
    format,
    "--merge-output-format",
    "mp4",
    "--retries",
    "5",
    "--fragment-retries",
    "5",
    "-o",
    outputTemplate,
    sourceUrl,
  ];

  await runCommand("yt-dlp", args);
}
async function downloadYouTubeSectionForSmartClipping({
  sourceUrl,
  startSec,
  endSec,
  index = 0,
}) {
  const safeStart = Math.max(0, Number(startSec) || 0);
  const safeEnd = Math.max(safeStart + 8, Number(endSec) || safeStart + 30);

  const clipStamp = `${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`;
  const tempBase = path.join(uploadsDir, `yt_smart_section_${clipStamp}`);
  const outputTemplate = `${tempBase}.%(ext)s`;

  const section = `*${formatSectionTime(safeStart)}-${formatSectionTime(safeEnd)}`;

  const strategies = [
    {
      name: "progressive mp4 section",
      format: "18/b[ext=mp4][height<=720]/best[ext=mp4][height<=720]/best",
      extraArgs: [],
    },
    {
      name: "best mp4 section",
      format: "best[ext=mp4][height<=720]/best[height<=720]/best",
      extraArgs: [],
    },
  ];

  let lastError = null;

  for (const strategy of strategies) {
    try {
      const args = [
        ...buildYtDlpCommonArgs(),
        ...strategy.extraArgs,
        "-f",
        strategy.format,
        "--download-sections",
        section,
        "--force-keyframes-at-cuts",
        "--merge-output-format",
        "mp4",
        "--socket-timeout",
        "15",
        "--retries",
        "2",
        "--fragment-retries",
        "2",
        "-o",
        outputTemplate,
        sourceUrl,
      ];

      await runCommand("yt-dlp", args, {
        timeoutMs: 90000,
      });

      const files = fs
        .readdirSync(uploadsDir)
        .filter((file) => file.startsWith(`yt_smart_section_${clipStamp}`))
        .map((file) => path.join(uploadsDir, file))
        .filter((filePath) => fs.existsSync(filePath))
        .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

      const mp4File = files.find((filePath) => {
        return filePath.toLowerCase().endsWith(".mp4");
      });

      const selectedFile = mp4File || files[0];

      if (selectedFile) {
        return selectedFile;
      }
    } catch (error) {
      lastError = error;
      console.warn(
        `yt-dlp section strategy failed: ${strategy.name}`,
        error.message,
      );
    }
  }

  throw new Error(cleanSmartClipError(lastError));
}

function isYouTubeDownloadBlockedError(error) {
  const raw = String(error?.message || error || "");

  return (
    raw.includes("challenge solving failed") ||
    raw.includes("PO Token") ||
    raw.includes("HTTP Error 403") ||
    raw.includes("Requested format is not available") ||
    raw.includes("Only images are available") ||
    raw.includes("Sign in to confirm") ||
    raw.includes("not a bot") ||
    raw.includes("Read timed out") ||
    raw.includes("timed out")
  );
}

async function downloadYouTubeSourceForSmartClipping(sourceUrl) {
  const clipStamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const tempBase = path.join(uploadsDir, `yt_smart_source_${clipStamp}`);
  const outputTemplate = `${tempBase}.%(ext)s`;

  const strategies = [
    {
      name: "simple progressive mp4",
      format: "18/b[ext=mp4][height<=720]/best[ext=mp4][height<=720]/best",
      extraArgs: [],
    },
    {
      name: "best mp4",
      format: "best[ext=mp4][height<=1080]/best[height<=1080]/best",
      extraArgs: [],
    },
    {
      name: "chrome cookies simple mp4",
      format: "18/b[ext=mp4][height<=720]/best[ext=mp4][height<=720]/best",
      extraArgs: ["--cookies-from-browser", "chrome"],
    },
    {
      name: "edge cookies simple mp4",
      format: "18/b[ext=mp4][height<=720]/best[ext=mp4][height<=720]/best",
      extraArgs: ["--cookies-from-browser", "edge"],
    },
  ];

  let lastError = null;

  for (const strategy of strategies) {
    try {
      await tryDownloadYouTubeSource({
        sourceUrl,
        outputTemplate,
        format: strategy.format,
        extraArgs: strategy.extraArgs,
      });

      const downloadedFile = findDownloadedSmartSource(clipStamp);

      if (downloadedFile) {
        return downloadedFile;
      }
    } catch (error) {
      lastError = error;
      console.warn(`yt-dlp strategy failed: ${strategy.name}`, error.message);
    }
  }

  throw new Error(cleanSmartClipError(lastError));
}

async function createClipFromSource({
  sourceType,
  inputPath,
  sourceUrl,
  startTime,
  endTime,
  aspectRatio,
}) {
  const { durationSec } = ensureValidClipWindow(startTime, endTime);

  let workingInputPath = inputPath;
  let tempSourcePath = null;

  try {
    if (sourceType === "youtube") {
      if (!sourceUrl || !isValidYouTubeUrl(sourceUrl)) {
        throw new Error("Valid YouTube source URL is required");
      }

      tempSourcePath = await downloadYouTubeClipSegment({
        sourceUrl,
        startTime,
        endTime,
      });

      workingInputPath = tempSourcePath;

      const result = await smartGenerateClip({
        inputPath: workingInputPath,
        startTime: "00:00:00",
        endTime: secondsToTime(durationSec),
        aspectRatio: aspectRatio || "9:16",
      });

      return result;
    }

    if (!workingInputPath) {
      throw new Error("Input video file is required");
    }

    if (!fs.existsSync(workingInputPath)) {
      throw new Error("Input video file not found");
    }

    const result = await smartGenerateClip({
      inputPath: workingInputPath,
      startTime,
      endTime,
      aspectRatio: aspectRatio || "9:16",
    });

    return result;
  } finally {
    if (tempSourcePath && fs.existsSync(tempSourcePath)) {
      try {
        fs.unlinkSync(tempSourcePath);
      } catch {
        // ignore cleanup errors
      }
    }
  }
}

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
        createdAt: new Date().toISOString(),
      };

      saveProject(project);

      return res.json({
        message: "Upload successful",
        project,
      });
    } catch (error) {
      console.error("UPLOAD ROUTE ERROR:", error);
      return res.status(500).json({
        error: "Internal upload error",
        details: error.message,
      });
    }
  });
});

router.post("/smart-suggest", async (req, res) => {
  try {
    const {
      sourceType,
      inputPath,
      sourceUrl,
      segments,
      maxClips,
      clipLengthSec,
      minDurationSec,
      maxDurationSec,
    } = req.body || {};
    let transcriptSegments = [];
    if (Array.isArray(segments) && segments.length)
      transcriptSegments = segments;
    else if (sourceType === "youtube")
      transcriptSegments = await getYouTubeSmartTranscript(sourceUrl);
    else transcriptSegments = await getLocalSmartTranscript(inputPath);
    const suggestions = findSmartClipMoments(transcriptSegments, {
      maxClips: Number(maxClips) || 5,
      preferredDurationSec: Number(clipLengthSec) || 45,
      minDurationSec: Number(minDurationSec) || 25,
      maxDurationSec: Number(maxDurationSec) || 90,
    });
    return res.json({
      success: true,
      source: "transcript",
      segmentCount: transcriptSegments.length,
      suggestions,
    });
  } catch (error) {
    console.error("SMART SUGGEST ERROR:", error);
    return res.status(500).json({
      error: "Smart clip suggestion failed",
      details: error.message,
      suggestions: [],
    });
  }
});

function buildSmartGeneratedClipPayload(
  result,
  suggestion,
  index,
  normalizedSourceType,
) {
  const outputStat = fs.existsSync(result.outputPath)
    ? fs.statSync(result.outputPath)
    : null;

  const startTime = suggestion.start || secondsToTime(suggestion.startSec || 0);
  const endTime = suggestion.end || secondsToTime(suggestion.endSec || 0);
  const duration = Math.max(
    0,
    timeToSeconds(endTime) - timeToSeconds(startTime),
  );

  return {
    message: "Smart clip generated successfully",
    fileName: result.fileName,
    outputPath: result.outputPath,
    filePath: result.outputPath,
    downloadUrl: `/api/files/download/${result.fileName}`,
    startTime,
    endTime,
    startSec: suggestion.startSec,
    endSec: suggestion.endSec,
    duration,
    durationSec: duration,
    size: outputStat?.size || 0,
    sourceType: normalizedSourceType,
    hook: suggestion.title || `Smart Clip #${index + 1}`,
    title: suggestion.title || `Smart Clip #${index + 1}`,
    smartScore: suggestion.score || 0,
    score: suggestion.score || 0,
    smartReason: suggestion.reason || "Smart transcript moment",
    reason: suggestion.reason || "Smart transcript moment",
    signals: suggestion.signals || [],
    previewText: suggestion.previewText || suggestion.text || "",
  };
}

router.post("/smart-generate", async (req, res) => {
  const tempSectionFiles = [];
  const startedAt = Date.now();
  const maxSmartGenerateMs = 6 * 60 * 1000;

  try {
    const {
      sourceType,
      inputPath,
      sourceUrl,
      segments,
      maxClips,
      minScore,
      clipLengthSec,
      minDurationSec,
      maxDurationSec,
      aspectRatio,
      videoDurationSec,
    } = req.body || {};

    const normalizedSourceType =
      sourceType === "youtube" ? "youtube" : "upload";
    const safeMaxClips = Math.max(1, Math.min(3, Number(maxClips) || 3));
    const safeMinScore = Math.max(1, Math.min(100, Number(minScore) || 80));

    if (normalizedSourceType === "youtube") {
      if (!sourceUrl || !isValidYouTubeUrl(sourceUrl)) {
        return res.status(400).json({
          error: "Valid YouTube source URL is required.",
          suggestions: [],
          clips: [],
        });
      }
    } else if (!inputPath) {
      return res.status(400).json({
        error: "Input video file is required.",
        suggestions: [],
        clips: [],
      });
    }

    let transcriptSegments = [];

    if (Array.isArray(segments) && segments.length) {
      transcriptSegments = segments;
    } else if (normalizedSourceType === "youtube") {
      transcriptSegments = await getYouTubeSmartTranscript(sourceUrl);
    } else {
      transcriptSegments = await getLocalSmartTranscript(inputPath);
    }

    const allSuggestions = findSmartClipMoments(transcriptSegments, {
      maxClips: Math.max(safeMaxClips * 3, 10),
      preferredDurationSec: Number(clipLengthSec) || 45,
      minDurationSec: Number(minDurationSec) || 25,
      maxDurationSec: Number(maxDurationSec) || 90,
      videoDurationSec: Number(videoDurationSec) || 0,
    });

    const suggestions = allSuggestions
      .filter((item) => Number(item.score || 0) >= safeMinScore)
      .slice(0, safeMaxClips);

    if (!suggestions.length) {
      return res.json({
        success: true,
        source: "transcript",
        segmentCount: transcriptSegments.length,
        minScore: safeMinScore,
        suggestions: [],
        clips: [],
        message: `No smart clips scored ${safeMinScore}+.`,
      });
    }

    const clips = [];

    for (let i = 0; i < suggestions.length; i += 1) {
      if (Date.now() - startedAt > maxSmartGenerateMs) {
        throw new Error(
          "Smart clipping timed out. Try a shorter video or upload the file directly.",
        );
      }
      const suggestion = suggestions[i];

      const startSec = Number(
        suggestion.startSec || timeToSeconds(suggestion.start || "00:00:00"),
      );
      const endSec = Number(
        suggestion.endSec || timeToSeconds(suggestion.end || "00:00:30"),
      );
      const durationSec = Math.max(8, endSec - startSec);

      let result;

      if (normalizedSourceType === "youtube") {
        let sectionPath = null;

        try {
          sectionPath = await downloadYouTubeSectionForSmartClipping({
            sourceUrl,
            startSec,
            endSec,
            index: i,
          });
        } catch (error) {
          if (isYouTubeDownloadBlockedError(error)) {
            return res.json({
              success: false,
              needsUpload: true,
              source: "transcript",
              error: "YOUTUBE_DOWNLOAD_BLOCKED",
              message:
                "YouTube blocked clip download. Upload the source video to generate these smart clips.",
              segmentCount: transcriptSegments.length,
              minScore: safeMinScore,
              suggestions,
              clips: [],
            });
          }

          throw error;
        }

        tempSectionFiles.push(sectionPath);

        result = await smartGenerateClip({
          inputPath: sectionPath,
          startTime: "00:00:00",
          endTime: secondsToTime(durationSec),
          aspectRatio: aspectRatio || "9:16",
        });
      } else {
        result = await createClipFromSource({
          sourceType: normalizedSourceType,
          inputPath,
          sourceUrl,
          startTime: suggestion.start || secondsToTime(startSec),
          endTime: suggestion.end || secondsToTime(endSec),
          aspectRatio: aspectRatio || "9:16",
        });
      }

      clips.push(
        buildSmartGeneratedClipPayload(
          result,
          suggestion,
          i,
          normalizedSourceType,
        ),
      );
    }

    return res.json({
      success: true,
      source: "transcript",
      segmentCount: transcriptSegments.length,
      minScore: safeMinScore,
      suggestions,
      clips,
    });
  } catch (error) {
    const cleanMessage = cleanSmartClipError(error);

    console.error("SMART GENERATE PIPELINE ERROR:", error);

    return res.status(500).json({
      error: "Smart clip generation failed",
      details: cleanMessage,
      message: cleanMessage,
      suggestions: [],
      clips: [],
    });
  } finally {
    for (const filePath of tempSectionFiles) {
      if (filePath && fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch {
          // ignore cleanup error
        }
      }
    }
  }
});

router.post("/generate", async (req, res) => {
  try {
    const {
      inputPath,
      sourceType,
      sourceUrl,
      startTime,
      endTime,
      aspectRatio,
    } = req.body;

    if (!startTime || !endTime) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const normalizedSourceType =
      sourceType === "youtube" ? "youtube" : "upload";

    if (
      normalizedSourceType === "youtube" &&
      (!sourceUrl || !isValidYouTubeUrl(sourceUrl))
    ) {
      return res
        .status(400)
        .json({ error: "Valid YouTube source URL is required" });
    }

    if (normalizedSourceType !== "youtube" && !inputPath) {
      return res.status(400).json({ error: "Input video file is required" });
    }

    ensureValidClipWindow(startTime, endTime);

    const result = await createClipFromSource({
      sourceType: normalizedSourceType,
      inputPath,
      sourceUrl,
      startTime,
      endTime,
      aspectRatio: aspectRatio || "9:16",
    });

    const outputStat = fs.existsSync(result.outputPath)
      ? fs.statSync(result.outputPath)
      : null;

    const clipDurationSec = timeToSeconds(endTime) - timeToSeconds(startTime);

    return res.json({
      message: "Smart clip generated successfully",
      fileName: result.fileName,
      outputPath: result.outputPath,
      downloadUrl: `/api/files/download/${result.fileName}`,
      startTime,
      endTime,
      duration: clipDurationSec,
      size: outputStat?.size || 0,
      sourceType: normalizedSourceType,
    });
  } catch (error) {
    console.error("SMART GENERATE ERROR:", error);
    return res.status(500).json({
      error: "Smart clip generation failed",
      details: error.message,
    });
  }
});

router.get("/suggest", (req, res) => {
  res.json({
    message:
      "Use POST /api/clips/smart-suggest with a source video to find real smart clips.",
    suggestions: [],
  });
});

module.exports = router;
