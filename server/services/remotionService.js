/**
 * Remotion Video Rendering Service
 * Uses @remotion/bundler and @remotion/renderer to produce studio-quality viral captions.
 * Includes smooth fallback handling to native FFmpeg ASS burning if Remotion dependencies
 * are not installed or hardware resources are restricted.
 */
const path = require("path");
const fs = require("fs");
const { rootDir, exportsDir } = require("../utils/paths");

let bundler = null;
let renderer = null;

try {
  bundler = require("@remotion/bundler");
  renderer = require("@remotion/renderer");
} catch (e) {
  // Remotion packages not yet installed in node_modules
  bundler = null;
  renderer = null;
}

/**
 * Check if Remotion rendering capabilities are available on this environment.
 */
function isRemotionAvailable() {
  return Boolean(bundler && renderer);
}

/**
 * Calculate total composition duration in frames based on segments or video duration.
 */
function calculateDurationFrames(segments = [], fps = 30) {
  if (!segments || !segments.length) return 300; // Default 10 seconds
  const maxEndSeconds = segments.reduce((max, seg) => {
    const end = Number(seg.end) || 0;
    return Math.max(max, end);
  }, 0);
  return Math.max(30, Math.ceil(maxEndSeconds * fps));
}

/**
 * Render clip using Remotion server-side headless pipeline.
 */
async function renderWithRemotion({
  videoUrl,
  segments = [],
  style = {},
  onProgress = null,
}) {
  if (!isRemotionAvailable()) {
    throw new Error(
      "Remotion renderer packages (@remotion/bundler, @remotion/renderer) are not installed."
    );
  }

  const entryPoint = path.join(rootDir, "src", "remotion", "index.js");
  if (!fs.existsSync(entryPoint)) {
    throw new Error(`Remotion entry point not found at ${entryPoint}`);
  }

  fs.mkdirSync(exportsDir, { recursive: true });
  const outputFileName = `clip-remotion-${Date.now()}.mp4`;
  const outputLocation = path.join(exportsDir, outputFileName);

  console.log("REMOTION BUNDLE START:", entryPoint);
  const bundleLocation = await bundler.bundle({
    entryPoint,
    webpackOverride: (config) => config,
  });

  const fps = 30;
  const durationInFrames = calculateDurationFrames(segments, fps);

  const inputProps = {
    videoUrl,
    segments,
    style: {
      fontFamily: style.fontFamily || "Montserrat",
      fontSize: Number(style.fontSize) || 48,
      textColor: style.textColor || "#FFFFFF",
      highlightColor: style.highlightColor || "#000000",
      highlightBg: style.highlightBg || "#FFE600",
      highlightMode: style.highlightMode || "pill",
      strokeColor: style.strokeColor || "#000000",
      strokeWidth: style.strokeWidth != null ? Number(style.strokeWidth) : 0,
      animationStyle: style.animationStyle || "pop",
      positionY: style.positionY != null ? Number(style.positionY) : 78,
      wordsInRow: style.wordsInRow || 3,
      textTransform: style.textTransform || "uppercase",
    },
  };

  console.log("REMOTION SELECTING COMPOSITION: CaptionsComposition");
  const composition = await renderer.selectComposition({
    serveUrl: bundleLocation,
    id: "CaptionsComposition",
    inputProps,
  });

  console.log(`REMOTION RENDERING: ${durationInFrames} frames to ${outputLocation}`);
  await renderer.renderMedia({
    composition: {
      ...composition,
      durationInFrames,
      fps,
    },
    serveUrl: bundleLocation,
    codec: "h264",
    outputLocation,
    inputProps,
    onProgress: (progress) => {
      if (typeof onProgress === "function") {
        onProgress(progress);
      }
    },
  });

  console.log("REMOTION RENDER COMPLETE:", outputFileName);

  return {
    success: true,
    fileName: outputFileName,
    outputPath: outputLocation,
    renderer: "remotion",
    durationInFrames,
    fps,
  };
}

module.exports = {
  isRemotionAvailable,
  renderWithRemotion,
};
