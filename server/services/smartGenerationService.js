const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { spawn } = require("child_process");
const {
  rootDir,
  uploadsDir,
  exportsDir,
  getJobWorkspace,
} = require("../utils/paths");
const { smartGenerateClip } = require("./smartClipService");
const { getPythonCandidates } = require("../utils/pythonRuntime");
const { findSmartClipMoments } = require("./smartClipRanker");
const {
  isValidYouTubeUrl,
  extractYouTubeId,
  cleanupFile,
} = require("./youtubeDownloader");

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

function cleanSmartClipError(error) {
  const raw = String(error?.message || error || "");
  if (raw.includes("RAPIDAPI_KEY is not configured")) {
    return "RAPIDAPI_KEY is not configured on the server. Please add your key in Render environment settings.";
  }
  if (raw.includes("RapidAPI file preparation timed out") || raw.includes("Timed out waiting for RapidAPI")) {
    return "RapidAPI CDN video preparation timed out. Try another video or upload directly.";
  }
  if (raw.includes("HTTP 403") || raw.includes("Forbidden")) {
    return "RapidAPI authentication failed. Please verify your RAPIDAPI_KEY.";
  }
  if (raw.includes("transcript")) return raw;
  return raw || "Smart clipping failed. Try uploading the source video directly.";
}

