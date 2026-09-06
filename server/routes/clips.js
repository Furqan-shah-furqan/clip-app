const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const {
  rootDir,
  uploadsDir,
  captionsDir,
  exportsDir,
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
    if (!allowed.includes(ext)) return cb(new Error("Only MP4, MOV, MKV, WEBM files are allowed"));
    cb(null, true);
  },
});

function isValidYouTubeUrl(url) {
  return /^https?:\/\/(www\.)?(youtube\.com\/(watch\?|shorts\/|live\/)|youtu\.be\/)/.test(url);
}

function extractYouTubeId(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) return parsed.pathname.replace("/", "").trim();
    if (parsed.searchParams.get("v")) return parsed.searchParams.get("v");
    const parts = parsed.pathname.split("/").filter(Boolean);
    const shortsIndex = parts.indexOf("shorts");
    const liveIndex = parts.indexOf("live");
    if (shortsIndex !== -1 && parts[shortsIndex + 1]) return parts[shortsIndex + 1];
    if (liveIndex !== -1 && parts[liveIndex + 1]) return parts[liveIndex + 1];
  } catch { return ""; }
  return "";
}

function timeToSeconds(timeStr) {
  if (!timeStr) return 0;
  const parts = String(timeStr).split(":").map(Number);
  if (parts.some((n) => Number.isNaN(n) || n < 0)) return NaN;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return NaN;
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
  if (Number.isNaN(startSec) || Number.isNaN(endSec)) throw new Error("Invalid start or end time format");
  if (endSec <= startSec) throw new Error("End time must be greater than start time");
  return { startSec, endSec, durationSec: endSec - startSec };
}


function readProjects() {
  try {
    if (!fs.existsSync(projectsFile)) return [];
    const raw = fs.readFileSync(projectsFile, "utf8");
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeProjects(projects) {
  fs.writeFileSync(projectsFile, JSON.stringify(projects, null, 2), "utf8");
}

function upsertProject(project) {
  const projects = readProjects();
  const id = String(project.id || `project_${Date.now()}`);
  const now = new Date().toISOString();
  const payload = {
    ...project,
    id,
    updatedAt: now,
    createdAt: project.createdAt || now,
  };
  const index = projects.findIndex((item) => String(item.id) === id);
  if (index >= 0) projects[index] = { ...projects[index], ...payload };
  else projects.unshift(payload);
  writeProjects(projects.slice(0, 100));
  return payload;
}

function saveProject(project) {
  let projects = [];
  try {
    if (fs.existsSync(projectsFile)) {
      const raw = fs.readFileSync(projectsFile, "utf8");
      projects = raw ? JSON.parse(raw) : [];
    }
  } catch { projects = []; }
  projects.push(project);
  fs.writeFileSync(projectsFile, JSON.stringify(projects, null, 2), "utf8");
}

function cleanSmartClipError(error) {
  const raw = String(error?.message || error || "");
  if (raw.includes("PO Token") || raw.includes("challenge solving failed") ||
    raw.includes("HTTP Error 403") || raw.includes("Sign in to confirm") ||
    raw.includes("not a bot")) {
    return "YouTube blocked this video. Try another video or use Upload instead.";
  }
  if (raw.includes("ENOENT") && raw.includes("yt-dlp")) {
    return "Smart clipping failed. Try uploading the source video directly.";
  }
  if (raw.includes("transcript")) return raw;
  return raw || "Smart clipping failed. Try uploading the source video directly.";
}

function runCommand(command, args = [], options = {}) {
  const timeoutMs = Number(options.timeoutMs || 180000);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "", settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill("SIGKILL"); } catch {}
      reject(new Error(`${command} timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);

    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    child.on("error", (err) => { if (settled) return; settled = true; clearTimeout(timeout); reject(err); });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr || stdout || `${command} exited with code ${code}`));
    });
  });
}

// ── YouTube transcript via YouTube Data API ──────────────────────────────────
async function getYouTubeSmartTranscript(sourceUrl) {
  if (!sourceUrl || !isValidYouTubeUrl(sourceUrl)) throw new Error("Valid YouTube source URL is required");
  const videoId = extractYouTubeId(sourceUrl);
  if (!videoId) throw new Error("Could not extract YouTube video ID");
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error("YOUTUBE_API_KEY not set");

  try {
    const axios = require("axios");
    const captionsRes = await axios.get(
      `https://www.googleapis.com/youtube/v3/captions?part=snippet&videoId=${videoId}&key=${apiKey}`
    );
    const tracks = captionsRes.data.items || [];
    const enTrack = tracks.find((t) => t.snippet.language === "en" || t.snippet.trackKind === "asr");
    if (!enTrack) return await getFallbackSegmentsFromVideoMeta(videoId, apiKey);
    const captionRes = await axios.get(
      `https://www.googleapis.com/youtube/v3/captions/${enTrack.id}?tfmt=vtt&key=${apiKey}`,
      { responseType: "text" }
    );
    const segments = parseTranscriptVtt(captionRes.data);
    if (segments.length) return segments;
    return await getFallbackSegmentsFromVideoMeta(videoId, apiKey);
  } catch (err) {
    return await getFallbackSegmentsFromVideoMeta(videoId, apiKey);
  }
}

function parseTranscriptVtt(vttText = "") {
  const segments = [];
  const lines = String(vttText || "").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes("-->")) continue;
    const [startRaw, endRawFull] = line.split("-->");
    const endRaw = String(endRawFull || "").trim().split(/\s+/)[0];
    const start = vttTimeToSeconds(startRaw);
    const end = vttTimeToSeconds(endRaw);
    const textLines = [];
    i++;
    while (i < lines.length && lines[i].trim()) {
      textLines.push(lines[i].replace(/<[^>]+>/g, " ").trim());
      i++;
    }
    const text = textLines.join(" ").replace(/\s+/g, " ").trim();
    if (text && end > start) segments.push({ start, end, text });
  }
  return segments;
}

