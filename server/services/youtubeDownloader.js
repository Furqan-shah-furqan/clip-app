/**
 * YouTube Downloader Service — ClipFlow Studio
 * 
 * Architecture:
 * 1. Primary Strategy: RapidAPI YouTube Video Downloader (ytstream-download-youtube-videos).
 *    Requests unblocked direct progressive MP4 stream links using process.env.RAPIDAPI_KEY,
 *    and streams directly to local disk via Axios with recursive 302 redirect handling.
 * 2. Single-Pass Local Processing: Downloads the source MP4 exactly once to Render's ephemeral
 *    storage (uploads/), passes path to local FFmpeg for clipping/captioning, and aggressively
 *    cleans up large video files immediately after processing.
 */

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const axios = require("axios");
const { rootDir, uploadsDir } = require("../utils/paths");

// ── Utility: URL & Video ID Parsing ──────────────────────────────────────────

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
  } catch {
    return "";
  }
  return "";
}

// ── Utility: Proxy & Config Resolution ───────────────────────────────────────

/**
 * Normalizes proxy URL.
 * Special handling: Webshare backbone proxies (p.webshare.io) require the username
 * to end in -rotate, otherwise they return HTTP 407 (Proxy Authentication Required).
 * Also trims trailing slashes that copy-pasting may introduce.
 */
function normalizeProxyUrl(rawProxy) {
  if (!rawProxy) return null;
  let clean = String(rawProxy).trim().replace(/\/+$/, "");

  try {
    const parsed = new URL(clean);
    if (parsed.hostname.includes("webshare.io") && parsed.username && !parsed.username.includes("-rotate")) {
      const auth = parsed.password ? `${parsed.username}-rotate:${parsed.password}` : `${parsed.username}-rotate`;
      const port = parsed.port ? `:${parsed.port}` : ":80";
      return `${parsed.protocol}//${auth}@${parsed.hostname}${port}`;
    }
    return clean;
  } catch {
    return clean;
  }
}

/**
 * Returns residential proxy URL if configured in environment variables.
 * Supported variables: YTDLP_PROXY, PROXY_URL, HTTPS_PROXY, HTTP_PROXY
 * Format: http://username:password@proxy-ip:port or socks5://...
 */
function getProxyUrl() {
  const proxy = process.env.YTDLP_PROXY || process.env.PROXY_URL || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || "";
  return normalizeProxyUrl(proxy);
}

/**
 * Masks credentials in proxy URL for safe logging in Render dashboard.
 */
function maskProxyUrl(proxyUrl) {
  if (!proxyUrl) return "none";
  try {
    const parsed = new URL(proxyUrl);
    if (parsed.password) {
      parsed.password = "***";
      return parsed.toString();
    }
    return proxyUrl;
  } catch {
    return proxyUrl.replace(/:[^:@]+@/, ":***@");
  }
}

/**
 * Resolves yt-dlp binary path across Windows local binary, system PATH, or Docker / Linux.
 */
function getYtDlpPath() {
  if (process.env.YTDLP_PATH) return process.env.YTDLP_PATH;
  if (process.platform === "win32") {
    const localWin = path.join(rootDir, "bin", "yt-dlp.exe");
    if (fs.existsSync(localWin)) return localWin;
  }
  if (fs.existsSync("/usr/local/bin/yt-dlp")) return "/usr/local/bin/yt-dlp";
  return "yt-dlp";
}

/**
 * Resolves ffmpeg location.
 */
function getFfmpegPath() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  if (process.platform === "win32") {
    const localWin = path.join(rootDir, "bin", "ffmpeg.exe");
    if (fs.existsSync(localWin)) return localWin;
  }
  return "ffmpeg";
}

/**
 * Resolves PO-Token and visitor data if configured for modern yt-dlp botguard bypass.
 */
function getPoTokenArgs() {
  const poToken = process.env.YTDLP_PO_TOKEN;
  const visitorData = process.env.YTDLP_VISITOR_DATA;
  if (!poToken) return [];

  let tokenArg = `youtube:po_token=android+${poToken}`;
  if (visitorData) {
    tokenArg += `;visitor_data=${visitorData}`;
  }
  return ["--extractor-args", tokenArg];
}

