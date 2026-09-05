const express = require("express");
const axios = require("axios");
const router = express.Router();

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

function isValidYouTubeUrl(url) {
  return /^https?:\/\/(www\.)?(youtube\.com\/(watch\?|shorts\/|live\/)|youtu\.be\/)/.test(url);
}

function buildEmbedUrl(id) {
  return id ? `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1` : "";
}

function parseDuration(iso) {
  const match = (iso || "").match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  return (parseInt(match[1] || 0) * 3600) + (parseInt(match[2] || 0) * 60) + parseInt(match[3] || 0);
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

async function fetchYouTubeMeta(videoId) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error("YOUTUBE_API_KEY not set");

  const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${videoId}&key=${apiKey}`;

  try {
    const { data } = await axios.get(apiUrl);

    console.log("YouTube videoId:", videoId);
    console.log("YouTube API response:", JSON.stringify(data, null, 2));

    const item = data.items?.[0];

    if (!item) {
      throw new Error(
        "Video not found. The video may be private, deleted, region blocked, or the URL video ID is unavailable."
      );
    }

    const title = item.snippet.title;
    const thumbnail =
      item.snippet.thumbnails?.maxres?.url ||
      item.snippet.thumbnails?.high?.url ||
      item.snippet.thumbnails?.medium?.url ||
      item.snippet.thumbnails?.default?.url ||
      "";

    const duration = parseDuration(item.contentDetails.duration);

    const canonicalVideoId = item.id || videoId;
    return { title, thumbnail, duration, canonicalVideoId };
  } catch (err) {
    if (err.response?.data?.error?.message) {
      throw new Error(err.response.data.error.message);
    }

    throw err;
  }
}

router.get("/info", async (req, res) => {
  const { url } = req.query;
  if (!url || !isValidYouTubeUrl(url)) return res.status(400).json({ error: "Invalid YouTube URL" });

  try {
    const videoId = extractYouTubeId(url);
    if (!videoId) return res.status(400).json({ error: "Could not extract video ID" });

    const { title, thumbnail, duration, canonicalVideoId } = await fetchYouTubeMeta(videoId);
    const resolvedId = canonicalVideoId || videoId;

    return res.json({
      title,
      duration,
      thumbnail,
      videoId: resolvedId,
      canonicalUrl: `https://www.youtube.com/watch?v=${resolvedId}`,
      embedUrl: buildEmbedUrl(resolvedId)
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post("/fetch", async (req, res) => {
  const { url } = req.body || {};
  if (!url || !isValidYouTubeUrl(url)) return res.status(400).json({ error: "Invalid YouTube URL" });

  try {
    const videoId = extractYouTubeId(url);
    if (!videoId) return res.status(400).json({ error: "Could not extract video ID" });

    const { title, thumbnail, duration, canonicalVideoId } = await fetchYouTubeMeta(videoId);
    const resolvedId = canonicalVideoId || videoId;
    const embedUrl = buildEmbedUrl(resolvedId);
    const canonicalUrl = `https://www.youtube.com/watch?v=${resolvedId}`;

    return res.json({
      success: true,
      message: "Preview imported successfully.",
      project: {
        id: `yt_${Date.now()}`,
        source: "youtube",
        sourceType: "youtube",
        sourceUrl: canonicalUrl,
        originalName: title || "YouTube Video",
        fileName: "",
        filePath: "",
        mimeType: "video/youtube",
        size: 0,
        duration,
        thumbnail,
        videoId: resolvedId,
        embedUrl,
        metaText: `${formatDuration(duration)} • YouTube import ready`,
        createdAt: new Date().toISOString()
      }
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;