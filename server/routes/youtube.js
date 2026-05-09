const express = require("express");
const { spawn } = require("child_process");

const router = express.Router();

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

function buildEmbedUrl(url) {
  const id = extractYouTubeId(url);
  return id ? `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1` : "";
}

function formatDuration(seconds) {
  const total = Math.floor(seconds || 0);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

function getYtDlpPath() {
  return process.env.YTDLP_PATH || "yt-dlp";
}

router.get("/info", async (req, res) => {
  const { url } = req.query;
  if (!url || !isValidYouTubeUrl(url)) return res.status(400).json({ error: "Invalid YouTube URL" });

  const args = ["--no-playlist", "--print", "%(title)s|||%(duration)s|||%(thumbnail)s", "--no-download", url];
  let stdout = "", stderr = "", responded = false;

  const proc = spawn(getYtDlpPath(), args, { windowsHide: true });

  proc.stdout.on("data", (d) => { stdout += d.toString(); });
  proc.stderr.on("data", (d) => { stderr += d.toString(); });

  proc.on("close", (code) => {
    if (responded) return;
    responded = true;

    if (code !== 0) {
      return res.status(400).json({
        error: "Could not fetch video info.",
        details: stderr.slice(0, 300)
      });
    }

    const [title = "Unknown", duration = "0", thumbnail = ""] = stdout.trim().split("|||");
    return res.json({
      title: title.trim(),
      duration: parseInt(duration, 10) || 0,
      thumbnail: thumbnail.trim(),
      videoId: extractYouTubeId(url),
      embedUrl: buildEmbedUrl(url)
    });
  });

  proc.on("error", (err) => {
    if (responded) return;
    responded = true;
    return res.status(500).json({ error: "yt-dlp not found or failed.", details: err.message });
  });
});

router.post("/fetch", async (req, res) => {
  const { url } = req.body || {};
  if (!url || !isValidYouTubeUrl(url)) return res.status(400).json({ error: "Invalid YouTube URL" });

  const args = ["--no-playlist", "--print", "%(title)s|||%(duration)s|||%(thumbnail)s", "--no-download", url];
  let stdout = "", stderr = "", responded = false;

  const proc = spawn(getYtDlpPath(), args, { windowsHide: true });

  proc.stdout.on("data", (d) => { stdout += d.toString(); });
  proc.stderr.on("data", (d) => { stderr += d.toString(); });

  proc.on("close", (code) => {
    if (responded) return;
    responded = true;

    if (code !== 0) {
      return res.status(400).json({
        error: "Could not import YouTube preview.",
        details: stderr.slice(0, 300)
      });
    }

    const [title = "Unknown", duration = "0", thumbnail = ""] = stdout.trim().split("|||");
    const videoId = extractYouTubeId(url);
    const embedUrl = buildEmbedUrl(url);

    if (!videoId || !embedUrl) {
      return res.status(400).json({ error: "Could not prepare YouTube preview." });
    }

    const parsedDuration = parseInt(duration, 10) || 0;

    return res.json({
      success: true,
      message: "Preview imported successfully.",
      project: {
        id: `yt_${Date.now()}`,
        source: "youtube",
        sourceType: "youtube",
        sourceUrl: url,
        originalName: title.trim() || "YouTube Video",
        fileName: "",
        filePath: "",
        mimeType: "video/youtube",
        size: 0,
        duration: parsedDuration,
        thumbnail: thumbnail.trim(),
        videoId,
        embedUrl,
        metaText: `${formatDuration(parsedDuration)} • YouTube import ready`,
        createdAt: new Date().toISOString()
      }
    });
  });

  proc.on("error", (err) => {
    if (responded) return;
    responded = true;
    return res.status(500).json({ error: "yt-dlp not found or failed.", details: err.message });
  });
});

module.exports = router;