// ── Utility: Cookie Management & Domain Auto-Normalization ───────────────────

function resolveActiveCookieFile() {
  if (fs.existsSync("/etc/secrets/cookies.txt")) return "/etc/secrets/cookies.txt";

  const rootCookie = path.join(rootDir, "cookies.txt");
  if (fs.existsSync(rootCookie) && fs.statSync(rootCookie).size > 100) return rootCookie;

  const uploadsCookie = path.join(uploadsDir, "cookies.txt");
  if (fs.existsSync(uploadsCookie) && fs.statSync(uploadsCookie).size > 100) return uploadsCookie;

  if (process.env.YOUTUBE_COOKIES) {
    try {
      const raw = process.env.YOUTUBE_COOKIES.trim();
      const content = raw.startsWith("e30") || (raw.length > 50 && !raw.includes("\t") && !raw.includes("\n"))
        ? Buffer.from(raw, "base64").toString("utf8")
        : raw;
      const envCookiePath = path.join(uploadsDir, "cookies_env.txt");
      fs.writeFileSync(envCookiePath, content, "utf8");
      return envCookiePath;
    } catch (e) {
      console.warn("[YouTube-Downloader] Could not write env cookies:", e.message);
    }
  }

  return null;
}

function prepareWritableCookies(activeCookies, clipStamp) {
  if (!activeCookies) return null;
  try {
    const tempCookiePath = path.join(uploadsDir, `yt_cookies_${clipStamp}.txt`);
    let cookieContent = fs.readFileSync(activeCookies, "utf8");

    // Auto-normalize: If cookies contain .google.com auth tokens but lack .youtube.com lines,
    // duplicate them for .youtube.com so yt-dlp sends full authentication
    const lines = cookieContent.split(/\r?\n/);
    const googleAuthNames = new Set([
      "SID", "HSID", "SSID", "APISID", "SAPISID",
      "__Secure-1PSID", "__Secure-1PAPISID", "__Secure-3PSID",
      "__Secure-1PSIDCC", "__Secure-3PSIDCC"
    ]);
    const ytLinesToAdd = [];
    const hasYtSid = lines.some((l) => l.includes(".youtube.com") && l.includes("\tSID\t"));

    if (!hasYtSid) {
      for (const line of lines) {
        const parts = line.split("\t");
        if (parts.length >= 7 && (parts[0] === ".google.com" || parts[0] === "google.com")) {
          const name = parts[5];
          if (googleAuthNames.has(name)) {
            const ytParts = [...parts];
            ytParts[0] = ".youtube.com";
            ytLinesToAdd.push(ytParts.join("\t"));
          }
        }
      }
      if (ytLinesToAdd.length) {
        cookieContent = cookieContent + "\n" + ytLinesToAdd.join("\n");
      }
    }

    fs.writeFileSync(tempCookiePath, cookieContent, "utf8");
    try { fs.chmodSync(tempCookiePath, 0o666); } catch {}
    return tempCookiePath;
  } catch (err) {
    console.warn("[YouTube-Downloader] Failed to prepare writable cookies:", err.message);
    return null;
  }
}

// ── Utility: Ephemeral Storage Cleanup ───────────────────────────────────────

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

/**
 * Deletes temporary source videos, sections, or temporary cookie files older than maxAgeMs.
 * Prevents Render's ephemeral disk space from being exhausted.
 */
function cleanupStaleSourceVideos(maxAgeMs = 15 * 60 * 1000) {
  try {
    if (!fs.existsSync(uploadsDir)) return;
    const now = Date.now();
    const files = fs.readdirSync(uploadsDir);
    for (const file of files) {
      if (file.startsWith("yt_source_") || file.startsWith("yt_smart_section_") || file.startsWith("yt_cookies_")) {
        const fullPath = path.join(uploadsDir, file);
        try {
          const stats = fs.statSync(fullPath);
          if (now - stats.mtimeMs > maxAgeMs) {
            fs.unlinkSync(fullPath);
            console.log(`[YouTube-Downloader] Removed stale file: ${file}`);
          }
        } catch {}
      }
    }
  } catch (err) {
    console.warn("[YouTube-Downloader] Error in stale file cleanup:", err.message);
  }
}

// ── Utility: Command Runner ──────────────────────────────────────────────────

