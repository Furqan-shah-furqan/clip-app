const { execSync } = require("child_process");
try {
  const v = execSync("yt-dlp --version").toString().trim();
  console.log("yt-dlp version:", v);
} catch {
  console.error("yt-dlp NOT found");
}
const express = require("express");
const path = require("path");
const cors = require("cors");
const fs = require("fs");
const os = require("os");
const { execFile } = require("child_process");

const clipsRouter = require("./routes/clips");
const captionsModule = require("./routes/captions");
const captionsRouter = captionsModule.router;
const youtubeRouter = require("./routes/youtube");
const schedulesRouter = require("./routes/schedules");
const authRouter = require("./routes/auth");
const accountsRouter = require("./routes/accounts");
require("./queue/publishWorker");
const http = require("http");
const { WebSocketServer } = require("ws");

const {
  rootDir,
  captionsDir,
  exportsDir,
  uploadsDir,
} = require("./utils/paths");

const app = express();
let prisma = null;

try {
  const prismaModule = require("./lib/prisma");
  prisma = prismaModule.prisma || prismaModule.default || prismaModule;
} catch (error) {
  console.warn("Prisma client not available for publish prepare route.");
}

function clampNumber(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, num));
}

function hexToAssColor(hex = "#ffffff", opacityPercent = 100) {
  const clean = String(hex || "#ffffff")
    .replace("#", "")
    .padStart(6, "0")
    .slice(0, 6);

  const r = clean.slice(0, 2);
  const g = clean.slice(2, 4);
  const b = clean.slice(4, 6);

  const opacity = clampNumber(opacityPercent, 0, 100, 100);
  const alpha = Math.round(((100 - opacity) / 100) * 255)
    .toString(16)
    .padStart(2, "0")
    .toUpperCase();

  return `&H${alpha}${b}${g}${r}&`;
}
function hexToAssRgbColor(hex = "#ffffff") {
  const clean = String(hex || "#ffffff")
    .replace("#", "")
    .padStart(6, "0")
    .slice(0, 6);

  const r = clean.slice(0, 2);
  const g = clean.slice(2, 4);
  const b = clean.slice(4, 6);

  return `&H${b}${g}${r}&`;
}

function opacityToAssAlpha(opacityPercent = 100) {
  const opacity = clampNumber(opacityPercent, 0, 100, 100);
  const alpha = Math.round(((100 - opacity) / 100) * 255)
    .toString(16)
    .padStart(2, "0")
    .toUpperCase();

  return `&H${alpha}&`;
}

