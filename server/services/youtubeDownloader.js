/**
 * YouTube Downloader Service — ClipFlow Studio
 * 
 * Fully isolated module for RapidAPI-powered YouTube video downloading.
 * Uses "YouTube Video FAST Downloader 24/7" (or configured RAPIDAPI_HOST)
 * to resolve direct MP4 file streams, polls for async readiness,
 * and streams directly to local disk for FFmpeg clipping.
 */

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { uploadsDir } = require("../utils/paths");

// ── Utility: URL & Video ID Parsing ──────────────────────────────────────────

/**
 * Validates whether a string is a valid YouTube URL or video ID.
 */
function isValidYouTubeUrl(url) {
  if (!url || typeof url !== "string") return false;
  return /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/|live\/))([a-zA-Z0-9_-]{11})|^[a-zA-Z0-9_-]{11}$/.test(url.trim());
}

/**
 * Extracts strictly the 11-character YouTube video ID, stripping all query parameters (e.g. &list=, &t=).
 */
function extractYouTubeId(url) {
  if (!url || typeof url !== "string") return "";
  const clean = url.trim();

  // Strict 11-character regex matching standard watch URLs, shorts, embed, and youtu.be
  const regex = /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/|live\/))([a-zA-Z0-9_-]{11})/;
  const match = clean.match(regex);
  if (match && match[1]) {
    return match[1];
  }

  // If the input was already a clean 11-char ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(clean)) {
    return clean;
  }

  // Fallback URL search params parsing
  try {
    const parsed = new URL(clean);
    const v = parsed.searchParams.get("v");
    if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
  } catch {}

  return "";
}

// ── Utility: File Cleanup ───────────────────────────────────────────────────

function cleanupFile(filePath) {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`[YouTube-Downloader] Cleaned up temporary file: ${path.basename(filePath)}`);
    }
  } catch (err) {
    console.warn(`[YouTube-Downloader] Failed to unlink ${filePath}:`, err.message);
  }
}

// ── Polling & Streaming ─────────────────────────────────────────────────────

/**
 * Polls an async file URL until HTTP 200 or 206 (max 5 minutes).
 */
async function pollForReadyFileUrl(fileUrl, { intervalMs = 4000, maxWaitMs = 300000 } = {}) {
  const startTime = Date.now();
  let attempt = 0;

  console.log(`[RapidAPI-Poll] Polling file readiness: ${fileUrl.slice(0, 80)}...`);

  while (Date.now() - startTime < maxWaitMs) {
    attempt++;
    const elapsedSec = Math.round((Date.now() - startTime) / 1000);

    try {
      const probe = await axios.get(fileUrl, {
        timeout: 15000,
        validateStatus: (s) => s < 500,
        maxRedirects: 5,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
          Range: "bytes=0-10",
        },
      });

      if (probe.status === 200 || probe.status === 206) {
        console.log(`[RapidAPI-Poll] ✅ File ready after ${elapsedSec}s (HTTP ${probe.status})`);
        return fileUrl;
      }
    } catch (probeErr) {
      // Continue polling while file is being prepared by provider
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`RapidAPI file preparation timed out after ${Math.round(maxWaitMs / 1000)} seconds.`);
}

/**
 * Parses stream or file URL from RapidAPI response payload.
 */
function parseStreamUrlFromResponse(data) {
  if (!data) return null;

  // FAST Downloader 24/7 file field
  if (typeof data.file === "string" && data.file.startsWith("http")) return data.file;

  // Nested video object
  if (data.video) {
    if (typeof data.video.file === "string" && data.video.file.startsWith("http")) return data.video.file;
    if (typeof data.video.url === "string" && data.video.url.startsWith("http")) return data.video.url;
  }

  // Direct fields
  if (typeof data.url === "string" && data.url.startsWith("http")) return data.url;
  if (typeof data.link === "string" && data.link.startsWith("http")) return data.link;
  if (typeof data.downloadUrl === "string" && data.downloadUrl.startsWith("http")) return data.downloadUrl;

  // formats[] array (prefer progressive MP4)
  if (Array.isArray(data.formats) && data.formats.length > 0) {
    const progressive = data.formats.filter(
      (f) =>
        f.url &&
        f.hasAudio !== false &&
        f.hasVideo !== false &&
        (String(f.mimeType || "").includes("mp4") || f.ext === "mp4" || f.itag === 22 || f.itag === 18)
    );
    if (progressive.length > 0) {
      progressive.sort((a, b) => (Number(b.height) || 0) - (Number(a.height) || 0));
      return progressive[0].url;
    }
    const anyMp4 = data.formats.find((f) => f.url && (String(f.mimeType || "").includes("mp4") || f.ext === "mp4"));
    if (anyMp4?.url) return anyMp4.url;
    const first = data.formats.find((f) => f.url);
    if (first?.url) return first.url;
  }

  return null;
}