function runCommand(command, args = [], options = {}) {
  const timeoutMs = Number(options.timeoutMs || 360000);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill("SIGKILL"); } catch {}
      reject(new Error(`${command} timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);

    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(err);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr || stdout || `${command} exited with code ${code}`));
    });
  });
}

// ── Streaming Downloader: Direct MP4 URL to Local Disk ───────────────────────

/**
 * Downloads a direct MP4 stream URL directly to disk via Axios stream.
 * Automatically and explicitly follows HTTP 301/302/303/307 redirects from Googlevideo / RapidAPI tunnels.
 * Logs status codes and validates minimum file size.
 */
async function streamRemoteVideoToFile(streamUrl, targetFilePath, options = {}) {
  const timeoutMs = options.timeoutMs || 300000;
  console.log(`[YouTube-Downloader] [Stream] Starting direct stream to ${path.basename(targetFilePath)}...`);

  let currentUrl = streamUrl;
  let response = null;
  let redirectsFollowed = 0;
  const maxRedirects = 10;

  while (redirectsFollowed < maxRedirects) {
    console.log(`[YouTube-Downloader] [Stream] Requesting: ${currentUrl.slice(0, 110)}... (Hop #${redirectsFollowed + 1})`);

    response = await axios({
      method: "GET",
      url: currentUrl,
      responseType: "stream",
      timeout: timeoutMs,
      maxRedirects: 0, // Handled manually to log redirects and preserve headers
      validateStatus: (status) => status >= 200 && status < 400,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        "Accept": "*/*",
        "Accept-Encoding": "identity",
        ...(options.headers || {}),
      },
    });

    console.log(`[YouTube-Downloader] [Stream] Response Status: ${response.status} ${response.statusText || ""}`);

    // If redirect (301, 302, 303, 307, 308), follow the Location header
    if (response.status >= 300 && response.status < 400 && response.headers.location) {
      redirectsFollowed++;
      const redirectLocation = response.headers.location;
      currentUrl = new URL(redirectLocation, currentUrl).toString();
      console.log(`[YouTube-Downloader] [Stream] Following HTTP ${response.status} redirect to: ${currentUrl.slice(0, 110)}...`);
      // Drain previous stream to release socket
      try { response.data.destroy(); } catch {}
      continue;
    }

    // 200 OK — Ready to write stream
    break;
  }

  if (!response || response.status < 200 || response.status >= 300) {
    throw new Error(`Failed to stream MP4: Server returned HTTP ${response?.status || "UNKNOWN"}`);
  }

  const totalBytes = Number(response.headers["content-length"]) || 0;
  console.log(`[YouTube-Downloader] [Stream] Streaming raw MP4 data (Total Size: ${totalBytes > 0 ? (totalBytes / (1024 * 1024)).toFixed(2) + " MB" : "chunked/unknown"})...`);

  let downloadedBytes = 0;
  let lastLoggedMb = 0;
  const writer = fs.createWriteStream(targetFilePath);

  response.data.on("data", (chunk) => {
    downloadedBytes += chunk.length;
    const currentMb = Math.floor(downloadedBytes / (5 * 1024 * 1024)) * 5;
    if (currentMb > lastLoggedMb) {
      lastLoggedMb = currentMb;
      const progressStr = totalBytes > 0
        ? ` (${Math.round((downloadedBytes / totalBytes) * 100)}%)`
        : "";
      console.log(`[YouTube-Downloader] [Stream] Received: ${(downloadedBytes / (1024 * 1024)).toFixed(1)} MB${progressStr}`);
    }
  });

  response.data.pipe(writer);

  await new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
    response.data.on("error", reject);
  });

  if (!fs.existsSync(targetFilePath)) {
    throw new Error("Target file was not created on disk.");
  }

  const stat = fs.statSync(targetFilePath);
  if (stat.size < 10000) {
    cleanupFile(targetFilePath);
    throw new Error(`Downloaded video file is corrupt or too small (${stat.size} bytes).`);
  }

  console.log(`[YouTube-Downloader] [Stream] Download complete: ${(stat.size / (1024 * 1024)).toFixed(2)} MB written to ${path.basename(targetFilePath)}`);
  return targetFilePath;
}

