/**
 * YouTube Downloader Service — ClipFlow Studio
 * 
 * Architecture:
 * 1. Primary Strategy: yt-dlp CLI with Residential Proxy routing (--proxy) and Android player
 *    client spoofing (--extractor-args "youtube:player_client=android"). Bypasses datacenter
 *    IP blocks and Botguard challenges. Supports modern PO-Tokens and OAuth2.
 * 2. Secondary Strategy: Serverless / 3rd-Party Extraction API Fallback. If yt-dlp fails due to
 *    bot challenge or memory limits, requests unblocked direct progressive MP4 stream links via
 *    Cobalt API, RapidAPI, or Invidious, streaming directly to disk via Axios.
 * 3. Single-Pass Local Processing: Downloads the source MP4 exactly once to Render's ephemeral
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
 * Returns residential proxy URL if configured in environment variables.
 * Supported variables: YTDLP_PROXY, PROXY_URL, HTTPS_PROXY, HTTP_PROXY
 * Format: http://username:password@proxy-ip:port or socks5://...
 */
function getProxyUrl() {
  const proxy = process.env.YTDLP_PROXY || process.env.PROXY_URL || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || "";
  return proxy.trim() || null;
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
 * Displays progress in Render dashboard and validates minimum file size.
 */
async function streamRemoteVideoToFile(streamUrl, targetFilePath, options = {}) {
  const timeoutMs = options.timeoutMs || 300000;
  console.log(`[YouTube-Downloader] Starting direct stream download to ${path.basename(targetFilePath)}...`);

  const response = await axios({
    method: "GET",
    url: streamUrl,
    responseType: "stream",
    timeout: timeoutMs,
    maxRedirects: 5,
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      ...(options.headers || {}),
    },
  });

  const totalBytes = Number(response.headers["content-length"]) || 0;
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
      console.log(`[YouTube-Downloader] Streaming progress: ${(downloadedBytes / (1024 * 1024)).toFixed(1)} MB${progressStr}`);
    }
  });

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

  console.log(`[YouTube-Downloader] Successfully streamed video: ${(stat.size / (1024 * 1024)).toFixed(2)} MB to ${path.basename(targetFilePath)}`);
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

  // Multi-tier client configurations
  const clientStrategies = [
    { client: "youtube:player_client=android", withCookies: false, label: "Android client (no cookies)" },
    { client: "youtube:player_client=android", withCookies: true, label: "Android client + cookies" },
    { client: "youtube:player_client=android,web", withCookies: true, label: "Android+Web client + cookies" },
    { client: "youtube:player_client=ios", withCookies: false, label: "iOS client (no cookies)" },
    { client: "youtube:player_client=ios,android", withCookies: true, label: "iOS+Android client + cookies" },
  ];

  const strategyErrors = [];

  for (const strategy of clientStrategies) {
    const useCookies = strategy.withCookies && Boolean(effectiveCookies);

    // Build arguments
    const args = [
      "--no-playlist",
      "--no-check-certificates",
      "--no-warnings",
      "--extractor-args", strategy.client,
      ...poTokenArgs,
      ...(proxyUrl ? ["--proxy", proxyUrl] : []),
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

    console.log(`[YouTube-Downloader] Trying ${strategy.label} [Proxy: ${maskProxyUrl(proxyUrl)}]`);

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

// ── Strategy 2: Serverless / 3rd-Party Extraction API Fallback ────────────────

/**
 * Provider A: Cobalt API
 * Open-source, high-performance extraction API (self-hosted or public instances).
 */
async function fetchCobaltStreamUrl(targetUrl) {
  const instances = [
    process.env.COBALT_API_URL,
    "https://api.cobalt.tools/",
    "https://co.wuk.sh/",
  ].filter(Boolean);

  for (const baseUrl of instances) {
    try {
      const cleanBase = baseUrl.replace(/\/+$/, "");
      console.log(`[YouTube-Downloader] [Fallback] Querying Cobalt API at ${cleanBase}...`);

      const res = await axios.post(
        `${cleanBase}/`,
        {
          url: targetUrl,
          videoQuality: "720",
          youtubeVideoCodec: "h264",
        },
        {
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            ...(process.env.COBALT_API_KEY ? { Authorization: `Bearer ${process.env.COBALT_API_KEY}` } : {}),
          },
          timeout: 20000,
        }
      );

      const data = res.data;
      if (data) {
        if (data.status === "tunnel" || data.status === "redirect" || data.status === "stream") {
          if (data.url) return data.url;
        }
        if (data.url) return data.url;
      }
    } catch (err) {
      console.warn(`[YouTube-Downloader] Cobalt API (${baseUrl}) failed:`, err.response?.data || err.message);
    }
  }
  return null;
}

/**
 * Provider B: RapidAPI YouTube Downloader
 * Enterprise-grade cloud scraper that returns unblocked googlevideo.com MP4 links.
 */
async function fetchRapidApiStreamUrl(videoId, targetUrl) {
  const rapidApiKey = process.env.RAPIDAPI_KEY;
  if (!rapidApiKey) return null;

  const rapidApiHost = process.env.RAPIDAPI_HOST || "ytstream-download-youtube-videos.p.rapidapi.com";
  const customUrl = process.env.RAPIDAPI_URL;

  console.log(`[YouTube-Downloader] [Fallback] Querying RapidAPI (${rapidApiHost})...`);

  try {
    let endpoint = customUrl || `https://${rapidApiHost}/dl?id=${videoId}`;
    const res = await axios.get(endpoint, {
      headers: {
        "x-rapidapi-key": rapidApiKey,
        "x-rapidapi-host": rapidApiHost,
      },
      timeout: 25000,
    });

    const data = res.data;
    if (!data) return null;

    // Direct link formats
    if (data.link) return data.link;
    if (data.downloadUrl) return data.downloadUrl;
    if (data.url) return data.url;

    // Formats array format
    if (Array.isArray(data.formats)) {
      // Find 720p or 360p progressive MP4
      const progressive = data.formats.filter((f) => f.url && (f.hasAudio !== false) && (f.mimeType?.includes("mp4") || f.ext === "mp4"));
      if (progressive.length) {
        // Sort highest quality first
        progressive.sort((a, b) => (Number(b.height) || 0) - (Number(a.height) || 0));
        return progressive[0].url;
      }
      if (data.formats[0]?.url) return data.formats[0].url;
    }

    // Adaptive or other formats format
    if (Array.isArray(data.adaptiveFormats)) {
      const mp4s = data.adaptiveFormats.filter((f) => f.url && f.mimeType?.includes("mp4"));
      if (mp4s.length) return mp4s[0].url;
    }
  } catch (err) {
    console.warn("[YouTube-Downloader] RapidAPI download failed:", err.response?.data || err.message);
  }

  return null;
}

/**
 * Provider C: Invidious Public Video Stream Extractor
 * Queries public Invidious instances for progressive format streams.
 */
async function fetchInvidiousStreamUrl(videoId) {
  const instances = [
    process.env.INVIDIOUS_API_URL,
    "https://invidious.privacydev.net",
    "https://vid.puffyan.us",
    "https://inv.nadeko.net",
  ].filter(Boolean);

  for (const base of instances) {
    try {
      const cleanBase = base.replace(/\/+$/, "");
      console.log(`[YouTube-Downloader] [Fallback] Querying Invidious instance ${cleanBase}...`);

      const res = await axios.get(`${cleanBase}/api/v1/videos/${videoId}`, {
        timeout: 15000,
      });

      const streams = res.data?.formatStreams;
      if (Array.isArray(streams) && streams.length > 0) {
        // Find 720p or 360p mp4
        const mp4Stream = streams.find((s) => s.container === "mp4" && s.resolution === "720p") ||
          streams.find((s) => s.container === "mp4") ||
          streams[0];
        if (mp4Stream?.url) return mp4Stream.url;
      }
    } catch (err) {
      console.warn(`[YouTube-Downloader] Invidious (${base}) failed:`, err.message);
    }
  }
  return null;
}

/**
 * Provider D: Custom Webhook / Serverless API Fallback
 * User-configurable microservice / Cloudflare worker.
 */
async function fetchCustomWebhookStreamUrl(targetUrl, videoId) {
  const customEndpoint = process.env.CUSTOM_YOUTUBE_API_URL;
  if (!customEndpoint) return null;

  try {
    console.log(`[YouTube-Downloader] [Fallback] Querying Custom Extractor Webhook...`);
    const res = await axios.get(customEndpoint, {
      params: { url: targetUrl, id: videoId },
      timeout: 25000,
    });
    return res.data?.downloadUrl || res.data?.streamUrl || res.data?.url || null;
  } catch (err) {
    console.warn("[YouTube-Downloader] Custom Webhook failed:", err.message);
    return null;
  }
}

/**
 * Executes the Secondary Strategy: queries external extraction providers and
 * directly streams the unblocked MP4 to the local target path.
 */
async function downloadViaExternalApiFallback({ targetUrl, videoId, targetPath }) {
  console.log(`[YouTube-Downloader] [Tier 2: Serverless API Fallback] Triggered for video ${videoId || targetUrl}`);

  // Provider 1: Cobalt API
  try {
    const cobaltUrl = await fetchCobaltStreamUrl(targetUrl);
    if (cobaltUrl) {
      console.log("[YouTube-Downloader] Resolved direct stream URL from Cobalt API!");
      return await streamRemoteVideoToFile(cobaltUrl, targetPath);
    }
  } catch (e) {
    console.warn("[YouTube-Downloader] Cobalt fallback error:", e.message);
  }

  // Provider 2: RapidAPI (if key provided)
  if (process.env.RAPIDAPI_KEY) {
    try {
      const rapidApiUrl = await fetchRapidApiStreamUrl(videoId, targetUrl);
      if (rapidApiUrl) {
        console.log("[YouTube-Downloader] Resolved direct stream URL from RapidAPI!");
        return await streamRemoteVideoToFile(rapidApiUrl, targetPath);
      }
    } catch (e) {
      console.warn("[YouTube-Downloader] RapidAPI fallback error:", e.message);
    }
  }

  // Provider 3: Custom Webhook (if provided)
  if (process.env.CUSTOM_YOUTUBE_API_URL) {
    try {
      const customUrl = await fetchCustomWebhookStreamUrl(targetUrl, videoId);
      if (customUrl) {
        console.log("[YouTube-Downloader] Resolved direct stream URL from Custom Webhook!");
        return await streamRemoteVideoToFile(customUrl, targetPath);
      }
    } catch (e) {
      console.warn("[YouTube-Downloader] Custom Webhook fallback error:", e.message);
    }
  }

  // Provider 4: Invidious Instances
  if (videoId) {
    try {
      const invidiousUrl = await fetchInvidiousStreamUrl(videoId);
      if (invidiousUrl) {
        console.log("[YouTube-Downloader] Resolved direct stream URL from Invidious instance!");
        return await streamRemoteVideoToFile(invidiousUrl, targetPath);
      }
    } catch (e) {
      console.warn("[YouTube-Downloader] Invidious fallback error:", e.message);
    }
  }

  throw new Error("All external API fallback extraction providers failed or returned no streamable MP4 URL.");
}

// ── Master High-Level Downloader ─────────────────────────────────────────────

/**
 * Downloads the YouTube source video to local ephemeral storage exactly once.
 * Cascades:
 *   1. yt-dlp with Residential Proxy + Android Client Spoofing + PO-Token
 *   2. Serverless API Fallback (Cobalt / RapidAPI / Invidious) -> Direct Axios Stream to Disk
 * 
 * Returns the absolute path of the downloaded source MP4 file.
 */
async function downloadYouTubeSourceVideo({ sourceUrl }) {
  if (!sourceUrl || !isValidYouTubeUrl(sourceUrl)) {
    throw new Error("A valid YouTube source URL is required.");
  }

  // Run routine cleanup of any stale source files older than 15 minutes
  cleanupStaleSourceVideos();

  const videoId = extractYouTubeId(sourceUrl);
  const targetUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : sourceUrl;
  const clipStamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const outputTemplate = path.join(uploadsDir, `yt_source_${clipStamp}.%(ext)s`);
  const finalMp4Target = path.join(uploadsDir, `yt_source_${clipStamp}.mp4`);

  console.log(`[YouTube-Downloader] Initiating download for YouTube video: ${targetUrl}`);

  // Tier 1: yt-dlp with Residential Proxy
  let ytDlpError = null;
  try {
    const downloadedPath = await downloadViaYtDlp({ targetUrl, clipStamp, outputTemplate });
    if (downloadedPath && fs.existsSync(downloadedPath)) {
      console.log(`[YouTube-Downloader] Source MP4 ready via yt-dlp: ${downloadedPath}`);
      return downloadedPath;
    }
  } catch (err) {
    ytDlpError = err;
    console.warn(`[YouTube-Downloader] Primary yt-dlp strategy failed. Switching to Tier 2 Serverless API Fallback. Error: ${err.message}`);
  }

  // Tier 2: Serverless Extraction API Fallback
  try {
    const fallbackPath = await downloadViaExternalApiFallback({
      targetUrl,
      videoId,
      targetPath: finalMp4Target,
    });

    if (fallbackPath && fs.existsSync(fallbackPath)) {
      console.log(`[YouTube-Downloader] Source MP4 ready via Serverless API Fallback: ${fallbackPath}`);
      return fallbackPath;
    }
  } catch (apiErr) {
    console.error(`[YouTube-Downloader] Serverless API Fallback also failed: ${apiErr.message}`);
    const compositeError = new Error(
      `YouTube download failed across all strategies.\n` +
      `Primary Strategy (yt-dlp): ${ytDlpError?.message || "Unknown error"}\n` +
      `Secondary Strategy (API Fallback): ${apiErr.message}`
    );
    throw compositeError;
  }

  throw new Error("Failed to download YouTube video: no file was created on disk.");
}

/**
 * Downloads a specific section of a YouTube video by downloading the full source
 * once and cutting with local FFmpeg, immediately deleting the full source video
 * to prevent disk exhaustion.
 */
async function downloadYouTubeSection({ sourceUrl, startSec, endSec, index = 0 }) {
  const safeStart = Math.max(0, Number(startSec) || 0);
  const safeEnd = Math.max(safeStart + 8, Number(endSec) || safeStart + 30);
  const clipStamp = `${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`;
  const cutMp4 = path.join(uploadsDir, `yt_smart_section_${clipStamp}.mp4`);

  console.log(`[YouTube-Downloader] Downloading section ${safeStart}s - ${safeEnd}s from ${sourceUrl}`);

  // Download whole source video once using the resilient hybrid downloader
  const sourceMp4 = await downloadYouTubeSourceVideo({ sourceUrl });

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
      console.log(`[YouTube-Downloader] Section cut successful: ${cutMp4}`);
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
    cobaltConfigured: Boolean(process.env.COBALT_API_URL),
    customApiConfigured: Boolean(process.env.CUSTOM_YOUTUBE_API_URL),
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

  // Test 3: Cobalt availability
  try {
    const cobaltBase = (process.env.COBALT_API_URL || "https://api.cobalt.tools/").replace(/\/+$/, "");
    const cobaltCheck = await axios.get(cobaltBase, { timeout: 6000 });
    results.tests.cobaltStatus = `HTTP ${cobaltCheck.status}`;
  } catch (e) {
    results.tests.cobaltStatus = e.response ? `HTTP ${e.response.status}` : e.message;
  }

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
  downloadViaExternalApiFallback,
  downloadYouTubeSourceVideo,
  downloadYouTubeSection,
  getDownloaderDiagnostics,
};