function vttTimeToSeconds(value = "") {
  const clean = String(value || "").replace(",", ".").trim();
  const parts = clean.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return Number(clean) || 0;
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

async function getFallbackSegmentsFromVideoMeta(videoId, apiKey) {
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

async function getYouTubeSmartTranscript(sourceUrl) {
  if (!sourceUrl || !isValidYouTubeUrl(sourceUrl)) throw new Error("Valid YouTube source URL is required");
  const videoId = extractYouTubeId(sourceUrl);
  if (!videoId) throw new Error("Could not extract YouTube video ID");
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error("YOUTUBE_API_KEY not set");

  try {
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

async function getLocalSmartTranscript(inputPath) {
  const videoPath = resolveSmartInputVideo(inputPath);
  if (!videoPath) throw new Error("Input video file not found for smart clipping");

  const pythonCandidates = getPythonCandidates();
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

const RAPIDAPI_FAST_HOST = "youtube-video-fast-downloader-24-7.p.rapidapi.com";

const YOUTUBE_SOURCE_DOWNLOAD_TIMEOUT_MS = Number(
  process.env.YOUTUBE_SOURCE_DOWNLOAD_TIMEOUT_MS || 600000
);

async function downloadVideoViaRapidApi(
  sourceUrl,
  destinationDir = uploadsDir,
  onProgress = () => {}
) {
  const videoId = extractYouTubeId(sourceUrl);
  if (!videoId) throw new Error("Invalid YouTube URL: unable to extract Video ID");

  const rapidApiKey = (process.env.RAPIDAPI_KEY || "").trim();
  const targetPath = path.join(destinationDir, `yt_rapidapi_${videoId}_${Date.now()}.mp4`);

  // If RapidAPI key is not configured, seamlessly hand off to youtubeDownloader's multi-tier engine
  if (!rapidApiKey) {
    console.log("[SmartGenerationService] RAPIDAPI_KEY not configured. Handing off to local downloader engine...");
    onProgress(48, "Using direct video downloader...");
    const { downloadYouTubeSource } = require("./youtubeDownloader");
    return await downloadYouTubeSource({ sourceUrl, targetPath });
  }

  const host = RAPIDAPI_FAST_HOST;
  const cleanId = videoId.trim();
  const apiUrl = `https://youtube-video-fast-downloader-24-7.p.rapidapi.com/download_video/${cleanId}?quality=720`;

  console.log(`[RapidAPI][FAST] Requesting download payload from verified contract: ${apiUrl}`);
  onProgress(46, "Resolving video download stream from RapidAPI...");

  let response;
  try {
    response = await axios.get(apiUrl, {
      headers: {
        "x-rapidapi-host": host,
        "x-rapidapi-key": rapidApiKey,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      timeout: 35000,
    });
  } catch (err) {
    const status = err.response?.status;
    const msg = err.response?.data?.message || err.response?.data?.error || err.message;
    console.warn(`[RapidAPI][FAST] Request failed (HTTP ${status || "ERR"}): ${msg}. Trying fallback downloader...`);
    const { downloadYouTubeSource } = require("./youtubeDownloader");
    return await downloadYouTubeSource({ sourceUrl, targetPath });
  }

  const data = response.data;
  const cdnUrl = data.file || data.link || data.download_url || data.downloadUrl || data.url || data.video?.file || data.video?.url;
  if (!cdnUrl) {
    console.warn("[RapidAPI][FAST] No CDN URL in payload. Falling back to alternative downloader...");
    const { downloadYouTubeSource } = require("./youtubeDownloader");
    return await downloadYouTubeSource({ sourceUrl, targetPath });
  }

  const cdnFileUrl = cdnUrl;
  console.log(`[RapidAPI][FAST] Extracted direct CDN file URL: ${cdnFileUrl.slice(0, 80)}...`);

  const maxAttempts = 30;
  const pollIntervalMs = 6000;
  let fileReady = false;
  fs.mkdirSync(destinationDir, { recursive: true });

  console.log(`[RapidAPI-Poll] Starting safe polling for CDN file: ${cdnFileUrl.slice(0, 80)}...`);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      onProgress(48, `Waiting for video CDN stream (attempt ${attempt}/${maxAttempts})...`);
      const probe = await axios({
        method: "GET",
        url: cdnFileUrl,
        responseType: "stream",
        timeout: 15000,
        maxRedirects: 5,
        validateStatus: (status) => status === 200 || status === 404,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      if (probe.status === 200) {
        console.log(`[RapidAPI-Poll] ✅ CDN file ready on attempt ${attempt} (HTTP 200)`);
        console.log(`[RapidAPI-Stream] Streaming completed CDN file to disk: ${targetPath}`);

        const totalBytes = Number(probe.headers["content-length"]) || 0;
        let downloadedBytes = 0;
        let lastProgressUpdate = 0;

        const writer = fs.createWriteStream(targetPath);
        await new Promise((resolve, reject) => {
          probe.data.on("data", (chunk) => {
            downloadedBytes += chunk.length;
            const now = Date.now();
            if (now - lastProgressUpdate > 1800) {
              lastProgressUpdate = now;
              if (totalBytes > 0) {
                const ratio = Math.min(1, downloadedBytes / totalBytes);
                const mappedPercent = Math.min(64, Math.round(48 + ratio * 16));
                const dlMb = (downloadedBytes / 1048576).toFixed(1);
                const totMb = (totalBytes / 1048576).toFixed(1);
                onProgress(mappedPercent, `Downloading source video — ${dlMb} MB / ${totMb} MB (${Math.round(ratio * 100)}%)`);
              } else {
                const dlMb = (downloadedBytes / 1048576).toFixed(1);
                onProgress(54, `Downloading source video — ${dlMb} MB downloaded`);
              }
            }
          });

          probe.data.pipe(writer);
          writer.on("finish", () => {
            writer.close(() => {
              if (!fs.existsSync(targetPath)) return reject(new Error("File stream failed to write to disk."));
              const stat = fs.statSync(targetPath);
              if (stat.size < 5000) {
                cleanupFile(targetPath);
                return reject(new Error(`Downloaded file is too small or incomplete (${stat.size} bytes).`));
              }
              console.log(`[RapidAPI-Stream] ✅ Saved ${(stat.size / 1024 / 1024).toFixed(2)} MB to ${targetPath}`);
              onProgress(64, `Source video ready (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
              resolve();
            });
          });
          writer.on("error", (err) => {
            cleanupFile(targetPath);
            reject(err);
          });
          probe.data.on("error", (err) => {
            cleanupFile(targetPath);
            reject(err);
          });
        });

        fileReady = true;
        break;
      }

      if (probe.status === 404) {
        try { probe.data.destroy(); } catch {}
        console.log("File still preparing, retrying in 6s...");
      } else {
        try { probe.data.destroy(); } catch {}
        console.log(`[RapidAPI-Poll] Received HTTP ${probe.status}, retrying in 6s...`);
      }
    } catch (err) {
      console.log("File still preparing, retrying in 6s...");
    }

    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  }

  if (!fileReady) {
    console.warn("[RapidAPI-Poll] RapidAPI file preparation timed out. Trying fallback downloader...");
    const { downloadYouTubeSource } = require("./youtubeDownloader");
    return await downloadYouTubeSource({ sourceUrl, targetPath });
  }

  return targetPath;
}

function buildSmartGeneratedClipPayload(result, suggestion, index, normalizedSourceType, options = {}) {
  const outputStat = fs.existsSync(result.outputPath) ? fs.statSync(result.outputPath) : null;
  const startTime = suggestion.start || secondsToTime(suggestion.startSec || 0);
  const endTime = suggestion.end || secondsToTime(suggestion.endSec || 0);
  const duration = Math.max(0, timeToSeconds(endTime) - timeToSeconds(startTime));

  const persistentUrl = options.storageUrl || null;
  const localDownloadUrl = `/api/files/download/${result.fileName}`;
  const accessibleUrl = persistentUrl || localDownloadUrl;

  return {
    message: "Smart clip generated successfully",
    fileName: result.fileName,
    outputPath: result.outputPath,
    filePath: result.outputPath,
    storageUrl: persistentUrl,
    downloadUrl: accessibleUrl,
    previewUrl: accessibleUrl,
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

/**
 * Main smart generation orchestrator.
 * Fully decoupled from Express request lifecycle.
 * Executes in isolated workspace and reports stage and progress updates.
 */
async function runSmartGeneration({
  generationJobId,
  payload,
  onProgress = () => {},
  isCancelled = () => false,
}) {
  const workspace = getJobWorkspace(generationJobId);
  // Idempotent retry cleanup: clean job-scoped clips and temp directory
  try {
    if (fs.existsSync(workspace.clipsDir)) {
      fs.rmSync(workspace.clipsDir, { recursive: true, force: true });
    }
    fs.mkdirSync(workspace.clipsDir, { recursive: true });
    if (fs.existsSync(workspace.tempDir)) {
      fs.rmSync(workspace.tempDir, { recursive: true, force: true });
    }
    fs.mkdirSync(workspace.tempDir, { recursive: true });
  } catch {}

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
  } = payload || {};

  const normalizedSourceType = sourceType === "youtube" ? "youtube" : "upload";
  const safeMaxClips = Math.max(1, Math.min(10, Number(maxClips) || 3));
  const safeMinScore = Math.max(1, Math.min(100, Number(minScore) || 50));

  if (normalizedSourceType === "youtube" && (!sourceUrl || !isValidYouTubeUrl(sourceUrl))) {
    throw new Error("Valid YouTube source URL is required.");
  }
  if (normalizedSourceType !== "youtube" && !inputPath) {
    throw new Error("Input video file is required.");
  }

  if (await isCancelled()) throw new Error("Job cancelled by user");

  // Step 1: Transcript extraction
  onProgress(10, "Extracting transcript...");
  let transcriptSegments = [];
  if (Array.isArray(segments) && segments.length) {
    transcriptSegments = segments;
  } else if (normalizedSourceType === "youtube") {
    transcriptSegments = await getYouTubeSmartTranscript(sourceUrl);
  } else {
    transcriptSegments = await getLocalSmartTranscript(inputPath);
  }

  if (await isCancelled()) throw new Error("Job cancelled by user");

  // Step 2: Viral moment selection & ranking
  onProgress(30, "Analyzing content & finding viral moments...");
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

  // Fallback 1: if no clips pass minScore, take best available
  if (!suggestions.length && allSuggestions.length > 0) {
    console.log(`[SmartClip][Job ${generationJobId}] No clips scored ${safeMinScore}+. Falling back to top ${safeMaxClips} best clips.`);
    suggestions = allSuggestions.slice(0, safeMaxClips);
  }

  // Fallback 2: transcript grouping or time windows
  if (!suggestions.length) {
    const clipDuration = Math.max(15, Number(clipLengthSec) || 30);
    const videoDur = Number(videoDurationSec) || 0;

    if (transcriptSegments.length > 0) {
      const used = new Set();
      let groupStart = null;
      let groupEnd = null;
      let groupText = [];

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
    return {
      success: true,
      source: "transcript",
      segmentCount: transcriptSegments.length,
      suggestions: [],
      clips: [],
      message: "No suitable clip moments found in this video.",
    };
  }

  onProgress(45, "Moments selected");

  if (await isCancelled()) throw new Error("Job cancelled by user");

  const clips = [];
  fs.mkdirSync(exportsDir, { recursive: true });

  // Step 3: Source Acquisition (if YouTube)
  if (normalizedSourceType === "youtube") {
    let sourceVideoPath = null;
    try {
      if (await isCancelled()) throw new Error("Job cancelled by user");
      onProgress(45, "Starting YouTube source download...");
      sourceVideoPath = await downloadVideoViaRapidApi(sourceUrl, workspace.sourceDir, onProgress);

      for (let i = 0; i < suggestions.length; i++) {
        if (await isCancelled()) throw new Error("Job cancelled by user");

        const progressPercent = Math.round(65 + (i / suggestions.length) * 30);
        onProgress(progressPercent, `Generating clip ${i + 1} of ${suggestions.length}...`);

        const suggestion = suggestions[i];
        const startSec = Number(suggestion.startSec || timeToSeconds(suggestion.start || "00:00:00"));
        const endSec = Number(suggestion.endSec || timeToSeconds(suggestion.end || "00:00:30"));

        const result = await smartGenerateClip({
          inputPath: sourceVideoPath,
          startTime: secondsToTime(startSec),
          endTime: secondsToTime(endSec),
          aspectRatio: aspectRatio || "9:16",
          outputDir: workspace.clipsDir,
          jobId: generationJobId,
        });

        // Ensure clip is also present in exportsDir for global downloads/views
        const targetExportPath = path.join(exportsDir, result.fileName);
        if (fs.existsSync(result.outputPath) && result.outputPath !== targetExportPath) {
          try {
            fs.copyFileSync(result.outputPath, targetExportPath);
          } catch (copyErr) {
            console.warn(`[SmartGenerationService] Failed copying clip to exportsDir:`, copyErr.message);
          }
        }

        // Production storage persistence (Render cross-container support)
        let storageUrl = null;
        if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
          try {
            onProgress(progressPercent, `Saving clip ${i + 1} to cloud storage...`);
            const { uploadVideoToCloudinary } = require("./storage/cloudinaryStorageService");
            const cloudRes = await uploadVideoToCloudinary(result.outputPath, {
              folder: `clipflow/jobs/${generationJobId}/clips`,
              publicId: `clip-${i}`,
              timeoutMs: 15000,
            });
            storageUrl = cloudRes.secureUrl;
            console.log(`[SmartGenerationService][Job ${generationJobId}] Uploaded clip ${i + 1} to Cloudinary: ${storageUrl}`);
          } catch (cloudErr) {
            console.warn(`[SmartGenerationService][Job ${generationJobId}] Cloudinary clip upload warning:`, cloudErr.message);
          }
        }

        clips.push(buildSmartGeneratedClipPayload(result, suggestion, i, normalizedSourceType, { storageUrl }));
      }

      if (!clips.length) {
        throw new Error("No clips could be produced from the source video.");
      }
    } catch (err) {
      if (err.message === "Job cancelled by user") throw err;

      console.error(`[SmartGenerationService][Job ${generationJobId}] YouTube clip generation failed:`, err.message || err);
      const cleanMsg = cleanSmartClipError(err);
      return {
        success: false,
        needsUpload: true,
        error: "YouTube clip generation failed",
        details: cleanMsg,
        message: cleanMsg,
        suggestions,
        clips: [],
      };
    } finally {
      if (sourceVideoPath) {
        cleanupFile(sourceVideoPath);
      }
    }
  } else {
    // Step 4: Local Upload Rendering
    let effectiveInputPath = resolveSmartInputVideo(inputPath);
    let downloadedRemoteSource = null;

    try {
      // If local path is missing on this worker instance, check if remote storageUrl was passed
      if (!effectiveInputPath && (sourceUrl || (inputPath && inputPath.startsWith("http")))) {
        const remoteSourceUrl = sourceUrl || inputPath;
        console.log(`[SmartGenerationService][Job ${generationJobId}] Uploaded file not found locally. Streaming from remote URL: ${remoteSourceUrl.slice(0, 80)}...`);
        onProgress(48, "Downloading source video from storage...");
        downloadedRemoteSource = path.join(workspace.sourceDir, `source_${Date.now()}.mp4`);
        const { streamRemoteVideoToFile } = require("./youtubeDownloader");
        await streamRemoteVideoToFile(remoteSourceUrl, downloadedRemoteSource);
        effectiveInputPath = downloadedRemoteSource;
      }

      if (!effectiveInputPath) {
        throw new Error("Input video file could not be found or retrieved for processing.");
      }

      for (let i = 0; i < suggestions.length; i++) {
        if (await isCancelled()) throw new Error("Job cancelled by user");

        const progressPercent = Math.round(55 + (i / suggestions.length) * 40);
        onProgress(progressPercent, `Generating clip ${i + 1} of ${suggestions.length}...`);

        const suggestion = suggestions[i];
        const startSec = Number(suggestion.startSec || timeToSeconds(suggestion.start || "00:00:00"));
        const endSec = Number(suggestion.endSec || timeToSeconds(suggestion.end || "00:00:30"));

        const result = await smartGenerateClip({
          inputPath: effectiveInputPath,
          startTime: secondsToTime(startSec),
          endTime: secondsToTime(endSec),
          aspectRatio: aspectRatio || "9:16",
          outputDir: workspace.clipsDir,
          jobId: generationJobId,
        });

        // Ensure clip is also present in exportsDir for global downloads/views
        const targetExportPath = path.join(exportsDir, result.fileName);
        if (fs.existsSync(result.outputPath) && result.outputPath !== targetExportPath) {
          try {
            fs.copyFileSync(result.outputPath, targetExportPath);
          } catch (copyErr) {
            console.warn(`[SmartGenerationService] Failed copying clip to exportsDir:`, copyErr.message);
          }
        }

        // Production storage persistence (Render cross-container support)
        let storageUrl = null;
        if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
          try {
            onProgress(progressPercent, `Saving clip ${i + 1} to cloud storage...`);
            const { uploadVideoToCloudinary } = require("./storage/cloudinaryStorageService");
            const cloudRes = await uploadVideoToCloudinary(result.outputPath, {
              folder: `clipflow/jobs/${generationJobId}/clips`,
              publicId: `clip-${i}`,
              timeoutMs: 15000,
            });
            storageUrl = cloudRes.secureUrl;
            console.log(`[SmartGenerationService][Job ${generationJobId}] Uploaded clip ${i + 1} to Cloudinary: ${storageUrl}`);
          } catch (cloudErr) {
            console.warn(`[SmartGenerationService][Job ${generationJobId}] Cloudinary clip upload warning:`, cloudErr.message);
          }
        }

        clips.push(buildSmartGeneratedClipPayload(result, suggestion, i, normalizedSourceType, { storageUrl }));
      }
    } finally {
      if (downloadedRemoteSource) {
        cleanupFile(downloadedRemoteSource);
      }
    }
  }

  if (await isCancelled()) throw new Error("Job cancelled by user");

  onProgress(98, "Finalizing generated clips...");

  return {
    success: true,
    source: "transcript",
    segmentCount: transcriptSegments.length,
    minScore: safeMinScore,
    suggestions,
    clips,
  };
}

module.exports = {
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
  runSmartGeneration,
};