// ── Strategy 1: yt-dlp with Residential Proxy & Android Spoofing ──────────────

async function downloadViaYtDlp({ targetUrl, clipStamp, outputTemplate }) {
  const ytDlpPath = getYtDlpPath();
  const ffmpegDir = path.join(rootDir, "bin");
  const hasWinFfmpeg = process.platform === "win32" && fs.existsSync(path.join(ffmpegDir, "ffmpeg.exe"));

  const proxyUrl = getProxyUrl();
  const poTokenArgs = getPoTokenArgs();
  const activeCookies = resolveActiveCookieFile();
  const tempCookiePath = prepareWritableCookies(activeCookies, clipStamp);
  const effectiveCookies = tempCookiePath || (activeCookies && !activeCookies.startsWith("/etc/secrets") ? activeCookies : null);

  console.log(`[YouTube-Downloader] [Tier 1: yt-dlp] Initializing. Proxy: ${maskProxyUrl(proxyUrl)}, Cookies: ${effectiveCookies ? "available" : "none"}`);

  // Multi-tier client configurations: tries direct unproxied first (fastest and clean),
  // then proxied (if configured), then authenticated cookies, then alternative clients.
  const clientStrategies = [
    // Tier 1: Direct Android & Android VR clients (unproxied — bypasses datacenter blocks cleanly)
    { client: "youtube:player_client=android", withCookies: false, useProxy: false, label: "Android client direct (no cookies)" },
    { client: "youtube:player_client=android_vr", withCookies: false, useProxy: false, label: "Android VR direct (no cookies)" },

    // Tier 2: Proxied Android clients (if proxy configured)
    ...(proxyUrl ? [
      { client: "youtube:player_client=android", withCookies: false, useProxy: true, label: "Android client via proxy" },
      { client: "youtube:player_client=android_vr", withCookies: false, useProxy: true, label: "Android VR via proxy" },
    ] : []),

    // Tier 3: Cookies strategies (Web/MWeb clients)
    ...(effectiveCookies ? [
      { client: "youtube:player_client=web,mweb", withCookies: true, useProxy: false, label: "Web client + cookies direct" },
      ...(proxyUrl ? [
        { client: "youtube:player_client=web,mweb", withCookies: true, useProxy: true, label: "Web client + cookies via proxy" },
      ] : []),
    ] : []),

    // Tier 4: iOS and TV Embedded clients
    { client: "youtube:player_client=ios", withCookies: false, useProxy: false, label: "iOS client direct" },
    { client: "youtube:player_client=tv_embedded", withCookies: false, useProxy: false, label: "TV Embedded direct" },
    ...(proxyUrl ? [
      { client: "youtube:player_client=ios", withCookies: false, useProxy: true, label: "iOS client via proxy" },
    ] : []),
  ];

  const strategyErrors = [];

  for (const strategy of clientStrategies) {
    const useCookies = strategy.withCookies && Boolean(effectiveCookies);
    const useProxy = strategy.useProxy && Boolean(proxyUrl);

    // Build arguments
    const args = [
      "--no-playlist",
      "--no-check-certificates",
      "--no-warnings",
      "--extractor-args", strategy.client,
      ...poTokenArgs,
      ...(useProxy ? ["--proxy", proxyUrl] : []),
      ...(useCookies ? ["--cookies", effectiveCookies] : []),
      "-f", "18/bv*[height<=720]+ba/b[height<=720]/b/best",
      ...(hasWinFfmpeg ? ["--ffmpeg-location", ffmpegDir] : []),
      "--merge-output-format", "mp4",
      "--socket-timeout", "30",
      "--retries", "3",
    ];

    if (process.env.YTDLP_OAUTH2 === "true") {
      args.push("--username", "oauth2");
    }

    if (process.env.YTDLP_EXTRA_ARGS) {
      args.push(...process.env.YTDLP_EXTRA_ARGS.split(/\s+/).filter(Boolean));
    }

    args.push("-o", outputTemplate, targetUrl);

    console.log(`[YouTube-Downloader] Trying ${strategy.label} [Proxy: ${useProxy ? maskProxyUrl(proxyUrl) : "none"}]`);

    try {
      await runCommand(ytDlpPath, args, { timeoutMs: 300000 });

      // Locate downloaded file
      const files = fs.readdirSync(uploadsDir)
        .filter((f) => f.startsWith(`yt_source_${clipStamp}`))
        .map((f) => path.join(uploadsDir, f))
        .filter((f) => fs.existsSync(f));

      const mp4 = files.find((f) => f.endsWith(".mp4")) || files[0];
      if (mp4 && fs.existsSync(mp4) && fs.statSync(mp4).size > 10000) {
        console.log(`[YouTube-Downloader] yt-dlp download succeeded with ${strategy.label}!`);
        if (tempCookiePath) cleanupFile(tempCookiePath);
        return mp4;
      }
    } catch (err) {
      const msg = err.message || String(err);
      strategyErrors.push(`[${strategy.label}]: ${msg}`);
      console.warn(`[YouTube-Downloader] ${strategy.label} failed: ${msg.slice(0, 160)}`);
    }
  }

  if (tempCookiePath) cleanupFile(tempCookiePath);
  throw new Error(`yt-dlp strategies exhausted:\n${strategyErrors.join("\n")}`);
}

