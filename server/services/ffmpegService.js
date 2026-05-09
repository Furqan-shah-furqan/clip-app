const ffmpeg = require("fluent-ffmpeg");
const path = require("path");
const { exportsDir } = require("../utils/paths");

function parseTimeToSeconds(time) {
  if (!time) return 0;
  const parts = time.split(":").map(Number);

  if (parts.length === 2) {
    const [mm, ss] = parts;
    return mm * 60 + ss;
  }

  if (parts.length === 3) {
    const [hh, mm, ss] = parts;
    return hh * 3600 + mm * 60 + ss;
  }

  return 0;
}

function getCropFilter(aspectRatio) {
  switch (aspectRatio) {
    case "9:16":
      return [
        "scale=-2:1920",
        "crop=1080:1920:(in_w-1080)/2:max(0,(in_h-1920)*0.18)"
      ].join(",");

    case "1:1":
      return [
        "scale=1080:-2",
        "crop=1080:1080:(in_w-1080)/2:max(0,(in_h-1080)*0.12)"
      ].join(",");

    case "16:9":
    default:
      return [
        "scale=1280:-2",
        "crop=1280:720:(in_w-1280)/2:max(0,(in_h-720)*0.08)"
      ].join(",");
  }
}

function generateClip({ inputPath, startTime, endTime, aspectRatio }) {
  return new Promise((resolve, reject) => {
    const startSeconds = parseTimeToSeconds(startTime);
    const endSeconds = parseTimeToSeconds(endTime);
    const duration = Math.max(endSeconds - startSeconds, 1);

    const fileName = `clip_${Date.now()}.mp4`;
    const outputPath = path.join(exportsDir, fileName);

    ffmpeg(inputPath)
      .setStartTime(startSeconds)
      .setDuration(duration)
      .videoFilters(getCropFilter(aspectRatio))
      .outputOptions([
        "-preset ultrafast",
        "-crf 23",
        "-c:v libx264",
        "-c:a aac",
        "-movflags +faststart"
      ])
      .on("start", (commandLine) => {
        console.log("FFMPEG START:", commandLine);
      })
      .on("end", () => {
        resolve({
          fileName,
          outputPath
        });
      })
      .on("error", (err) => {
        console.error("FFMPEG ERROR:", err.message);
        reject(err);
      })
      .save(outputPath);
  });
}

function burnSubtitles({ inputPath, subtitlePath, style }) {
  return new Promise((resolve, reject) => {
    const fileName = `captioned_${Date.now()}.mp4`;
    const outputPath = path.join(exportsDir, fileName);

    const forceStyle = [
      `FontName=${style.fontName || "Arial"}`,
      `FontSize=${style.fontSize || 24}`,
      `PrimaryColour=&H${style.primaryColour || "FFFFFF"}`,
      `OutlineColour=&H${style.outlineColour || "000000"}`,
      `BackColour=&H${style.backColour || "000000"}`,
      `Bold=${style.bold ? 1 : 0}`,
      `Alignment=${style.alignment || 2}`,
      `Outline=${style.outline || 2}`,
      `Shadow=${style.shadow || 1}`,
      `MarginV=${style.marginV || 40}`
    ].join(",");

    const safeSubtitlePath = subtitlePath.replace(/\\/g, "/").replace(/:/g, "\\:");

    ffmpeg(inputPath)
      .videoFilters(`subtitles='${safeSubtitlePath}':force_style='${forceStyle}'`)
      .outputOptions([
        "-preset ultrafast",
        "-crf 23",
        "-c:v libx264",
        "-c:a aac",
        "-movflags +faststart"
      ])
      .on("end", () => {
        resolve({
          fileName,
          outputPath
        });
      })
      .on("error", (err) => {
        reject(err);
      })
      .save(outputPath);
  });
}

function suggestMoments() {
  return [
    { start: "00:00:00", end: "00:00:30", note: "Strong intro clip" },
    { start: "00:00:30", end: "00:01:00", note: "Second engaging segment" },
    { start: "00:01:00", end: "00:01:30", note: "Good hook-worthy part" }
  ];
}

module.exports = {
  generateClip,
  burnSubtitles,
  suggestMoments
};