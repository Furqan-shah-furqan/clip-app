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
const { getPythonCandidates } = require("../utils/pythonRuntime");

const { createCaptionJobQueue } = require("../services/captionJobService");
const { allowedCaptionSource, restoreCaptionSource } = require("../services/captionSourceService");
const { isRemotionAvailable, renderWithRemotion } = require("../services/remotionService");
const { FONT_REGISTRY, resolveFont } = require("../services/fontRegistry");
const router = express.Router();

const TRANSCRIBE_SCRIPT = path.join(rootDir, "python", "transcribe_whisper.py");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function safeBaseName(input = "") {
  let raw = String(input || "");
  try { raw = new URL(raw, "http://local").pathname; } catch {}
  try { raw = decodeURIComponent(raw); } catch {}
  return path.basename(raw.replace(/\\/g, "/"));
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
  return crypto
    .createHash("md5")
    .update(`v2|${path.resolve(filePath)}|${stat.size}|${stat.mtimeMs}|${process.env.WHISPER_MODEL || "base"}`)
    .digest("hex")
    .slice(0, 12);
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
    const isBatch = process.platform === "win32" && /\.(cmd|bat)$/i.test(command);
    const proc = spawn(command, args, { windowsHide: true, shell: isBatch, ...options });
    let stdout = "", stderr = "";
    proc.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    proc.stderr.on("data", (chunk) => { stderr = (stderr + chunk.toString()).slice(-16000); });
    const timeoutMs = Number(process.env.CAPTION_PROCESS_TIMEOUT_MS) || 600000;
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; proc.kill("SIGKILL"); }, timeoutMs);
    proc.on("error", error => { clearTimeout(timer); reject(error); });
    proc.on("close", (code, signal) => {
      clearTimeout(timer);
      if (timedOut) return reject(new Error("Caption processing timed out. Try a shorter clip or a smaller WHISPER_MODEL."));
      if (signal) return reject(new Error(`Caption process stopped (${signal}). Check server memory and restart logs.`));
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
  const localFfmpeg = path.join(rootDir, "bin", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
  const ffmpegCmd = process.env.FFMPEG_PATH || (fs.existsSync(localFfmpeg) ? localFfmpeg : "ffmpeg");
  await runCommand(ffmpegCmd, [
    "-y", "-i", videoPath,
    "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le",
    wavPath,
  ]);
}

async function runPythonTranscription(wavPath) {
  const pythonCandidates = getPythonCandidates();
  let lastError = null;
  for (const candidate of pythonCandidates) {
    try {
      const { stdout } = await runCommand(candidate, [TRANSCRIBE_SCRIPT, wavPath]);
      const parsed = JSON.parse(stdout || "{}");
      if (Array.isArray(parsed.segments)) {
        return parsed.segments;
      }
    } catch (error) {
      lastError = error;
      // Do not launch the same expensive job again after timeout, OOM or model errors.
      if (error.code !== "ENOENT" && !/not installed|No module named/.test(error.message)) throw error;
    }
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

  const { wavPath, vttPath, jsonPath } = getArtifactPaths(videoPath);

  if (fs.existsSync(vttPath) && fs.existsSync(jsonPath)) {
    const segments = readExistingSegments(jsonPath);
    if (segments.length) return { vttPath, jsonPath, segments };
  }

  try {
    await extractAudioToWav(videoPath, wavPath);
    const segments = await runPythonTranscription(wavPath);
    if (!segments.length) throw new Error("No speech detected in this clip.");
    writeJsonSegments(jsonPath, segments);
    writeVttFile(vttPath, segments);
    return { vttPath, jsonPath, segments };
  } finally {
    try { fs.unlinkSync(wavPath); } catch {}
  }
}

const captionJobs = createCaptionJobQueue({
  run: async input => ensureCaptionFiles(input.videoPath || await restoreCaptionSource(input.remoteUrl)),
  getKey: input => input.videoPath ? getFileStamp(input.videoPath) : `remote|${input.remoteUrl}|${process.env.WHISPER_MODEL || "base"}`,
});
function jobResponse(job) {
  return {
    jobId: job.id, status: job.status,
    ...(job.status === "failed" ? { error: job.error } : {}),
    ...(job.status === "completed" ? {
      success: true, source: "whisper",
      trackUrl: `/captions/${path.basename(job.result.vttPath)}`,
      segments: job.result.segments,
    } : {}),
  };
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
    const body = req.body || {};
    const candidates = [body.inputPath, ...(Array.isArray(body.inputPaths) ? body.inputPaths : []), body.url, body.previewUrl, body.downloadUrl];
    if (!candidates.some(v => typeof v === "string" && v.trim())) {
      return res.status(400).json({ error: "inputPath is required" });
    }
    const resolvedVideoPath = candidates.filter(v => typeof v === "string").map(resolveInputVideo).find(Boolean);
    const remoteUrl = candidates.map(allowedCaptionSource).find(Boolean);
    if (!resolvedVideoPath && !remoteUrl) {
      return res.status(404).json({ error: "Clip file is no longer on this server. Re-upload or regenerate the clip, then sync captions again." });
    }
    const job = captionJobs.start({ videoPath: resolvedVideoPath, remoteUrl });
    if (body.async !== true) await job.promise; // Compatibility with older clients.
    res.set("Cache-Control", "no-store");
    return res.status(job.status === "failed" ? 500 : job.status === "completed" ? 200 : 202).json(jobResponse(job));
  } catch (error) {
    console.error("CAPTION PREVIEW ERROR:", error);
    return res.status(error.statusCode || 500).json({ error: error.message || "Failed to generate captions" });
  }
});

router.get("/jobs/:id", (req, res) => {
  res.set("Cache-Control", "no-store");
  const job = captionJobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "Caption job expired or server restarted. Click Sync Audio to retry." });
  return res.json(jobResponse(job));
});