// ── RapidAPI YouTube Downloader (Exclusive Cloud Extractor) ──────────────────

/**
 * Provider: RapidAPI YouTube Video Downloader (ytstream-download-youtube-videos)
 * Connects directly to RapidAPI to retrieve direct progressive googlevideo.com MP4 stream URLs.
 */
async function fetchRapidApiStreamUrl(videoId, targetUrl) {
  const rapidApiKey = (process.env.RAPIDAPI_KEY || "").trim();
  if (!rapidApiKey) {
    throw new Error("RAPIDAPI_KEY is not configured in environment variables.");
  }

  // Step 1: Extract Video ID
  const id = videoId || extractYouTubeId(targetUrl);
  if (!id) {
    throw new Error(`Could not extract video ID from URL: ${targetUrl}`);
  }

  // Step 2: Fetch the Raw MP4 Data
  const rapidApiHost = "ytstream-download-youtube-videos.p.rapidapi.com";
  const endpoint = `https://${rapidApiHost}/dl?id=${id}`;

  console.log(`[RapidAPI] Fetching stream URL for Video ID: ${id}`);
  console.log(`[RapidAPI] Target Endpoint: ${endpoint}`);

  try {
    const response = await axios.get(endpoint, {
      headers: {
        "x-rapidapi-host": rapidApiHost,
        "x-rapidapi-key": rapidApiKey,
      },
      timeout: 30000,
    });

    // Step 3: Advanced Logging & Parsing
    console.log("RapidAPI Response:", response.data);

    const data = response.data;
    if (!data) {
      throw new Error("RapidAPI returned empty response body.");
    }

    // Direct link formats (link, url, downloadUrl)
    if (typeof data.link === "string" && data.link.startsWith("http")) return data.link;
    if (typeof data.url === "string" && data.url.startsWith("http")) return data.url;
    if (typeof data.downloadUrl === "string" && data.downloadUrl.startsWith("http")) return data.downloadUrl;

    // Formats array format from ytstream-download-youtube-videos (formats 18, 22, etc.)
    if (Array.isArray(data.formats) && data.formats.length > 0) {
      // Find progressive MP4 formats that contain both video and audio
      const progressive = data.formats.filter(
        (f) =>
          f.url &&
          f.hasAudio !== false &&
          f.hasVideo !== false &&
          (String(f.mimeType || "").includes("mp4") || f.ext === "mp4" || f.itag === 22 || f.itag === 18)
      );

      if (progressive.length > 0) {
        // Sort highest resolution first (1080p -> 720p -> 480p -> 360p)
        progressive.sort((a, b) => (Number(b.height) || 0) - (Number(a.height) || 0));
        console.log(`[RapidAPI] Selected progressive MP4 format: ${progressive[0].qualityLabel || progressive[0].height || "best"} (itag: ${progressive[0].itag})`);
        return progressive[0].url;
      }

      // Fallback: any format with an MP4 URL
      const anyMp4 = data.formats.find((f) => f.url && (String(f.mimeType || "").includes("mp4") || f.ext === "mp4"));
      if (anyMp4?.url) return anyMp4.url;

      // Fallback: any format with a valid URL
      const anyWithUrl = data.formats.find((f) => f.url);
      if (anyWithUrl?.url) return anyWithUrl.url;
    }

    // Adaptive formats fallback
    if (Array.isArray(data.adaptiveFormats) && data.adaptiveFormats.length > 0) {
      const mp4s = data.adaptiveFormats.filter((f) => f.url && String(f.mimeType || "").includes("mp4"));
      if (mp4s.length > 0) {
        mp4s.sort((a, b) => (Number(b.height) || 0) - (Number(a.height) || 0));
        return mp4s[0].url;
      }
    }

    throw new Error("RapidAPI responded successfully, but no streamable MP4 URL was found in the formats payload.");
  } catch (error) {
    console.error("RapidAPI Fetch Failed!");
    console.error("RapidAPI Error Status:", error.response?.status || "NO_STATUS");
    console.error("RapidAPI Full Error Response:", JSON.stringify(error.response?.data || error.message, null, 2));
    throw error;
  }
}

