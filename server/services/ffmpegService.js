const ffmpeg = require("fluent-ffmpeg");
const path = require("path");
const fs = require("fs");
const { exportsDir } = require("../utils/paths");

function hexToABGR(hex = "#ffffff", opacity = 100) {
  const clean = hex.replace("#", "").padEnd(6, "0");
  const r = clean.slice(0, 2);
  const g = clean.slice(2, 4);
  const b = clean.slice(4, 6);
  const alpha = Math.round((1 - opacity / 100) * 255)
    .toString(16)
    .padStart(2, "0");
  return `&H${alpha}${b}${g}${r}`.toUpperCase();
}

function parseTimeToSeconds(time) {
  if (!time) return 0;
  const parts = time.split(":").map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

function getCropFilter(aspectRatio) {
  switch (aspectRatio) {
    case "9:16":
      return [
        "scale=-2:1920",
        "crop=1080:1920:(in_w-1080)/2:max(0,(in_h-1920)*0.18)",
      ].join(",");
    case "1:1":
      return [
        "scale=1080:-2",
        "crop=1080:1080:(in_w-1080)/2:max(0,(in_h-1080)*0.12)",
      ].join(",");
    case "16:9":
    default:
      return [
        "scale=1280:-2",
        "crop=1280:720:(in_w-1280)/2:max(0,(in_h-720)*0.08)",
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
        "-movflags +faststart",
      ])
      .on("end", () => resolve({ fileName, outputPath }))
      .on("error", (err) => reject(err))
      .save(outputPath);
  });
}

function buildAssContent(segments, style) {
  const fontSize = Math.round(Number(style.fontSize) || 28);
  const fontName = (style.fontFamily || "Arial")
    .replace(/['"]/g, "")
    .split(",")[0]
    .trim();
  const bold = Number(style.fontWeight) >= 700 ? 1 : 0;

  // Convert colors
  const primaryColor = hexToABGR(style.textColor || "#ffffff", 100);
  const backColor = hexToABGR(
    style.bgColor || "#000000",
    style.bgOpacity ?? 70,
  );
  const shadowColor = hexToABGR(style.shadowColor || "#000000", 80);

  // Position: bottom=2, center=5, top=8
  const alignment =
    style.position === "top" ? 8 : style.position === "center" ? 5 : 2;

  const marginV = style.position === "top" ? 60 : 40;

  const outline = style.textShadow ? 2 : 0;
  const shadow = style.textShadow ? 1 : 0;

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${style.exportVideoWidth || 1080}
PlayResY: ${style.exportVideoHeight || 1920}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${fontSize},${primaryColor},${primaryColor},${shadowColor},${backColor},${bold},0,0,0,100,100,${Number(style.letterSpacing) || 0},0,3,${outline},${shadow},${alignment},20,20,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  function toAssTime(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const cs = Math.round((sec % 1) * 100);
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
  }

  const events = segments
    .map((seg) => {
      const text = String(seg.text || "").replace(/\n/g, "\\N");
      return `Dialogue: 0,${toAssTime(seg.start)},${toAssTime(seg.end)},Default,,0,0,0,,${text}`;
    })
    .join("\n");

  return header + events;
}

function burnSubtitles({ inputPath, segments, style }) {
  return new Promise((resolve, reject) => {
    if (!segments || !segments.length) {
      return reject(new Error("No segments to burn"));
    }

    const fileName = `captioned_${Date.now()}.mp4`;
    const outputPath = path.join(exportsDir, fileName);
    const assPath = path.join(exportsDir, `subs_${Date.now()}.ass`);

    // Write ASS subtitle file
    const assContent = buildAssContent(segments, style || {});
    fs.writeFileSync(assPath, assContent, "utf8");

    const safeAssPath = assPath.replace(/\\/g, "/").replace(/:/g, "\\:");

    ffmpeg(inputPath)
      .videoFilters(`ass='${safeAssPath}'`)
      .outputOptions([
        "-preset ultrafast",
        "-crf 23",
        "-c:v libx264",
        "-c:a aac",
        "-movflags +faststart",
      ])
      .on("end", () => {
        // Cleanup temp ASS file
        try {
          fs.unlinkSync(assPath);
        } catch {}
        resolve({ fileName, outputPath });
      })
      .on("error", (err) => {
        try {
          fs.unlinkSync(assPath);
        } catch {}
        reject(err);
      })
      .save(outputPath);
  });
}

function suggestMoments() {
  return [
    { start: "00:00:00", end: "00:00:30", note: "Strong intro clip" },
    { start: "00:00:30", end: "00:01:00", note: "Second engaging segment" },
    { start: "00:01:00", end: "00:01:30", note: "Good hook-worthy part" },
  ];
}

module.exports = { generateClip, burnSubtitles, suggestMoments };