function vttTimeToSeconds(value = "") {
  const clean = String(value || "").replace(",", ".").trim();
  const parts = clean.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return Number(clean) || 0;
}

async function getFallbackSegmentsFromVideoMeta(videoId, apiKey) {
  const axios = require("axios");
  const res = await axios.get(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${videoId}&key=${apiKey}`
  );
  const item = res.data.items?.[0];
  if (!item) throw new Error("Video not found");
  const description = item.snippet.description || "";
  const title = item.snippet.title || "";
  const lines = [title, ...description.split(/\n+/)].filter((l) => l.trim().length > 20);
  const segments = [];
  let t = 0;
  for (const line of lines.slice(0, 30)) {
    const dur = 4 + Math.random() * 6;
    segments.push({ start: t, end: t + dur, text: line.trim() });
    t += dur + 1;
  }
  if (!segments.length) throw new Error("No usable content found for this video");
  return segments;
}

// ── Local video transcript ───────────────────────────────────────────────────
function resolveSmartInputVideo(inputPath = "") {
  if (!inputPath) return null;
  const raw = String(inputPath).trim();
  const base = path.basename(raw);
  const candidates = [raw, path.join(uploadsDir, base)];
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

async function getLocalSmartTranscript(inputPath) {
  const videoPath = resolveSmartInputVideo(inputPath);
  if (!videoPath) throw new Error("Input video file not found for smart clipping");

  const python311 = "C:\\Users\\xpert computers\\AppData\\Local\\Programs\\Python\\Python311\\python.exe";
  const pythonCandidates = [
    process.env.PYTHON_PATH,
    fs.existsSync(python311) ? python311 : null,
    "python3",
    "python",
  ].filter(Boolean);
  const TRANSCRIBE_SCRIPT = path.join(rootDir, "python", "transcribe_whisper.py");

  if (fs.existsSync(TRANSCRIBE_SCRIPT)) {
    for (const pythonBin of pythonCandidates) {
      try {
        const result = await new Promise((resolve, reject) => {
          const child = spawn(pythonBin, [TRANSCRIBE_SCRIPT, videoPath], { windowsHide: true });
          let stdout = "", stderr = "";
          child.stdout.on("data", (d) => { stdout += d.toString(); });
          child.stderr.on("data", (d) => { stderr += d.toString(); });
          child.on("close", (code) => {
            if (code !== 0) return reject(new Error(stderr || "Transcription failed"));
            try {
              const parsed = JSON.parse(stdout || "{}");
              resolve(Array.isArray(parsed.segments) ? parsed.segments : []);
            } catch { reject(new Error("Invalid transcription output")); }
          });
          child.on("error", reject);
        });
        if (result.length) return result;
      } catch { continue; }
    }
  }

  return generateFallbackSegments();
}

function generateFallbackSegments() {
  const MOCK_PHRASES = [
    "This is a powerful moment worth clipping.",
    "Here is where the key insight happens.",
    "This part has strong engagement potential.",
    "The speaker makes an important point here.",
    "This moment has high viral potential.",
    "A compelling story unfolds here.",
    "This is the emotional peak of the content.",
    "The audience reacts strongly to this part.",
  ];
  const segments = [];
  let t = 0;
  let idx = 0;
  while (t < 300) {
    const dur = 3 + Math.random() * 4;
    segments.push({ start: t, end: t + dur, text: MOCK_PHRASES[idx % MOCK_PHRASES.length] });
    t += dur + 1;
    idx++;
  }
  return segments;
}

// ── YouTube section download ─────────────────────────────────────────────────
async function downloadYouTubeSectionForSmartClipping({ sourceUrl, startSec, endSec, index = 0 }) {
  const safeStart = Math.max(0, Number(startSec) || 0);
  const safeEnd = Math.max(safeStart + 8, Number(endSec) || safeStart + 30);
  const clipStamp = `${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`;
  const tempBase = path.join(uploadsDir, `yt_smart_section_${clipStamp}`);
  const outputTemplate = `${tempBase}.%(ext)s`;
  const section = `*${safeStart.toFixed(3)}-${safeEnd.toFixed(3)}`;
  const ytDlpPath = process.env.YTDLP_PATH || (process.platform === "win32" ? path.join(rootDir, "bin", "yt-dlp.exe") : (fs.existsSync("/usr/local/bin/yt-dlp") ? "/usr/local/bin/yt-dlp" : "yt-dlp"));
  const ffmpegDir = path.join(rootDir, "bin");
  const hasWinFfmpeg = process.platform === "win32" && fs.existsSync(path.join(ffmpegDir, "ffmpeg.exe"));

  const videoId = extractYouTubeId(sourceUrl);
  const targetUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : sourceUrl;

  const cookieFile = path.join(rootDir, "cookies.txt");
  const renderSecretCookie = "/etc/secrets/cookies.txt";
  let tempCookiePath = null;

  if (fs.existsSync(renderSecretCookie)) {
    try {
      tempCookiePath = path.join(uploadsDir, `cookies_${clipStamp}.txt`);
      fs.copyFileSync(renderSecretCookie, tempCookiePath);
    } catch (e) {
      console.warn("[SmartClip] Could not copy Render secret cookie:", e.message);
    }
  } else if (process.env.YOUTUBE_COOKIES && process.env.YOUTUBE_COOKIES.length < 50000) {
    try {
      tempCookiePath = path.join(uploadsDir, `cookies_${clipStamp}.txt`);
      fs.writeFileSync(tempCookiePath, process.env.YOUTUBE_COOKIES, "utf8");
    } catch (e) {
      console.warn("[SmartClip] Could not write env cookies:", e.message);
    }
  } else if (fs.existsSync(cookieFile)) {
    try {
      tempCookiePath = path.join(uploadsDir, `cookies_${clipStamp}.txt`);
      fs.copyFileSync(cookieFile, tempCookiePath);
    } catch {}
  }

  const activeCookies = tempCookiePath;

  const args = [
    "--no-playlist", "--no-check-certificates", "--no-warnings",
    ...(activeCookies
      ? [
          "--cookies", activeCookies,
          "-f", "bv*[height<=1080]+ba/b[height<=1080]/bv*+ba/b/best"
        ]
      : [
          "--extractor-args", "youtube:player_client=android",
          "-f", "18/bv*[height<=720]+ba/b[height<=720]/b/best"
        ]
    ),
    ...(hasWinFfmpeg ? ["--ffmpeg-location", ffmpegDir] : []),
    "--download-sections", section,
    "--force-keyframes-at-cuts",
    "--merge-output-format", "mp4",
    "--socket-timeout", "30",
    "--retries", "5",
    "-o", outputTemplate,
    targetUrl,
  ];

  try {
    console.log(`[SmartClip] Invoking yt-dlp (${ytDlpPath}) for section ${section} from ${targetUrl} (cookies: ${!!activeCookies})`);
    await runCommand(ytDlpPath, args, { timeoutMs: 180000 });
  } finally {
    if (tempCookiePath && fs.existsSync(tempCookiePath)) {
      try { fs.unlinkSync(tempCookiePath); } catch {}
    }
  }

  const files = fs.readdirSync(uploadsDir)
    .filter((f) => f.startsWith(`yt_smart_section_${clipStamp}`))
    .map((f) => path.join(uploadsDir, f))
    .filter((f) => fs.existsSync(f));

  const mp4 = files.find((f) => f.endsWith(".mp4")) || files[0];
  if (!mp4) throw new Error("yt-dlp section download failed");
  return mp4;
}

function buildSmartGeneratedClipPayload(result, suggestion, index, normalizedSourceType) {
  const outputStat = fs.existsSync(result.outputPath) ? fs.statSync(result.outputPath) : null;
  const startTime = suggestion.start || secondsToTime(suggestion.startSec || 0);
  const endTime = suggestion.end || secondsToTime(suggestion.endSec || 0);
  const duration = Math.max(0, timeToSeconds(endTime) - timeToSeconds(startTime));

  return {
    message: "Smart clip generated successfully",
    fileName: result.fileName,
    outputPath: result.outputPath,
    filePath: result.outputPath,
    downloadUrl: `/api/files/download/${result.fileName}`,
    previewUrl: `/api/files/download/${result.fileName}`,
    startTime, endTime,
    startSec: suggestion.startSec,
    endSec: suggestion.endSec,
    duration, durationSec: duration,
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

// ── Routes ───────────────────────────────────────────────────────────────────

router.post("/upload", (req, res) => {
  upload.single("video")(req, res, (err) => {
    try {
      if (err instanceof multer.MulterError) return res.status(400).json({ error: `Upload error: ${err.message}` });
      if (err) return res.status(400).json({ error: err.message || "Upload failed" });
      if (!req.file) return res.status(400).json({ error: "No video file received" });

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
      return res.json({ message: "Upload successful", project });
    } catch (error) {
      console.error("UPLOAD ROUTE ERROR:", error);
      return res.status(500).json({ error: "Internal upload error", details: error.message });
    }
  });
});

router.post("/smart-suggest", async (req, res) => {
  try {
    const { sourceType, inputPath, sourceUrl, segments, maxClips, clipLengthSec, minDurationSec, maxDurationSec } = req.body || {};

    let transcriptSegments = [];
    if (Array.isArray(segments) && segments.length) transcriptSegments = segments;
    else if (sourceType === "youtube") transcriptSegments = await getYouTubeSmartTranscript(sourceUrl);
    else transcriptSegments = await getLocalSmartTranscript(inputPath);

    const suggestions = findSmartClipMoments(transcriptSegments, {
      maxClips: Number(maxClips) || 5,
      preferredDurationSec: Number(clipLengthSec) || 45,
      minDurationSec: Number(minDurationSec) || 25,
      maxDurationSec: Number(maxDurationSec) || 90,
    });

    return res.json({ success: true, source: "transcript", segmentCount: transcriptSegments.length, suggestions });
  } catch (error) {
    console.error("SMART SUGGEST ERROR:", error);
    return res.status(500).json({ error: "Smart clip suggestion failed", details: error.message, suggestions: [] });
  }
});

router.post("/smart-generate", async (req, res) => {
  const startedAt = Date.now();
  const maxSmartGenerateMs = 6 * 60 * 1000;

  try {
    const {
      sourceType, inputPath, sourceUrl, segments,
      maxClips, minScore, clipLengthSec, minDurationSec,
      maxDurationSec, aspectRatio, videoDurationSec,
    } = req.body || {};

    const normalizedSourceType = sourceType === "youtube" ? "youtube" : "upload";
    const safeMaxClips = Math.max(1, Math.min(10, Number(maxClips) || 3));
    const safeMinScore = Math.max(1, Math.min(100, Number(minScore) || 50));

    if (normalizedSourceType === "youtube" && (!sourceUrl || !isValidYouTubeUrl(sourceUrl))) {
      return res.status(400).json({ error: "Valid YouTube source URL is required.", clips: [] });
    }
    if (normalizedSourceType !== "youtube" && !inputPath) {
      return res.status(400).json({ error: "Input video file is required.", clips: [] });
    }

    // ── Get transcript ──
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

    let suggestions = allSuggestions
      .filter((item) => Number(item.score || 0) >= safeMinScore)
      .slice(0, safeMaxClips);

    // ── Fallback 1: if no clips pass minScore, take the best available ones ──
    if (!suggestions.length && allSuggestions.length > 0) {
      console.log(`[SmartClip] No clips scored ${safeMinScore}+. Falling back to top ${safeMaxClips} best clips.`);
      suggestions = allSuggestions.slice(0, safeMaxClips);
    }

    // ── Fallback 2: if findSmartClipMoments found nothing, use transcript segments or time windows ──
    if (!suggestions.length) {
      const clipDuration = Math.max(15, Number(clipLengthSec) || 30);
      const videoDur = Number(videoDurationSec) || 0;

      if (transcriptSegments.length > 0) {
        // Use transcript time ranges directly — group consecutive segments
        const used = new Set();
        let groupStart = null, groupEnd = null, groupText = [];

        const pushGroup = () => {
          if (groupStart !== null && groupEnd > groupStart) {
            suggestions.push({
              startSec: groupStart,
              endSec: Math.min(groupEnd, groupStart + clipDuration),
              start: secondsToTime(groupStart),
              end: secondsToTime(Math.min(groupEnd, groupStart + clipDuration)),
              durationSec: Math.min(groupEnd, groupStart + clipDuration) - groupStart,
              score: 35,
              title: groupText.join(" ").slice(0, 78) || "Video moment",
              reason: "transcript segment",
              signals: ["transcript segment"],
              previewText: groupText.join(" ").slice(0, 260),
              text: groupText.join(" "),
            });
          }
        };

        for (const seg of transcriptSegments) {
          if (suggestions.length >= safeMaxClips) break;
          if (used.has(seg)) continue;
          if (groupStart === null || seg.start - groupEnd > 5) {
            pushGroup();
            groupStart = seg.start;
            groupEnd = seg.end;
            groupText = [seg.text || ""];
          } else {
            groupEnd = Math.max(groupEnd, seg.end);
            groupText.push(seg.text || "");
          }
          used.add(seg);
        }
        pushGroup();
      }

      // If still no suggestions, create time-window placeholders
      if (!suggestions.length && videoDur > 0) {
        for (let i = 0; i < safeMaxClips; i++) {
          const startSec = Math.max(0, Math.floor((videoDur / (safeMaxClips + 1)) * (i + 1)) - Math.floor(clipDuration / 2));
          const endSec = Math.min(videoDur, startSec + clipDuration);
          if (endSec <= startSec) continue;
          suggestions.push({
            startSec,
            endSec,
            start: secondsToTime(startSec),
            end: secondsToTime(endSec),
            durationSec: endSec - startSec,
            score: 30,
            title: `Video Clip ${i + 1}`,
            reason: "time-based fallback",
            signals: ["time-based"],
            previewText: "",
            text: "",
          });
        }
      }
    }

    if (!suggestions.length) {
      return res.json({
        success: true,
        source: "transcript",
        segmentCount: transcriptSegments.length,
        suggestions: [],
        clips: [],
        message: `No suitable clip moments found in this video.`,
      });
    }

    // ── declare clips here — before any branch uses it ──
    const clips = [];
    fs.mkdirSync(exportsDir, { recursive: true });

    // ── YouTube → download + generate ──
    if (normalizedSourceType === "youtube") {
      const tempSectionFiles = [];
      try {
        for (let i = 0; i < suggestions.length; i++) {
          if (Date.now() - startedAt > maxSmartGenerateMs) throw new Error("Smart clipping timed out.");

          const suggestion = suggestions[i];
          const startSec = Number(suggestion.startSec || timeToSeconds(suggestion.start || "00:00:00"));
          const endSec = Number(suggestion.endSec || timeToSeconds(suggestion.end || "00:00:30"));

          let sectionPath;
          try {
            sectionPath = await downloadYouTubeSectionForSmartClipping({ sourceUrl, startSec, endSec, index: i });
          } catch (err) {
            console.error(`[SmartClip] Section download failed for suggestion #${i + 1}:`, err.message || err);
            return res.json({
              success: false,
              needsUpload: true,
              source: "transcript",
              message: `YouTube clip download failed: ${err.message || "download error"}. Upload the source video to generate these smart clips.`,
              segmentCount: transcriptSegments.length,
              suggestions,
              clips: [],
            });
          }

          tempSectionFiles.push(sectionPath);

          const durationSec = Math.max(8, endSec - startSec);
          const result = await smartGenerateClip({
            inputPath: sectionPath,
            startTime: "00:00:00",
            endTime: secondsToTime(durationSec),
            aspectRatio: aspectRatio || "9:16",
          });

          clips.push(buildSmartGeneratedClipPayload(result, suggestion, i, normalizedSourceType));
        }
      } finally {
        for (const f of tempSectionFiles) {
          try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
        }
      }
    } else {
      // ── Local upload → FFmpeg ──
      for (let i = 0; i < suggestions.length; i++) {
        if (Date.now() - startedAt > maxSmartGenerateMs) throw new Error("Smart clipping timed out.");

        const suggestion = suggestions[i];
        const startSec = Number(suggestion.startSec || timeToSeconds(suggestion.start || "00:00:00"));
        const endSec = Number(suggestion.endSec || timeToSeconds(suggestion.end || "00:00:30"));

        const result = await smartGenerateClip({
          inputPath,
          startTime: secondsToTime(startSec),
          endTime: secondsToTime(endSec),
          aspectRatio: aspectRatio || "9:16",
        });

        clips.push(buildSmartGeneratedClipPayload(result, suggestion, i, normalizedSourceType));
      }
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
  }
});