router.post(["/transcribe", "/api/transcribe"], async (req, res) => {
  try {
    const body = req.body || {};
    const candidates = [
      body.videoPath,
      body.inputPath,
      body.filePath,
      body.localPath,
      body.url,
      body.videoUrl,
      body.previewUrl,
      body.downloadUrl,
      body.clip?.outputPath,
      body.clip?.filePath,
      body.clip?.localPath,
      body.clip?.downloadUrl,
      body.clip?.previewUrl,
      body.clip?.storageUrl,
      ...(Array.isArray(body.inputPaths) ? body.inputPaths : []),
    ];

    let resolvedVideoPath = candidates
      .filter((v) => typeof v === "string" && v.trim())
      .map(resolveInputVideo)
      .find(Boolean);

    // If not found directly by path, check clipIndex or id
    const idOrIndex =
      body.clipIndex ??
      body.index ??
      body.id ??
      body.clip?.id ??
      body.clip?.index;

    if (!resolvedVideoPath && idOrIndex !== undefined && idOrIndex !== null) {
      const isNum = /^\d+$/.test(String(idOrIndex));
      const idx = isNum ? parseInt(idOrIndex, 10) : null;
      try {
        const { readProjects } = require("./clips");
        const projects = typeof readProjects === "function" ? readProjects() : [];
        for (const p of projects) {
          if (Array.isArray(p.clips)) {
            if (idx !== null && p.clips[idx]) {
              const c = p.clips[idx];
              resolvedVideoPath = resolveInputVideo(
                c.outputPath || c.filePath || c.localPath || c.downloadUrl
              );
              if (resolvedVideoPath) break;
            }
            const found = p.clips.find(
              (c) =>
                c && (String(c.id) === String(idOrIndex) || c.fileName === idOrIndex)
            );
            if (found) {
              resolvedVideoPath = resolveInputVideo(
                found.outputPath || found.filePath || found.localPath || found.downloadUrl
              );
              if (resolvedVideoPath) break;
            }
          }
        }
      } catch (projErr) {
        console.warn("[Captions] Error reading projects for transcribe:", projErr.message);
      }

      if (!resolvedVideoPath && fs.existsSync(exportsDir)) {
        const files = fs
          .readdirSync(exportsDir)
          .filter((f) => f.endsWith(".mp4"))
          .sort((a, b) => {
            try {
              return (
                fs.statSync(path.join(exportsDir, b)).mtimeMs -
                fs.statSync(path.join(exportsDir, a)).mtimeMs
              );
            } catch {
              return 0;
            }
          });

        if (idx !== null && files[idx]) {
          resolvedVideoPath = path.join(exportsDir, files[idx]);
        } else if (typeof idOrIndex === "string" && idOrIndex.trim()) {
          const matched = files.find(
            (f) => f === idOrIndex || f.startsWith(idOrIndex)
          );
          if (matched) resolvedVideoPath = path.join(exportsDir, matched);
        }
      }
    }

    const remoteUrl = candidates.map(allowedCaptionSource).find(Boolean);
    if (!resolvedVideoPath && !remoteUrl) {
      return res.status(404).json({
        error: "Clip video file not found on server for transcription. Ensure video is exported or uploaded.",
      });
    }

    const targetVideo = resolvedVideoPath || (await restoreCaptionSource(remoteUrl));
    console.log(`[Captions] Running Whisper transcription on: ${targetVideo}`);
    const result = await ensureCaptionFiles(targetVideo);

    const clipStartSec = Math.max(
      0,
      Number(
        body.clipStartTime ||
          body.startSec ||
          body.clip?.startSec ||
          body.clip?.startTime ||
          0
      )
    );
    const rawSegments = result.segments || [];

    // Calibrate all segments so timestamps start at 0.00s relative to the clip
    const calibratedSegments = rawSegments.map((seg, segIdx) => {
      const segStart = Math.max(0, Number((seg.start - clipStartSec).toFixed(3)));
      const segEnd = Math.max(segStart + 0.1, Number((seg.end - clipStartSec).toFixed(3)));
      let words = undefined;
      if (Array.isArray(seg.words) && seg.words.length) {
        words = seg.words.map((w) => ({
          word: String(w.word || "").trim(),
          start: Math.max(0, Number((w.start - clipStartSec).toFixed(3))),
          end: Math.max(0.05, Number((w.end - clipStartSec).toFixed(3))),
        }));
      }
      return {
        id: seg.id || `seg-${segIdx + 1}`,
        start: segStart,
        end: segEnd,
        text: String(seg.text || "").trim(),
        ...(words ? { words } : {}),
      };
    });

    const flattenedWords = [];
    calibratedSegments.forEach((seg) => {
      if (Array.isArray(seg.words) && seg.words.length) {
        seg.words.forEach((w) => {
          if (w.word) flattenedWords.push({ word: w.word, start: w.start, end: w.end });
        });
      } else if (seg.text) {
        const parts = seg.text.split(/\s+/).filter(Boolean);
        const dur = (seg.end - seg.start) / Math.max(parts.length, 1);
        parts.forEach((p, i) =>
          flattenedWords.push({
            word: p,
            start: Number((seg.start + i * dur).toFixed(3)),
            end: Number((seg.start + (i + 1) * dur).toFixed(3)),
          })
        );
      }
    });

    res.set("Cache-Control", "no-store");
    return res.json({
      success: true,
      source: "whisper",
      trackUrl: `/captions/${path.basename(result.vttPath)}`,
      segments: calibratedSegments,
      words: flattenedWords,
    });
  } catch (error) {
    console.error("[Captions] Transcription endpoint error:", error);
    return res
      .status(500)
      .json({ error: error.message || "Whisper transcription failed" });
  }
});