/**
 * Downloads the source YouTube video via RapidAPI stream directly to local disk.
 */
async function downloadViaRapidApi({ targetUrl, videoId, targetPath }) {
  console.log(`[YouTube-Downloader] Initiating RapidAPI download for video: ${videoId || targetUrl}`);

  const mp4StreamUrl = await fetchRapidApiStreamUrl(videoId, targetUrl);
  if (!mp4StreamUrl) {
    throw new Error("RapidAPI extraction returned null or empty MP4 URL.");
  }

  console.log(`[YouTube-Downloader] RapidAPI direct MP4 link acquired. Starting stream to disk: ${targetPath}`);
  return await streamRemoteVideoToFile(mp4StreamUrl, targetPath);
}

// Alias for backwards compatibility
const downloadViaExternalApiFallback = downloadViaRapidApi;

/**
 * Step 4: Stream and Handoff
 * High-level YouTube source downloader controller:
 * Exclusively uses RapidAPI extraction to download raw MP4 directly to Render's ephemeral storage (/tmp or uploads).
 * Returns the absolute path of the downloaded source MP4 for local FFmpeg clipping.
 */
async function downloadYouTubeSourceVideo({ sourceUrl }) {
  if (!sourceUrl || !isValidYouTubeUrl(sourceUrl)) {
    throw new Error("A valid YouTube source URL is required.");
  }

  cleanupStaleSourceVideos();

  // Step 1: Extract 11-character Video ID
  const videoId = extractYouTubeId(sourceUrl);
  if (!videoId) {
    throw new Error(`Could not extract valid Video ID from URL: ${sourceUrl}`);
  }

  const targetUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const tempDir = fs.existsSync("/tmp") ? "/tmp" : uploadsDir;
  const clipStamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const finalMp4Target = path.join(tempDir, `${videoId}_${clipStamp}.mp4`);

  console.log(`[YouTube-Downloader] Initiating RapidAPI video extraction: ${targetUrl}`);
  console.log(`[YouTube-Downloader] Target ephemeral file path: ${finalMp4Target}`);

  try {
    const downloadedPath = await downloadViaRapidApi({
      targetUrl,
      videoId,
      targetPath: finalMp4Target,
    });

    if (downloadedPath && fs.existsSync(downloadedPath)) {
      console.log(`[YouTube-Downloader] Source MP4 successfully downloaded to disk: ${downloadedPath}`);
      return downloadedPath;
    }
  } catch (apiErr) {
    console.error(`[YouTube-Downloader] RapidAPI extraction failed: ${apiErr.message}`);
    throw new Error(`YouTube RapidAPI extraction failed: ${apiErr.message}`);
  }

  throw new Error("Failed to download YouTube video: no file was created on disk.");
}

/**
 * Direct Section Downloader via yt-dlp.
 * Uses --download-sections to download ONLY the needed 15-45s slice directly.
 * Extremely fast (1-3s, ~2-3MB) and bypasses full-video cloud timeouts and memory issues.
 */