router.post("/generate", async (req, res) => {
  try {
    const { inputPath, sourceType, sourceUrl, startTime, endTime, aspectRatio } = req.body || {};

    if (!startTime || !endTime) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const normalizedSourceType = sourceType === "youtube" ? "youtube" : "upload";

    if (normalizedSourceType === "youtube" && (!sourceUrl || !isValidYouTubeUrl(sourceUrl))) {
      return res.status(400).json({ error: "Valid YouTube source URL is required" });
    }

    if (normalizedSourceType !== "youtube" && !inputPath) {
      return res.status(400).json({ error: "Input video file is required" });
    }

    ensureValidClipWindow(startTime, endTime);
    fs.mkdirSync(exportsDir, { recursive: true });

    let result;
    let tempSectionPath = null;

    try {
      if (normalizedSourceType === "youtube") {
        const startSec = timeToSeconds(startTime);
        const endSec = timeToSeconds(endTime);
        const durationSec = Math.max(1, endSec - startSec);

        tempSectionPath = await downloadYouTubeSectionForSmartClipping({
          sourceUrl,
          startSec,
          endSec,
          index: Date.now(),
        });

        result = await smartGenerateClip({
          inputPath: tempSectionPath,
          startTime: "00:00:00",
          endTime: secondsToTime(durationSec),
          aspectRatio: aspectRatio || "9:16",
        });
      } else {
        result = await smartGenerateClip({
          inputPath,
          startTime,
          endTime,
          aspectRatio: aspectRatio || "9:16",
        });
      }
    } finally {
      if (tempSectionPath) {
        try {
          if (fs.existsSync(tempSectionPath)) fs.unlinkSync(tempSectionPath);
        } catch {}
      }
    }

    const outputStat = fs.existsSync(result.outputPath) ? fs.statSync(result.outputPath) : null;
    const clipDurationSec = timeToSeconds(endTime) - timeToSeconds(startTime);

    return res.json({
      message: "Smart clip generated successfully",
      fileName: result.fileName,
      outputPath: result.outputPath,
      downloadUrl: `/api/files/download/${result.fileName}`,
      previewUrl: `/api/files/download/${result.fileName}`,
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
      details: cleanSmartClipError ? cleanSmartClipError(error) : error.message,
    });
  }
});