/**
 * Streams raw MP4 from remote URL directly to disk.
 */
async function streamRemoteVideoToFile(streamUrl, targetFilePath, options = {}) {
  const timeoutMs = options.timeoutMs || 300000;
  console.log(`[YouTube-Downloader] Streaming video to: ${targetFilePath}`);

  let currentUrl = streamUrl;
  let response = null;
  let redirectsFollowed = 0;
  const maxRedirects = 10;

  while (redirectsFollowed < maxRedirects) {
    response = await axios({
      method: "GET",
      url: currentUrl,
      responseType: "stream",
      timeout: timeoutMs,
      maxRedirects: 0,
      validateStatus: (status) => status >= 200 && status < 400,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        Accept: "*/*",
        "Accept-Encoding": "identity",
        Referer: "https://www.youtube.com/",
        Origin: "https://www.youtube.com",
      },
    });

    if (response.status >= 300 && response.status < 400 && response.headers.location) {
      redirectsFollowed++;
      currentUrl = new URL(response.headers.location, currentUrl).toString();
      try { response.data.destroy(); } catch {}
      continue;
    }

    break;
  }

  if (!response || response.status < 200 || response.status >= 300) {
    throw new Error(`Failed to stream MP4: Server returned HTTP ${response?.status || "UNKNOWN"}`);
  }

  const writer = fs.createWriteStream(targetFilePath);

  return new Promise((resolve, reject) => {
    response.data.pipe(writer);

    writer.on("finish", () => {
      writer.close(() => {
        if (!fs.existsSync(targetFilePath)) return reject(new Error("Target video file was not written to disk."));
        const stat = fs.statSync(targetFilePath);
        if (stat.size < 10000) {
          cleanupFile(targetFilePath);
          return reject(new Error(`Downloaded video file is too small or corrupt (${stat.size} bytes).`));
        }
        console.log(`[YouTube-Downloader] Download complete: ${(stat.size / (1024 * 1024)).toFixed(2)} MB written to ${path.basename(targetFilePath)}`);
        resolve(targetFilePath);
      });
    });

    writer.on("error", (err) => {
      cleanupFile(targetFilePath);
      reject(err);
    });

    response.data.on("error", (err) => {
      cleanupFile(targetFilePath);
      reject(err);
    });
  });
}

// ── RapidAPI Providers ──────────────────────────────────────────────────────

/**
 * Strips any accidental header labels or URL prefixes from the host configuration.
 */