async function downloadDirectSectionViaYtDlp({ targetUrl, startSec, endSec, clipStamp, outputTemplate }) {
  const ytDlpPath = getYtDlpPath();
  const ffmpegDir = path.join(rootDir, "bin");
  const hasWinFfmpeg = process.platform === "win32" && fs.existsSync(path.join(ffmpegDir, "ffmpeg.exe"));

  const proxyUrl = getProxyUrl();
  const poTokenArgs = getPoTokenArgs();
  const activeCookies = resolveActiveCookieFile();
  const tempCookiePath = prepareWritableCookies(activeCookies, clipStamp);
  const effectiveCookies = tempCookiePath || (activeCookies && !activeCookies.startsWith("/etc/secrets") ? activeCookies : null);
  const section = `*${Number(startSec).toFixed(2)}-${Number(endSec).toFixed(2)}`;

  const strategies = [
    { client: "youtube:player_client=android", withCookies: false, useProxy: false, label: "Section Android direct (no cookies)" },
    { client: "youtube:player_client=android_vr", withCookies: false, useProxy: false, label: "Section Android VR direct (no cookies)" },
    ...(proxyUrl ? [
      { client: "youtube:player_client=android", withCookies: false, useProxy: true, label: "Section Android via proxy" },
      { client: "youtube:player_client=android_vr", withCookies: false, useProxy: true, label: "Section Android VR via proxy" },
    ] : []),
    ...(effectiveCookies ? [
      { client: "youtube:player_client=web,mweb", withCookies: true, useProxy: false, label: "Section Web + cookies direct" },
      ...(proxyUrl ? [
        { client: "youtube:player_client=web,mweb", withCookies: true, useProxy: true, label: "Section Web + cookies via proxy" },
      ] : []),
    ] : []),
    { client: "youtube:player_client=ios", withCookies: false, useProxy: false, label: "Section iOS direct" },
    { client: "youtube:player_client=tv_embedded", withCookies: false, useProxy: false, label: "Section TV Embedded direct" },
  ];

  const stratErrors = [];

  for (const strat of strategies) {
    const useCookies = strat.withCookies && Boolean(effectiveCookies);
    const useProxy = strat.useProxy && Boolean(proxyUrl);
    const args = [
      "--no-playlist",
      "--no-check-certificates",
      "--no-warnings",
      "--extractor-args", strat.client,
      ...poTokenArgs,
      ...(useProxy ? ["--proxy", proxyUrl] : []),
      ...(useCookies ? ["--cookies", effectiveCookies] : []),
      "-f", "18/bv*[height<=720]+ba/b[height<=720]/b/best",
      ...(hasWinFfmpeg ? ["--ffmpeg-location", ffmpegDir] : []),
      "--download-sections", section,
      "--force-keyframes-at-cuts",
      "--merge-output-format", "mp4",
      "--socket-timeout", "20",
      "--retries", "2",
      "-o", outputTemplate,
      targetUrl,
    ];

    try {
      console.log(`[YouTube-Downloader] Trying direct section download with ${strat.label}...`);
      await runCommand(ytDlpPath, args, { timeoutMs: 45000 });

      const files = fs.readdirSync(uploadsDir)
        .filter((f) => f.startsWith(`yt_smart_section_${clipStamp}`))
        .map((f) => path.join(uploadsDir, f))
        .filter((f) => fs.existsSync(f));

      const mp4 = files.find((f) => f.endsWith(".mp4")) || files[0];
      if (mp4 && fs.existsSync(mp4) && fs.statSync(mp4).size > 1000) {
        console.log(`[YouTube-Downloader] Direct section download succeeded with ${strat.label}!`);
        if (tempCookiePath) cleanupFile(tempCookiePath);
        return mp4;
      }
    } catch (err) {
      const msg = err.message || String(err);
      stratErrors.push(`[${strat.label}]: ${msg}`);
      console.warn(`[YouTube-Downloader] ${strat.label} failed: ${msg.slice(0, 120)}`);
    }
  }

  if (tempCookiePath) cleanupFile(tempCookiePath);
  throw new Error(`Direct section download strategies exhausted:\n${stratErrors.join("\n")}`);
}

/**
 * Downloads a specific section of a YouTube video by attempting direct section download
 * first (1-3 seconds), and falling back to full source download + FFmpeg cut if needed.
 */