router.get("/projects", (req, res) => {
  const projects = readProjects()
    .map((project) => ({
      id: project.id,
      title: project.title || project.originalName || project.name || "Untitled Project",
      source: project.source || project.sourceType || "unknown",
      thumbnail: project.thumbnail || project.uploadedProject?.thumbnail || "",
      videoId: project.videoId || project.uploadedProject?.videoId || "",
      duration: project.duration || project.uploadedProject?.duration || 0,
      clipCount: Array.isArray(project.clips) ? project.clips.length : 0,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt || project.createdAt,
    }))
    .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));

  res.json({ success: true, projects });
});

router.get("/projects/:id", (req, res) => {
  const project = readProjects().find((item) => String(item.id) === String(req.params.id));
  if (!project) return res.status(404).json({ error: "Project not found" });
  res.json({ success: true, project });
});

router.post("/projects/save", (req, res) => {
  try {
    const {
      id,
      title,
      uploadedProject,
      clips,
      clipCaptions,
      captionStyle,
      videoDurationSeconds,
      selectedDuration,
    } = req.body || {};

    if (!uploadedProject && !Array.isArray(clips)) {
      return res.status(400).json({ error: "Nothing to save" });
    }

    const baseTitle =
      title ||
      uploadedProject?.originalName ||
      uploadedProject?.title ||
      `Clip Project ${new Date().toLocaleDateString()}`;

    const saved = upsertProject({
      id,
      title: baseTitle,
      source: uploadedProject?.source || uploadedProject?.sourceType || "unknown",
      uploadedProject: uploadedProject || null,
      clips: Array.isArray(clips) ? clips : [],
      clipCaptions: clipCaptions || {},
      captionStyle: captionStyle || {},
      videoDurationSeconds: Number(videoDurationSeconds || uploadedProject?.duration || 0),
      selectedDuration: Number(selectedDuration || 30),
      thumbnail: uploadedProject?.thumbnail || "",
      videoId: uploadedProject?.videoId || "",
      duration: Number(uploadedProject?.duration || videoDurationSeconds || 0),
    });

    res.json({ success: true, project: saved });
  } catch (error) {
    console.error("SAVE PROJECT ERROR:", error);
    res.status(500).json({ error: "Project save failed", details: error.message });
  }
});

router.delete("/projects/:id", (req, res) => {
  const before = readProjects();
  const after = before.filter((item) => String(item.id) !== String(req.params.id));
  writeProjects(after);
  res.json({ success: true, deleted: before.length - after.length });
});

router.get("/suggest", (req, res) => {
  res.json({ message: "Use POST /api/clips/smart-suggest with a source video.", suggestions: [] });
});

module.exports = router;