async function resolveBurnVideo(clip = {}, videoUrl = "") {
  const candidates = [
    clip?.outputPath, clip?.filePath, clip?.localPath,
    videoUrl, clip?.storageUrl, clip?.previewUrl, clip?.downloadUrl,
  ].filter(value => typeof value === "string" && value.trim());
  for (const candidate of candidates) {
    const localPath = resolveInputVideo(candidate);
    if (localPath) return localPath;
  }
  const remoteUrl = candidates.map(allowedCaptionSource).find(Boolean);
  return remoteUrl ? restoreCaptionSource(remoteUrl) : null;
}

router.post("/burn", async (req, res) => {
  try {
    const { clip, videoUrl, segments, style } = req.body || {};

    if (!segments || !segments.length) {
      return res.status(400).json({ error: "No caption segments provided" });
    }

    const resolvedPath = await resolveBurnVideo(clip, videoUrl);

    if (!resolvedPath) {
      return res.status(404).json({
        error: "Video file not found for burning captions",
        details: "The clip is missing locally and no video URL from the configured Cloudinary account is available.",
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

/**
 * High-End Studio Render Endpoint: /api/captions/render-clip (also mounted at /api/render-clip)
 * Programmatically renders viral animated captions with Moonshot yellow highlight pills & spring physics.
 * Uses Remotion when dependencies are available, or seamlessly falls back to high-speed FFmpeg ASS.
 */
router.post("/render-clip", async (req, res) => {
  try {
    const { videoUrl, captionData, segments: rawSegments, style = {}, engine = "auto" } = req.body || {};
    const segments = (captionData?.segments || rawSegments || []);

    if (!segments || !segments.length) {
      return res.status(400).json({ error: "No caption segments provided for rendering" });
    }

    const resolvedPath = await resolveBurnVideo(null, videoUrl);
    const effectiveVideoUrl = resolvedPath || videoUrl;

    if (!effectiveVideoUrl) {
      return res.status(404).json({ error: "Input videoUrl could not be resolved" });
    }

    // Check if Remotion engine should and can be used
    const remotionReady = isRemotionAvailable();
    const useRemotion = (engine === "remotion" || engine === "auto") && remotionReady;

    if (useRemotion) {
      console.log("EXECUTING REMOTION RENDER PIPELINE...");
      const renderResult = await renderWithRemotion({
        videoUrl: effectiveVideoUrl,
        segments,
        style,
      });

      const downloadUrl = `/api/files/download/${renderResult.fileName}`;
      const directUrl = `/exports/${renderResult.fileName}`;

      return res.json({
        success: true,
        engine: "remotion",
        fileName: renderResult.fileName,
        outputPath: renderResult.outputPath,
        downloadUrl,
        directUrl,
        fps: renderResult.fps,
        durationInFrames: renderResult.durationInFrames,
      });
    }

    // High-performance fallback: FFmpeg ASS karaoke with dynamic font registry mapping
    console.log("REMOTION NOT ACTIVE — EXECUTING NATIVE FFMPEG ASS ENGINE PIPELINE...");
    const font = resolveFont(style.fontFamily);
    const enhancedStyle = {
      ...style,
      fontFamily: font.cssFamily,
      highlightBg: style.highlightBg || "#FFE600",
      highlightColor: style.highlightColor || "#000000",
    };

    const result = await burnSubtitles({
      inputPath: resolvedPath || effectiveVideoUrl,
      segments,
      style: enhancedStyle,
    });

    const downloadUrl = `/api/files/download/${result.fileName}`;
    const directUrl = `/exports/${result.fileName}`;

    return res.json({
      success: true,
      engine: "ffmpeg-ass",
      fileName: result.fileName,
      outputPath: result.outputPath,
      downloadUrl,
      directUrl,
      note: remotionReady ? undefined : "Executed via high-speed native FFmpeg ASS engine. Install @remotion packages to enable headless React render.",
    });
  } catch (error) {
    console.error("RENDER-CLIP ERROR:", error);
    return res.status(500).json({ error: "Failed to render clip with captions", details: error.message });
  }
});

/**
 * Font registry inspection endpoint
 */
router.get("/fonts", (req, res) => {
  return res.json({
    success: true,
    fonts: FONT_REGISTRY,
  });
});

function registerCaptionStream(wss) {
  wss.on("connection", (ws, request) => {
    ws.on("message", async (message) => {
      try {
        const payload = JSON.parse(String(message || "{}"));
        if (payload.type !== "start") return;

        const requestedPath = payload.inputPath || payload.filePath || payload.localPath || payload.url || "";
        const resolvedVideoPath = resolveInputVideo(requestedPath);

        const remoteUrl = [requestedPath, payload.url].map(allowedCaptionSource).find(Boolean);
        if (!resolvedVideoPath && !remoteUrl) {
          ws.send(JSON.stringify({ error: "Input video file not found for realtime captions" }));
          return;
        }

        const job = captionJobs.start({ videoPath: resolvedVideoPath, remoteUrl });
        await job.promise;
        if (job.status === "failed") throw new Error(job.error);
        await streamPseudoRealtime(ws, job.result.segments || []);
      } catch (error) {
        console.error("CAPTION STREAM ERROR:", error);
        if (ws.readyState === 1) ws.send(JSON.stringify({ error: error.message || "Realtime caption stream failed" }));
      }
    });
  });
}

module.exports = { router, registerCaptionStream };