async function downloadYouTubeSection({ sourceUrl, startSec, endSec, index = 0 }) {
  const safeStart = Math.max(0, Number(startSec) || 0);
  const safeEnd = Math.max(safeStart + 8, Number(endSec) || safeStart + 30);
  const clipStamp = `${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`;

  console.log(`[YouTube-Downloader] [Step 3: FFmpeg Handoff] Extracting section ${safeStart}s - ${safeEnd}s`);

  // Step 1 & 2: Download raw MP4 stream via 3rd-party extraction API
  const sourceMp4 = await downloadYouTubeSourceVideo({ sourceUrl });
  const cutMp4 = path.join(uploadsDir, `yt_smart_section_${clipStamp}.mp4`);

  // Step 3: Local FFmpeg slice & immediate ephemeral cleanup
  try {
    const ffmpegPath = getFfmpegPath();
    const cutDuration = safeEnd - safeStart;

    await runCommand(ffmpegPath, [
      "-y",
      "-ss", String(safeStart),
      "-i", sourceMp4,
      "-t", String(cutDuration),
      "-c", "copy",
      cutMp4,
    ], { timeoutMs: 60000 });

    if (fs.existsSync(cutMp4) && fs.statSync(cutMp4).size > 1000) {
      console.log(`[YouTube-Downloader] Section cut successful via FFmpeg: ${cutMp4}`);
      return cutMp4;
    }
    throw new Error("FFmpeg cut produced invalid or empty file.");
  } finally {
    // Ephemeral cleanup: delete source video immediately after slicing
    cleanupFile(sourceMp4);
  }
}

// ── Diagnostics Function ─────────────────────────────────────────────────────

/**
 * Gathers end-to-end diagnostic status for Render logs and the /api/clips/diag route.
 */
async function getDownloaderDiagnostics(testUrl = "https://www.youtube.com/watch?v=AxRd9vXZ1kc") {
  const proxyUrl = getProxyUrl();
  const ytDlpPath = getYtDlpPath();
  const activeCookies = resolveActiveCookieFile();

  const results = {
    timestamp: new Date().toISOString(),
    platform: process.platform,
    ytDlpPath,
    proxyConfigured: Boolean(proxyUrl),
    proxyMasked: maskProxyUrl(proxyUrl),
    cookiesConfigured: Boolean(activeCookies),
    activeCookiesPath: activeCookies,
    poTokenConfigured: Boolean(process.env.YTDLP_PO_TOKEN),
    rapidApiConfigured: Boolean(process.env.RAPIDAPI_KEY),
    tests: {},
  };

  // Test 1: yt-dlp version
  try {
    const v = await runCommand(ytDlpPath, ["--version"], { timeoutMs: 8000 });
    results.tests.ytDlpVersion = v.stdout.trim();
  } catch (e) {
    results.tests.ytDlpVersion = `error: ${e.message}`;
  }

  // Test 2: Proxy IP verification (if proxy is configured)
  if (proxyUrl) {
    try {
      const axiosProxy = require("axios");
      const { HttpsProxyAgent } = require("https-proxy-agent");
      const agent = new HttpsProxyAgent(proxyUrl);
      const ipRes = await axiosProxy.get("https://api.ipify.org?format=json", {
        httpsAgent: agent,
        timeout: 10000,
      });
      results.tests.proxyOutboundIp = ipRes.data?.ip || "ok";
    } catch (e) {
      results.tests.proxyOutboundIp = `failed: ${e.message}`;
    }
  }

  // Test 3: RapidAPI configuration status
  results.tests.rapidApiStatus = process.env.RAPIDAPI_KEY
    ? `Key configured (length: ${process.env.RAPIDAPI_KEY.trim().length})`
    : "RAPIDAPI_KEY missing";

  return results;
}

module.exports = {
  isValidYouTubeUrl,
  extractYouTubeId,
  getProxyUrl,
  maskProxyUrl,
  getYtDlpPath,
  getFfmpegPath,
  resolveActiveCookieFile,
  prepareWritableCookies,
  cleanupFile,
  cleanupStaleSourceVideos,
  streamRemoteVideoToFile,
  downloadViaYtDlp,
  downloadDirectSectionViaYtDlp,
  downloadViaExternalApiFallback,
  downloadYouTubeSourceVideo,
  downloadYouTubeSection,
  getDownloaderDiagnostics,
};
