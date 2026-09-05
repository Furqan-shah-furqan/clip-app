const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { spawn } = require("child_process");
const {
  rootDir,
  captionsDir,
  exportsDir,
  uploadsDir
} = require("../utils/paths");
const { burnSubtitles } = require("../services/ffmpegService");

const router = express.Router();

const TRANSCRIBE_SCRIPT = path.join(rootDir, "python", "transcribe_whisper.py");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function safeBaseName(input = "") {
  return path.basename(String(input || "").replace(/^[/\\]+/, ""));
}

function resolveInputVideo(inputPath = "") {
  if (!inputPath) return null;
  const raw = String(inputPath).trim();
  const cleanBase = safeBaseName(raw);

  const absoluteCandidates = [raw, path.resolve(process.cwd(), raw)];
  for (const fullPath of absoluteCandidates) {
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) return fullPath;
  }

  const namedCandidates = [
    path.join(exportsDir, cleanBase),
    path.join(uploadsDir, cleanBase),
    path.join(captionsDir, cleanBase),
  ];
  for (const fullPath of namedCandidates) {
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) return fullPath;
  }

  return null;
}

function getFileStamp(filePath) {
  const stat = fs.statSync(filePath);
  const base = path.basename(filePath);
  return crypto
    .createHash("md5")
    .update(`${base}|${stat.size}`)
    .digest("hex")
    .slice(0, 12);
}

function findExistingCaptionArtifacts(videoPath) {
  const parsed = path.parse(path.basename(videoPath));
  const baseName = parsed.name;
  if (!fs.existsSync(captionsDir)) return null;
  const files = fs.readdirSync(captionsDir);
  const jsonMatch = files.find((f) => f.startsWith(baseName) && f.endsWith(".json"));
  if (jsonMatch) {
    const jsonPath = path.join(captionsDir, jsonMatch);
    const segs = readExistingSegments(jsonPath);
    if (segs && segs.length) {
      const vttMatch = files.find((f) => f.startsWith(baseName) && f.endsWith(".vtt"));
      return {
        vttPath: vttMatch ? path.join(captionsDir, vttMatch) : null,
        jsonPath,
        segments: segs,
      };
    }
  }
  return null;
}

function getArtifactPaths(videoPath) {
  const parsed = path.parse(path.basename(videoPath));
  const stamp = getFileStamp(videoPath);
  return {
    wavPath: path.join(captionsDir, `${parsed.name}-${stamp}.wav`),
    vttPath: path.join(captionsDir, `${parsed.name}-${stamp}.vtt`),
    jsonPath: path.join(captionsDir, `${parsed.name}-${stamp}.json`),
  };
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { windowsHide: true, ...options });
    let stdout = "", stderr = "";
    proc.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    proc.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error((stderr || stdout || `${command} failed`).trim()));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function extractAudioToWav(videoPath, wavPath) {
  ensureDir(path.dirname(wavPath));
  const ffmpegCmd = process.env.FFMPEG_PATH || "ffmpeg";
  await runCommand(ffmpegCmd, [
    "-y", "-i", videoPath,
    "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le",
    wavPath,
  ]);
}

async function runPythonTranscription(wavPath) {
  const python311 = "C:\\Users\\xpert computers\\AppData\\Local\\Programs\\Python\\Python311\\python.exe";
  const defaultVenvPython = path.resolve(rootDir, ".venv", "Scripts", "python.exe");
  const pythonCandidates = [
    process.env.PYTHON_PATH,
    fs.existsSync(python311) ? python311 : null,
    fs.existsSync(defaultVenvPython) ? defaultVenvPython : null,
    "python",
    "py",
  ].filter(Boolean);
  let lastError = null;
  for (const candidate of pythonCandidates) {
    try {
      const { stdout } = await runCommand(candidate, [TRANSCRIBE_SCRIPT, wavPath]);
      const parsed = JSON.parse(stdout || "{}");
      return Array.isArray(parsed.segments) ? parsed.segments : [];
    } catch (error) { lastError = error; }
  }
  throw lastError || new Error("No working Python runtime found");
}

function writeJsonSegments(jsonPath, segments) {
  fs.writeFileSync(jsonPath, JSON.stringify({ segments }, null, 2), "utf8");
}

