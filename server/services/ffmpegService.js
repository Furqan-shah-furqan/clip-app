const ffmpeg = require("fluent-ffmpeg");
const path = require("path");
const fs = require("fs");
const { exportsDir } = require("../utils/paths");

function hexToABGR(hex = "#000000", opacityPercent = 100) {
  const clean = (hex || "#000000").replace("#", "").padEnd(6, "0");
  const r = clean.slice(0, 2);
  const g = clean.slice(2, 4);
  const b = clean.slice(4, 6);
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
      return ["scale=-2:1920", "crop=1080:1920:(in_w-1080)/2:max(0,(in_h-1920)*0.18)"].join(",");
    case "1:1":
      return ["scale=1080:-2", "crop=1080:1080:(in_w-1080)/2:max(0,(in_h-1080)*0.12)"].join(",");
    case "16:9":
    default:
      return ["scale=1280:-2", "crop=1280:720:(in_w-1280)/2:max(0,(in_h-720)*0.08)"].join(",");
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
      .outputOptions(["-preset ultrafast", "-crf 23", "-c:v libx264", "-c:a aac", "-movflags +faststart"])
      .on("end", () => resolve({ fileName, outputPath }))
      .on("error", (err) => reject(err))
      .save(outputPath);
  });
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

function toAssTime(sec) {
  const s = Math.max(0, Number(sec) || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = Math.floor(s % 60);
  const cs = Math.round((s % 1) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function applyEffectTags(text, anim, segDurationMs) {
  const dur = Math.max(200, segDurationMs);
  const fadeIn = Math.min(220, Math.round(dur * 0.22));
  const fadeOut = Math.min(150, Math.round(dur * 0.15));

  switch (anim) {
    case "reveal":
      // Blur dissolves away — libass supports \blur and \t(\blur)
      return `{\\fad(${fadeIn},${fadeOut})\\blur14\\t(0,${Math.min(fadeIn * 2, 400)},\\blur0)}${text}`;

    case "neon":
      // Pulsing glow — blur cycles up and down
      return `{\\fad(120,80)\\blur5\\t(0,${Math.round(dur * 0.4)},\\blur2)\\t(${Math.round(dur * 0.4)},${Math.round(dur * 0.7)},\\blur6)\\t(${Math.round(dur * 0.7)},${dur},\\blur3)}${text}`;

    case "cinematic":
      // Long elegant fade
      return `{\\fad(350,250)}${text}`;

    case "highlight":
      // Snap in fast
      return `{\\fad(60,80)}${text}`;

    case "pop":
      // Fade with slight upward move
      return `{\\fad(80,80)\\move(540,1720,540,1700,0,${Math.min(120, fadeIn)})}${text}`;

    case "typewriter":
    case "oneword":
    case "twoword":
      // Fast snap per word — segments already split
      return `{\\fad(60,50)}${text}`;

    case "wordcolor":
      // Each word different color with fade
      const colors = ["&H00FFFFFF", "&H0000E5FF", "&H004ADE80", "&H00FB923C", "&H00C084FC", "&H00FF6B6B"];
      return `{\\fad(${fadeIn},${fadeOut})}` + text.split(" ").map((w, i) =>
        `{\\1c${colors[i % colors.length]}}${w}`
      ).join(" ");

    default:
      // classic / none
      return `{\\fad(${fadeIn},${fadeOut})}${text}`;
  }
}

function buildAssContent(segments, style) {
  const fontSize = Math.round(Number(style.fontSize) || 28);
  const fontName = (style.fontFamily || "Arial").replace(/['"]/g, "").split(",")[0].trim();
  const bold = Number(style.fontWeight) >= 700 ? -1 : 0;
  const textTransform = style.textTransform || "none";
  const animStyle = style.animationStyle || style.sourceAnimationStyle || "none";
  const videoW = style.exportVideoWidth || style.playResX || 1080;
  const videoH = style.exportVideoHeight || style.playResY || 1920;
  const letterSpacing = Number(style.letterSpacing) || 0;
  const bgOpacity = Number(style.bgOpacity ?? 0);
  const hasShadow = Boolean(style.textShadow);

  const primaryColor = hexToABGR(style.textColor || "#ffffff", 100);
  const backColor = hexToABGR(style.bgColor || "#000000", bgOpacity);

  let outlineColor = "&H00000000";
  let borderStyle = bgOpacity > 5 ? 3 : 1;
  let outline = 0;
  let shadow = 0;

  switch (animStyle) {
    case "neon":
      outlineColor = hexToABGR(style.shadowColor || "#00e5ff", 85);
      borderStyle = 1; outline = 4; shadow = 0;
      break;
    case "reveal":
      outlineColor = hexToABGR(style.shadowColor || "#0d1b3e", 80);
      borderStyle = bgOpacity > 5 ? 3 : 1;
      outline = 0; shadow = 0;
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
    case "wordcolor":
      borderStyle = 3; outline = 0; shadow = 0;
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

  const events = segments.map((seg) => {
    let text = String(seg.text || "").trim();
    if (textTransform === "uppercase") text = text.toUpperCase();
    if (textTransform === "lowercase") text = text.toLowerCase();
    text = text.replace(/\r?\n/g, "\\N");
    if (!text.includes("\\N")) text = wrapText(text, charsPerLine);

    const durationMs = Math.round((Number(seg.end) - Number(seg.start)) * 1000);
    text = applyEffectTags(text, animStyle, durationMs);

    return `Dialogue: 0,${toAssTime(seg.start)},${toAssTime(seg.end)},Default,,0,0,0,,${text}`;
  }).join("\n");

  return header + events;
}

function burnSubtitles({ inputPath, segments, style }) {
  return new Promise((resolve, reject) => {
    if (!segments || !segments.length) return reject(new Error("No segments to burn"));

    const fileName = `captioned_${Date.now()}.mp4`;
    const outputPath = path.join(exportsDir, fileName);
    const assPath = path.join(exportsDir, `subs_${Date.now()}.ass`);

    const assContent = buildAssContent(segments, style || {});
    fs.writeFileSync(assPath, assContent, "utf8");

    console.log("ASS file written:", assPath);
    console.log("ASS preview:", assContent.slice(0, 500));

    const safeAssPath = assPath.replace(/\\/g, "/").replace(/:/g, "\\:");

    ffmpeg(inputPath)
      .videoFilters(`ass='${safeAssPath}'`)
      .outputOptions(["-preset ultrafast", "-crf 23", "-c:v libx264", "-c:a aac", "-movflags +faststart"])
      .on("start", (cmd) => console.log("BURN CMD:", cmd))
      .on("end", () => {
        try { fs.unlinkSync(assPath); } catch {}
        resolve({ fileName, outputPath });
      })
      .on("error", (err) => {
        try { fs.unlinkSync(assPath); } catch {}
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

module.exports = { generateClip, burnSubtitles, suggestMoments };