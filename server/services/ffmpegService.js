const ffmpeg = require("fluent-ffmpeg");
const path = require("path");
const fs = require("fs");
const { exportsDir } = require("../utils/paths");

function hexToABGR(hex = "#000000", opacityPercent = 100) {
  const clean = (hex || "#000000").replace("#", "").padEnd(6, "0");
  const r = clean.slice(0, 2);
  const g = clean.slice(2, 4);
  const b = clean.slice(4, 6);
  // ASS alpha: 00 = fully opaque, FF = fully transparent
  const alpha = Math.round((1 - Math.min(opacityPercent, 100) / 100) * 255)
    .toString(16).padStart(2, "0").toUpperCase();
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
    .replace(/['"]/g, "").split(",")[0].trim();
  const bold = Number(style.fontWeight) >= 700 ? -1 : 0;
  const textTransform = style.textTransform || "none";
  const animStyle = style.animationStyle || style.sourceAnimationStyle || "none";
  const videoW = style.exportVideoWidth || style.playResX || 1080;
  const videoH = style.exportVideoHeight || style.playResY || 1920;
  const letterSpacing = Number(style.letterSpacing) || 0;

  const primaryColor = hexToABGR(style.textColor || "#ffffff", 100);
  const bgOpacity = Number(style.bgOpacity ?? 0);
  const backColor = hexToABGR(style.bgColor || "#000000", bgOpacity);
  const hasShadow = Boolean(style.textShadow);

  let outlineColor = "&H00000000";
  let borderStyle = bgOpacity > 5 ? 3 : 1;
  let outline = 0;
  let shadow = 0;

  // Per-preset style settings
  switch (animStyle) {
    case "neon":
      outlineColor = hexToABGR(style.shadowColor || "#00e5ff", 85);
      borderStyle = 1; outline = 4; shadow = 0;
      break;
    case "highlight":
      borderStyle = 3; outline = 0; shadow = 0;
      break;
    case "pop":
      borderStyle = 3;
      outlineColor = hexToABGR(style.shadowColor || "#7b0000", 100);
      outline = 3; shadow = 2;
      break;
    case "cinematic":
      borderStyle = 3; outline = 0; shadow = 0;
      break;
    case "typewriter":
      borderStyle = 3;
      outlineColor = hexToABGR(style.shadowColor || "#39ff14", 60);
      outline = 1; shadow = 0;
      break;
    case "elevate":
    case "reveal":
      borderStyle = 1;
      outlineColor = hexToABGR(style.shadowColor || "#000000", 80);
      outline = 2; shadow = 2;
      break;
    default:
      if (hasShadow) {
        outlineColor = hexToABGR(style.shadowColor || "#000000", 80);
        outline = 2; shadow = 1;
      }
      if (bgOpacity > 5) {
        borderStyle = 3; outlineColor = "&H00000000"; outline = 0; shadow = 0;
      }
      break;
  }

  const alignment = style.position === "top" ? 8
    : style.position === "center" ? 5 : 2;
  const marginV = style.position === "top" ? 80
    : style.position === "center" ? 0 : 80;

  const charsPerLine = Math.max(12, Math.round((videoW * 0.82) / (fontSize * 0.52)));

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${videoW}
PlayResY: ${videoH}
ScaledBorderAndShadow: yes
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${fontSize},${primaryColor},${primaryColor},${outlineColor},${backColor},${bold},0,0,0,100,100,${letterSpacing},0,${borderStyle},${outline},${shadow},${alignment},60,60,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  function toAssTime(sec) {
    const s = Math.max(0, Number(sec) || 0);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = Math.floor(s % 60);
    const cs = Math.round((s % 1) * 100);
    return `${h}:${String(m).padStart(2,"0")}:${String(ss).padStart(2,"0")}.${String(cs).padStart(2,"0")}`;
  }

  function wrapText(text, maxChars) {
    const words = text.split(/\s+/);
    const lines = [];
    let current = "";
    for (const word of words) {
      if (!current) { current = word; }
      else if (current.length + 1 + word.length <= maxChars) { current += " " + word; }
      else { lines.push(current); current = word; }
    }
    if (current) lines.push(current);
    return lines.join("\\N");
  }

  // Add ASS inline effect tags per preset
  

const events = segments.map((seg) => {
  let text = String(seg.text || "").trim();
  if (textTransform === "uppercase") text = text.toUpperCase();
  if (textTransform === "lowercase") text = text.toLowerCase();
  text = text.replace(/\r?\n/g, "\\N");
  if (!text.includes("\\N")) text = wrapText(text, charsPerLine);

  const durationMs = Math.round((Number(seg.end) - Number(seg.start)) * 1000);
  text = applyEffectTags(text, animStyle, durationMs, seg.start, seg.end);

  return `Dialogue: 0,${toAssTime(seg.start)},${toAssTime(seg.end)},Default,,0,0,0,,${text}`;
}).join("\n");

  return header + events;
}
function applyEffectTags(text, anim, segDurationMs) {
    const fadeIn = Math.min(150, Math.round(segDurationMs * 0.15));
    const fadeOut = Math.min(100, Math.round(segDurationMs * 0.1));

    switch (anim) {
      case "elevate":
        // Fade in + move up slightly
        return `{\\fad(${fadeIn},${fadeOut})\\move(0,20,0,0,0,${fadeIn})}${text}`;

      case "reveal":
        // Fade in with blur clearing
        return `{\\fad(${fadeIn},${fadeOut})\\blur8\\t(0,${fadeIn},\\blur0)}${text}`;

      case "neon":
        // Glow blur effect
        return `{\\blur3\\fad(80,50)}${text}`;

      case "cinematic":
        // Fade in/out only
        return `{\\fad(200,150)}${text}`;

      case "pop":
        // Fast fade in
        return `{\\fad(80,60)}${text}`;

      case "highlight":
        // Snap in
        return `{\\fad(60,60)}${text}`;

      case "typewriter":
      case "classic":
      case "none":
        return `{\\fad(${fadeIn},${fadeOut})}${text}`;

      case "wordcolor": {
        // Color cycle each word
        const colors = ["&H00FFFFFF", "&H0000E5FF", "&H004ade80", "&H00FB923C", "&H00C084FC"];
        return text.split(" ").map((w, i) =>
          `{\\1c${colors[i % colors.length]}}${w}`
        ).join(" ");
      }

      case "highlightimpact": {
        // Highlight every 3rd word in cyan
        return text.split(" ").map((w, i) =>
          i % 3 === 1 ? `{\\1c&H00E5FF00\\bord3}${w}{\\r}` : w
        ).join(" ");
      }

      default:
        return `{\\fad(${fadeIn},${fadeOut})}${text}`;
    }
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
