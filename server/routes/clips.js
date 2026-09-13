const express = require("express");
const axios = require("axios");
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
const prisma = require("../lib/prisma");
const { addGenerationJob } = require("../queue/generationQueue");
const { smartGenerateClip } = require("../services/smartClipService");
const { getPythonCandidates } = require("../utils/pythonRuntime");
const { findSmartClipMoments } = require("../services/smartClipRanker");
const {
  isValidYouTubeUrl,
  extractYouTubeId,
  cleanupFile,
} = require("../services/youtubeDownloader");
const {
  timeToSeconds,
  secondsToTime,
  ensureValidClipWindow,
  cleanSmartClipError,
  vttTimeToSeconds,
  parseTranscriptVtt,
  getFallbackSegmentsFromVideoMeta,
  getYouTubeSmartTranscript,
  resolveSmartInputVideo,
  generateFallbackSegments,
  getLocalSmartTranscript,
  downloadVideoViaRapidApi,
  buildSmartGeneratedClipPayload,
} = require("../services/smartGenerationService");

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

const THIRTY_ONE_DAYS_MS = 31 * 24 * 60 * 60 * 1000;

function readProjects() {
  try {
    if (!fs.existsSync(projectsFile)) return [];
    const raw = fs.readFileSync(projectsFile, "utf8");
    const data = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(data)) return [];

    const now = Date.now();
    const fresh = data.filter((project) => {
      const dateVal = project.updatedAt || project.createdAt;
      if (!dateVal) return true;
      const ts = new Date(dateVal).getTime();
      if (!ts || isNaN(ts)) return true;
      return (now - ts) <= THIRTY_ONE_DAYS_MS;
    });

    if (fresh.length !== data.length) {
      writeProjects(fresh);
    }
    return fresh;
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

router.get("/diag", async (req, res) => {
  const videoId = req.query.id || "1_t6l6ObfRc";
  const rapidApiKey = (process.env.RAPIDAPI_KEY || "").trim();
  const rawRapidApiHost = (process.env.RAPIDAPI_HOST || "youtube-video-fast-downloader-24-7.p.rapidapi.com").trim();
  const rapidApiHost = rawRapidApiHost
    .replace(/^(?:x-)?rapidapi-host:\s*/i, "")
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .trim() || "youtube-video-fast-downloader-24-7.p.rapidapi.com";

  const results = {
    rapidApiKeyConfigured: !!rapidApiKey,
    rapidApiKeyLength: rapidApiKey.length,
    rapidApiKeyPrefix: rapidApiKey ? rapidApiKey.slice(0, 5) + "..." : null,
    rawRapidApiHost,
    sanitizedRapidApiHost: rapidApiHost,
    testVideoId: videoId,
    fastDownloaderTest: null,
    ytstreamTest: null,
  };

  if (!rapidApiKey) {
    results.fastDownloaderTest = { error: "RAPIDAPI_KEY environment variable is not configured." };
    return res.json(results);
  }

  // Test 1: Probe candidate endpoints on rapidApiHost
  const probePaths = [
    "/",
    `/video/${videoId}`,
    `/download/${videoId}`,
    `/download_video/${videoId}`,
    `/dl?id=${videoId}`,
    `/api/video/${videoId}`,
    `/info/${videoId}`,
  ];

  results.hostProbe = {};
  for (const p of probePaths) {
    try {
      const probeRes = await axios.get(`https://${rapidApiHost}${p}`, {
        headers: {
          "x-rapidapi-host": rapidApiHost,
          "x-rapidapi-key": rapidApiKey,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        timeout: 8000,
      });
      results.hostProbe[p] = {
        status: probeRes.status,
        data: probeRes.data,
      };
    } catch (pErr) {
      results.hostProbe[p] = {
        status: pErr.response?.status || "ERR",
        message: pErr.response?.data?.message || pErr.response?.data || pErr.message,
      };
    }
  }

  // Test 2: FAST Downloader quality endpoint
  try {
    const qUrl = `https://${rapidApiHost}/get_available_quality/${videoId}`;
    const qRes = await axios.get(qUrl, {
      headers: {
        "x-rapidapi-host": rapidApiHost,
        "x-rapidapi-key": rapidApiKey,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      timeout: 10000,
    });
    results.fastDownloaderTest = {
      status: qRes.status,
      qualityCount: Array.isArray(qRes.data) ? qRes.data.length : 0,
      data: qRes.data,
    };
  } catch (err) {
    results.fastDownloaderTest = {
      error: err.message,
      status: err.response?.status,
      data: err.response?.data,
    };
  }

  // Test 3: ytstream endpoint
  try {
    const ytUrl = `https://ytstream-download-youtube-videos.p.rapidapi.com/dl?id=${videoId}`;
    const ytRes = await axios.get(ytUrl, {
      headers: {
        "x-rapidapi-host": "ytstream-download-youtube-videos.p.rapidapi.com",
        "x-rapidapi-key": rapidApiKey,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      timeout: 10000,
    });
    results.ytstreamTest = {
      status: ytRes.status,
      formatCount: ytRes.data?.formats?.length || 0,
    };
  } catch (err) {
    results.ytstreamTest = {
      error: err.message,
      status: err.response?.status,
      data: err.response?.data,
    };
  }

  // Test 4: RapidAPI FAST Downloader test
  if (req.query.testDownload === "1") {
    try {
      const t0 = Date.now();
      const downloadedPath = await downloadVideoViaRapidApi(`https://www.youtube.com/watch?v=${videoId}`);
      results.downloadTest = {
        success: true,
        provider: "RapidAPI FAST Downloader",
        timeSec: ((Date.now() - t0) / 1000).toFixed(1),
        path: downloadedPath,
        size: fs.existsSync(downloadedPath) ? fs.statSync(downloadedPath).size : 0,
      };
      cleanupFile(downloadedPath);
    } catch (err) {
      results.downloadTest = {
        success: false,
        provider: "RapidAPI FAST Downloader",
        error: err.message,
      };
    }
  }

  return res.json(results);
});

router.post("/smart-generate", async (req, res) => {
  try {
    const {
      sourceType, inputPath, sourceUrl, segments,
      maxClips, minScore, clipLengthSec, minDurationSec,
      maxDurationSec, aspectRatio, videoDurationSec,
    } = req.body || {};

    const normalizedSourceType = sourceType === "youtube" ? "youtube" : "upload";

    if (normalizedSourceType === "youtube" && (!sourceUrl || !isValidYouTubeUrl(sourceUrl))) {
      return res.status(400).json({ error: "Valid YouTube source URL is required." });
    }
    if (normalizedSourceType !== "youtube" && !inputPath) {
      return res.status(400).json({ error: "Input video file is required." });
    }

    // 1. Create persistent GenerationJob record in PostgreSQL/Prisma
    const job = await prisma.generationJob.create({
      data: {
        sourceType: normalizedSourceType,
        sourceUrl: normalizedSourceType === "youtube" ? sourceUrl : null,
        inputPath: normalizedSourceType !== "youtube" ? inputPath : null,
        status: "QUEUED",
        progress: 0,
        stage: "Queued for processing",
        requestJson: {
          sourceType: normalizedSourceType,
          inputPath: normalizedSourceType !== "youtube" ? inputPath : null,
          sourceUrl: normalizedSourceType === "youtube" ? sourceUrl : null,
          segments: Array.isArray(segments) ? segments : null,
          maxClips: Number(maxClips) || 3,
          minScore: Number(minScore) || 50,
          clipLengthSec: Number(clipLengthSec) || 45,
          minDurationSec: Number(minDurationSec) || 25,
          maxDurationSec: Number(maxDurationSec) || 90,
          aspectRatio: aspectRatio || "9:16",
          videoDurationSec: Number(videoDurationSec) || 0,
        },
      },
    });

    // 2. Enqueue job into BullMQ
    await addGenerationJob(job.id);

    console.log(`[SmartGenerate] Enqueued background generation job: ${job.id} (${normalizedSourceType})`);

    // 3. Return immediately with 202 Accepted (Browser/HTTP request does NOT own the job lifecycle)
    return res.status(202).json({
      success: true,
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      stage: job.stage,
    });
  } catch (error) {
    console.error("[POST /smart-generate] Failed to queue generation job:", error);
    return res.status(500).json({
      error: "Failed to queue smart clip generation",
      details: error.message,
    });
  }
});

router.get("/generation-jobs/:jobId", async (req, res) => {
  try {
    const { jobId } = req.params;
    if (!jobId || typeof jobId !== "string") {
      return res.status(400).json({ error: "Valid job ID is required" });
    }

    const job = await prisma.generationJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      return res.status(404).json({ error: "Generation job not found" });
    }

    const resultClips = job.resultJson?.clips || [];
    const suggestions = job.suggestionsJson || [];
    const isAwaitingUpload = job.status === "AWAITING_UPLOAD";

    return res.json({
      success: true,
      job: {
        id: job.id,
        status: job.status,
        progress: job.progress,
        stage: job.stage || "",
        message: job.stage || "",
        needsUpload: isAwaitingUpload,
        suggestions,
        clips: resultClips,
        error: job.errorMessage || null,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
      },
    });
  } catch (error) {
    console.error("[GET /generation-jobs/:jobId] Error fetching job:", error);
    return res.status(500).json({ error: "Failed to fetch job status" });
  }
});

router.post("/generation-jobs/:jobId/cancel", async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await prisma.generationJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      return res.status(404).json({ error: "Generation job not found" });
    }

    if (["COMPLETED", "FAILED", "CANCELLED"].includes(job.status)) {
      return res.json({
        success: true,
        message: `Job is already ${job.status.toLowerCase()}`,
        status: job.status,
      });
    }

    await prisma.generationJob.update({
      where: { id: jobId },
      data: {
        cancelRequestedAt: new Date(),
        status: "CANCELLED",
        stage: "Cancellation requested by user",
      },
    });

    return res.json({
      success: true,
      message: "Cancellation requested successfully",
      status: "CANCELLED",
    });
  } catch (error) {
    console.error("[POST /generation-jobs/:jobId/cancel] Error cancelling job:", error);
    return res.status(500).json({ error: "Failed to cancel generation job" });
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
        tempSectionPath = await downloadVideoViaRapidApi(sourceUrl);

        result = await smartGenerateClip({
          inputPath: tempSectionPath,
          startTime,
          endTime,
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
      cleanupFile(tempSectionPath);
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

router.get("/cookies-status", (req, res) => {
  const activePath = resolveActiveCookieFile();
  const configured = Boolean(activePath);
  return res.json({
    configured,
    source: activePath
      ? activePath.startsWith("/etc/secrets")
        ? "render-secret"
        : activePath.includes("env_cookies")
        ? "env"
        : "file"
      : "none",
    filename: activePath ? path.basename(activePath) : null,
  });
});

router.post("/upload-cookies", express.json({ limit: "10mb" }), (req, res) => {
  try {
    const { cookiesText } = req.body || {};
    if (!cookiesText || typeof cookiesText !== "string" || cookiesText.trim().length < 20) {
      return res.status(400).json({ error: "No valid cookies data provided." });
    }

    const content = cookiesText.trim();
    if (
      !content.includes("youtube.com") &&
      !content.includes(".google.com") &&
      !content.includes("# Netscape")
    ) {
      return res.status(400).json({
        error: "File does not appear to contain Netscape YouTube/Google cookies.",
      });
    }

    const targetPath = path.join(rootDir, "cookies.txt");
    fs.writeFileSync(targetPath, content, "utf8");

    try {
      fs.writeFileSync(path.join(uploadsDir, "cookies.txt"), content, "utf8");
    } catch {}

    resetCookieQuarantine();

    return res.json({
      success: true,
      message: "YouTube cookies saved and activated successfully!",
      path: targetPath,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to save cookies" });
  }
});

router.get("/suggest", (req, res) => {
  res.json({ message: "Use POST /api/clips/smart-suggest with a source video.", suggestions: [] });
});

module.exports = router;