function sanitizeRapidApiHost(rawHost) {
  if (!rawHost || typeof rawHost !== "string") {
    return "youtube-video-fast-downloader-24-7.p.rapidapi.com";
  }
  let clean = rawHost.trim();
  clean = clean.replace(/^(?:x-)?rapidapi-host:\s*/i, "");
  clean = clean.replace(/^https?:\/\//i, "");
  clean = clean.replace(/\/.*$/, "").trim();
  return clean || "youtube-video-fast-downloader-24-7.p.rapidapi.com";
}

async function fetchFromFastDownloader(videoId, rapidApiKey) {
  const host = sanitizeRapidApiHost(process.env.RAPIDAPI_HOST);

  // Step 1: Discover quality ID
  let selectedQualityId = null;
  try {
    const qualityUrl = `https://${host}/get_available_quality/${videoId}`;
    console.log(`[RapidAPI][FAST] Discovering qualities at: ${qualityUrl} (host: ${host})`);
    const qRes = await axios.get(qualityUrl, {
      headers: {
        "x-rapidapi-host": host,
        "x-rapidapi-key": rapidApiKey,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      timeout: 15000,
    });
    const qualities = Array.isArray(qRes.data) ? qRes.data : [];
    if (qualities.length > 0) {
      const videoQualities = qualities.filter((q) => q.type === "video" || String(q.mime || "").includes("video"));
      const best =
        videoQualities.find((q) => q.quality === "720p" && String(q.mime || "").includes("mp4")) ||
        videoQualities.find((q) => q.quality === "720p") ||
        videoQualities.find((q) => q.quality === "1080p" && String(q.mime || "").includes("mp4")) ||
        videoQualities.find((q) => q.quality === "1080p") ||
        videoQualities.find((q) => q.quality === "480p" || q.quality === "360p") ||
        videoQualities[0] ||
        qualities[0];

      if (best?.id) {
        selectedQualityId = best.id;
        console.log(`[RapidAPI][FAST] Selected quality ID: ${selectedQualityId} (${best.quality || "auto"})`);
      }
    }
  } catch (qErr) {
    console.warn(`[RapidAPI][FAST] Quality discovery note: ${qErr.response?.data?.message || qErr.message}`);
  }

  // Step 2: Request video download URL
  const endpoint = selectedQualityId
    ? `https://${host}/download_video/${videoId}?quality=${selectedQualityId}`
    : `https://${host}/download_video/${videoId}`;

  console.log(`[RapidAPI][FAST] Requesting video download URL: ${endpoint}`);

  let response;
  try {
    response = await axios.get(endpoint, {
      headers: {
        "x-rapidapi-host": host,
        "x-rapidapi-key": rapidApiKey,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      timeout: 30000,
    });
  } catch (err) {
    const status = err.response?.status;
    const msg = err.response?.data?.message || err.response?.data?.error || err.message;
    throw new Error(`RapidAPI FAST Downloader error (HTTP ${status || "UNKNOWN"}): ${msg}`);
  }

  const rawUrl = parseStreamUrlFromResponse(response.data);
  if (!rawUrl) {
    throw new Error(`FAST Downloader returned no streamable file URL: ${JSON.stringify(response.data)}`);
  }

  console.log(`[RapidAPI][FAST] Raw file URL received: ${rawUrl.slice(0, 80)}...`);

  // Step 3: Poll until ready
  return await pollForReadyFileUrl(rawUrl, { intervalMs: 4000, maxWaitMs: 300000 });
}

async function fetchFromYtStream(videoId, rapidApiKey) {
  const host = "ytstream-download-youtube-videos.p.rapidapi.com";
  const endpoint = `https://${host}/dl?id=${videoId}`;

  console.log(`[RapidAPI][ytstream] Requesting direct MP4 link: ${endpoint}`);

  let response;
  try {
    response = await axios.get(endpoint, {
      headers: {
        "x-rapidapi-host": host,
        "x-rapidapi-key": rapidApiKey,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      timeout: 30000,
    });
  } catch (err) {
    const status = err.response?.status;
    const msg = err.response?.data?.message || err.response?.data?.error || err.message;
    throw new Error(`RapidAPI ytstream error (HTTP ${status || "UNKNOWN"}): ${msg}`);
  }

  const url = parseStreamUrlFromResponse(response.data);
  if (!url) {
    throw new Error("ytstream: no streamable MP4 URL found in response.");
  }

  return url;
}

// ── Master Export: downloadYouTubeSource ────────────────────────────────────

/**
 * Downloads a YouTube video via RapidAPI and saves it to local disk storage.
 * 
 * @param {string} url - YouTube URL or video ID.
 * @returns {Promise<string>} - Absolute path to the downloaded MP4 file.
 */
async function downloadYouTubeSource(url) {
  if (!url || !isValidYouTubeUrl(url)) {
    throw new Error("A valid YouTube source URL or Video ID is required.");
  }

  const videoId = extractYouTubeId(url);
  if (!videoId) {
    throw new Error(`Could not extract a valid 11-character Video ID from: ${url}`);
  }

  const rapidApiKey = (process.env.RAPIDAPI_KEY || "").trim();
  if (!rapidApiKey) {
    throw new Error("RAPIDAPI_KEY environment variable is not configured.");
  }

  console.log(`[YouTube-Downloader] Starting source download for Video ID: ${videoId}`);

  const hostConfig = sanitizeRapidApiHost(process.env.RAPIDAPI_HOST).toLowerCase();
  let streamUrl = null;

  // Attempt configured provider or FAST Downloader with ytstream fallback
  if (hostConfig.includes("ytstream")) {
    try {
      streamUrl = await fetchFromYtStream(videoId, rapidApiKey);
    } catch (ytErr) {
      console.warn(`[RapidAPI][ytstream] Failed (${ytErr.message}), trying FAST Downloader...`);
      streamUrl = await fetchFromFastDownloader(videoId, rapidApiKey);
    }
  } else {
    try {
      streamUrl = await fetchFromFastDownloader(videoId, rapidApiKey);
    } catch (fastErr) {
      console.warn(`[RapidAPI][FAST] Failed (${fastErr.message}), trying ytstream fallback...`);
      streamUrl = await fetchFromYtStream(videoId, rapidApiKey);
    }
  }

  if (!streamUrl) {
    throw new Error(`Could not resolve a downloadable MP4 stream URL for YouTube video: ${videoId}`);
  }

  // Stream to uploads/ directory
  const targetPath = path.join(uploadsDir, `yt_source_${videoId}_${Date.now()}.mp4`);
  await streamRemoteVideoToFile(streamUrl, targetPath);

  return targetPath;
}

module.exports = {
  downloadYouTubeSource,
  downloadYouTubeSourceVideo: downloadYouTubeSource,
  isValidYouTubeUrl,
  extractYouTubeId,
  cleanupFile,
};