function secondsToAssTime(sec) {
  const s = Math.max(0, Number(sec) || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = Math.floor(s % 60);
  const cs = Math.floor((s - Math.floor(s)) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function escapeAssText(text = "") {
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\r?\n/g, "\\N");
}

function mapPosition(position) {
  if (position === "top") return 8;
  if (position === "center") return 5;
  return 2;
}

function normalizeBurnStyle(style = {}) {
  return {
    fontFamily: String(style.fontFamily || "Montserrat"),
    fontSize: clampNumber(style.fontSize, 12, 220, 28),
    textColor: style.textColor || "#ffffff",
    bgColor: style.bgColor || "#000000",
    bgOpacity: clampNumber(style.bgOpacity, 0, 100, 70),
    position: style.position || "bottom",
    textShadow: Boolean(style.textShadow),
    shadowColor: style.shadowColor || "#000000",
    shadowBlur: clampNumber(style.shadowBlur, 0, 80, 8),
    shadowOffsetX: clampNumber(style.shadowOffsetX, -80, 80, 0),
    shadowOffsetY: clampNumber(style.shadowOffsetY, -80, 80, 2),
    animationStyle:
      style.animationStyle || style.sourceAnimationStyle || "none",
    burnAnimationStyle: style.burnAnimationStyle || "static",
    sourceAnimationStyle:
      style.sourceAnimationStyle || style.animationStyle || "none",
    fontWeight: clampNumber(style.fontWeight, 100, 900, 800),
    textTransform: style.textTransform || "none",
    letterSpacing: clampNumber(style.letterSpacing, -10, 40, 0),
    borderRadius: clampNumber(style.borderRadius, 0, 120, 14),
    paddingX: clampNumber(style.paddingX, 0, 180, 14),
    paddingY: clampNumber(style.paddingY, 0, 180, 10),
    lineHeight: clampNumber(style.lineHeight, 1, 3, 1.4),
    maxWidthPercent: clampNumber(style.maxWidthPercent, 40, 100, 88),
    playResX: Math.round(
      clampNumber(style.playResX || style.exportVideoWidth, 320, 7680, 1080),
    ),
    playResY: Math.round(
      clampNumber(style.playResY || style.exportVideoHeight, 320, 7680, 1920),
    ),
  };
}

function normalizeBurnSegments(segments = []) {
  return segments
    .map((seg) => ({
      start: Math.max(0, Number(seg?.start) || 0),
      end: Math.max(0, Number(seg?.end) || 0),
      text: String(seg?.text || "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .trim(),
    }))
    .filter((seg) => seg.text && seg.end > seg.start)
    .sort((a, b) => a.start - b.start);
}

function applyBurnTextTransform(text = "", transform = "none") {
  const raw = String(text || "");

  if (transform === "uppercase") return raw.toUpperCase();
  if (transform === "lowercase") return raw.toLowerCase();

  return raw;
}

function buildAssOverrideTags(style = {}) {
  const s = normalizeBurnStyle(style);

  const rawFont = String(s.fontFamily || "Montserrat");
  const fontName =
    rawFont.split(",")[0].replace(/["']/g, "").trim() || "Montserrat";

  const alignment = mapPosition(s.position);
  const bold = Number(s.fontWeight) >= 700 ? 1 : 0;
  const spacing = Number(s.letterSpacing) || 0;

  const textColor = hexToAssRgbColor(s.textColor || "#ffffff");
  const textAlpha = opacityToAssAlpha(100);

  const outlineColor = hexToAssRgbColor(s.shadowColor || "#000000");
  const outlineAlpha = opacityToAssAlpha(s.textShadow ? 100 : 0);

  const shadowColor = hexToAssRgbColor(s.shadowColor || "#000000");
  const shadowAlpha = opacityToAssAlpha(s.textShadow ? 100 : 0);

  const shadowEnabled = Boolean(s.textShadow);
  const shadowBlur = Number(s.shadowBlur) || 0;
  const shadowOffsetX = Math.abs(Number(s.shadowOffsetX) || 0);
  const shadowOffsetY = Math.abs(Number(s.shadowOffsetY) || 0);

  const paddingX = Math.max(0, Math.round(Number(s.paddingX) || 0));
  const paddingY = Math.max(0, Math.round(Number(s.paddingY) || 0));
  const outline =
    Number(s.bgOpacity) > 0
      ? Math.max(2, Math.round(Math.max(paddingX, paddingY) / 2))
      : Math.max(1, Math.round(shadowBlur / 5) || 2);

  const shadow = shadowEnabled
    ? Math.max(1, Math.round((shadowBlur + shadowOffsetX + shadowOffsetY) / 6))
    : 0;

  const blur = shadowEnabled ? Math.max(0.4, shadowBlur / 8) : 0;

  return `{\\fn${fontName}\\an${alignment}\\fs${Math.round(Number(s.fontSize) || 28)}\\b${bold}\\fsp${spacing}\\bord${outline}\\shad${shadow}\\blur${Number(blur.toFixed(2))}\\1c${textColor}\\1a${textAlpha}\\3c${outlineColor}\\3a${outlineAlpha}\\4c${shadowColor}\\4a${shadowAlpha}}`;
}

function getBurnAnimationMode(style = {}) {
  return (
    style.sourceAnimationStyle ||
    style.animationStyle ||
    style.burnAnimationStyle ||
    "none"
  );
}

function assInlineColor(hex = "#ffffff") {
  return `\\1c${hexToAssRgbColor(hex)}`;
}

function assInlineBold(enabled) {
  return `\\b${enabled ? 1 : 0}`;
}

function styleWordForAss(word, index, mode, baseStyle) {
  const escaped = escapeAssText(word);

  if (mode === "wordcolor") {
    const colors = [
      baseStyle.textColor || "#ffffff",
      "#F5D76E",
      "#00e5ff",
      "#ff6b6b",
      "#4ade80",
      "#c084fc",
      "#fb923c",
    ];
    return `{${assInlineColor(colors[index % colors.length])}${assInlineBold(true)}}${escaped}{\\rDefault}`;
  }

  if (mode === "highlightimpact") {
    const plain = String(word || "").replace(/[^a-zA-Z0-9]/g, "");
    const shouldHighlight = plain.length >= 5 || index % 3 === 1;
    if (shouldHighlight) {
      return `{${assInlineColor("#00e5ff")}${assInlineBold(true)}}${escaped}{\\rDefault}`;
    }
  }

  return escaped;
}

function buildAssStyledText(text = "", style = {}) {
  const s = normalizeBurnStyle(style);
  const mode = getBurnAnimationMode(s);
  const transformedText = applyBurnTextTransform(
    text,
    s.textTransform || "none",
  );

  if (!transformedText.trim()) return "";

  if (!["wordcolor", "highlightimpact"].includes(mode)) {
    return escapeAssText(transformedText);
  }

  let wordIndex = 0;
  return transformedText
    .split(/(\r?\n)/)
    .map((linePart) => {
      if (/^\r?\n$/.test(linePart)) return "\\N";

      return linePart
        .split(/(\s+)/)
        .map((part) => {
          if (!part) return "";
          if (/^\s+$/.test(part)) return escapeAssText(part);

          const styled = styleWordForAss(part, wordIndex, mode, s);
          wordIndex += 1;
          return styled;
        })
        .join("");
    })
    .join("");
}

function escapeSubtitleFilterPath(filePath) {
  return String(filePath)
    .replace(/\\/g, "/")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'");
}

function buildSubtitleFilter(assPath) {
  return `subtitles=filename='${escapeSubtitleFilterPath(assPath)}'`;
}

function buildAssFromSegments(segments = [], style = {}) {
  const s = getEffectiveBurnStyle(style);

  const rawFont = String(s.fontFamily || "Montserrat");
  const fontName =
    rawFont.split(",")[0].replace(/["']/g, "").trim() || "Montserrat";

  const bold = Number(s.fontWeight) >= 700 ? -1 : 0;
  const spacing = Number(s.letterSpacing) || 0;
  const alignment = mapPosition(s.position);

  const bgOpacity = clampNumber(s.bgOpacity, 0, 100, 70);
  const hasOpaqueBox = bgOpacity > 0;

  const shadowEnabled = Boolean(s.textShadow);
  const shadowBlur = Number(s.shadowBlur) || 0;
  const shadowOffsetX = Math.abs(Number(s.shadowOffsetX) || 0);
  const shadowOffsetY = Math.abs(Number(s.shadowOffsetY) || 0);
  const paddingX = Math.max(0, Math.round(Number(s.paddingX) || 0));
  const paddingY = Math.max(0, Math.round(Number(s.paddingY) || 0));

  const borderStyle = hasOpaqueBox ? 3 : 1;
  const outline = hasOpaqueBox
    ? Math.max(2, Math.round(Math.max(paddingX, paddingY) / 2))
    : Math.max(1, Math.round(shadowBlur / 5) || 2);

  const shadow = shadowEnabled
    ? Math.max(1, Math.round((shadowBlur + shadowOffsetX + shadowOffsetY) / 6))
    : 0;

  const marginL = Math.max(10, 54 + paddingX);
  const marginR = Math.max(10, 54 + paddingX);

  const marginV =
    s.position === "top"
      ? 68 + paddingY
      : s.position === "center"
        ? 0
        : 92 + paddingY;

  const primaryColor = hexToAssColor(s.textColor || "#ffffff", 100);
  const secondaryColor = primaryColor;

  const outlineColor = hexToAssColor(
    s.shadowColor || "#000000",
    shadowEnabled ? 100 : 0,
  );

  const backColor = hexToAssColor(
    s.bgColor || "#000000",
    hasOpaqueBox ? bgOpacity : 0,
  );

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${s.playResX || 1080}
PlayResY: ${s.playResY || 1920}
WrapStyle: 2
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: Default,${fontName},${Math.round(s.fontSize)},${primaryColor},${secondaryColor},${outlineColor},${backColor},${bold},0,0,0,100,100,${spacing},0,${borderStyle},${outline},${shadow},${alignment},${marginL},${marginR},${marginV},1

[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text`;

  const overrideTags = buildAssOverrideTags(s);

  const lines = normalizeBurnSegments(segments).map((seg) => {
    const styledText = buildAssStyledText(seg.text, s);

    return `Dialogue: 0,${secondsToAssTime(seg.start)},${secondsToAssTime(seg.end)},Default,,${marginL},${marginR},${marginV},,${overrideTags}${styledText}`;
  });

  return `${header}\n${lines.join("\n")}\n`;
}

function normalizeDrawHexColor(hex = "#ffffff", fallback = "#ffffff") {
  const raw = String(hex || fallback)
    .replace("#", "")
    .trim();
  const clean = /^[0-9a-fA-F]{6}$/.test(raw)
    ? raw
    : String(fallback).replace("#", "");
  return `0x${clean.toUpperCase()}`;
}

function opacityToDrawAlpha(opacityPercent = 100) {
  const opacity = clampNumber(opacityPercent, 0, 100, 100);
  return Math.max(0, Math.min(1, opacity / 100)).toFixed(3);
}

function drawColor(
  hex = "#ffffff",
  opacityPercent = 100,
  fallback = "#ffffff",
) {
  return `${normalizeDrawHexColor(hex, fallback)}@${opacityToDrawAlpha(opacityPercent)}`;
}

function escapeDrawTextPath(filePath) {
  return String(filePath)
    .replace(/\\/g, "/")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/,/g, "\\,");
}

function escapeDrawTextValue(value = "") {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/,/g, "\\,");
}

function resolveWindowsFontFile(fontFamily = "") {
  const first = String(fontFamily || "")
    .split(",")[0]
    .replace(/["']/g, "")
    .trim()
    .toLowerCase();

  const fontsDir = process.env.WINDIR
    ? path.join(process.env.WINDIR, "Fonts")
    : "C:\\Windows\\Fonts";

  const candidatesByFont = {
    montserrat: [
      "Montserrat-Bold.ttf",
      "Montserrat-SemiBold.ttf",
      "arialbd.ttf",
    ],
    poppins: ["Poppins-Bold.ttf", "Poppins-SemiBold.ttf", "arialbd.ttf"],
    inter: ["Inter-Bold.ttf", "Inter-SemiBold.ttf", "arialbd.ttf"],
    oswald: ["Oswald-Bold.ttf", "Oswald-SemiBold.ttf", "arialbd.ttf"],
    impact: ["impact.ttf", "arialbd.ttf"],
    "arial black": ["ariblk.ttf", "arialbd.ttf"],
    "courier new": ["courbd.ttf", "cour.ttf"],
  };

  const key = Object.keys(candidatesByFont).find((name) =>
    first.includes(name),
  );
  const candidates = key ? candidatesByFont[key] : ["arialbd.ttf", "arial.ttf"];

  for (const file of candidates) {
    const fullPath = path.join(fontsDir, file);
    if (fs.existsSync(fullPath)) return fullPath;
  }

  return null;
}

function getEffectiveBurnStyle(style = {}) {
  const s = normalizeBurnStyle(style);
  const mode = s.animationStyle || style.sourceAnimationStyle || "none";

  if (
    mode === "wordcolor" &&
    (!s.textColor || s.textColor.toLowerCase() === "#ffffff")
  ) {
    s.textColor = "#00e5ff";
  }

  if (
    mode === "highlightimpact" &&
    (!s.textColor || s.textColor.toLowerCase() === "#ffffff")
  ) {
    s.textColor = "#00e5ff";
  }

  if (mode === "neon") {
    s.textShadow = true;
    s.shadowColor = s.shadowColor || s.textColor || "#00e5ff";
    s.shadowBlur = Math.max(Number(s.shadowBlur) || 0, 18);
  }

  return s;
}

function buildDrawTextFilterFromSegments(segments = [], style = {}, workDir) {
  const s = getEffectiveBurnStyle(style);
  const normalizedSegments = normalizeBurnSegments(segments);
  const filters = [];
  const fontFile = resolveWindowsFontFile(s.fontFamily);

  const fontSize = Math.round(Number(s.fontSize) || 48);
  const paddingX = Math.max(0, Math.round(Number(s.paddingX) || 0));
  const paddingY = Math.max(0, Math.round(Number(s.paddingY) || 0));
  const boxBorder = Math.max(paddingX, paddingY, 0);
  const marginV =
    s.position === "top"
      ? 68 + paddingY
      : s.position === "center"
        ? 0
        : 92 + paddingY;

  const yExpr =
    s.position === "top"
      ? `${marginV}`
      : s.position === "center"
        ? `(h-text_h)/2`
        : `h-text_h-${marginV}`;

  const bgOpacity = clampNumber(s.bgOpacity, 0, 100, 0);
  const hasBox = bgOpacity > 0;
  const shadowEnabled = Boolean(s.textShadow);
  const shadowX = shadowEnabled ? Math.round(Number(s.shadowOffsetX) || 0) : 0;
  const shadowY = shadowEnabled ? Math.round(Number(s.shadowOffsetY) || 0) : 0;
  const borderW = shadowEnabled
    ? Math.max(1, Math.round((Number(s.shadowBlur) || 0) / 8))
    : 0;

  normalizedSegments.forEach((seg, index) => {
    const transformedText = applyBurnTextTransform(
      seg.text,
      s.textTransform || "none",
    );
    const textPath = path.join(
      workDir,
      `caption-${String(index).padStart(4, "0")}.txt`,
    );
    fs.writeFileSync(textPath, transformedText, "utf8");

    const options = [
      `textfile='${escapeDrawTextPath(textPath)}'`,
      `enable='between(t\\,${Number(seg.start).toFixed(3)}\\,${Number(seg.end).toFixed(3)})'`,
      `fontcolor=${drawColor(s.textColor || "#ffffff", 100)}`,
      `fontsize=${fontSize}`,
      `x=(w-text_w)/2`,
      `y=${yExpr}`,
      `line_spacing=${Math.round(fontSize * 0.18)}`,
      `box=${hasBox ? 1 : 0}`,
      `boxcolor=${drawColor(s.bgColor || "#000000", bgOpacity, "#000000")}`,
      `boxborderw=${boxBorder}`,
      `borderw=${borderW}`,
      `bordercolor=${drawColor(s.shadowColor || "#000000", shadowEnabled ? 100 : 0, "#000000")}`,
      `shadowcolor=${drawColor(s.shadowColor || "#000000", shadowEnabled ? 100 : 0, "#000000")}`,
      `shadowx=${shadowX}`,
      `shadowy=${shadowY}`,
    ];

    if (fontFile) {
      options.splice(1, 0, `fontfile='${escapeDrawTextPath(fontFile)}'`);
    } else {
      const fontName =
        String(s.fontFamily || "Arial")
          .split(",")[0]
          .replace(/["']/g, "")
          .trim() || "Arial";
      options.splice(1, 0, `font='${escapeDrawTextValue(fontName)}'`);
    }

    filters.push(`drawtext=${options.join(":")}`);
  });

  return filters.join(",");
}

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Static file serving
app.use(express.static(path.join(rootDir, "public")));
app.use("/captions", express.static(captionsDir));
app.use("/exports", express.static(exportsDir));
app.use("/uploads", express.static(uploadsDir));

// API routes
app.use("/api/clips", clipsRouter);
app.use("/api/captions", captionsRouter);
app.use("/api/youtube", youtubeRouter);
app.use("/api/schedules", schedulesRouter);
app.use("/api/auth", authRouter);
app.use("/api/accounts", accountsRouter);
function getClipSourceForPublish(clip = {}) {
  return (
    clip.localPath ||
    clip.filePath ||
    clip.inputPath ||
    clip.sourcePath ||
    clip.clipPath ||
    clip.outputPath ||
    clip.storagePath ||
    clip.relativePath ||
    clip.previewUrl ||
    clip.downloadUrl ||
    clip.videoUrl ||
    clip.directUrl ||
    clip.url ||
    clip.src ||
    ""
  );
}

function resolvePublishClipPath(clip = {}) {
  const source = getClipSourceForPublish(clip);
  const candidates = [];

  [
    clip.localPath,
    clip.filePath,
    clip.inputPath,
    clip.sourcePath,
    clip.clipPath,
    clip.outputPath,
    clip.storagePath,
    clip.relativePath,
    clip.previewUrl,
    clip.downloadUrl,
    clip.videoUrl,
    clip.directUrl,
    clip.url,
    clip.src,
    source,
  ]
    .filter(Boolean)
    .forEach((value) => {
      const raw = String(value).trim();
      if (!raw) return;

      const clean = raw.split("?")[0];
      const base = path.basename(clean);

      candidates.push(raw);

      if (raw.startsWith("/exports/") || raw.startsWith("/uploads/")) {
        candidates.push(path.join(rootDir, raw.replace(/^\/+/, "")));
      }

      if (raw.startsWith("exports/") || raw.startsWith("uploads/")) {
        candidates.push(path.join(rootDir, raw));
      }

      try {
        const parsed = new URL(raw, "http://localhost:3000");
        if (parsed.pathname.startsWith("/exports/") || parsed.pathname.startsWith("/uploads/")) {
          candidates.push(path.join(rootDir, parsed.pathname.replace(/^\/+/, "")));
        }

        if (parsed.pathname.startsWith("/api/files/download/")) {
          candidates.push(path.join(exportsDir, path.basename(parsed.pathname)));
          candidates.push(path.join(uploadsDir, path.basename(parsed.pathname)));
        }
      } catch {
        // ignore invalid URL
      }

      candidates.push(path.isAbsolute(raw) ? raw : path.join(rootDir, raw));
      candidates.push(path.join(exportsDir, base));
      candidates.push(path.join(uploadsDir, base));
    });

  for (const candidate of candidates) {
    try {
      if (candidate && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      // ignore invalid path
    }
  }

  return "";
}

function getPublishClipTitle(clip = {}) {
  return (
    clip.title ||
    clip.name ||
    clip.fileName ||
    clip.filename ||
    path.basename(getClipSourceForPublish(clip) || "clip.mp4")
  );
}

function looksLikeDatabaseId(value = "") {
  const id = String(value || "");
  if (!id) return false;
  if (id.startsWith("draft-")) return false;
  if (id.includes(".mp4")) return false;
  if (id.includes("/") || id.includes("\\")) return false;
  return id.length >= 12;
}
function getClipSourceForPublish(clip = {}) {
  return (
    clip.localPath ||
    clip.filePath ||
    clip.inputPath ||
    clip.sourcePath ||
    clip.clipPath ||
    clip.outputPath ||
    clip.storagePath ||
    clip.relativePath ||
    clip.previewUrl ||
    clip.downloadUrl ||
    clip.videoUrl ||
    clip.directUrl ||
    clip.url ||
    clip.src ||
    ""
  );
}

function resolvePublishClipPath(clip = {}) {
  const source = getClipSourceForPublish(clip);
  const candidates = [];

  [
    clip.localPath,
    clip.filePath,
    clip.inputPath,
    clip.sourcePath,
    clip.clipPath,
    clip.outputPath,
    clip.storagePath,
    clip.relativePath,
    clip.previewUrl,
    clip.downloadUrl,
    clip.videoUrl,
    clip.directUrl,
    clip.url,
    clip.src,
    source,
  ]
    .filter(Boolean)
    .forEach((value) => {
      const raw = String(value).trim();
      if (!raw) return;

      const clean = raw.split("?")[0];
      const base = path.basename(clean);

      candidates.push(raw);

      if (raw.startsWith("/exports/") || raw.startsWith("/uploads/")) {
        candidates.push(path.join(rootDir, raw.replace(/^\/+/, "")));
      }

      if (raw.startsWith("exports/") || raw.startsWith("uploads/")) {
        candidates.push(path.join(rootDir, raw));
      }

      try {
        const parsed = new URL(raw, "http://localhost:3000");

        if (
          parsed.pathname.startsWith("/exports/") ||
          parsed.pathname.startsWith("/uploads/")
        ) {
          candidates.push(
            path.join(rootDir, parsed.pathname.replace(/^\/+/, "")),
          );
        }

        if (parsed.pathname.startsWith("/api/files/download/")) {
          candidates.push(path.join(exportsDir, path.basename(parsed.pathname)));
          candidates.push(path.join(uploadsDir, path.basename(parsed.pathname)));
        }
      } catch {
        // ignore invalid URL
      }

      candidates.push(path.isAbsolute(raw) ? raw : path.join(rootDir, raw));
      candidates.push(path.join(exportsDir, base));
      candidates.push(path.join(uploadsDir, base));
    });

  for (const candidate of candidates) {
    try {
      if (
        candidate &&
        fs.existsSync(candidate) &&
        fs.statSync(candidate).isFile()
      ) {
        return candidate;
      }
    } catch {
      // ignore invalid path
    }
  }

  return "";
}

function getPublishClipTitle(clip = {}) {
  return (
    clip.title ||
    clip.name ||
    clip.fileName ||
    clip.filename ||
    path.basename(getClipSourceForPublish(clip) || "clip.mp4")
  );
}

function looksLikeDatabaseId(value = "") {
  const id = String(value || "");
  if (!id) return false;
  if (id.startsWith("draft-")) return false;
  if (id.includes(".mp4")) return false;
  if (id.includes("/") || id.includes("\\")) return false;
  return id.length >= 12;
}

app.post("/api/publish/prepare-clip", async (req, res) => {
  try {
    if (!prisma || !prisma.clip) {
      return res.status(500).json({
        error: "Database client is not available.",
      });
    }

    const { userId, clip } = req.body || {};

    if (!userId) {
      return res.status(400).json({
        error: "userId is required.",
      });
    }

    if (!clip) {
      return res.status(400).json({
        error: "clip is required.",
      });
    }

    const possibleDbId =
      clip.id ||
      clip.clipId ||
      clip.dbClipId ||
      clip.databaseId ||
      clip.prismaClipId ||
      "";

    if (looksLikeDatabaseId(possibleDbId)) {
      const existingById = await prisma.clip.findUnique({
        where: {
          id: possibleDbId,
        },
      });

      if (existingById) {
        return res.json({
          success: true,
          clip: existingById,
        });
      }
    }

    const localPath = resolvePublishClipPath(clip);

    if (!localPath) {
      return res.status(400).json({
        error: "Selected clip file was not found on the server.",
      });
    }

    const stat = fs.statSync(localPath);
    const fileName =
      clip.fileName ||
      clip.filename ||
      path.basename(localPath);

    const existingClip = await prisma.clip.findFirst({
      where: {
        userId,
        localPath,
      },
    });

    if (existingClip) {
      return res.json({
        success: true,
        clip: existingClip,
      });
    }

    const createdClip = await prisma.clip.create({
      data: {
        userId,
        title: getPublishClipTitle(clip),
        localPath,
        storageUrl: clip.storageUrl || null,
        fileName,
        mimeType: clip.mimeType || "video/mp4",
        durationSeconds: clip.durationSeconds
          ? Number(clip.durationSeconds)
          : null,
        aspectRatio: clip.aspectRatio || "9:16",
        fileSize: stat.size,
      },
    });

    return res.json({
      success: true,
      clip: createdClip,
    });
  } catch (error) {
    console.error("PREPARE PUBLISH CLIP ERROR:", error);

    return res.status(500).json({
      error: "Failed to prepare selected clip for publishing.",
      details: error.message || String(error),
    });
  }
});
app.post("/api/captions/burn", async (req, res) => {
  try {
    const { clip, videoUrl, segments, style } = req.body || {};

    const normalizedSegments = normalizeBurnSegments(segments || []);
    if (!normalizedSegments.length) {
      return res.status(400).json({ error: "No caption segments provided" });
    }

    const normalizedStyle = getEffectiveBurnStyle(style || {});
    let sourcePath = null;

    const possiblePaths = [
      clip?.filePath,
      clip?.inputPath,
      clip?.sourcePath,
      clip?.clipPath,
      clip?.relativePath,
      clip?.storagePath,
      clip?.outputPath,
      clip?.localPath,
    ].filter(Boolean);

    for (const p of possiblePaths) {
      const normalized = path.isAbsolute(p) ? p : path.join(rootDir, p);
      if (fs.existsSync(normalized)) {
        sourcePath = normalized;
        break;
      }
    }

    if (!sourcePath && videoUrl) {
      const safeName = path.basename(videoUrl.split("?")[0] || "input.mp4");
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "clipflow-burn-"));
      sourcePath = path.join(tempDir, safeName);

      const response = await fetch(videoUrl);
      if (!response.ok) {
        return res.status(400).json({ error: "Failed to fetch source video" });
      }

      const arrayBuffer = await response.arrayBuffer();
      fs.writeFileSync(sourcePath, Buffer.from(arrayBuffer));
    }

    if (!sourcePath || !fs.existsSync(sourcePath)) {
      return res.status(400).json({ error: "Source video not found" });
    }

    fs.mkdirSync(exportsDir, { recursive: true });

    const workDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "clipflow-caption-burn-"),
    );
    const outputName = `captioned-${Date.now()}.mp4`;
    const outputPath = path.join(exportsDir, outputName);
    const assPath = path.join(workDir, "captions.ass");
    const assContent = buildAssFromSegments(
      normalizedSegments,
      normalizedStyle,
    );
    fs.writeFileSync(assPath, assContent, "utf8");

    const finalizeSuccess = (renderer = "ass") =>
      res.json({
        success: true,
        renderer,
        fileName: outputName,
        downloadUrl: `/api/files/download/${outputName}`,
        directUrl: `/exports/${outputName}`,
      });

    const cleanupWorkDir = () => {
      try {
        fs.rmSync(workDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    };

    const commonOutputArgs = [
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "18",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-movflags",
      "+faststart",
      outputPath,
    ];

    const assArgs = [
      "-y",
      "-i",
      sourcePath,
      "-vf",
      buildSubtitleFilter(assPath),
      ...commonOutputArgs,
    ];

    execFile("ffmpeg", assArgs, (assError, assStdout, assStderr) => {
      if (!assError) {
        cleanupWorkDir();
        return finalizeSuccess("ass");
      }

      console.warn("ASS subtitle burn failed, trying drawtext fallback.");
      console.warn(assStderr || assError);

      const drawTextFilter = buildDrawTextFilterFromSegments(
        normalizedSegments,
        normalizedStyle,
        workDir,
      );

      if (!drawTextFilter) {
        cleanupWorkDir();
        return res
          .status(400)
          .json({ error: "No drawable captions were generated" });
      }

      const filterScriptPath = path.join(workDir, "drawtext-filter.txt");
      fs.writeFileSync(filterScriptPath, drawTextFilter, "utf8");

      const drawTextArgs = [
        "-y",
        "-i",
        sourcePath,
        "-filter_script:v",
        filterScriptPath,
        ...commonOutputArgs,
      ];

      execFile("ffmpeg", drawTextArgs, (drawError, drawStdout, drawStderr) => {
        cleanupWorkDir();

        if (drawError) {
          console.error("FFMPEG BURN ERROR:");
          console.error("ASS error:", assStderr || assError);
          console.error("Drawtext error:", drawStderr || drawError);
          return res.status(500).json({
            error: "ffmpeg failed to burn captions",
            details: drawStderr || assStderr || String(drawError),
          });
        }

        return finalizeSuccess("drawtext-fallback");
      });
    });
  } catch (error) {
    console.error("CAPTION BURN ERROR:", error);
    return res.status(500).json({
      error: "Could not export captioned video",
      details: error.message || String(error),
    });
  }
});

app.get("/api/files/download/:fileName", (req, res) => {
  try {
    const safeName = path.basename(req.params.fileName);

    const exportPath = path.join(exportsDir, safeName);
    const uploadPath = path.join(uploadsDir, safeName);
    const captionPath = path.join(captionsDir, safeName);

    let foundPath = null;

    if (fs.existsSync(exportPath)) {
      foundPath = exportPath;
    } else if (fs.existsSync(uploadPath)) {
      foundPath = uploadPath;
    } else if (fs.existsSync(captionPath)) {
      foundPath = captionPath;
    }

    if (!foundPath) {
      return res.status(404).send("File not found");
    }

    return res.sendFile(foundPath);
  } catch (error) {
    console.error("FILE DOWNLOAD ERROR:", error);
    return res.status(500).send("Could not open file");
  }
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

// Catch-all route for frontend app
app.get("*", (req, res) => {
  res.sendFile(path.join(rootDir, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

if (typeof captionsModule.registerCaptionStream === "function") {
  captionsModule.registerCaptionStream(wss);
}

server.on("upgrade", (request, socket, head) => {
  const url = request.url || "";

  if (url.startsWith("/api/captions/stream")) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
    return;
  }

  socket.destroy();
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
