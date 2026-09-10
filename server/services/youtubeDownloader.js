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
 * Automatically and explicitly follows HTTP 301/302/303/307 redirects.
 * If direct stream fails (e.g. 403 on googlevideo.com datacenter block), automatically retries via residential proxy.
 */
async function streamRemoteVideoToFile(streamUrl, targetFilePath, options = {}) {
  const timeoutMs = options.timeoutMs || 300000;
  const proxyUrl = getProxyUrl();
  console.log(`[YouTube-Downloader] [Stream] Starting stream to ${path.basename(targetFilePath)}...`);

  async function tryFetchStream(useProxy = false) {
    let currentUrl = streamUrl;
    let response = null;
    let redirectsFollowed = 0;
    const maxRedirects = 10;

    let agent = null;
    if (useProxy && proxyUrl) {
      try {
        const { HttpsProxyAgent } = require("https-proxy-agent");
        agent = new HttpsProxyAgent(proxyUrl);
      } catch (e) {
        console.warn(`[YouTube-Downloader] [Stream] Failed to initialize HttpsProxyAgent: ${e.message}`);
      }
    }

    while (redirectsFollowed < maxRedirects) {
      console.log(`[YouTube-Downloader] [Stream] Requesting: ${currentUrl.slice(0, 90)}... (Hop #${redirectsFollowed + 1}, Proxy: ${Boolean(agent)})`);

      response = await axios({
        method: "GET",
        url: currentUrl,
        responseType: "stream",
        timeout: timeoutMs,
        maxRedirects: 0, // Handled manually to log redirects and preserve headers
        validateStatus: (status) => status >= 200 && status < 400,
        httpsAgent: agent || undefined,
        proxy: false,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
          "Accept": "*/*",
          "Accept-Encoding": "identity",
          "Referer": "https://www.youtube.com/",
          "Origin": "https://www.youtube.com",
          ...(options.headers || {}),
        },
      });

      console.log(`[YouTube-Downloader] [Stream] Response Status: ${response.status} ${response.statusText || ""}`);

      if (response.status >= 300 && response.status < 400 && response.headers.location) {
        redirectsFollowed++;
        const redirectLocation = response.headers.location;
        currentUrl = new URL(redirectLocation, currentUrl).toString();
        console.log(`[YouTube-Downloader] [Stream] Following HTTP ${response.status} redirect to: ${currentUrl.slice(0, 90)}...`);
        try { response.data.destroy(); } catch {}
        continue;
      }

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

    return new Promise((resolve, reject) => {
      response.data.on("data", (chunk) => {
        downloadedBytes += chunk.length;
        const currentMb = Math.floor(downloadedBytes / (5 * 1024 * 1024)) * 5;
        if (currentMb > lastLoggedMb) {
          lastLoggedMb = currentMb;
          const progressStr = totalBytes > 0 ? ` (${Math.round((downloadedBytes / totalBytes) * 100)}%)` : "";
          console.log(`[YouTube-Downloader] [Stream] Received: ${(downloadedBytes / (1024 * 1024)).toFixed(1)} MB${progressStr}`);
        }
      });

      response.data.pipe(writer);

      writer.on("finish", () => {
        writer.close(() => {
          if (!fs.existsSync(targetFilePath)) return reject(new Error("Target file was not created on disk."));
          const stat = fs.statSync(targetFilePath);
          if (stat.size < 10000) {
            cleanupFile(targetFilePath);
            return reject(new Error(`Downloaded video file is corrupt or too small (${stat.size} bytes).`));
          }
          console.log(`[YouTube-Downloader] [Stream] Download complete: ${(stat.size / (1024 * 1024)).toFixed(2)} MB written to ${path.basename(targetFilePath)}`);
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

  // Attempt direct first; if blocked (e.g. 403 on googlevideo), retry via residential proxy
  try {
    return await tryFetchStream(false);
  } catch (directErr) {
    if (proxyUrl) {
      console.warn(`[YouTube-Downloader] [Stream] Direct stream failed (${directErr.message}). Retrying via residential proxy...`);
      return await tryFetchStream(true);
    }
    throw directErr;
  }
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

  // Multi-tier client configurations: prioritizes VisionOS & Android VR clients
  // (bypasses GVS PO Token format removal, SABR-only stream limitations, and bot blocks)
  const clientStrategies = [
    // Priority 1: visionos,android_vr with cookies & proxy
    ...(effectiveCookies && proxyUrl ? [
      { client: "youtube:player_client=visionos,android_vr", withCookies: true, useProxy: true, label: "VisionOS/VR + cookies via proxy" },
    ] : []),

    // Priority 2: visionos,android_vr direct with cookies
    ...(effectiveCookies ? [
      { client: "youtube:player_client=visionos,android_vr", withCookies: true, useProxy: false, label: "VisionOS/VR + cookies direct" },
    ] : []),

    // Priority 3: visionos,android_vr via proxy (no cookies)
    ...(proxyUrl ? [
      { client: "youtube:player_client=visionos,android_vr", withCookies: false, useProxy: true, label: "VisionOS/VR via proxy" },
    ] : []),

    // Priority 4: visionos,android_vr direct (no cookies)
    { client: "youtube:player_client=visionos,android_vr", withCookies: false, useProxy: false, label: "VisionOS/VR direct" },

    // Fallbacks
    { client: "youtube:player_client=android", withCookies: false, useProxy: Boolean(proxyUrl), label: "Android client fallback" },
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
      "-f", "bestvideo*[height<=720]+bestaudio/best[height<=720]/bestvideo*+bestaudio/best",
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
      await runCommand(ytDlpPath, args, { timeoutMs: 60000 });

      // Locate downloaded file
      const searchDir = path.dirname(outputTemplate);
      const files = fs.readdirSync(searchDir)
        .filter((f) => f.startsWith(`yt_source_${clipStamp}`))
        .map((f) => path.join(searchDir, f))
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

// ── RapidAPI YouTube Downloader ───────────────────────────────────────────────

/**
 * Polls a delayed file URL every 5s until HTTP 200 or 206 (max 5 min).
 * Required for the FAST Downloader 24/7 provider whose files are processed async.
 */
async function pollForReadyFileUrl(fileUrl, { intervalMs = 5000, maxWaitMs = 300000 } = {}) {
  const startTime = Date.now();
  let attempt = 0;

  console.log(`[RapidAPI-Poll] Starting poll: ${fileUrl.slice(0, 80)}...`);

  while (Date.now() - startTime < maxWaitMs) {
    attempt++;
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`[RapidAPI-Poll] Attempt #${attempt} (${elapsed}s elapsed)...`);

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
        console.log(`[RapidAPI-Poll] ✅ File READY after ${elapsed}s (HTTP ${probe.status})`);
        return fileUrl;
      }

      console.log(`[RapidAPI-Poll] HTTP ${probe.status} — waiting ${intervalMs / 1000}s...`);
      await new Promise((r) => setTimeout(r, intervalMs));
    } catch (err) {
      const s = err.response?.status;
      console.log(`[RapidAPI-Poll] ${s === 404 ? "404 not ready" : `Error (${s || err.message})`} — waiting ${intervalMs / 1000}s...`);
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  throw new Error(`RapidAPI-Poll timed out after ${maxWaitMs / 1000}s for: ${fileUrl.slice(0, 80)}`);
}

/**
 * Extracts a streamable MP4 URL from any RapidAPI JSON response shape.
 * Handles: formats[], adaptiveFormats[], file, url, link, downloadUrl, video.url, video.file
 */
function parseStreamUrlFromResponse(data) {
  if (!data) return null;

  // Provider-specific `file` field (FAST Downloader 24/7)
  if (typeof data.file === "string" && data.file.startsWith("http")) return data.file;

  // Nested video object
  if (data.video) {
    if (typeof data.video.file === "string" && data.video.file.startsWith("http")) return data.video.file;
    if (typeof data.video.url === "string" && data.video.url.startsWith("http")) return data.video.url;
  }

  // Generic top-level direct links
  if (typeof data.url === "string" && data.url.startsWith("http")) return data.url;
  if (typeof data.link === "string" && data.link.startsWith("http")) return data.link;
  if (typeof data.downloadUrl === "string" && data.downloadUrl.startsWith("http")) return data.downloadUrl;

  // formats[] array — prefer progressive MP4 (itag 22=720p, 18=360p)
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
      console.log(`[RapidAPI] Progressive MP4: ${progressive[0].qualityLabel || progressive[0].height || "best"} (itag ${progressive[0].itag})`);
      return progressive[0].url;
    }
    // Fallback: any mp4
    const anyMp4 = data.formats.find((f) => f.url && (String(f.mimeType || "").includes("mp4") || f.ext === "mp4"));
    if (anyMp4?.url) return anyMp4.url;
    // Last resort: first URL
    const first = data.formats.find((f) => f.url);
    if (first?.url) return first.url;
  }

  // adaptiveFormats[] fallback
  if (Array.isArray(data.adaptiveFormats) && data.adaptiveFormats.length > 0) {
    const mp4s = data.adaptiveFormats.filter((f) => f.url && String(f.mimeType || "").includes("mp4"));
    if (mp4s.length > 0) {
      mp4s.sort((a, b) => (Number(b.height) || 0) - (Number(a.height) || 0));
      return mp4s[0].url;
    }
  }

  return null;
}

/**
 * Provider: ytstream-download-youtube-videos.p.rapidapi.com
 * Returns direct progressive MP4 URLs instantly (no polling needed).
 */
async function fetchFromYtStream(id, rapidApiKey) {
  const host = "ytstream-download-youtube-videos.p.rapidapi.com";
  const endpoint = `https://${host}/dl?id=${id}`;

  console.log(`[RapidAPI][ytstream] GET ${endpoint}`);

  const response = await axios.get(endpoint, {
    headers: {
      "x-rapidapi-host": host,
      "x-rapidapi-key": rapidApiKey,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
    timeout: 30000,
  });

  console.log("RapidAPI Response:", JSON.stringify(response.data, null, 2));

  const url = parseStreamUrlFromResponse(response.data);
  if (!url) {
    throw new Error("ytstream: no streamable MP4 URL found in response.");
  }

  console.log(`[RapidAPI][ytstream] ✅ Direct MP4 URL resolved: ${url.slice(0, 80)}...`);
  return url;
}

/**
 * Provider: YouTube Video FAST Downloader 24/7
 * Uses /get_available_quality to pick best MP4, then /download_video to generate async file URL.
 */
async function fetchFromFastDownloader(id, rapidApiKey) {
  const host = (process.env.RAPIDAPI_HOST || "youtube-video-fast-downloader-24-7.p.rapidapi.com").trim();

  // Step 1: Discover available quality IDs
  let selectedQualityId = null;
  try {
    const qualityUrl = `https://${host}/get_available_quality/${id}`;
    console.log(`[RapidAPI][FAST] Discovering qualities at: ${qualityUrl}`);
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
      console.log(`[RapidAPI][FAST] Discovered ${qualities.length} quality options`);
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
    console.warn(`[RapidAPI][FAST] Quality discovery skipped: ${qErr.message}`);
  }

  // Step 2: Request video download URL from /download_video/{id}
  const endpoint = selectedQualityId
    ? `https://${host}/download_video/${id}?quality=${selectedQualityId}`
    : `https://${host}/download_video/${id}`;

  console.log(`[RapidAPI][FAST] GET ${endpoint}`);

  const response = await axios.get(endpoint, {
    headers: {
      "x-rapidapi-host": host,
      "x-rapidapi-key": rapidApiKey,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
    timeout: 30000,
  });

  console.log("RapidAPI Response:", JSON.stringify(response.data, null, 2));

  const rawUrl = parseStreamUrlFromResponse(response.data);
  if (!rawUrl) {
    throw new Error(`FAST Downloader returned no streamable file URL: ${JSON.stringify(response.data)}`);
  }

  console.log(`[RapidAPI][FAST] Parsed async file URL: ${rawUrl.slice(0, 80)}...`);

  // Step 3: FAST Downloader processes files asynchronously — poll until ready
  return await pollForReadyFileUrl(rawUrl, { intervalMs: 5000, maxWaitMs: 300000 });
}

/**
 * Master fetch function: automatically prioritizes provider matching RAPIDAPI_HOST, with fallback.
 */
async function fetchRapidApiStreamUrl(videoId, targetUrl) {
  const rapidApiKey = (process.env.RAPIDAPI_KEY || "").trim();
  if (!rapidApiKey) {
    throw new Error("RAPIDAPI_KEY is not configured in environment variables.");
  }

  const id = videoId || extractYouTubeId(targetUrl);
  if (!id) {
    throw new Error(`Could not extract video ID from URL: ${targetUrl}`);
  }

  const hostConfig = (process.env.RAPIDAPI_HOST || "").trim().toLowerCase();
  console.log(`[RapidAPI] Fetching MP4 for Video ID: ${id} (Host: ${hostConfig || "auto"})`);

  // If host is configured for ytstream, prioritize it
  if (hostConfig.includes("ytstream")) {
    try {
      return await fetchFromYtStream(id, rapidApiKey);
    } catch (ytErr) {
      const ytDetail = ytErr.response?.data?.message || ytErr.message;
      console.warn(`[RapidAPI][ytstream] Failed: ${ytDetail}. Trying FAST Downloader...`);
      return await fetchFromFastDownloader(id, rapidApiKey);
    }
  }

  // Default: FAST Downloader 24/7 (matches user's active subscription)
  try {
    return await fetchFromFastDownloader(id, rapidApiKey);
  } catch (fastErr) {
    const fastDetail = fastErr.response?.data?.message || fastErr.response?.data || fastErr.message;
    console.warn(`[RapidAPI][FAST] Failed: ${fastDetail}. Trying ytstream fallback...`);

    try {
      return await fetchFromYtStream(id, rapidApiKey);
    } catch (ytErr) {
      const ytDetail = ytErr.response?.data?.message || ytErr.response?.data || ytErr.message;
      throw new Error(`All RapidAPI providers failed for video ${id}. FAST Downloader: ${fastDetail} | ytstream: ${ytDetail}`);
    }
  }
}

/**
 * Downloads the confirmed-ready MP4 stream directly to local disk.
 */
async function downloadViaRapidApi({ targetUrl, videoId, targetPath }) {
  console.log(`[YouTube-Downloader] Initiating RapidAPI download for video: ${videoId || targetUrl}`);

  const mp4StreamUrl = await fetchRapidApiStreamUrl(videoId, targetUrl);
  if (!mp4StreamUrl) {
    throw new Error("RapidAPI extraction returned null or empty MP4 URL.");
  }

  console.log(`[YouTube-Downloader] MP4 URL confirmed. Streaming to disk: ${targetPath}`);
  return await streamRemoteVideoToFile(mp4StreamUrl, targetPath);
}

// Alias for backwards compatibility
const downloadViaExternalApiFallback = downloadViaRapidApi;

/**
 * High-level YouTube source downloader.
 * Downloads raw MP4 to /tmp (or uploads/) via RapidAPI and returns the absolute path for FFmpeg.
 */
async function downloadYouTubeSourceVideo(input) {
  const sourceUrl = typeof input === "string" ? input : input?.sourceUrl;
  if (!sourceUrl || !isValidYouTubeUrl(sourceUrl)) {
    throw new Error("A valid YouTube source URL is required.");
  }

  cleanupStaleSourceVideos();

  const videoId = extractYouTubeId(sourceUrl);
  if (!videoId) {
    throw new Error(`Could not extract valid Video ID from URL: ${sourceUrl}`);
  }

  const targetUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const tempDir = fs.existsSync("/tmp") ? "/tmp" : uploadsDir;
  const clipStamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const finalMp4Target = path.join(tempDir, `${videoId}_${clipStamp}.mp4`);

  console.log(`[YouTube-Downloader] Source URL: ${targetUrl}`);
  console.log(`[YouTube-Downloader] Target path: ${finalMp4Target}`);

  // ── Strategy 1: Prioritized yt-dlp with Residential Proxy & Session Cookies ──
  const hasProxyAndCookies = Boolean(getProxyUrl() && resolveActiveCookieFile());
  if (hasProxyAndCookies) {
    try {
      console.log(`[YouTube-Downloader] Priority Tier: Attempting yt-dlp via residential proxy + cookies...`);
      const outputTemplate = path.join(tempDir, `yt_source_${clipStamp}.%(ext)s`);
      const ytdlpPath = await downloadViaYtDlp({
        targetUrl,
        clipStamp,
        outputTemplate,
      });

      if (ytdlpPath && fs.existsSync(ytdlpPath) && fs.statSync(ytdlpPath).size > 10000) {
        console.log(`[YouTube-Downloader] ✅ Source MP4 downloaded via proxied yt-dlp: ${ytdlpPath}`);
        return ytdlpPath;
      }
    } catch (ytdlpErr) {
      console.warn(`[YouTube-Downloader] Proxied yt-dlp attempt failed: ${ytdlpErr.message}. Trying RapidAPI fallback...`);
    }
  }

  // ── Strategy 2: RapidAPI ──
  if (process.env.RAPIDAPI_KEY) {
    try {
      console.log(`[YouTube-Downloader] Attempting RapidAPI download...`);
      const downloadedPath = await downloadViaRapidApi({
        targetUrl,
        videoId,
        targetPath: finalMp4Target,
      });

      if (downloadedPath && fs.existsSync(downloadedPath) && fs.statSync(downloadedPath).size > 10000) {
        console.log(`[YouTube-Downloader] ✅ Source MP4 downloaded via RapidAPI: ${downloadedPath}`);
        return downloadedPath;
      }
    } catch (apiErr) {
      rapidApiError = apiErr;
      const detail = apiErr.response?.data?.message || apiErr.response?.data?.error || apiErr.message;
      console.warn(`[YouTube-Downloader] RapidAPI download failed: ${detail}. Falling back to general yt-dlp...`);
    }
  }

  // ── Strategy 3: General yt-dlp (exhaust all client strategies) ──
  try {
    console.log(`[YouTube-Downloader] Attempting general yt-dlp download...`);
    const outputTemplate = path.join(tempDir, `yt_source_${clipStamp}.%(ext)s`);
    const ytdlpPath = await downloadViaYtDlp({
      targetUrl,
      clipStamp,
      outputTemplate,
    });

    if (ytdlpPath && fs.existsSync(ytdlpPath) && fs.statSync(ytdlpPath).size > 10000) {
      console.log(`[YouTube-Downloader] ✅ Source MP4 downloaded via general yt-dlp: ${ytdlpPath}`);
      return ytdlpPath;
    }
  } catch (ytdlpErr) {
    console.error(`[YouTube-Downloader] All download pipelines failed: ${ytdlpErr.message}`);
    const apiDetail = rapidApiError?.response?.data?.message || rapidApiError?.message || "RapidAPI not configured or failed";
    throw new Error(
      `YouTube download failed across all pipelines.\n` +
      `RapidAPI Error: ${apiDetail}\n` +
      `yt-dlp Error: ${ytdlpErr.message.slice(0, 180)}`
    );
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
    // Priority 1: visionos,android_vr with cookies & proxy (if available)
    ...(effectiveCookies && proxyUrl ? [
      { client: "youtube:player_client=visionos,android_vr", withCookies: true, useProxy: true, label: "VisionOS/VR + cookies via proxy" },
    ] : []),
    // Priority 2: visionos,android_vr with cookies direct
    ...(effectiveCookies ? [
      { client: "youtube:player_client=visionos,android_vr", withCookies: true, useProxy: false, label: "VisionOS/VR + cookies direct" },
    ] : []),
    // Priority 3: visionos,android_vr via proxy
    ...(proxyUrl ? [
      { client: "youtube:player_client=visionos,android_vr", withCookies: false, useProxy: true, label: "VisionOS/VR via proxy" },
    ] : []),
    // Priority 4: Android client direct
    { client: "youtube:player_client=android", withCookies: Boolean(effectiveCookies), useProxy: Boolean(proxyUrl), label: "Android client" },
    // Priority 5: Web client fallback
    { client: "youtube:player_client=web", withCookies: Boolean(effectiveCookies), useProxy: Boolean(proxyUrl), label: "Web client" },
  ];

  const stratErrors = [];

  for (const strat of strategies) {
    const useCookies = strat.withCookies && Boolean(effectiveCookies);
    const useProxy = strat.useProxy && Boolean(proxyUrl);
    const args = [
      "--no-playlist",
      "--no-check-certificates",
      "--no-warnings",
      ...(strat.client ? ["--extractor-args", strat.client] : []),
      ...poTokenArgs,
      ...(useProxy ? ["--proxy", proxyUrl] : []),
      ...(useCookies ? ["--cookies", effectiveCookies] : []),
      "-f", "bestvideo*[height<=720]+bestaudio/best[height<=720]/bestvideo*+bestaudio/best",
      ...(hasWinFfmpeg ? ["--ffmpeg-location", ffmpegDir] : []),
      "--download-sections", section,
      "--force-keyframes-at-cuts",
      "--merge-output-format", "mp4",
      "--socket-timeout", "10",
      "--retries", "1",
      "-o", outputTemplate,
      targetUrl,
    ];

    try {
      console.log(`[YouTube-Downloader] Trying direct section download with ${strat.label}...`);
      await runCommand(ytDlpPath, args, { timeoutMs: 15000 });

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
 * first (1-3 seconds), then remote RapidAPI slice, and falling back to full source download + FFmpeg cut if needed.
 */
async function downloadYouTubeSection({ sourceUrl, startSec, endSec, index = 0 }) {
  const safeStart = Math.max(0, Number(startSec) || 0);
  const safeEnd = Math.max(safeStart + 8, Number(endSec) || safeStart + 30);
  const clipStamp = `${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`;

  console.log(`[YouTube-Downloader] [Step 3: FFmpeg Handoff] Extracting section ${safeStart}s - ${safeEnd}s`);

  // Step 1: Attempt direct section extraction via yt-dlp first (fast, 1-3s, ~2-3MB)
  try {
    const outputTemplate = path.join(uploadsDir, `yt_smart_section_${clipStamp}.%(ext)s`);
    const mp4 = await downloadDirectSectionViaYtDlp({
      targetUrl: sourceUrl,
      startSec: safeStart,
      endSec: safeEnd,
      clipStamp,
      outputTemplate,
    });
    if (mp4 && fs.existsSync(mp4) && fs.statSync(mp4).size > 1000) {
      console.log(`[YouTube-Downloader] Direct section download succeeded: ${mp4}`);
      return mp4;
    }
  } catch (secErr) {
    console.warn(`[YouTube-Downloader] Direct section download failed (${secErr.message.slice(0, 100)}), trying fallbacks...`);
  }

  // Step 1.5: RapidAPI remote stream extraction + FFmpeg remote slice (fast, 1-3s, ~2-3MB)
  if (process.env.RAPIDAPI_KEY) {
    try {
      console.log(`[YouTube-Downloader] Attempting remote section slice via RapidAPI stream...`);
      const videoId = extractYouTubeId(sourceUrl);
      const streamUrl = await fetchRapidApiStreamUrl(videoId, sourceUrl);
      if (streamUrl) {
        const cutMp4 = path.join(uploadsDir, `yt_smart_section_${clipStamp}.mp4`);
        const cutDuration = Math.max(1, safeEnd - safeStart);
        const ffmpegPath = getFfmpegPath();
        await runCommand(ffmpegPath, [
          "-y",
          "-ss", String(safeStart),
          "-i", streamUrl,
          "-t", String(cutDuration),
          "-c", "copy",
          cutMp4,
        ], { timeoutMs: 45000 });

        if (fs.existsSync(cutMp4) && fs.statSync(cutMp4).size > 1000) {
          console.log(`[YouTube-Downloader] Remote section slice successful via RapidAPI: ${cutMp4}`);
          return cutMp4;
        }
      }
    } catch (apiErr) {
      console.warn(`[YouTube-Downloader] Remote RapidAPI section slice failed: ${apiErr.message}`);
    }
  }

  // Step 2 & 3: Fall back to full source video download + FFmpeg cut
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

  // Test 4: Live RapidAPI extraction test
  if (process.env.RAPIDAPI_KEY) {
    try {
      const testId = extractYouTubeId(testUrl) || "AxRd9vXZ1kc";
      const rapidUrl = await fetchRapidApiStreamUrl(testId, testUrl);
      results.tests.rapidApiLive = {
        success: true,
        streamUrl: rapidUrl ? rapidUrl.slice(0, 80) + "..." : null,
      };
    } catch (e) {
      results.tests.rapidApiLive = {
        success: false,
        error: e.message,
        status: e.response?.status,
        data: e.response?.data,
      };
    }
  }

  results.buildVersion = "hybrid-v5";
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