function secondsToVttTime(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${secs.toFixed(3).padStart(6, "0")}`;
}

function writeVttFile(vttPath, segments = []) {
  const lines = ["WEBVTT", ""];
  segments.forEach((segment) => {
    lines.push(`${secondsToVttTime(segment.start)} --> ${secondsToVttTime(segment.end)}`);
    lines.push(String(segment.text || "").trim());
    lines.push("");
  });
  fs.writeFileSync(vttPath, lines.join("\n"), "utf8");
}

function readExistingSegments(jsonPath) {
  if (!fs.existsSync(jsonPath)) return [];
  try {
    const raw = fs.readFileSync(jsonPath, "utf8");
    const parsed = JSON.parse(raw || "{}");
    return Array.isArray(parsed.segments) ? parsed.segments : [];
  } catch { return []; }
}

async function ensureCaptionFiles(videoPath) {
  ensureDir(captionsDir);

  const existing = findExistingCaptionArtifacts(videoPath);
  if (existing) {
    return existing;
  }

  const { wavPath, vttPath, jsonPath } = getArtifactPaths(videoPath);

  if (fs.existsSync(vttPath) && fs.existsSync(jsonPath)) {
    return { vttPath, jsonPath, segments: readExistingSegments(jsonPath) };
  }

  await extractAudioToWav(videoPath, wavPath);
  const segments = await runPythonTranscription(wavPath);
  if (!segments.length) throw new Error("No caption segments were produced");

  writeJsonSegments(jsonPath, segments);
  writeVttFile(vttPath, segments);
  try { if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath); } catch {}

  return { vttPath, jsonPath, segments };
}

function splitSegmentsIntoPseudoWords(segments = []) {
  const words = [];
  segments.forEach((segment) => {
    if (Array.isArray(segment.words) && segment.words.length) {
      segment.words.forEach((w) => {
        const text = String(w.word || "").trim();
        if (text) {
          words.push({
            word: text,
            start: Number(w.start) || Number(segment.start) || 0,
            end: Number(w.end) || Number(segment.end) || 0,
          });
        }
      });
      return;
    }
    const text = String(segment.text || "").trim();
    if (!text) return;
    const parts = text.split(/\s+/).filter(Boolean);
    if (!parts.length) return;
    const segStart = Number(segment.start) || 0;
    const segEnd = Number(segment.end) || segStart + 0.6;
    const segDuration = Math.max(0.3, segEnd - segStart);
    const slice = segDuration / parts.length;
    parts.forEach((word, index) => {
      const start = segStart + slice * index;
      const end = index === parts.length - 1 ? segEnd : segStart + slice * (index + 1);
      words.push({ word, start: Math.round(start * 1000) / 1000, end: Math.round(end * 1000) / 1000 });
    });
  });
  return words;
}

function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function streamPseudoRealtime(ws, segments = []) {
  const words = splitSegmentsIntoPseudoWords(segments);
  if (!words.length) { ws.send(JSON.stringify({ done: true })); return; }

  let streamStartedAt = Date.now();
  let firstWordStart = words[0].start || 0;

  for (const item of words) {
    if (ws.readyState !== 1) return;
    const dueIn = (item.start - firstWordStart) * 1000 - (Date.now() - streamStartedAt);
    if (dueIn > 0) await wait(dueIn);
    if (ws.readyState !== 1) return;
    ws.send(JSON.stringify({ word: { word: item.word, start: item.start, end: item.end } }));
  }

  for (const segment of segments) {
    if (ws.readyState !== 1) return;
    ws.send(JSON.stringify({ segment: { start: Number(segment.start) || 0, end: Number(segment.end) || 0, text: String(segment.text || "") } }));
  }

  if (ws.readyState === 1) ws.send(JSON.stringify({ done: true }));
}

// ── Routes ───────────────────────────────────────────────────────────────────

router.get("/", (req, res) => res.json({ ok: true, route: "captions" }));

router.post("/preview", async (req, res) => {
  try {
    const { inputPath } = req.body || {};
    if (!inputPath) return res.status(400).json({ error: "inputPath is required" });

    const resolvedVideoPath = resolveInputVideo(inputPath);
    if (!resolvedVideoPath) {
      return res.status(404).json({ error: "Input video file not found", trackUrl: null, segments: [] });
    }

    const result = await ensureCaptionFiles(resolvedVideoPath);
    return res.json({
      success: true,
      trackUrl: `/captions/${path.basename(result.vttPath)}`,
      segments: result.segments,
      message: "Real captions generated successfully",
    });
  } catch (error) {
    console.error("CAPTION PREVIEW ERROR:", error);
    return res.status(500).json({ error: "Failed to generate preview captions", details: error.message, trackUrl: null, segments: [] });
  }
});

router.post("/burn", async (req, res) => {
  try {
    const { clip, videoUrl, segments, style } = req.body || {};

    if (!segments || !segments.length) {
      return res.status(400).json({ error: "No caption segments provided" });
    }

    const rawPath =
      clip?.filePath ||
      clip?.outputPath ||
      clip?.localPath ||
      clip?.downloadUrl ||
      videoUrl ||
      "";

    const resolvedPath = resolveInputVideo(rawPath);

    if (!resolvedPath) {
      return res.status(404).json({
        error: "Video file not found for burning captions",
        details: `Could not resolve: ${rawPath}`,
      });
    }
    console.log("BURN STYLE fontSize:", style?.fontSize, "animStyle:", style?.animationStyle || style?.sourceAnimationStyle);
    console.log("BURN START:", resolvedPath, "segments:", segments.length);
    ensureDir(exportsDir);

    const result = await burnSubtitles({
      inputPath: resolvedPath,
      segments,
      style: style || {},
    });

    const downloadUrl = `/api/files/download/${result.fileName}`;
    const directUrl = `/exports/${result.fileName}`;

    console.log("BURN DONE:", result.fileName);

    return res.json({
      success: true,
      fileName: result.fileName,
      outputPath: result.outputPath,
      downloadUrl,
      directUrl,
      renderer: "ass-burn",
    });
  } catch (error) {
    console.error("CAPTION BURN ERROR:", error);
    return res.status(500).json({ error: "Caption burn failed", details: error.message });
  }
});

function registerCaptionStream(wss) {
  wss.on("connection", (ws, request) => {
    ws.on("message", async (message) => {
      try {
        const payload = JSON.parse(String(message || "{}"));
        if (payload.type !== "start") return;

        const requestedPath = payload.inputPath || payload.filePath || payload.localPath || payload.url || "";
        const resolvedVideoPath = resolveInputVideo(requestedPath);

        if (!resolvedVideoPath) {
          ws.send(JSON.stringify({ error: "Input video file not found for realtime captions" }));
          return;
        }

        const result = await ensureCaptionFiles(resolvedVideoPath);
        await streamPseudoRealtime(ws, result.segments || []);
      } catch (error) {
        console.error("CAPTION STREAM ERROR:", error);
        if (ws.readyState === 1) ws.send(JSON.stringify({ error: error.message || "Realtime caption stream failed" }));
      }
    });
  });
}

module.exports = { router, registerCaptionStream };