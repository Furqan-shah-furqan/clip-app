const fs = require("fs");
const path = require("path");
const { exportsDir, uploadsDir, captionsDir, subtitlesDir, rootDir } = require("./paths");

const rendersDir = path.join(rootDir, "public", "renders");
if (!fs.existsSync(rendersDir)) {
  try {
    fs.mkdirSync(rendersDir, { recursive: true });
  } catch (_) {}
}

/**
 * Resolves a requested video filename to its absolute path on disk.
 * Checks public/renders, exports, uploads, captions, and index-based aliases (clip-0.mp4).
 * @param {string} filename
 * @returns {string|null}
 */
function resolveVideoPath(filename) {
  const raw = String(filename || "").trim();
  if (!raw) return null;
  const safeName = path.basename(decodeURIComponent(raw));

  const candidates = [
    path.join(__dirname, "../../public/renders", safeName),
    path.join(rendersDir, safeName),
    path.join(exportsDir, safeName),
    path.join(uploadsDir, safeName),
    path.join(captionsDir, safeName),
    typeof subtitlesDir !== "undefined" && subtitlesDir ? path.join(subtitlesDir, safeName) : null,
    path.join(rootDir, "exports", safeName),
    path.join(rootDir, "uploads", safeName),
    path.join(rootDir, safeName),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // Handle clip-0.mp4 / clip_0.mp4 / index-based lookup
  const match = safeName.match(/^clip[_-]?(\d+)\.mp4$/i);
  if (match) {
    const idx = parseInt(match[1], 10);
    // Check renders dir first
    const indexedRender = path.join(rendersDir, `clip-${idx}.mp4`);
    if (fs.existsSync(indexedRender)) return indexedRender;

    // Check exports directory for sorted mp4 files
    if (fs.existsSync(exportsDir)) {
      try {
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
        if (files[idx]) {
          return path.join(exportsDir, files[idx]);
        }
        if (files.length > 0) {
          return path.join(exportsDir, files[0]);
        }
      } catch (_) {}
    }
  }

  return null;
}

/**
 * Streams an MP4 video file using HTTP 206 Partial Content (Byte-Range Streaming).
 * Enables seamless seeking, video scrubbing, and prevents net::ERR_TIMED_OUT on cloud reverse proxies.
 * @param {string} filePath
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
function streamVideoFile(filePath, req, res) {
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).send("Clip not found");
  }

  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch (err) {
    console.error("Error reading file stat:", err);
    return res.status(500).send("Could not access video file");
  }

  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (isNaN(start) || start >= fileSize || (parts[1] && end < start)) {
      res.writeHead(416, {
        "Content-Range": `bytes */${fileSize}`,
        "Accept-Ranges": "bytes",
      });
      return res.end();
    }

    const chunksize = end - start + 1;
    const file = fs.createReadStream(filePath, { start, end });
    const head = {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunksize,
      "Content-Type": "video/mp4",
      "Cache-Control": "public, max-age=3600",
    };

    res.writeHead(206, head);
    file.on("error", (err) => {
      console.error("Video stream error (range):", err.message);
      if (!res.headersSent) res.status(500).end();
    });
    file.pipe(res);
  } else {
    const head = {
      "Content-Length": fileSize,
      "Content-Type": "video/mp4",
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=3600",
    };

    res.writeHead(200, head);
    const file = fs.createReadStream(filePath);
    file.on("error", (err) => {
      console.error("Video stream error (full):", err.message);
      if (!res.headersSent) res.status(500).end();
    });
    file.pipe(res);
  }
}

module.exports = {
  rendersDir,
  resolveVideoPath,
  streamVideoFile,
};
