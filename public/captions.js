const API_BASE = "/api";
const SESSION_KEY = "clipflow-caption-clip";
const STYLE_KEY = "clipflow-caption-style";

// ─── ANIMATION WORD DELAY (seconds per word) ─────────────
const ANIM_WORD_DELAY = {
  none: 0,
  classic: 0,
  elevate: 0.075,
  reveal: 0.085,
  highlight: 0.065,
  neon: 0.1,
  cinematic: 0.09,
  pop: 0.08,
  typewriter: 0.22,
  oneword: 0,
  twoword: 0,
  wordcolor: 0.06,
  wordappend: 0.18,
  highlightimpact: 0.07,
};

// ─── DEFAULT STYLE (used as base when applying presets) ──
const DEFAULT_STYLE = {
  fontFamily: "'Montserrat', sans-serif",
  fontSize: 28,
  textColor: "#ffffff",
  bgColor: "#000000",
  bgOpacity: 70,
  position: "bottom",
  positionX: 50,
  positionY: 82,
  wordsPerRow: 0,
  textShadow: true,
  shadowColor: "#000000",
  shadowBlur: 8,
  shadowOffsetX: 0,
  shadowOffsetY: 2,
  animationStyle: "pop",
  fontWeight: 800,
  textTransform: "none",
  letterSpacing: 0,
  lineSpacing: 1.35,
  borderRadius: 14,
  paddingX: 14,
  paddingY: 10,
  presetDuration: 0.6,
  strokeWidth: 0,
  strokeColor: "#000000",
  glowIntensity: 0,
  rotateAngle: 0,
  activePresetId: null,
};

// ─── STYLE PRESETS ────────────────────────────────────────
const STYLE_PRESETS = [
  {
    id: "classic",
    name: "Classic",
    label: "Clean look",
    style: {
      fontFamily: "'Montserrat', sans-serif",
      fontSize: 26,
      textColor: "#ffffff",
      bgColor: "#000000",
      bgOpacity: 65,
      position: "bottom",
      positionX: 50,
      positionY: 82,
      wordsPerRow: 0,
      textShadow: false,
      shadowColor: "#000000",
      shadowBlur: 0,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      animationStyle: "none",
      fontWeight: 700,
      textTransform: "none",
      letterSpacing: 0,
      borderRadius: 14,
      paddingX: 14,
      paddingY: 10,
    },
  },
  {
    id: "highlight",
    name: "Highlight",
    label: "Bold pop",
    style: {
      fontFamily: "'Poppins', sans-serif",
      fontSize: 28,
      textColor: "#111111",
      bgColor: "#F5D76E",
      bgOpacity: 100,
      position: "bottom",
      positionX: 50,
      positionY: 82,
      wordsPerRow: 2,
      textShadow: false,
      shadowColor: "#000000",
      shadowBlur: 0,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      animationStyle: "highlight",
      fontWeight: 900,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      borderRadius: 10,
      paddingX: 20,
      paddingY: 10,
    },
  },
  {
    id: "neon",
    name: "Neon",
    label: "Glow effect",
    style: {
      fontFamily: "Impact, sans-serif",
      fontSize: 32,
      textColor: "#00ffff",
      bgColor: "#000000",
      bgOpacity: 0,
      position: "bottom",
      positionX: 50,
      positionY: 82,
      wordsPerRow: 0,
      textShadow: true,
      shadowColor: "#00e5ff",
      shadowBlur: 26,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      animationStyle: "neon",
      fontWeight: 900,
      textTransform: "uppercase",
      letterSpacing: 1.5,
      borderRadius: 0,
      paddingX: 10,
      paddingY: 8,
    },
  },
  {
    id: "hormozi",
    name: "Hormozi Gold",
    label: "High energy punch",
    style: {
      fontFamily: "'Montserrat', sans-serif",
      fontSize: 34,
      textColor: "#f5d76e",
      bgColor: "#111111",
      bgOpacity: 85,
      position: "center",
      positionX: 50,
      positionY: 50,
      wordsPerRow: 1,
      textShadow: true,
      shadowColor: "#000000",
      shadowBlur: 14,
      shadowOffsetX: 0,
      shadowOffsetY: 3,
      animationStyle: "pop",
      fontWeight: 900,
      textTransform: "uppercase",
      letterSpacing: 1,
      borderRadius: 12,
      paddingX: 16,
      paddingY: 10,
    },
  },
  {
    id: "minimal",
    name: "Minimalist",
    label: "Subtitle clean",
    style: {
      fontFamily: "Inter, sans-serif",
      fontSize: 22,
      textColor: "#ffffff",
      bgColor: "#000000",
      bgOpacity: 40,
      position: "bottom",
      positionX: 50,
      positionY: 84,
      wordsPerRow: 0,
      textShadow: true,
      shadowColor: "#000000",
      shadowBlur: 6,
      shadowOffsetX: 0,
      shadowOffsetY: 2,
      animationStyle: "classic",
      fontWeight: 600,
      textTransform: "none",
      letterSpacing: 0,
      borderRadius: 8,
      paddingX: 12,
      paddingY: 6,
    },
  },
  {
    id: "pop",
    name: "Pop Dynamic",
    label: "Spring bounce",
    style: {
      fontFamily: "'Montserrat', sans-serif",
      fontSize: 30,
      textColor: "#ffffff",
      bgColor: "#000000",
      bgOpacity: 75,
      position: "bottom",
      positionX: 50,
      positionY: 80,
      wordsPerRow: 2,
      textShadow: true,
      shadowColor: "#000000",
      shadowBlur: 10,
      shadowOffsetX: 0,
      shadowOffsetY: 2,
      animationStyle: "pop",
      fontWeight: 900,
      textTransform: "none",
      letterSpacing: 0.5,
      borderRadius: 12,
      paddingX: 18,
      paddingY: 10,
    },
  },
];

const editorState = {
  clip: null,
  clipIndex: null,
  segments: [],
  activeSegmentId: null,
  syncFrame: null,
  activeTab: "timeline",
  style: { ...DEFAULT_STYLE },
};
window.editorState = editorState;

let _lastRenderedSegId = null;
let _lastRenderedText = null;
let _lastRenderedAnim = null;
let _lastRenderedWordsPerRow = null;

let _persistTimeout = null;
function debouncedPersistCaptions() {
  if (_persistTimeout) clearTimeout(_persistTimeout);
  _persistTimeout = setTimeout(() => {
    persistCaptions();
  }, 250);
}

// ─── REALTIME STATE ──────────────────────────────────────
let realtimeSocket = null;
let realtimeBuffer = [];
let realtimeActive = false;
let realtimeLastFlushTime = 0;
let realtimeWordStreamSeen = false;
let realtimeShouldPersistSegments = false;

// DOM refs
let themeToggle, modePill, backBtn, goBackBtn, saveAndBackBtn, publishNavBtn;
let noClipState, editorShell, clipTitleDisplay;
let captionVideo, captionVideoWrap, captionOverlay, captionOverlayText, captionDragHandle;
let captionPosDisplay, segmentCountBadge;
let captionLoadingState, captionSegmentsList;
let addSegmentBtn, regenerateBtn;
let timelineTabBtn, styleTabBtn, timelinePanel, stylePanel, timelineActions;
let capFontFamily, capFontSize, capFontSizeVal, capWordsPerRow, wordsPerRowGroup;
let capLineSpacing, capLineSpacingVal;
let capTextColor, capBgColor, capBgOpacity, capBgOpacityVal;
let capTextShadow, capShadowColor, capShadowBlur, capShadowBlurVal;
let capShadowOffsetX, capShadowOffsetY, shadowControlsGrid;
let positionBtns, capPosX, capPosY, capPosXVal, capPosYVal, resetCenterBtn, captionLivePreview;
let applyStyleBtn, exportCaptionedVideoBtn;
let capAnimStyle, presetsGrid;
let capPresetDuration, capPresetDurationVal;
let capLetterSpacing, capLetterSpacingVal;
let textTransformGroup, capTextTransform;
let capStrokeWidth, capStrokeWidthVal, capStrokeColor;
let capGlowIntensity, capGlowIntensityVal;
let capRotateAngle, capRotateAngleVal;
let capBoxPadding, capBoxPaddingVal, capBoxSizeLabel, capBoxFrame;
let syncAudioCaptionsBtn;
let colorSwatchButtons = [];

function cacheDom() {
  themeToggle = document.getElementById("themeToggle");
  modePill = document.getElementById("modePill");
  backBtn = document.getElementById("backBtn");
  goBackBtn = document.getElementById("goBackBtn");
  saveAndBackBtn = document.getElementById("saveAndBackBtn");
  publishNavBtn = document.getElementById("publishNavBtn");
  noClipState = document.getElementById("noClipState");
  editorShell = document.getElementById("editorShell");
  clipTitleDisplay = document.getElementById("clipTitleDisplay");
  captionVideo = document.getElementById("captionVideo");
  captionVideoWrap = document.getElementById("captionVideoWrap");
  captionOverlay = document.getElementById("captionOverlay");
  captionOverlayText = document.getElementById("captionOverlayText");
  captionDragHandle = document.getElementById("captionDragHandle");
  capBoxFrame = document.getElementById("capBoxFrame");
  capBoxSizeLabel = document.getElementById("capBoxSizeLabel");
  captionPosDisplay = document.getElementById("captionPosDisplay");
  segmentCountBadge = document.getElementById("segmentCountBadge");
  captionLoadingState = document.getElementById("captionLoadingState");
  captionSegmentsList = document.getElementById("captionSegmentsList");
  addSegmentBtn = document.getElementById("addSegmentBtn");
  regenerateBtn = document.getElementById("regenerateCaptionsBtn");
  timelineTabBtn = document.getElementById("timelineTabBtn");
  styleTabBtn = document.getElementById("styleTabBtn");
  timelinePanel = document.getElementById("timelinePanel");
  stylePanel = document.getElementById("stylePanel");
  timelineActions = document.getElementById("timelineActions");
  capFontFamily = document.getElementById("capFontFamily");
  capFontSize = document.getElementById("capFontSize");
  capFontSizeVal = document.getElementById("capFontSizeVal");
  capWordsPerRow = document.getElementById("capWordsPerRow");
  wordsPerRowGroup = document.getElementById("wordsPerRowGroup");
  capTextColor = document.getElementById("capTextColor");
  capBgColor = document.getElementById("capBgColor");
  capBgOpacity = document.getElementById("capBgOpacity");
  capBgOpacityVal = document.getElementById("capBgOpacityVal");
  capBoxPadding = document.getElementById("capBoxPadding");
  capBoxPaddingVal = document.getElementById("capBoxPaddingVal");
  capTextShadow = document.getElementById("capTextShadow");
  capShadowColor = document.getElementById("capShadowColor");
  capShadowBlur = document.getElementById("capShadowBlur");
  capShadowBlurVal = document.getElementById("capShadowBlurVal");
  capShadowOffsetX = document.getElementById("capShadowOffsetX");
  capShadowOffsetY = document.getElementById("capShadowOffsetY");
  shadowControlsGrid = document.getElementById("shadowControlsGrid");
  positionBtns = document.getElementById("positionBtns");
  capPosX = document.getElementById("capPosX");
  capPosY = document.getElementById("capPosY");
  capPosXVal = document.getElementById("capPosXVal");
  capPosYVal = document.getElementById("capPosYVal");
  resetCenterBtn = document.getElementById("resetCenterBtn");
  captionLivePreview = document.getElementById("captionLivePreview");
  applyStyleBtn = document.getElementById("applyStyleBtn");
  exportCaptionedVideoBtn = document.getElementById("exportCaptionedVideoBtn");
  capAnimStyle = document.getElementById("capAnimStyle");
  presetsGrid = document.getElementById("presetsGrid");

  capPresetDuration = document.getElementById("capPresetDuration");
  capPresetDurationVal = document.getElementById("capPresetDurationVal");
  capLetterSpacing = document.getElementById("capLetterSpacing");
  capLetterSpacingVal = document.getElementById("capLetterSpacingVal");
  capLineSpacing = document.getElementById("capLineSpacing");
  capLineSpacingVal = document.getElementById("capLineSpacingVal");
  textTransformGroup = document.getElementById("textTransformGroup");
  capTextTransform = document.getElementById("capTextTransform");
  capStrokeWidth = document.getElementById("capStrokeWidth");
  capStrokeWidthVal = document.getElementById("capStrokeWidthVal");
  capStrokeColor = document.getElementById("capStrokeColor");
  capGlowIntensity = document.getElementById("capGlowIntensity");
  capGlowIntensityVal = document.getElementById("capGlowIntensityVal");
  capRotateAngle = document.getElementById("capRotateAngle");
  capRotateAngleVal = document.getElementById("capRotateAngleVal");
  syncAudioCaptionsBtn = document.getElementById("syncAudioCaptionsBtn");

  colorSwatchButtons = Array.from(
    document.querySelectorAll(".color-swatch-btn"),
  );
}

// Theme
function updateThemeState() {
  document.body.classList.toggle("theme-dark", !!themeToggle?.checked);
}
function initTheme() {
  const isDark = localStorage.getItem("clipflow-theme") === "dark";
  if (themeToggle) themeToggle.checked = isDark;
  updateModePill();
  updateThemeState();
}
function updateModePill() {
  if (!modePill) return;
  modePill.textContent = themeToggle?.checked ? "Dark" : "Light";
}
function bindTheme() {
  themeToggle?.addEventListener("change", () => {
    localStorage.setItem(
      "clipflow-theme",
      themeToggle.checked ? "dark" : "light",
    );
    updateModePill();
    updateThemeState();
  });
}

// Tabs
function setActiveTab(tabName = "timeline") {
  editorState.activeTab = tabName === "style" ? "style" : "timeline";
  const isTimeline = editorState.activeTab === "timeline";
  if (timelineTabBtn) {
    timelineTabBtn.classList.toggle("is-active", isTimeline);
    timelineTabBtn.setAttribute("aria-selected", isTimeline);
  }
  if (styleTabBtn) {
    styleTabBtn.classList.toggle("is-active", !isTimeline);
    styleTabBtn.setAttribute("aria-selected", !isTimeline);
  }
  if (timelinePanel) {
    timelinePanel.classList.toggle("is-active", isTimeline);
    timelinePanel.hidden = !isTimeline;
    timelinePanel.setAttribute("aria-hidden", !isTimeline);
  }
  if (stylePanel) {
    stylePanel.classList.toggle("is-active", !isTimeline);
    stylePanel.hidden = isTimeline;
    stylePanel.setAttribute("aria-hidden", isTimeline);
  }
  if (timelineActions)
    timelineActions.style.display = isTimeline ? "flex" : "none";
}

// Utils
function uniqueId() {
  return `seg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
function hexToRgb(hex) {
  const clean = (hex || "#000000").replace("#", "");
  const normalized =
    clean.length === 3
      ? clean
          .split("")
          .map((p) => p + p)
          .join("")
      : clean.padEnd(6, "0");
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return [r, g, b];
}
function secondsToClock(totalSeconds) {
  const safe = Math.max(0, Number(totalSeconds) || 0);
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = Math.floor(safe % 60);
  return [hrs, mins, secs].map((p) => String(p).padStart(2, "0")).join(":");
}
function secondsToHMM(totalSeconds) {
  const safe = Math.max(0, Number(totalSeconds) || 0);
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}
function secondsToTimecode(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${secs.toFixed(3).padStart(6, "0")}`;
}
function secondsToSRTTimecode(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = Math.floor(safe % 60);
  const ms = Math.round((safe % 1) * 1000);
  return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}
function clockToSeconds(value) {
  if (!value) return 0;
  const parts = String(value).split(":").map(Number);
  if (parts.some(isNaN)) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return Number(parts[0]) || 0;
}
function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}
function safeVideoTime() {
  return isFiniteNumber(captionVideo?.currentTime)
    ? Number(captionVideo.currentTime)
    : 0;
}
function getClipSource(clip = {}) {
  if (!clip) return "";
  let url =
    clip.previewUrl ||
    clip.downloadUrl ||
    clip.videoUrl ||
    clip.directUrl ||
    clip.url ||
    clip.src ||
    clip.fileUrl ||
    clip.assetUrl ||
    "";

  // If url is a local Windows or file system path, convert to server download endpoint
  if (
    url &&
    (url.includes("\\") ||
      url.startsWith("file:") ||
      url.includes("server/exports") ||
      url.includes("server\\exports"))
  ) {
    const fileName = url.replace(/\\/g, "/").split("/").pop();
    if (fileName && fileName.endsWith(".mp4")) {
      url = `/api/files/download/${encodeURIComponent(fileName)}`;
    }
  }

  // If no url yet, check fileName, outputPath, or filePath
  if (
    !url ||
    (!url.startsWith("http") && !url.startsWith("/") && !url.startsWith("blob:"))
  ) {
    const rawName =
      clip.fileName || clip.outputPath || clip.filePath || clip.localPath || "";
    const fileName = String(rawName).replace(/\\/g, "/").split("/").pop();
    if (fileName && fileName.endsWith(".mp4")) {
      url = `/api/files/download/${encodeURIComponent(fileName)}`;
    }
  }

  return url;
}

function wrapCaptionText(text, maxCharsPerLine) {
  if (!text) return "";
  const clean = String(text).trim();
  if (clean.includes("\n")) {
    const lines = clean.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length > 0) return lines.slice(0, 2).join("\n");
  }

  const words = clean.split(/\s+/).filter(Boolean);
  // 1, 2, 3, 4, 5, 6 words: strictly single row, not column
  if (words.length <= 6) {
    return words.join(" ");
  }

  // More than 6 words: put remaining words in the 2nd row (exactly 2 rows)
  const splitIdx = Math.ceil(words.length / 2);
  const row1 = words.slice(0, splitIdx).join(" ");
  const row2 = words.slice(splitIdx).join(" ");
  return `${row1}\n${row2}`;
}

function getPreviewCharsPerLine(style = editorState.style) {
  const previewW = captionVideo?.clientWidth || 246;
  const previewFs = Number(style?.fontSize || 28);
  return Math.max(18, Math.round((previewW * 0.90) / (previewFs * 0.45)));
}

function formatWordsIntoRows(text, wordsPerRow = 0) {
  if (!text) return "";
  const num = Number(wordsPerRow) || 0;
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  if (num <= 0 || words.length <= num) {
    return words.join(" ");
  }
  const rows = [];
  for (let i = 0; i < words.length; i += num) {
    rows.push(words.slice(i, i + num).join(" "));
  }
  return rows.join("\n");
}

function getParityDisplayText(segment, currentTime, style = editorState.style) {
  if (!segment) return "";

  const anim = style.animationStyle || "none";
  const wordsPerRow = Number(style.wordsPerRow) || 0;
  let text = segment.text || "";

  if (wordsPerRow > 0) {
    return getWordGroupText(segment, currentTime, wordsPerRow);
  }

  if (anim === "oneword") {
    return getWordGroupText(segment, currentTime, 1);
  } else if (anim === "twoword") {
    return getWordGroupText(segment, currentTime, 2);
  } else if (anim === "wordappend") {
    return getWordAppendText(segment, currentTime);
  }

  return wrapCaptionText(text, getPreviewCharsPerLine(style));
}

function computeExportScale() {
  if (!captionVideo) return 1;
  const previewW = captionVideo.clientWidth || 265;
  const nativeW = captionVideo.videoWidth > 0 ? captionVideo.videoWidth : 1080;
  return nativeW / previewW;
}

function buildScaledStyleForExport(baseStyle) {
  const style = normalizeStyle(baseStyle);
  const scale = computeExportScale();
  const sourceAnimationStyle = style.animationStyle || "none";
  const exportVideoWidth =
    captionVideo?.videoWidth && captionVideo.videoWidth > 0
      ? captionVideo.videoWidth
      : 1080;
  const exportVideoHeight =
    captionVideo?.videoHeight && captionVideo.videoHeight > 0
      ? captionVideo.videoHeight
      : 1920;

  return {
    ...style,
    fontSize: Math.round((Number(style.fontSize) || 28) * scale),
    shadowBlur: Math.round((Number(style.shadowBlur) || 0) * scale),
    shadowOffsetX: Math.round((Number(style.shadowOffsetX) || 0) * scale),
    shadowOffsetY: Math.round((Number(style.shadowOffsetY) || 0) * scale),
    paddingX: Math.round((Number(style.paddingX) || 14) * scale),
    paddingY: Math.round((Number(style.paddingY) || 10) * scale),
    borderRadius: Math.round((Number(style.borderRadius) || 14) * scale),
    letterSpacing: parseFloat(
      ((Number(style.letterSpacing) || 0) * scale).toFixed(2),
    ),
    lineHeight: Number(style.lineSpacing || 1.35),
    lineSpacing: Number(style.lineSpacing || 1.35),
    maxWidthPercent: 88,
    positionX: Number(style.positionX ?? 50),
    positionY: Number(style.positionY ?? 82),
    wordsPerRow: Number(style.wordsPerRow || 0),
    animationStyle: sourceAnimationStyle,
    sourceAnimationStyle,
    burnAnimationStyle: "static",
    exportVideoWidth,
    exportVideoHeight,
    playResX: exportVideoWidth,
    playResY: exportVideoHeight,
  };
}

// ─── WORD-BY-WORD HELPERS ────────────────────────────────

/**
 * For oneword / twoword / wordsPerRow: returns the correct word group text based on
 * current playback position within a segment.
 */
function getWordGroupText(seg, currentTime, wordsPerGroup = 1) {
  const groupSize = Math.max(1, Number(wordsPerGroup) || 1);
  const words = String(seg?.text || "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";

  // 1. Precise word-level timestamps from Whisper AI speech recognition
  if (Array.isArray(seg.words) && seg.words.length > 0) {
    const wordGroups = [];
    for (let i = 0; i < seg.words.length; i += groupSize) {
      const slice = seg.words.slice(i, i + groupSize);
      const gStart = Number(slice[0].start);
      const gEnd = Number(slice[slice.length - 1].end);
      const gText = slice.map((w) => (w.word || "").trim()).filter(Boolean).join(" ");
      wordGroups.push({ start: gStart, end: gEnd, text: gText });
    }

    if (wordGroups.length === 0) return "";

    // If currentTime is at or before the first word of the segment (e.g. paused at start):
    if (currentTime <= wordGroups[0].start) {
      return wordGroups[0].text;
    }

    // 1. Exact active group
    let activeGroup = wordGroups.find((g) => currentTime >= g.start && currentTime < g.end);
    if (activeGroup) return activeGroup.text;

    // 2. Micro boundary window (bridge microscopic gaps between word speech timestamps)
    activeGroup = wordGroups.find((g) => currentTime >= g.start - 0.04 && currentTime <= g.end + 0.06);
    if (activeGroup) return activeGroup.text;

    // 3. Fallback to latest spoken group within segment
    const prevGroup = [...wordGroups].reverse().find((g) => currentTime >= g.start);
    return prevGroup ? prevGroup.text : wordGroups[0].text;
  }

  // 2. Fallback for segments without word timestamps
  const duration = Math.max(0.05, (Number(seg.end) || 1) - (Number(seg.start) || 0));
  const elapsed = Math.max(0, currentTime - (Number(seg.start) || 0));
  const progress = Math.min(elapsed / duration, 0.99999);
  const totalGroups = Math.ceil(words.length / groupSize);
  const groupIndex = Math.min(Math.floor(progress * totalGroups), totalGroups - 1);
  const startIdx = groupIndex * groupSize;
  const endIdx = Math.min(startIdx + groupSize, words.length);
  return words.slice(startIdx, endIdx).join(" ");
}

/**
 * For wordappend: returns progressively more words as video plays through segment.
 */
function getWordAppendText(seg, currentTime) {
  const words = seg.text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const duration = Math.max(0.05, seg.end - seg.start);
  const elapsed = Math.max(0, currentTime - seg.start);
  const progress = Math.min(elapsed / duration, 0.99999);
  const wordCount = Math.max(1, Math.ceil(progress * words.length));
  return words.slice(0, wordCount).join(" ");
}

/**
 * For export: splits segments into smaller word-group segments so the
 * server can burn them as timed subtitle events with exact animations.
 * Handles: wordsPerRow, oneword, twoword, wordappend, typewriter.
 */
function expandSegmentsForExport(segments, animStyle, wordsPerRow = 0) {
  const animation = animStyle || "none";
  const numWordsPerRow = Number(wordsPerRow) || 0;
  const splitStyles = ["oneword", "twoword", "typewriter", "wordappend"];

  if (numWordsPerRow <= 0 && !splitStyles.includes(animation)) {
    return segments;
  }

  const expanded = [];

  for (const seg of segments) {
    const words = String(seg.text || "").trim().split(/\s+/).filter(Boolean);

    if (words.length <= 1) {
      expanded.push(seg);
      continue;
    }

    const start = Number(seg.start) || 0;
    const end = Math.max(start + 0.25, Number(seg.end) || start + 0.25);
    const duration = end - start;

    if (numWordsPerRow > 0 || animation === "oneword" || animation === "twoword" || animation === "typewriter") {
      const wordsPerGroup = numWordsPerRow > 0
        ? numWordsPerRow
        : (animation === "twoword" ? 2 : 1);

      // Use real word-level timestamps when available so silence gaps are preserved in export
      if (Array.isArray(seg.words) && seg.words.length > 0) {
        for (let i = 0; i < seg.words.length; i += wordsPerGroup) {
          const slice = seg.words.slice(i, i + wordsPerGroup);
          const subStart = Math.round(Number(slice[0].start) * 1000) / 1000;
          const subEnd = Math.round(Number(slice[slice.length - 1].end) * 1000) / 1000;
          const text = slice.map((w) => w.word).join(" ");
          if (subEnd > subStart) {
            expanded.push({
              ...seg,
              id: `${seg.id || "seg"}-chunk-${i}`,
              start: subStart,
              end: subEnd,
              text,
            });
          }
        }
        continue;
      }

      const groups = [];
      for (let i = 0; i < words.length; i += wordsPerGroup) {
        groups.push(words.slice(i, i + wordsPerGroup).join(" "));
      }

      const minGroupDuration = 0.18;
      const timePerGroup = Math.max(minGroupDuration, duration / groups.length);

      groups.forEach((text, i) => {
        const subStart = Math.round((start + i * timePerGroup) * 1000) / 1000;
        const subEnd =
          i < groups.length - 1
            ? Math.round(Math.min(start + (i + 1) * timePerGroup, end) * 1000) / 1000
            : Math.round(end * 1000) / 1000;

        if (subEnd > subStart && subStart < end) {
          expanded.push({
            ...seg,
            id: `${seg.id || "seg"}-chunk-${i}`,
            start: subStart,
            end: subEnd,
            text,
          });
        }
      });

      continue;
    }

    if (animation === "wordappend") {
      const revealWindow = Math.min(duration * 0.55, Math.max(0.35, words.length * 0.09));
      const timePerWord = revealWindow / words.length;

      for (let i = 0; i < words.length; i++) {
        const subStart = Math.round((start + i * timePerWord) * 1000) / 1000;
        const subEnd =
          i < words.length - 1
            ? Math.round((start + (i + 1) * timePerWord) * 1000) / 1000
            : Math.round(end * 1000) / 1000;

        if (subEnd > subStart && subStart < end) {
          expanded.push({
            ...seg,
            id: `${seg.id || "seg"}-${animation}-append-${i}`,
            start: subStart,
            end: subEnd,
            text: words.slice(0, i + 1).join(" "),
          });
        }
      }
    }
  }

  return expanded
    .filter((s) => s.text && Number(s.end) > Number(s.start))
    .sort((a, b) => Number(a.start) - Number(b.start));
}
// Session
function loadSession() {
  let session = null;
  const raw = localStorage.getItem(SESSION_KEY);
  if (raw) {
    try {
      session = JSON.parse(raw);
    } catch {}
  }

  // Check URL search params (?index=X)
  const urlParams = new URLSearchParams(window.location.search);
  const paramIndex = urlParams.get("index");
  const hasParamIndex = paramIndex !== null && !isNaN(parseInt(paramIndex, 10));
  const requestedIdx = hasParamIndex ? parseInt(paramIndex, 10) : null;

  // If session has a clip and matches requestedIdx (or no index was requested), return it
  if (session?.clip && getClipSource(session.clip)) {
    if (requestedIdx === null || Number(session.index) === requestedIdx) {
      return session;
    }
  }

  const targetIdx = requestedIdx !== null ? requestedIdx : 0;

  // Fallback 1: check studio session
  const studioRaw = localStorage.getItem("clipflow-studio-session");
  if (studioRaw) {
    try {
      const studio = JSON.parse(studioRaw);
      const clips = Array.isArray(studio.generatedClips)
        ? studio.generatedClips
        : [];
      const clip = clips[targetIdx] || (requestedIdx === null ? (clips[0] || studio.generatedClip) : null);
      if (clip) {
        return {
          clip,
          index: targetIdx,
          captions:
            (studio.clipCaptions && studio.clipCaptions[targetIdx]) || clip.captions || [],
          captionStyle: studio.captionStyle || null,
        };
      }
    } catch {}
  }

  // Fallback 2: check all projects cache in localStorage
  const projectsRaw =
    localStorage.getItem("clipflow_all_projects_v2") ||
    localStorage.getItem("clipflow_all_projects");
  if (projectsRaw) {
    try {
      const projects = JSON.parse(projectsRaw);
      if (Array.isArray(projects) && projects.length) {
        for (const proj of projects) {
          const clips = Array.isArray(proj.clips) ? proj.clips : [];
          if (clips[targetIdx]) {
            return {
              clip: clips[targetIdx],
              index: targetIdx,
              captions:
                (proj.clipCaptions && proj.clipCaptions[targetIdx]) || clips[targetIdx].captions || [],
              captionStyle: proj.captionStyle || null,
            };
          }
        }
      }
    } catch {}
  }

  return session;
}
function persistCaptions() {
  const existing = loadSession() || {};
  const payload = {
    ...existing,
    clip: editorState.clip,
    index: editorState.clipIndex,
    captions: editorState.segments.map((s) => ({
      id: s.id,
      start: s.start,
      end: s.end,
      text: s.text,
    })),
    captionStyle: { ...editorState.style },
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
  localStorage.setItem(STYLE_KEY, JSON.stringify(editorState.style));
}

// Segments normalization
function normalizeCaptionText(value = "") {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCaptionCompareText(value = "") {
  return normalizeCaptionText(value)
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+([,.;!?])/g, "$1");
}

function normalizeCaptionWord(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

function collapseRepeatedCaptionText(value = "") {
  const cleaned = normalizeCaptionText(value);
  if (!cleaned) return "";

  let words = cleaned.split(/\s+/);

  // Collapse exact full-line phrase repeats:
  // "this is good this is good" -> "this is good".
  for (let size = 2; size <= Math.floor(words.length / 2); size++) {
    if (words.length % size !== 0) continue;
    const first = words.slice(0, size).map(normalizeCaptionWord).join(" ");
    let repeated = true;
    for (let i = size; i < words.length; i += size) {
      const part = words
        .slice(i, i + size)
        .map(normalizeCaptionWord)
        .join(" ");
      if (part !== first) {
        repeated = false;
        break;
      }
    }
    if (repeated) return words.slice(0, size).join(" ");
  }

  // Collapse accidental 3x+ repeated single words without touching natural doubles.
  const compact = [];
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const norm = normalizeCaptionWord(word);
    const prev = normalizeCaptionWord(compact[compact.length - 1] || "");
    const next = normalizeCaptionWord(words[i + 1] || "");
    const next2 = normalizeCaptionWord(words[i + 2] || "");

    if (norm && norm === prev && norm === next) continue;
    if (norm && norm === next && norm === next2) {
      compact.push(word);
      while (normalizeCaptionWord(words[i + 1] || "") === norm) i++;
      continue;
    }
    compact.push(word);
  }

  return compact.join(" ").trim();
}

function dedupeCaptionSegments(segments = []) {
  const output = [];

  for (const seg of segments) {
    const text = collapseRepeatedCaptionText(seg.text);
    if (!text) continue;

    const candidate = { ...seg, text };
    const norm = normalizeCaptionCompareText(candidate.text);
    const duplicate = output.some((existing) => {
      const existingNorm = normalizeCaptionCompareText(existing.text);
      if (existingNorm !== norm) return false;

      const startDelta = Math.abs(
        (Number(existing.start) || 0) - candidate.start,
      );
      const endDelta = Math.abs((Number(existing.end) || 0) - candidate.end);
      const overlaps =
        candidate.start < existing.end && candidate.end > existing.start;
      const nearTouching = Math.abs(candidate.start - existing.end) <= 0.35;

      return (
        (startDelta <= 0.25 && endDelta <= 0.45) || overlaps || nearTouching
      );
    });

    if (!duplicate) output.push(candidate);
  }

  return output;
}

function normalizeSegments(segments = []) {
  const normalized = segments
    .map((s) => ({
      id: s.id || uniqueId(),
      start: clamp(Number(s.start) || 0, 0, Number.MAX_SAFE_INTEGER),
      end: clamp(Number(s.end) || 0, 0, Number.MAX_SAFE_INTEGER),
      text: collapseRepeatedCaptionText(s.text || ""),
      words: Array.isArray(s.words) ? s.words : undefined,
    }))
    .filter((s) => s.text && s.end > s.start)
    .map((s) => ({ ...s, end: s.end > s.start ? s.end : s.start + 1.5 }))
    .sort((a, b) => a.start - b.start);

  return dedupeCaptionSegments(normalized);
}

// VTT parsing
function vttTimeToSeconds(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.replace(",", ".").split(":");
  if (parts.length === 3)
    return (
      parseFloat(parts[0]) * 3600 +
      parseFloat(parts[1]) * 60 +
      parseFloat(parts[2])
    );
  if (parts.length === 2)
    return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
  return parseFloat(parts[0]) || 0;
}
function parseVTT(vttText = "") {
  const segments = [];
  const lines = vttText.split(/\r?\n/);
  let index = 0;
  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line.includes("-->")) {
      index++;
      continue;
    }
    const [startStr, rest] = line.split("-->");
    const endStr = (rest || "").trim().split(" ")[0];
    const start = vttTimeToSeconds(startStr.trim());
    const end = vttTimeToSeconds(endStr.trim());
    index++;
    const textLines = [];
    while (index < lines.length && lines[index].trim() !== "") {
      textLines.push(lines[index].replace(/<[^>]+>/g, "").trim());
      index++;
    }
    const text = textLines.join(" ").trim();
    if (text && !isNaN(start) && !isNaN(end))
      segments.push({ id: uniqueId(), start, end, text });
  }
  return normalizeSegments(segments);
}

function extractSegmentsFromPayload(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return normalizeSegments(payload);
  const candidates = [
    payload.segments,
    payload.captions,
    payload.subtitleSegments,
    payload.data?.segments,
    payload.data?.captions,
    payload.data?.subtitleSegments,
    payload.result?.segments,
    payload.result?.captions,
    payload.result?.subtitleSegments,
  ];
  for (const c of candidates)
    if (Array.isArray(c) && c.length) return normalizeSegments(c);
  const wordCandidates = [
    payload.words,
    payload.data?.words,
    payload.result?.words,
  ];
  for (const words of wordCandidates) {
    if (Array.isArray(words) && words.length) {
      const fromWords = buildSegmentsFromWords(words);
      if (fromWords.length) return fromWords;
    }
  }
  const vttCandidate =
    payload.vtt ||
    payload.webvtt ||
    payload.data?.vtt ||
    payload.data?.webvtt ||
    payload.result?.vtt ||
    payload.result?.webvtt ||
    "";
  if (typeof vttCandidate === "string" && vttCandidate.includes("-->"))
    return parseVTT(vttCandidate);
  return [];
}

function buildSegmentsFromWords(words = []) {
  if (!Array.isArray(words) || !words.length) return [];
  const segments = [];
  let chunk = [],
    chunkStart = null,
    chunkEnd = null;
  const flush = () => {
    if (!chunk.length || chunkStart === null || chunkEnd === null) return;
    segments.push({
      id: uniqueId(),
      start: chunkStart,
      end: Math.max(chunkEnd, chunkStart + 0.5),
      text: chunk
        .join(" ")
        .replace(/\s+([,.;!?])/g, "$1")
        .trim(),
    });
    chunk = [];
    chunkStart = null;
    chunkEnd = null;
  };
  words.forEach((item, idx) => {
    const text = String(
      item?.text || item?.word || item?.token || item?.value || "",
    ).trim();
    const start = Number(
      item?.start ?? item?.startTime ?? item?.from ?? item?.offset,
    );
    const end = Number(
      item?.end ?? item?.endTime ?? item?.to ?? item?.offsetEnd ?? start,
    );
    if (!text || !Number.isFinite(start)) return;
    if (chunkStart === null) chunkStart = start;
    const prevEnd = chunkEnd;
    chunk.push(text);
    chunkEnd = Number.isFinite(end) ? end : start + 0.4;
    const shouldFlush =
      /[.!?]$/.test(text) ||
      chunk.length >= 5 ||
      (prevEnd !== null && start - prevEnd > 0.45) ||
      idx === words.length - 1;
    if (shouldFlush) flush();
  });
  flush();
  return normalizeSegments(segments);
}

function isPlaceholderOrMockCaptions(segments, clip) {
  if (!Array.isArray(segments) || !segments.length) return true;
  const mockPhrases = [
    "welcome to this video",
    "today we'll explore",
    "let's dive right in",
    "this is a powerful moment",
    "here is where the key insight",
    "a compelling story",
    "robert greene reveals",
    "robert greene",
    "true mastery begins",
    "notice how this works",
    "that's the main idea",
    "now let's continue",
    "pay attention to this",
    "and that's it for now",
    "a powerful mindset shift",
    "mindset shift",
  ];
  const hookText = String(clip?.hook || "").trim().toLowerCase();
  const titleText = String(clip?.title || "").trim().toLowerCase();

  // If combined text matches hook or title exactly or stripped of spaces
  const combined = segments
    .map((s) => String(s.text || "").trim().toLowerCase())
    .join(" ");
  const combinedCompact = combined.replace(/[^a-z0-9]/g, "");

  if (hookText) {
    const hookCompact = hookText.replace(/[^a-z0-9]/g, "");
    if (combined === hookText || (hookCompact && combinedCompact === hookCompact)) {
      return true;
    }
  }
  if (titleText) {
    const titleCompact = titleText.replace(/[^a-z0-9]/g, "");
    if (combined === titleText || (titleCompact && combinedCompact === titleCompact)) {
      return true;
    }
  }

  // Check if every segment text is merely words from the hook or title
  const hookWords = new Set(
    (hookText + " " + titleText)
      .toLowerCase()
      .split(/\s+/)
      .map((w) => w.replace(/[^a-z0-9]/g, ""))
      .filter(Boolean)
  );
  if (hookWords.size > 0 && segments.length <= 8) {
    const allAreHookWords = segments.every((s) => {
      const clean = String(s.text || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
      return !clean || hookWords.has(clean);
    });
    if (allAreHookWords) return true;
  }

  // Any mock phrase match
  const hasMockPhrase = segments.some((s) => {
    const txt = String(s.text || "").trim().toLowerCase();
    return mockPhrases.some((m) => txt.includes(m));
  });
  if (hasMockPhrase) return true;

  // Real Whisper transcriptions have word-level data (words array) and more segments
  const hasWordTimestamps = segments.some(
    (s) => Array.isArray(s.words) && s.words.length > 0
  );
  if (!hasWordTimestamps && segments.length <= 4) {
    return true;
  }

  return false;
}

async function fetchServerCaptions(clip) {
  console.log("Fetching captions for clip:", clip);

  const embedded = extractSegmentsFromPayload(
    clip?.captions ||
      clip?.segments ||
      clip?.subtitleSegments ||
      clip?.transcript,
  );
  if (embedded.length && !isPlaceholderOrMockCaptions(embedded, clip)) {
    console.log("Using real embedded captions:", embedded.length);
    return embedded;
  }

  const controller = new AbortController();
  // 60-second timeout for Whisper AI speech transcription
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    const sourceUrl = getClipSource(clip);
    const pathCandidates = getClipPathCandidates(clip);

    const payload = {
      inputPath:
        pathCandidates[0] || clip.filePath || clip.inputPath || clip.sourcePath,
      url: sourceUrl,
      previewUrl: clip.previewUrl || "",
      downloadUrl: clip.downloadUrl || "",
    };

    console.log(
      "Requesting captions from:",
      `${API_BASE}/captions/preview`,
      payload,
    );

    const response = await fetch(`${API_BASE}/captions/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Caption API error:", response.status, errorText);
      throw new Error(`API returned ${response.status}`);
    }

    const data = await response.json();
    console.log("Caption API response:", data);

    let segments = extractSegmentsFromPayload(data);
    if (segments.length) return segments;

    const trackUrls = getTrackUrlCandidates(clip, data);
    for (const trackUrl of trackUrls) {
      console.log("Fetching track from URL:", trackUrl);
      const trackResp = await fetch(trackUrl, { signal: controller.signal });
      if (trackResp.ok) {
        const contentType = trackResp.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const trackData = await trackResp.json();
          segments = extractSegmentsFromPayload(trackData);
        } else {
          const text = await trackResp.text();
          if (text.includes("-->")) segments = parseVTT(text);
        }
        if (segments.length) return segments;
      }
    }

    console.warn("No captions found in response, using fallback");
    return [];
  } catch (error) {
    console.error("Failed to fetch captions:", error);
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

function getClipPathCandidates(clip = {}) {
  const candidates = new Set();
  [
    clip.filePath,
    clip.inputPath,
    clip.sourcePath,
    clip.clipPath,
    clip.relativePath,
    clip.storagePath,
    clip.outputPath,
    clip.localPath,
    getClipSource(clip),
    clip.previewUrl,
    clip.downloadUrl,
  ].forEach((v) => {
    if (typeof v === "string" && v.trim()) candidates.add(v.trim());
  });
  return Array.from(candidates);
}

function getTrackUrlCandidates(clip = {}, payload = null) {
  const candidates = new Set();
  [
    clip.trackUrl,
    clip.captionTrackUrl,
    clip.captionsUrl,
    clip.vttUrl,
    clip.subtitleUrl,
    clip.subtitleTrackUrl,
    payload?.trackUrl,
    payload?.captionTrackUrl,
    payload?.captionsUrl,
    payload?.vttUrl,
    payload?.subtitleUrl,
    payload?.data?.trackUrl,
    payload?.data?.captionTrackUrl,
    payload?.data?.captionsUrl,
    payload?.data?.vttUrl,
    payload?.data?.subtitleUrl,
    payload?.result?.trackUrl,
    payload?.result?.captionTrackUrl,
    payload?.result?.captionsUrl,
    payload?.result?.vttUrl,
    payload?.result?.subtitleUrl,
  ].forEach((v) => {
    if (typeof v === "string" && v.trim()) candidates.add(v.trim());
  });
  return Array.from(candidates);
}

function generateSmartCaptionsForClip(clip = {}, duration = 30) {
  const dur = Math.max(5, Number(duration) || 30);
  const rawText =
    clip.hook ||
    clip.description ||
    clip.title ||
    clip.text ||
    clip.transcript ||
    clip.summary ||
    "Robert Greene reveals that true mastery begins when you turn your focus inward. When you work on yourself, everything starts to make sense. Stop chasing opportunities and start creating them.";

  const words = String(rawText).trim().split(/\s+/).filter(Boolean);
  if (!words.length) {
    return generateFallbackCaptions(dur);
  }

  const chunks = [];
  const wordsPerChunk = 5;
  for (let i = 0; i < words.length; i += wordsPerChunk) {
    chunks.push(words.slice(i, i + wordsPerChunk).join(" "));
  }

  const timePerChunk = Math.max(1.4, (dur - 1) / chunks.length);
  const segments = [];

  chunks.forEach((chunkText, i) => {
    const start = Math.round((0.5 + i * timePerChunk) * 100) / 100;
    const end = Math.round(Math.min(dur - 0.2, start + timePerChunk - 0.2) * 100) / 100;
    if (end > start) {
      segments.push({
        id: uniqueId(),
        start,
        end,
        text: chunkText,
      });
    }
  });

  return segments.length ? segments : generateFallbackCaptions(dur);
}

function generateFallbackCaptions(duration = 30) {
  const phrases = [
    "Welcome to this video.",
    "Today we'll explore something new.",
    "Let's dive right in.",
    "This is the key point.",
    "Notice how this works.",
    "That's the main idea.",
    "Now let's continue.",
    "Here's another example.",
    "Pay attention to this.",
    "And that's it for now.",
  ];
  const segments = [];
  let t = 0.8;
  let i = 0;
  while (t < duration - 0.5 && segments.length < 20) {
    const dur = 2 + Math.random() * 2;
    segments.push({
      id: uniqueId(),
      start: Math.round(t * 100) / 100,
      end: Math.round(Math.min(duration, t + dur) * 100) / 100,
      text: phrases[i % phrases.length],
    });
    t += dur + 0.3;
    i++;
  }
  return segments;
}

// ─── REALTIME CAPTIONS ENGINE ────────────────────────────

function startRealtimeCaptions(clip) {
  if (!clip) return;

  // Existing timeline captions are the source of truth. Do not start the
  // realtime stream on top of them, because it can repeat/override lines.
  if (editorState.segments.length > 0) return;

  const sourceUrl = getClipSource(clip);
  if (!sourceUrl) {
    console.warn("Realtime captions skipped: no clip source URL found.");
    return;
  }

  stopRealtimeCaptions();

  const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsHost = window.location.host;
  const wsUrl = `${wsProtocol}//${wsHost}${API_BASE}/captions/stream`;

  console.log("🎤 Starting realtime captions:", sourceUrl);
  console.log("🎤 Realtime socket URL:", wsUrl);

  realtimeSocket = new WebSocket(wsUrl);

  realtimeSocket.onopen = () => {
    realtimeActive = true;
    realtimeLastFlushTime = performance.now();
    realtimeWordStreamSeen = false;

    realtimeShouldPersistSegments = editorState.segments.length === 0;
    if (!realtimeShouldPersistSegments) {
      stopRealtimeCaptions();
      return;
    }

    const inputPath =
      clip.filePath ||
      clip.inputPath ||
      clip.sourcePath ||
      clip.localPath ||
      clip.downloadUrl ||
      sourceUrl;

    realtimeSocket.send(
      JSON.stringify({
        type: "start",
        inputPath,
        url: sourceUrl,
      }),
    );
  };

  realtimeSocket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      if (data.word) {
        realtimeWordStreamSeen = true;
        handleRealtimeWord(typeof data.word === "object" ? data.word : data);
      }

      if (data.segment && !realtimeWordStreamSeen) {
        addRealtimeSegment(
          typeof data.segment === "object" ? data.segment : data,
        );
      }
    } catch (e) {
      console.error("Realtime parse error:", e);
    }
  };

  realtimeSocket.onerror = (err) => {
    console.error("Realtime socket error:", err);
  };

  realtimeSocket.onclose = () => {
    realtimeActive = false;
    console.log("🛑 Realtime captions stopped");
  };
}

function handleRealtimeWord(wordData) {
  const text = String(wordData.word || "").trim();
  const start = Number(wordData.start);
  const end = Number(wordData.end || start + 0.4);

  if (!text || !Number.isFinite(start)) return;

  realtimeBuffer.push({ text, start, end });

  const first = realtimeBuffer[0];
  const last = realtimeBuffer[realtimeBuffer.length - 1];

  const now = performance.now();

  const shouldFlush =
    /[.!?]$/.test(text) ||
    realtimeBuffer.length >= 6 ||
    last.start - first.start > 2.5 ||
    now - realtimeLastFlushTime > 2000;

  if (shouldFlush) {
    flushRealtimeSegment();
    realtimeLastFlushTime = now;
  }

  syncRealtimeOverlay();
}
function isDuplicateRealtimeSegment(candidate) {
  if (!candidate?.text) return false;

  const normText = String(candidate.text)
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

  const candStart = Number(candidate.start) || 0;
  const candEnd = Number(candidate.end) || 0;

  return editorState.segments.some((seg) => {
    const segText = String(seg.text || "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();

    const startDelta = Math.abs((Number(seg.start) || 0) - candStart);
    const endDelta = Math.abs((Number(seg.end) || 0) - candEnd);

    return segText === normText && startDelta <= 0.18 && endDelta <= 0.18;
  });
}
function flushRealtimeSegment() {
  if (!realtimeBuffer.length) return;

  const first = realtimeBuffer[0];
  const last = realtimeBuffer[realtimeBuffer.length - 1];

  const segment = {
    id: uniqueId(),
    start: first.start,
    end: last.end,
    text: collapseRepeatedCaptionText(
      realtimeBuffer.map((w) => w.text).join(" "),
    ),
  };

  if (
    segment.text &&
    realtimeShouldPersistSegments &&
    !isDuplicateRealtimeSegment(segment)
  ) {
    editorState.segments.push(segment);
    editorState.segments = normalizeSegments(editorState.segments);
    renderTimeline();
    persistCaptions();
  }

  realtimeBuffer = [];
}

function syncRealtimeOverlay() {
  if (!captionOverlayText || !captionOverlay) return;
  if (!realtimeShouldPersistSegments) return;

  const words = realtimeBuffer.map((w) => w.text).filter(Boolean);
  if (!words.length) return;

  const anim = editorState.style.animationStyle || "none";
  let text = words.join(" ");

  if (anim === "oneword") {
    text = words.slice(-1).join(" ");
  } else if (anim === "twoword") {
    text = words.slice(-2).join(" ");
  } else if (anim === "wordappend") {
    text = words.join(" ");
  }

  if (!text) return;

  renderAnimatedCaption(text, "realtime");
  captionOverlay.style.opacity = "1";
}

function addRealtimeSegment(seg) {
  if (!seg?.text || !realtimeShouldPersistSegments) return;

  const candidate = {
    id: uniqueId(),
    start: Number(seg.start) || 0,
    end: Number(seg.end) || 0,
    text: collapseRepeatedCaptionText(seg.text),
  };

  if (!candidate.text || isDuplicateRealtimeSegment(candidate)) return;

  editorState.segments.push(candidate);
  editorState.segments = normalizeSegments(editorState.segments);

  renderTimeline();
  persistCaptions();
}

function stopRealtimeCaptions() {
  flushRealtimeSegment();

  if (realtimeSocket) {
    realtimeSocket.close();
    realtimeSocket = null;
  }

  realtimeActive = false;
  realtimeBuffer = [];
  realtimeWordStreamSeen = false;
  realtimeShouldPersistSegments = false;
}

// UI state
function showLoadingState(message = "Generating captions via server...") {
  if (captionLoadingState) {
    captionLoadingState.style.display = "grid";
    captionLoadingState.querySelector(".caption-loading-copy").textContent =
      message;
  }
  if (captionSegmentsList) captionSegmentsList.style.display = "none";
}
function showTimelineList() {
  if (captionLoadingState) captionLoadingState.style.display = "none";
  if (captionSegmentsList) captionSegmentsList.style.display = "flex";
  renderTimeline();
}

// Timeline rendering
function cssEscape(v) {
  return window.CSS?.escape
    ? window.CSS.escape(v)
    : String(v).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}
function setActiveSegment(id, shouldScroll = false) {
  editorState.activeSegmentId = id;
  captionSegmentsList?.querySelectorAll(".caption-segment").forEach((el) => {
    const isActive = el.dataset.id === id;
    el.classList.toggle("active", isActive);
    el.closest(".timeline-entry")?.classList.toggle("active-entry", isActive);
  });
  if (shouldScroll && id) {
    const activeEl = captionSegmentsList?.querySelector(
      `.caption-segment[data-id="${cssEscape(id)}"]`,
    );
    activeEl?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}
function formatSegmentTemplate(seg) {
  const duration = Math.max(0, seg.end - seg.start).toFixed(1);
  const isActive = seg.id === editorState.activeSegmentId;
  return `<div class="timeline-entry${isActive ? " active-entry" : ""}"><div class="timeline-rail"><div class="timeline-dot"></div><div class="timeline-track"></div></div><article class="caption-segment${isActive ? " active" : ""}" data-id="${escapeHtml(seg.id)}"><div class="caption-segment-time"><div class="segment-range">${secondsToHMM(seg.start)} → ${secondsToHMM(seg.end)}</div><div class="segment-duration-badge">${duration}s</div><div class="segment-time-grid"><label class="segment-time-field"><span>Start</span><input class="segment-time-input" data-role="start" data-id="${escapeHtml(seg.id)}" type="text" value="${secondsToClock(seg.start)}"></label><label class="segment-time-field"><span>End</span><input class="segment-time-input" data-role="end" data-id="${escapeHtml(seg.id)}" type="text" value="${secondsToClock(seg.end)}"></label></div></div><textarea class="caption-segment-text" data-id="${escapeHtml(seg.id)}" rows="3">${escapeHtml(seg.text)}</textarea><button class="segment-delete-btn" type="button" data-id="${escapeHtml(seg.id)}">×</button></article></div>`;
}
function renderTimeline() {
  if (!captionSegmentsList) return;
  if (segmentCountBadge) {
    const count = editorState.segments.length;
    segmentCountBadge.textContent = `${count} segment${count === 1 ? "" : "s"}`;
  }
  if (!editorState.segments.length) {
    captionSegmentsList.innerHTML =
      '<div class="empty-state">No captions yet. Click <strong>↺ Regenerate</strong> to generate from server.</div>';
    return;
  }
  captionSegmentsList.innerHTML = editorState.segments
    .map(formatSegmentTemplate)
    .join("");
  captionSegmentsList.querySelectorAll(".caption-segment").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target.closest("textarea, input, button")) return;
      const id = el.dataset.id;
      const seg = editorState.segments.find((s) => s.id === id);
      if (seg && captionVideo) {
        captionVideo.currentTime = seg.start;
        setActiveSegment(id, true);
        _lastRenderedSegId = null;
        _lastRenderedText = null;
        syncCaptionOverlay();
      }
    });
  });
  captionSegmentsList
    .querySelectorAll(".caption-segment-text")
    .forEach((ta) => {
      ta.addEventListener("focus", () => setActiveSegment(ta.dataset.id));
      ta.addEventListener("input", () => {
        const seg = editorState.segments.find((s) => s.id === ta.dataset.id);
        if (seg) {
          seg.text = ta.value;
          _lastRenderedSegId = null;
          _lastRenderedText = null;
          persistCaptions();
          syncCaptionOverlay();
        }
      });
    });
  captionSegmentsList.querySelectorAll(".segment-time-input").forEach((inp) => {
    inp.addEventListener("focus", () => setActiveSegment(inp.dataset.id));
    inp.addEventListener("change", () => {
      const seg = editorState.segments.find((s) => s.id === inp.dataset.id);
      if (!seg) return;
      const raw = clamp(
        clockToSeconds(inp.value),
        0,
        captionVideo?.duration || 36000,
      );
      if (inp.dataset.role === "start") {
        seg.start = raw;
        if (seg.end <= seg.start) seg.end = seg.start + 0.6;
      } else {
        seg.end = Math.max(raw, seg.start + 0.6);
      }
      editorState.segments = normalizeSegments(editorState.segments);
      _lastRenderedSegId = null;
      _lastRenderedText = null;
      persistCaptions();
      renderTimeline();
      setActiveSegment(seg.id, true);
      syncCaptionOverlay();
    });
  });
  captionSegmentsList.querySelectorAll(".segment-delete-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      editorState.segments = editorState.segments.filter(
        (s) => s.id !== btn.dataset.id,
      );
      if (editorState.activeSegmentId === btn.dataset.id)
        editorState.activeSegmentId = editorState.segments[0]?.id || null;
      _lastRenderedSegId = null;
      _lastRenderedText = null;
      persistCaptions();
      renderTimeline();
      syncCaptionOverlay();
    });
  });
}

// Style & overlay
function getShadowCss(style) {
  if (!style.textShadow) return "none";
  const blur = clamp(Number(style.shadowBlur) || 0, 0, 30);
  const offX = clamp(Number(style.shadowOffsetX) || 0, -20, 20);
  const offY = clamp(Number(style.shadowOffsetY) || 0, -20, 20);
  return `${offX}px ${offY}px ${blur}px ${style.shadowColor || "#000"}`;
}
function getTextTransformCss(style) {
  return style.textTransform || "none";
}
function normalizeStyle(style = {}) {
  const merged = { ...DEFAULT_STYLE, ...(style || {}) };
  merged.positionX = Number(merged.positionX ?? 50);
  merged.positionY = Number(merged.positionY ?? 82);
  merged.wordsPerRow = Number(merged.wordsPerRow ?? 0);
  merged.fontSize = clamp(Number(merged.fontSize ?? 28), 12, 72);
  merged.paddingX = clamp(Number(merged.paddingX ?? 14), 4, 60);
  merged.paddingY = clamp(Number(merged.paddingY ?? 10), 2, 40);
  merged.lineSpacing = clamp(parseFloat(merged.lineSpacing ?? 1.35), 0.8, 2.5);
  merged.presetDuration = clamp(parseFloat(merged.presetDuration ?? 0.6), 0.2, 2.5);
  merged.letterSpacing = clamp(parseFloat(merged.letterSpacing ?? 0), -2, 14);
  merged.strokeWidth = clamp(parseInt(merged.strokeWidth ?? 0, 10), 0, 10);
  merged.strokeColor = merged.strokeColor || "#000000";
  merged.glowIntensity = clamp(parseInt(merged.glowIntensity ?? 0, 10), 0, 30);
  merged.rotateAngle = clamp(parseInt(merged.rotateAngle ?? 0, 10), -15, 15);
  merged.textTransform = merged.textTransform || "none";
  return merged;
}

function styleMatchesPreset(style, presetStyle) {
  if (style?.activePresetId) {
    return style.activePresetId === presetStyle.id;
  }
  return style?.animationStyle === presetStyle.style?.animationStyle;
}

function applyTextBoxVisuals(element, style) {
  if (!element) return;
  const merged = normalizeStyle(style);
  const [r, g, b] = hexToRgb(merged.bgColor);
  const op = clamp(Number(merged.bgOpacity) || 0, 100) / 100;

  element.style.removeProperty("filter");
  element.style.removeProperty("transform");
  element.style.removeProperty("box-shadow");
  element.style.fontStyle = "normal";
  element.style.fontFamily = merged.fontFamily;
  element.style.fontSize = `${merged.fontSize}px`;
  element.style.color = merged.textColor;
  element.style.background = `rgba(${r},${g},${b},${op})`;
  element.style.textShadow = getShadowCss(merged);
  element.style.fontWeight = String(merged.fontWeight || 800);
  element.style.textTransform = getTextTransformCss(merged);
  element.style.letterSpacing = `${Number(merged.letterSpacing) || 0}px`;
  element.style.borderRadius = `${Number(merged.borderRadius) || 14}px`;
  element.style.padding = `${Number(merged.paddingY) || 8}px ${Number(merged.paddingX) || 14}px`;
  
  const lineSpacing = Number(merged.lineSpacing || 1.35);
  element.style.lineHeight = String(lineSpacing);
  element.style.setProperty("--caption-line-height", String(lineSpacing));

  element.style.width = "max-content";
  element.style.maxWidth = "92%";
  element.style.boxSizing = "border-box";
  element.style.whiteSpace = "normal";
  element.style.wordBreak = "keep-all";
  element.style.overflowWrap = "normal";

  // Dynamic animation cadence / speed from preset duration
  element.style.setProperty("--preset-duration", `${Number(merged.presetDuration || 0.6)}s`);

  // Stroke / Outline
  const strokeW = Number(merged.strokeWidth) || 0;
  const strokeC = merged.strokeColor || "#000000";
  if (strokeW > 0) {
    element.style.webkitTextStroke = `${strokeW}px ${strokeC}`;
  } else {
    element.style.webkitTextStroke = "0px transparent";
  }

  // Neon Glow filter
  const glow = Number(merged.glowIntensity) || 0;
  if (glow > 0) {
    const glowColor = merged.shadowColor || merged.textColor || "#00e5ff";
    element.style.filter = `drop-shadow(0 0 ${glow}px ${glowColor})`;
  } else {
    element.style.removeProperty("filter");
  }

  // Tilt / Rotation
  const rot = Number(merged.rotateAngle) || 0;
  if (rot !== 0) {
    element.style.transform = `rotate(${rot}deg)`;
  } else {
    element.style.removeProperty("transform");
  }
}

function resetCaptionRenderCache() {
  _lastRenderedSegId = null;
  _lastRenderedText = null;
  _lastRenderedAnim = null;
  _lastRenderedWordsPerRow = null;
  if (captionLivePreview) delete captionLivePreview.dataset.lastKey;
}
function updateShadowControlsState() {
  if (shadowControlsGrid)
    shadowControlsGrid.classList.toggle("is-disabled", !capTextShadow?.checked);
}
function updateColorSwatchState() {
  if (!colorSwatchButtons.length) return;
  const map = {
    capTextColor: (capTextColor?.value || "").toLowerCase(),
    capBgColor: (capBgColor?.value || "").toLowerCase(),
    capShadowColor: (capShadowColor?.value || "").toLowerCase(),
  };
  colorSwatchButtons.forEach((btn) =>
    btn.classList.toggle(
      "active",
      map[btn.dataset.target] === (btn.dataset.value || "").toLowerCase(),
    ),
  );
}
function bindColorSwatches() {
  colorSwatchButtons.forEach((btn) =>
    btn.addEventListener("click", () => {
      const target = document.getElementById(btn.dataset.target);
      if (target && btn.dataset.value) {
        target.value = btn.dataset.value;
        syncStyleFromControls();
        updateColorSwatchState();
      }
    }),
  );
}

// Layout reorganization no-op since captions.html is already authored correctly
function reorganizeStyleLayout() {}

// ─── ANIMATION RENDERERS ──────────────────────────────────

/**
 * Renders words with staggered delays for word animations.
 */
function renderWordGroupCaption(text, container, animClass) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  container.innerHTML = words
    .map(
      (w, i) =>
        `<span class="cap-word ${animClass}" style="--word-delay:${(i * 0.05).toFixed(3)}s">${escapeHtml(w)}</span>`,
    )
    .join(" ");
}

function renderWordColorCaption(text, container) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const colors = [
    "#ffffff",
    "#F5D76E",
    "#00e5ff",
    "#ff6b6b",
    "#4ade80",
    "#c084fc",
    "#fb923c",
  ];
  container.innerHTML = words
    .map((w, i) => {
      const col = colors[i % colors.length];
      return `<span class="cap-word cap-word--wordcolor" style="color:${col};--word-delay:${(i * 0.06).toFixed(3)}s">${escapeHtml(w)}</span>`;
    })
    .join(" ");
}

function renderWordAppendCaption(text, container) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  container.innerHTML = words
    .map(
      (w, i) =>
        `<span class="cap-word cap-word--wordappend" style="--word-delay:${(i * 0.05).toFixed(3)}s">${escapeHtml(w)}</span>`,
    )
    .join(" ");
}

function renderHighlightImpactCaption(text, container) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const highlightIndices = new Set();
  words.forEach((w, i) => {
    if (w.length >= 5 || i % 3 === 1) highlightIndices.add(i);
  });
  container.innerHTML = words
    .map((w, i) => {
      const isHighlight = highlightIndices.has(i);
      const style = isHighlight
        ? `color:#00e5ff;font-weight:900;--word-delay:${(i * 0.07).toFixed(3)}s`
        : `--word-delay:${(i * 0.07).toFixed(3)}s`;
      return `<span class="cap-word cap-word--highlightimpact${isHighlight ? " cap-highlight-impact" : ""}" style="${style}">${escapeHtml(w)}</span>`;
    })
    .join(" ");
}

function renderWordSpan(w, idx, anim, delay) {
  const wDelay = (idx * delay).toFixed(3);
  const escaped = escapeHtml(w);
  if (anim === "none" || anim === "static") {
    return `<span class="cap-word cap-word--static">${escaped}</span>`;
  }
  if (anim === "classic") {
    return `<span class="cap-word cap-word--classic" style="--word-delay:${wDelay}s">${escaped}</span>`;
  }
  if (anim === "wordcolor") {
    const colors = [
      "#ffffff",
      "#F5D76E",
      "#00e5ff",
      "#ff6b6b",
      "#4ade80",
      "#c084fc",
      "#fb923c",
    ];
    return `<span class="cap-word cap-word--wordcolor" style="color:${colors[idx % colors.length]};--word-delay:${wDelay}s">${escaped}</span>`;
  }
  if (anim === "highlightimpact") {
    const isHighlight = w.length >= 5 || idx % 3 === 1;
    const style = isHighlight
      ? `color:#00e5ff;font-weight:900;--word-delay:${wDelay}s`
      : `--word-delay:${wDelay}s`;
    return `<span class="cap-word cap-word--highlightimpact${isHighlight ? " cap-highlight-impact" : ""}" style="${style}">${escaped}</span>`;
  }
  return `<span class="cap-word cap-word--${anim}" style="--word-delay:${wDelay}s">${escaped}</span>`;
}

/**
 * Core caption renderer. Formats words into rows when wordsPerRow > 0 or line breaks exist,
 * and maintains sequential animation delays. Only re-renders DOM when text, segment ID,
 * wordsPerRow, or animation style changes.
 */
function renderAnimatedCaption(text, segId) {
  if (!captionOverlayText) return;

  if (!text) {
    captionOverlayText.innerHTML = "";
    captionOverlayText.classList.remove("has-cap-rows");
    _lastRenderedSegId = null;
    _lastRenderedText = "";
    _lastRenderedAnim = null;
    _lastRenderedWordsPerRow = null;
    return;
  }

  const anim = editorState.style.animationStyle || "none";
  const wordsPerRow = Number(editorState.style.wordsPerRow) || 0;

  if (
    segId === _lastRenderedSegId &&
    text === _lastRenderedText &&
    anim === _lastRenderedAnim &&
    wordsPerRow === _lastRenderedWordsPerRow
  ) {
    return;
  }

  _lastRenderedSegId = segId;
  _lastRenderedText = text;
  _lastRenderedAnim = anim;
  _lastRenderedWordsPerRow = wordsPerRow;

  const delay = ANIM_WORD_DELAY[anim] ?? 0.07;
  const allWords = text.trim().split(/\s+/).filter(Boolean);

  // If wordsPerRow is 0, allow special full-line styles like oneword/twoword/wordappend
  if (wordsPerRow <= 0) {
    if (anim === "oneword") {
      captionOverlayText.classList.remove("has-cap-rows");
      renderWordGroupCaption(text, captionOverlayText, "cap-word--oneword");
      return;
    }
    if (anim === "twoword") {
      captionOverlayText.classList.remove("has-cap-rows");
      renderWordGroupCaption(text, captionOverlayText, "cap-word--twoword");
      return;
    }
    if (anim === "wordappend") {
      captionOverlayText.classList.remove("has-cap-rows");
      renderWordAppendCaption(text, captionOverlayText);
      return;
    }
  }

  // Row chunking: if text has explicit line breaks (\n), render distinct rows
  let rowsOfWords = [];
  if (text.includes("\n")) {
    rowsOfWords = text
      .split(/\r?\n/)
      .map((l) => l.trim().split(/\s+/).filter(Boolean))
      .filter((arr) => arr.length > 0);
  }

  const isMultiRow = rowsOfWords.length > 1;
  captionOverlayText.classList.toggle("has-cap-rows", isMultiRow);

  if (isMultiRow) {
    let globalIdx = 0;
    captionOverlayText.innerHTML = rowsOfWords
      .map((rowWords) => {
        const rowContent = rowWords
          .map((w) => renderWordSpan(w, globalIdx++, anim, delay))
          .join(" ");
        return `<div class="cap-row">${rowContent}</div>`;
      })
      .join("");
    return;
  }

  // Single line / auto wrapping
  captionOverlayText.innerHTML = allWords
    .map((w, i) => renderWordSpan(w, i, anim, delay))
    .join(" ");
}

function updatePositionUI() {
  const posX = clamp(Number(editorState.style.positionX ?? 50), 5, 95);
  const posY = clamp(Number(editorState.style.positionY ?? 82), 5, 95);

  if (capPosX) capPosX.value = String(posX);
  if (capPosY) capPosY.value = String(posY);
  if (capPosXVal) capPosXVal.textContent = `${posX}%`;
  if (capPosYVal) capPosYVal.textContent = `${posY}%`;
  if (captionPosDisplay) captionPosDisplay.textContent = `X: ${posX}% · Y: ${posY}%`;

  positionBtns?.querySelectorAll(".duration-btn").forEach((btn) => {
    if (btn.dataset.pos === "top") {
      btn.classList.toggle("active", posY <= 25 && Math.abs(posX - 50) <= 10);
    } else if (btn.dataset.pos === "center") {
      btn.classList.toggle("active", Math.abs(posY - 50) <= 10 && Math.abs(posX - 50) <= 10);
    } else if (btn.dataset.pos === "bottom") {
      btn.classList.toggle("active", posY >= 75 && Math.abs(posX - 50) <= 10);
    } else if (btn.dataset.x && btn.dataset.y) {
      btn.classList.toggle("active", Number(btn.dataset.x) === posX && Number(btn.dataset.y) === posY);
    }
  });
}

function applyStyleToOverlay() {
  if (!captionOverlayText || !captionOverlay) return;
  const s = editorState.style;
  applyTextBoxVisuals(captionOverlayText, s);

  const wasSelected = captionOverlay.classList.contains("is-selected");
  const wasDragging = captionOverlay.classList.contains("is-dragging");
  const wasResizing = captionOverlay.classList.contains("is-resizing");
  captionOverlay.className = "caption-video-overlay";
  if (wasSelected) captionOverlay.classList.add("is-selected");
  if (wasDragging) captionOverlay.classList.add("is-dragging");
  if (wasResizing) captionOverlay.classList.add("is-resizing");

  const posX = clamp(Number(s.positionX ?? 50), 5, 95);
  const posY = clamp(Number(s.positionY ?? 82), 5, 95);

  captionOverlay.style.left = `${posX}%`;
  captionOverlay.style.top = `${posY}%`;
  captionOverlay.style.bottom = "auto";
  captionOverlay.style.transform = "translate(-50%, -50%)";

  if (capBoxSizeLabel) {
    capBoxSizeLabel.textContent = `${s.fontSize ?? 28}px`;
  }

  updatePositionUI();
}

let isDraggingCaption = false;
let dragStartX = 0;
let dragStartY = 0;
let dragStartPosX = 50;
let dragStartPosY = 82;

let isResizingCaption = false;
let resizeHandleType = null;
let activeHandleElement = null;
let resizeStartDist = 0;
let resizeStartDx = 0;
let resizeStartFontSize = 28;
let resizeStartPaddingX = 14;
let resizeStartPaddingY = 10;
let resizeOverlayCenterX = 0;
let resizeOverlayCenterY = 0;

function initCaptionDragging() {
  if (!captionOverlay || !captionVideoWrap) return;

  const onPointerDown = (e) => {
    // Always select the caption on tap/click to reveal the CapCut bounding box
    captionOverlay.classList.add("is-selected");

    // 1. Check if clicked on a CapCut resize handle (corner or side)
    const handleEl = e.target.closest(".cap-resize-handle");
    if (handleEl) {
      e.stopPropagation();
      e.preventDefault();
      isResizingCaption = true;
      activeHandleElement = handleEl;
      resizeHandleType = handleEl.dataset.handle || "br";
      captionOverlay.classList.add("is-resizing");
      handleEl.classList.add("is-active");

      const rect = captionOverlay.getBoundingClientRect();
      resizeOverlayCenterX = rect.left + rect.width / 2;
      resizeOverlayCenterY = rect.top + rect.height / 2;

      resizeStartDist = Math.hypot(e.clientX - resizeOverlayCenterX, e.clientY - resizeOverlayCenterY);
      resizeStartDx = Math.abs(e.clientX - resizeOverlayCenterX);
      resizeStartFontSize = Number(editorState.style.fontSize ?? 28);
      resizeStartPaddingX = Number(editorState.style.paddingX ?? 14);
      resizeStartPaddingY = Number(editorState.style.paddingY ?? 10);

      try {
        handleEl.setPointerCapture?.(e.pointerId);
      } catch {}
      return;
    }

    // 2. Normal drag to move caption anywhere
    isDraggingCaption = true;
    captionOverlay.classList.add("is-dragging");
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragStartPosX = Number(editorState.style.positionX ?? 50);
    dragStartPosY = Number(editorState.style.positionY ?? 82);
    try {
      captionOverlay.setPointerCapture?.(e.pointerId);
    } catch {}
    e.preventDefault();
  };

  const onPointerMove = (e) => {
    if (isResizingCaption) {
      if (resizeHandleType === "ml" || resizeHandleType === "mr") {
        // Adjust horizontal width / padding (side handles)
        const currDx = Math.abs(e.clientX - resizeOverlayCenterX);
        const ratio = currDx / Math.max(resizeStartDx, 10);
        const newPadX = Math.round(clamp(resizeStartPaddingX * ratio, 4, 40));
        const newPadY = Math.max(2, Math.round(newPadX * 0.7));

        editorState.style.paddingX = newPadX;
        editorState.style.paddingY = newPadY;

        if (capBoxPadding) capBoxPadding.value = String(newPadX);
        if (capBoxPaddingVal) capBoxPaddingVal.textContent = `${newPadX}px`;
      } else {
        // Corner handles: proportional box size and font scaling (CapCut style)
        const currDist = Math.hypot(e.clientX - resizeOverlayCenterX, e.clientY - resizeOverlayCenterY);
        const scaleFactor = currDist / Math.max(resizeStartDist, 10);

        const newFontSize = Math.round(clamp(resizeStartFontSize * scaleFactor, 12, 72));
        const newPadX = Math.round(clamp(resizeStartPaddingX * scaleFactor, 4, 40));
        const newPadY = Math.max(2, Math.round(newPadX * 0.7));

        editorState.style.fontSize = newFontSize;
        editorState.style.paddingX = newPadX;
        editorState.style.paddingY = newPadY;

        if (capFontSize) capFontSize.value = String(newFontSize);
        if (capFontSizeVal) capFontSizeVal.textContent = String(newFontSize);
        if (capBoxPadding) capBoxPadding.value = String(newPadX);
        if (capBoxPaddingVal) capBoxPaddingVal.textContent = `${newPadX}px`;
        if (capBoxSizeLabel) capBoxSizeLabel.textContent = `${newFontSize}px`;
      }

      applyStyleToOverlay();
      updateLivePreview();
      debouncedPersistCaptions();
      return;
    }

    if (!isDraggingCaption) return;
    const rect = captionVideoWrap.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const deltaX = e.clientX - dragStartX;
    const deltaY = e.clientY - dragStartY;

    const deltaXPercent = (deltaX / rect.width) * 100;
    const deltaYPercent = (deltaY / rect.height) * 100;

    const newX = Math.round(clamp(dragStartPosX + deltaXPercent, 5, 95));
    const newY = Math.round(clamp(dragStartPosY + deltaYPercent, 5, 95));

    editorState.style.positionX = newX;
    editorState.style.positionY = newY;
    editorState.style.position = "custom";

    captionOverlay.style.left = `${newX}%`;
    captionOverlay.style.top = `${newY}%`;

    updatePositionUI();
  };

  const onPointerUp = (e) => {
    if (isResizingCaption) {
      isResizingCaption = false;
      resizeHandleType = null;
      if (activeHandleElement) {
        activeHandleElement.classList.remove("is-active");
        try {
          activeHandleElement.releasePointerCapture?.(e.pointerId);
        } catch {}
        activeHandleElement = null;
      }
      captionOverlay.classList.remove("is-resizing");
      applyStyleToOverlay();
      syncCaptionOverlay();
      updateLivePreview();
      persistCaptions();
      return;
    }

    if (!isDraggingCaption) return;
    isDraggingCaption = false;
    captionOverlay.classList.remove("is-dragging");
    try {
      captionOverlay.releasePointerCapture?.(e.pointerId);
    } catch {}
    persistCaptions();
  };

  // Deselect caption when tapping/clicking outside the box in the preview or elsewhere
  const onOutsidePointerDown = (e) => {
    if (!captionOverlay.classList.contains("is-selected")) return;
    if (captionOverlay.contains(e.target)) return;
    // Don't deselect if adjusting editor style cards on the right
    if (e.target.closest && e.target.closest(".ce-card, .ce-workspace, .ce-quality-badge-wrap")) return;

    captionOverlay.classList.remove("is-selected");
    captionOverlay.classList.remove("is-resizing");
    captionOverlay.classList.remove("is-dragging");
  };

  // Direct video preview click to immediately deselect
  captionVideoWrap?.addEventListener("pointerdown", (e) => {
    if (!captionOverlay.contains(e.target)) {
      captionOverlay.classList.remove("is-selected");
      captionOverlay.classList.remove("is-resizing");
      captionOverlay.classList.remove("is-dragging");
    }
  });

  captionOverlay.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);
  window.addEventListener("pointerdown", onOutsidePointerDown, true);
}

function getActiveSegmentByTime(time) {
  const t = Number.isFinite(Number(time)) ? Number(time) : 0;
  if (t <= 0.05 && editorState.segments.length > 0 && Number(editorState.segments[0].start) <= 1.5) {
    return editorState.segments[0];
  }
  return editorState.segments.find((s) => t >= s.start && t < s.end) || null;
}

function syncCaptionOverlay() {
  if (!captionVideo || !captionOverlay || !captionOverlayText) return;

  const currentTime = safeVideoTime();
  let activeSegment = getActiveSegmentByTime(currentTime);

  // If paused and no active segment at this exact moment, fallback to selected segment or segment 0
  // so the user can always see and resize the caption box while editing!
  if (!activeSegment && captionVideo.paused && editorState.segments.length > 0) {
    if (editorState.activeSegmentId) {
      activeSegment = editorState.segments.find((s) => s.id === editorState.activeSegmentId);
    }
    if (!activeSegment) {
      activeSegment = editorState.segments[0];
    }
  }

  const nextSegId = activeSegment?.id || null;
  const displayText = activeSegment
    ? getParityDisplayText(activeSegment, currentTime, editorState.style)
    : "";

  const hasText = Boolean(displayText && displayText.trim());
  captionOverlay.style.opacity = hasText ? "1" : "0";
  captionOverlay.style.visibility = hasText ? "visible" : "hidden";
  captionOverlay.style.pointerEvents = hasText ? "auto" : "none";

  renderAnimatedCaption(hasText ? displayText : "", nextSegId);

  if (activeSegment && activeSegment.id !== editorState.activeSegmentId) {
    editorState.activeSegmentId = activeSegment.id;
    setActiveSegment(activeSegment.id, false);
  } else if (!activeSegment && editorState.activeSegmentId !== null) {
    editorState.activeSegmentId = null;
    captionSegmentsList?.querySelectorAll(".caption-segment").forEach((el) => {
      el.classList.remove("active");
      el.closest(".timeline-entry")?.classList.remove("active-entry");
    });
  }

  updateLivePreview();
}

function updateLivePreview() {
  if (!captionLivePreview) return;

  const s = normalizeStyle(editorState.style);
  applyTextBoxVisuals(captionLivePreview, s);

  const currentTime = captionVideo?.currentTime || 0;
  const currentSeg = getActiveSegmentByTime(currentTime) || editorState.segments[0];

  let sampleText = currentSeg
    ? getParityDisplayText(currentSeg, currentTime, s)
    : "Sample Caption";

  const anim = s.animationStyle || "none";
  const delay = ANIM_WORD_DELAY[anim] ?? 0.07;

  const cacheKey = [
    sampleText,
    anim,
    s.fontFamily,
    s.fontSize,
    s.wordsPerRow,
    s.lineSpacing,
    s.textColor,
    s.bgColor,
    s.bgOpacity,
    s.fontWeight,
    s.textTransform,
    s.letterSpacing,
    s.borderRadius,
    s.paddingX,
    s.paddingY,
  ].join("|");

  const previewWords = sampleText.trim().split(/\s+/).filter(Boolean);

  if (anim === "none") {
    captionLivePreview.innerHTML = previewWords
      .map((w) => `<span class="cap-word cap-word--static" style="display:inline-block;white-space:nowrap;">${escapeHtml(w)}</span>`)
      .join(" ");
    captionLivePreview.dataset.lastKey = cacheKey;
  } else if (anim === "classic") {
    captionLivePreview.innerHTML = previewWords
      .map((w, i) => {
        const d = (i * delay).toFixed(3);
        return `<span class="cap-word cap-word--classic" style="display:inline-block;white-space:nowrap;animation-delay:${d}s;--word-delay:${d}s">${escapeHtml(w)}</span>`;
      })
      .join(" ");
    captionLivePreview.dataset.lastKey = cacheKey;
  } else if (captionLivePreview.dataset.lastKey !== cacheKey) {
    captionLivePreview.dataset.lastKey = cacheKey;

    if (anim === "oneword") {
      renderWordGroupCaption(
        sampleText.trim().split(/\s+/)[0] || sampleText,
        captionLivePreview,
        "cap-word--twoword",
      );
      return;
    }

    if (anim === "twoword") {
      const words = sampleText.trim().split(/\s+/);
      renderWordGroupCaption(
        words.slice(0, 2).join(" "),
        captionLivePreview,
        "cap-word--twoword",
      );
      return;
    }

    if (anim === "wordcolor") {
      renderWordColorCaption(sampleText, captionLivePreview);
      return;
    }

    if (anim === "wordappend") {
      renderWordAppendCaption(sampleText, captionLivePreview);
      return;
    }

    if (anim === "highlightimpact") {
      renderHighlightImpactCaption(sampleText, captionLivePreview);
      return;
    }

    const words = sampleText.trim().split(/\s+/);
    captionLivePreview.innerHTML = words
      .map((w, i) => {
        const d = (i * delay).toFixed(3);
        return `<span class="cap-word cap-word--${anim}" style="display:inline-block;opacity:1;visibility:visible;color:inherit;font:inherit;text-shadow:inherit;transform:none;animation-delay:${d}s;--word-delay:${d}s">${escapeHtml(w)}</span>`;
      })
      .join(" ");
  }

  const wrap = document.getElementById("livePreviewWrap");
  if (wrap) {
    wrap.style.alignItems =
      s.position === "top"
        ? "flex-start"
        : s.position === "center"
          ? "center"
          : "flex-end";
  }
}

function startCaptionSync() {
  if (!captionVideo) return;
  stopCaptionSync();
  const loop = () => {
    syncCaptionOverlay();
    updateLivePreview();
    editorState.syncFrame = requestAnimationFrame(loop);
  };
  syncCaptionOverlay();
  editorState.syncFrame = requestAnimationFrame(loop);
}
function stopCaptionSync() {
  if (editorState.syncFrame) {
    cancelAnimationFrame(editorState.syncFrame);
    editorState.syncFrame = null;
  }
}

// Style controls
function populateStyleControls() {
  editorState.style = normalizeStyle(editorState.style);
  const s = editorState.style;
  if (capFontFamily) capFontFamily.value = s.fontFamily;
  if (capFontSize) capFontSize.value = String(s.fontSize);
  if (capFontSizeVal) capFontSizeVal.textContent = String(s.fontSize);
  if (capLineSpacing) capLineSpacing.value = String(s.lineSpacing ?? 1.35);
  if (capLineSpacingVal) capLineSpacingVal.textContent = `${Number(s.lineSpacing ?? 1.35).toFixed(2)}x`;
  if (capTextColor) capTextColor.value = s.textColor;
  if (capBgColor) capBgColor.value = s.bgColor;
  if (capBgOpacity) capBgOpacity.value = String(s.bgOpacity);
  if (capBgOpacityVal) capBgOpacityVal.textContent = String(s.bgOpacity);
  if (capBoxPadding) capBoxPadding.value = String(s.paddingX ?? 14);
  if (capBoxPaddingVal) capBoxPaddingVal.textContent = `${s.paddingX ?? 14}px`;
  if (capBoxSizeLabel) capBoxSizeLabel.textContent = `${s.fontSize ?? 28}px`;
  if (capTextShadow) capTextShadow.checked = s.textShadow;
  if (capShadowColor) capShadowColor.value = s.shadowColor;
  if (capShadowBlur) capShadowBlur.value = String(s.shadowBlur);
  if (capShadowBlurVal) capShadowBlurVal.textContent = String(s.shadowBlur);
  if (capShadowOffsetX) capShadowOffsetX.value = String(s.shadowOffsetX);
  if (capShadowOffsetY) capShadowOffsetY.value = String(s.shadowOffsetY);
  if (capAnimStyle) capAnimStyle.value = s.animationStyle || "none";

  if (capPresetDuration) capPresetDuration.value = String(s.presetDuration ?? 0.6);
  if (capPresetDurationVal) capPresetDurationVal.textContent = String(s.presetDuration ?? 0.6);

  if (capLetterSpacing) capLetterSpacing.value = String(s.letterSpacing ?? 0);
  if (capLetterSpacingVal) capLetterSpacingVal.textContent = String(s.letterSpacing ?? 0);

  if (capTextTransform) capTextTransform.value = s.textTransform || "none";
  textTransformGroup?.querySelectorAll(".ce-pill-opt").forEach((btn) => {
    btn.classList.toggle("is-active", (btn.dataset.case || "none") === (s.textTransform || "none"));
  });

  if (capStrokeWidth) capStrokeWidth.value = String(s.strokeWidth ?? 0);
  if (capStrokeWidthVal) capStrokeWidthVal.textContent = String(s.strokeWidth ?? 0);
  if (capStrokeColor) capStrokeColor.value = s.strokeColor || "#000000";

  if (capGlowIntensity) capGlowIntensity.value = String(s.glowIntensity ?? 0);
  if (capGlowIntensityVal) capGlowIntensityVal.textContent = String(s.glowIntensity ?? 0);

  if (capRotateAngle) capRotateAngle.value = String(s.rotateAngle ?? 0);
  if (capRotateAngleVal) capRotateAngleVal.textContent = String(s.rotateAngle ?? 0);

  const wpr = Number(s.wordsPerRow || 0);
  if (capWordsPerRow) capWordsPerRow.value = String(wpr);
  wordsPerRowGroup?.querySelectorAll(".ce-pill-opt").forEach((btn) => {
    btn.classList.toggle("is-active", Number(btn.dataset.words) === wpr);
  });

  updatePositionUI();
  updateShadowControlsState();
  updateColorSwatchState();
  renderPresetsUI();
  applyStyleToOverlay();
  updateLivePreview();
}

function syncStyleFromControls(options = {}) {
  const isLiveSlider = options.isLiveSlider === true;

  editorState.style = normalizeStyle(editorState.style);

  editorState.style.fontFamily =
    capFontFamily?.value || "'Montserrat', sans-serif";
  editorState.style.fontSize = clamp(
    parseInt(capFontSize?.value || "28", 10),
    12,
    72,
  );
  editorState.style.lineSpacing = clamp(
    parseFloat(capLineSpacing?.value || "1.35"),
    0.8,
    2.5,
  );
  editorState.style.textColor = capTextColor?.value || "#fff";
  editorState.style.bgColor = capBgColor?.value || "#000";
  editorState.style.bgOpacity = clamp(
    parseInt(capBgOpacity?.value || "70", 10),
    0,
    100,
  );
  if (capBoxPadding) {
    const pad = clamp(parseInt(capBoxPadding.value || "14", 10), 4, 40);
    editorState.style.paddingX = pad;
    editorState.style.paddingY = Math.max(2, Math.round(pad * 0.7));
  }
  editorState.style.textShadow = Boolean(capTextShadow?.checked);
  editorState.style.shadowColor = capShadowColor?.value || "#000";
  editorState.style.shadowBlur = clamp(
    parseInt(capShadowBlur?.value || "8", 10),
    0,
    30,
  );
  editorState.style.shadowOffsetX = clamp(
    parseInt(capShadowOffsetX?.value || "0", 10),
    -20,
    20,
  );
  editorState.style.shadowOffsetY = clamp(
    parseInt(capShadowOffsetY?.value || "2", 10),
    -20,
    20,
  );
  editorState.style.animationStyle = capAnimStyle?.value || "none";
  editorState.style.wordsPerRow = Number(capWordsPerRow?.value || 0);
  editorState.style.positionX = clamp(Number(capPosX?.value || 50), 5, 95);
  editorState.style.positionY = clamp(Number(capPosY?.value || 82), 5, 95);

  editorState.style.presetDuration = clamp(
    parseFloat(capPresetDuration?.value || "0.6"),
    0.2,
    2.5,
  );
  editorState.style.letterSpacing = clamp(
    parseFloat(capLetterSpacing?.value || "0"),
    -2,
    14,
  );
  editorState.style.strokeWidth = clamp(
    parseInt(capStrokeWidth?.value || "0", 10),
    0,
    10,
  );
  editorState.style.strokeColor = capStrokeColor?.value || "#000000";
  editorState.style.glowIntensity = clamp(
    parseInt(capGlowIntensity?.value || "0", 10),
    0,
    30,
  );
  editorState.style.rotateAngle = clamp(
    parseInt(capRotateAngle?.value || "0", 10),
    -15,
    15,
  );
  editorState.style.textTransform = capTextTransform?.value || "none";

  if (capFontSizeVal)
    capFontSizeVal.textContent = String(editorState.style.fontSize);
  if (capLineSpacingVal)
    capLineSpacingVal.textContent = `${Number(editorState.style.lineSpacing).toFixed(2)}x`;
  if (capBgOpacityVal)
    capBgOpacityVal.textContent = String(editorState.style.bgOpacity);
  if (capBoxPaddingVal)
    capBoxPaddingVal.textContent = `${editorState.style.paddingX ?? 14}px`;
  if (capBoxSizeLabel)
    capBoxSizeLabel.textContent = `${editorState.style.fontSize ?? 28}px`;
  if (capShadowBlurVal)
    capShadowBlurVal.textContent = String(editorState.style.shadowBlur);
  if (capPresetDurationVal)
    capPresetDurationVal.textContent = String(editorState.style.presetDuration);
  if (capLetterSpacingVal)
    capLetterSpacingVal.textContent = String(editorState.style.letterSpacing);
  if (capStrokeWidthVal)
    capStrokeWidthVal.textContent = String(editorState.style.strokeWidth);
  if (capGlowIntensityVal)
    capGlowIntensityVal.textContent = String(editorState.style.glowIntensity);
  if (capRotateAngleVal)
    capRotateAngleVal.textContent = String(editorState.style.rotateAngle);

  updateShadowControlsState();
  updateColorSwatchState();

  if (isLiveSlider) {
    // Direct CSS visual updates — eliminates font refreshing and preserves running animations
    applyStyleToOverlay();
    debouncedPersistCaptions();
    return;
  }

  // Full synchronization on commit or preset selection
  resetCaptionRenderCache();
  applyStyleToOverlay();
  renderPresetsUI();
  syncCaptionOverlay();
  updateLivePreview();
  persistCaptions();
}

function renderPresetsUI() {
  if (!presetsGrid) return;

  presetsGrid.innerHTML = STYLE_PRESETS.map((preset) => {
    const s = normalizeStyle(preset.style);
    const [r, g, b] = hexToRgb(s.bgColor);
    const bg =
      s.bgOpacity > 5 ? `rgba(${r},${g},${b},${s.bgOpacity / 100})` : "#111111";
    const active = styleMatchesPreset(editorState.style, preset);

    return `
      <button
        class="preset-card${active ? " preset-card--active" : ""}"
        data-preset-id="${preset.id}"
        type="button"
        title="${preset.name} — ${preset.label}"
      >
        <div
          class="preset-swatch"
          style="
            background:${bg};
            color:${s.textColor};
            font-family:${s.fontFamily};
            font-size:${Math.max(11, Math.round(Number(s.fontSize || 26) * 0.44))}px;
            font-weight:${s.fontWeight || 800};
            text-transform:${s.textTransform || "none"};
            letter-spacing:${Number(s.letterSpacing) || 0}px;
          "
        >Aa</div>
        <span class="preset-name">${preset.name}</span>
      </button>
    `;
  }).join("");

  presetsGrid.querySelectorAll(".preset-card").forEach((card) => {
    card.addEventListener("click", () => applyPreset(card.dataset.presetId));
  });
}

/**
 * Apply preset while strictly preserving user customizations:
 * font size, font family, words in a row, text color, bg, opacity, position X/Y,
 * preset duration, stroke, glow, tilt, and transform.
 */
function applyPreset(id) {
  const preset = STYLE_PRESETS.find((item) => item.id === id);
  if (!preset) return;

  const cur = editorState.style || {};

  const preserved = {};
  if (cur.fontSize !== undefined) preserved.fontSize = cur.fontSize;
  if (cur.fontFamily !== undefined) preserved.fontFamily = cur.fontFamily;
  if (cur.wordsPerRow !== undefined) preserved.wordsPerRow = cur.wordsPerRow;
  if (cur.textColor !== undefined) preserved.textColor = cur.textColor;
  if (cur.bgColor !== undefined) preserved.bgColor = cur.bgColor;
  if (cur.bgOpacity !== undefined) preserved.bgOpacity = cur.bgOpacity;
  if (cur.position !== undefined) preserved.position = cur.position;
  if (cur.positionX !== undefined) preserved.positionX = cur.positionX;
  if (cur.positionY !== undefined) preserved.positionY = cur.positionY;
  if (cur.presetDuration !== undefined) preserved.presetDuration = cur.presetDuration;
  if (cur.letterSpacing !== undefined) preserved.letterSpacing = cur.letterSpacing;
  if (cur.textTransform !== undefined) preserved.textTransform = cur.textTransform;
  if (cur.strokeWidth !== undefined) preserved.strokeWidth = cur.strokeWidth;
  if (cur.strokeColor !== undefined) preserved.strokeColor = cur.strokeColor;
  if (cur.glowIntensity !== undefined) preserved.glowIntensity = cur.glowIntensity;
  if (cur.rotateAngle !== undefined) preserved.rotateAngle = cur.rotateAngle;
  if (cur.lineSpacing !== undefined) preserved.lineSpacing = cur.lineSpacing;
  if (cur.paddingX !== undefined) preserved.paddingX = cur.paddingX;
  if (cur.paddingY !== undefined) preserved.paddingY = cur.paddingY;

  editorState.style = normalizeStyle({
    ...DEFAULT_STYLE,
    ...preset.style,
    ...preserved,
    activePresetId: preset.id,
  });

  resetCaptionRenderCache();
  populateStyleControls();
  updateShadowControlsState();
  updateColorSwatchState();
  applyStyleToOverlay();
  renderPresetsUI();
  syncCaptionOverlay();
  updateLivePreview();
  persistCaptions();
}

// Segment actions
function addSegment() {
  const last = editorState.segments[editorState.segments.length - 1];
  const start = last ? last.end + 0.25 : Number(captionVideo?.currentTime) || 0;
  const end = start + 1.8;
  const seg = {
    id: uniqueId(),
    start: Math.round(start * 100) / 100,
    end: Math.round(end * 100) / 100,
    text: "New caption",
  };
  editorState.segments = normalizeSegments([...editorState.segments, seg]);
  editorState.activeSegmentId = seg.id;
  persistCaptions();
  renderTimeline();
  setActiveSegment(seg.id, true);
  syncCaptionOverlay();
}
async function regenerateCaptions() {
  if (!editorState.clip) return;
  if (regenerateBtn) {
    regenerateBtn.disabled = true;
    regenerateBtn.textContent = "Processing...";
  }
  showLoadingState("Calling server for captions...");
  try {
    let serverSegments = await fetchServerCaptions(editorState.clip);
    if (!serverSegments.length) {
      console.warn("No captions from server, using fallback");
      serverSegments = generateFallbackCaptions(
        captionVideo?.duration || editorState.clip?.duration || 30,
      );
    }
    editorState.segments = normalizeSegments(serverSegments);
    editorState.activeSegmentId = editorState.segments[0]?.id || null;
    persistCaptions();
    showTimelineList();
    syncCaptionOverlay();
  } catch (e) {
    console.error("Regenerate failed:", e);
    editorState.segments = generateFallbackCaptions(
      captionVideo?.duration || 30,
    );
    editorState.activeSegmentId = editorState.segments[0]?.id || null;
    persistCaptions();
    showTimelineList();
    syncCaptionOverlay();
  } finally {
    if (regenerateBtn) {
      regenerateBtn.disabled = false;
      regenerateBtn.textContent = "↺ Regenerate";
    }
  }
}

// Export
function downloadTextFile(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function exportCaptionedVideo() {
  if (!editorState.clip) {
    alert("No clip loaded.");
    return;
  }

  const sourceUrl = getClipSource(editorState.clip);
  if (!sourceUrl) {
    alert("Video source not found.");
    return;
  }

  flushRealtimeSegment();

  if (!editorState.segments.length) {
    alert("No captions available.");
    return;
  }

  const originalText =
    exportCaptionedVideoBtn?.textContent || "Download Video With Captions";

  try {
    if (exportCaptionedVideoBtn) {
      exportCaptionedVideoBtn.disabled = true;
      exportCaptionedVideoBtn.textContent = "Exporting...";
    }

    syncStyleFromControls();

    const normalizedStyle = normalizeStyle(editorState.style);
    const scaledStyle = buildScaledStyleForExport(normalizedStyle);

    const wrappedSegments = normalizeSegments(
      editorState.segments.map((segment) => ({
        ...segment,
        text: wrapCaptionText(
          segment.text,
          getPreviewCharsPerLine(normalizedStyle),
        ),
      })),
    );

    const exportSegments = expandSegmentsForExport(
      wrappedSegments,
      normalizedStyle.animationStyle || "none",
      normalizedStyle.wordsPerRow || 0,
    );

    console.log("====== EXPORT CAPTION STYLE SENT ======");
    console.log(JSON.stringify(scaledStyle, null, 2));
    console.log("====== EXPORT FIRST SEGMENT SENT ======");
    console.log(JSON.stringify(exportSegments[0], null, 2));

    const response = await fetch(`${API_BASE}/captions/burn`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        clip: editorState.clip,
        videoUrl: sourceUrl,
        segments: exportSegments,
        style: scaledStyle,
      }),
    });

    const data = await response.json().catch(() => null);

    console.log("====== EXPORT RESPONSE ======");
    console.log(data);

    if (!response.ok) {
      throw new Error(
        data?.details ||
          data?.error ||
          `Export failed with status ${response.status}`,
      );
    }

    if (!data?.downloadUrl) {
      throw new Error("Server did not return a download URL.");
    }

    const a = document.createElement("a");
    a.href = data.downloadUrl;
    a.download = data.fileName || "captioned-video.mp4";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (error) {
    console.error("EXPORT CAPTIONED VIDEO ERROR:", error);
    alert(error.message || "Failed to export captioned video.");
  } finally {
    if (exportCaptionedVideoBtn) {
      exportCaptionedVideoBtn.disabled = false;
      exportCaptionedVideoBtn.textContent = originalText;
    }
  }
}
function ensurePublishNavButton() {
  if (document.getElementById("publishNavBtn")) {
    publishNavBtn = document.getElementById("publishNavBtn");
    return;
  }

  const topbarRight =
    document.querySelector(".ce-topbar-right") ||
    saveAndBackBtn?.parentElement;

  if (!topbarRight) return;

  publishNavBtn = document.createElement("button");
  publishNavBtn.id = "publishNavBtn";
  publishNavBtn.type = "button";
  publishNavBtn.className = "ce-btn ce-btn--publish";
  publishNavBtn.innerHTML = `
    <span class="publish-dot"></span>
    Publish
  `;

  if (saveAndBackBtn) {
    topbarRight.insertBefore(publishNavBtn, saveAndBackBtn);
  } else {
    topbarRight.appendChild(publishNavBtn);
  }
}
function setPublishButtonBusy(isBusy, label = "Publish") {
  if (!publishNavBtn) return;

  publishNavBtn.disabled = isBusy;
  publishNavBtn.innerHTML = isBusy
    ? `<span class="publish-dot"></span> Preparing...`
    : `<span class="publish-dot"></span> ${label}`;
}
async function buildCaptionedClipForPublish() {
  if (!editorState.clip) {
    throw new Error("No clip loaded to publish.");
  }

  const sourceUrl = getClipSource(editorState.clip);

  if (!sourceUrl) {
    throw new Error("Video source not found.");
  }

  flushRealtimeSegment();

  if (!editorState.segments.length) {
    throw new Error("No captions available.");
  }

  syncStyleFromControls();
  persistCaptions();

  const normalizedStyle = normalizeStyle(editorState.style);
  const scaledStyle = buildScaledStyleForExport(normalizedStyle);

  const wrappedSegments = normalizeSegments(
    editorState.segments.map((segment) => ({
      ...segment,
      text: wrapCaptionText(
        segment.text,
        getPreviewCharsPerLine(normalizedStyle),
      ),
    })),
  );

  const exportSegments = expandSegmentsForExport(
    wrappedSegments,
    normalizedStyle.animationStyle || "none",
    normalizedStyle.wordsPerRow || 0,
  );

  const response = await fetch(`${API_BASE}/captions/burn`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      clip: editorState.clip,
      videoUrl: sourceUrl,
      segments: exportSegments,
      style: scaledStyle,
    }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      data?.details ||
        data?.error ||
        `Could not prepare captioned video. Status ${response.status}`,
    );
  }

  if (!data?.directUrl && !data?.downloadUrl) {
    throw new Error("Caption export finished but no video URL was returned.");
  }

  const captionedUrl = data.directUrl || data.downloadUrl;
  const captionedFileName =
    data.fileName ||
    pathSafeFileNameFromUrl(captionedUrl) ||
    `captioned-${Date.now()}.mp4`;

  return {
    ...editorState.clip,
    title:
      editorState.clip.title ||
      editorState.clip.fileName ||
      clipTitleDisplay?.textContent ||
      captionedFileName,
    fileName: captionedFileName,
    filename: captionedFileName,
    previewUrl: captionedUrl,
    downloadUrl: data.downloadUrl || captionedUrl,
    videoUrl: captionedUrl,
    directUrl: data.directUrl || captionedUrl,
    url: captionedUrl,
    src: captionedUrl,
    localPath: captionedUrl,
    filePath: captionedUrl,
    mimeType: "video/mp4",
    hasBurnedCaptions: true,
    captionedExport: {
      fileName: captionedFileName,
      downloadUrl: data.downloadUrl || "",
      directUrl: data.directUrl || "",
      renderer: data.renderer || "caption-burn",
      createdAt: new Date().toISOString(),
    },
  };
}

async function goToPublishCenter() {
  try {
    if (!editorState.clip) {
      alert("No clip loaded to publish.");
      return;
    }

    setPublishButtonBusy(true);

    const captionedClip = await buildCaptionedClipForPublish();

    const draftTitle =
      captionedClip.title ||
      captionedClip.fileName ||
      clipTitleDisplay?.textContent ||
      "YouTube Short";

    const draftCaption = editorState.segments
      .map((segment) => segment.text)
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 4500);

    const publishDraft = {
      source: "caption-editor",
      uploadMode: "captioned-video",
      clip: captionedClip,
      clipIndex: editorState.clipIndex,
      title: draftTitle,
      caption: draftCaption,
      hashtags: "#shorts #youtube #clipflow",
      captionStyle: { ...editorState.style },
      captions: editorState.segments.map((segment) => ({
        id: segment.id,
        start: segment.start,
        end: segment.end,
        text: segment.text,
      })),
      createdAt: new Date().toISOString(),
    };

    localStorage.setItem(
      "clipflow-publish-draft",
      JSON.stringify(publishDraft),
    );

    stopCaptionSync();

    window.location.href = "./publish.html?from=captions";
  } catch (error) {
    console.error("PUBLISH PREPARE ERROR:", error);
    alert(error.message || "Could not prepare captioned video for publishing.");
  } finally {
    setPublishButtonBusy(false);
  }
}

function pathSafeFileNameFromUrl(value = "") {
  try {
    const clean = String(value || "").split("?")[0];
    return clean.split("/").pop() || "";
  } catch {
    return "";
  }
}

// Navigation
function goBack() {
  try {
    persistCaptions();
  } catch (e) {
    console.warn("Could not persist captions before returning:", e);
  }
  try {
    stopCaptionSync();
  } catch (e) {
    console.warn("Could not stop caption sync:", e);
  }

  // If user has history from the app, prefer history.back()
  if (
    window.history.length > 1 &&
    document.referrer &&
    document.referrer.includes(window.location.host)
  ) {
    window.history.back();
    return;
  }

  window.location.href = "index.html";
}
window.goBack = goBack;

// Bind controls
function bindControls() {
  ensurePublishNavButton();

  backBtn?.addEventListener("click", goBack);
  goBackBtn?.addEventListener("click", goBack);

  saveAndBackBtn?.addEventListener("click", () => {
    try {
      syncStyleFromControls();
    } catch {}
    goBack();
  });

  publishNavBtn?.addEventListener("click", goToPublishCenter);

  // ✦ CapCut-Style 4K HD Quality Enhancer
  const qualityEnhancerBtn = document.getElementById("qualityEnhancerBtn");
  if (qualityEnhancerBtn && captionVideoWrap) {
    captionVideoWrap.classList.add("is-enhanced");
    qualityEnhancerBtn.classList.add("is-active");

    qualityEnhancerBtn.addEventListener("click", () => {
      const isNowActive = captionVideoWrap.classList.toggle("is-enhanced");
      qualityEnhancerBtn.classList.toggle("is-active", isNowActive);
    });
  }

  applyStyleBtn?.addEventListener("click", syncStyleFromControls);
  exportCaptionedVideoBtn?.addEventListener("click", exportCaptionedVideo);

  const onLiveSliderInput = () => syncStyleFromControls({ isLiveSlider: true });
  const onSliderCommit = () => syncStyleFromControls({ isLiveSlider: false });

  capFontFamily?.addEventListener("change", onSliderCommit);
  capAnimStyle?.addEventListener("change", onSliderCommit);
  capTextShadow?.addEventListener("change", onSliderCommit);

  capFontSize?.addEventListener("input", onLiveSliderInput);
  capFontSize?.addEventListener("change", onSliderCommit);

  capLineSpacing?.addEventListener("input", onLiveSliderInput);
  capLineSpacing?.addEventListener("change", onSliderCommit);

  capLetterSpacing?.addEventListener("input", onLiveSliderInput);
  capLetterSpacing?.addEventListener("change", onSliderCommit);

  capPresetDuration?.addEventListener("input", onLiveSliderInput);
  capPresetDuration?.addEventListener("change", onSliderCommit);

  capStrokeWidth?.addEventListener("input", onLiveSliderInput);
  capStrokeWidth?.addEventListener("change", onSliderCommit);

  capStrokeColor?.addEventListener("input", onLiveSliderInput);
  capStrokeColor?.addEventListener("change", onSliderCommit);

  capGlowIntensity?.addEventListener("input", onLiveSliderInput);
  capGlowIntensity?.addEventListener("change", onSliderCommit);

  capRotateAngle?.addEventListener("input", onLiveSliderInput);
  capRotateAngle?.addEventListener("change", onSliderCommit);

  capTextColor?.addEventListener("input", onLiveSliderInput);
  capTextColor?.addEventListener("change", onSliderCommit);

  capBgColor?.addEventListener("input", onLiveSliderInput);
  capBgColor?.addEventListener("change", onSliderCommit);

  capBgOpacity?.addEventListener("input", onLiveSliderInput);
  capBgOpacity?.addEventListener("change", onSliderCommit);

  capBoxPadding?.addEventListener("input", onLiveSliderInput);
  capBoxPadding?.addEventListener("change", onSliderCommit);

  capShadowColor?.addEventListener("input", onLiveSliderInput);
  capShadowColor?.addEventListener("change", onSliderCommit);

  capShadowBlur?.addEventListener("input", onLiveSliderInput);
  capShadowBlur?.addEventListener("change", onSliderCommit);

  capShadowOffsetX?.addEventListener("input", onLiveSliderInput);
  capShadowOffsetX?.addEventListener("change", onSliderCommit);

  capShadowOffsetY?.addEventListener("input", onLiveSliderInput);
  capShadowOffsetY?.addEventListener("change", onSliderCommit);

  textTransformGroup?.querySelectorAll(".ce-pill-opt").forEach((btn) => {
    btn.addEventListener("click", () => {
      const val = btn.dataset.case || "none";
      if (capTextTransform) capTextTransform.value = val;
      editorState.style.textTransform = val;
      textTransformGroup.querySelectorAll(".ce-pill-opt").forEach((b) => b.classList.toggle("is-active", b === btn));
      resetCaptionRenderCache();
      persistCaptions();
      syncCaptionOverlay();
      updateLivePreview();
    });
  });

  syncAudioCaptionsBtn?.addEventListener("click", async () => {
    if (!editorState.clip) return;
    const origHtml = syncAudioCaptionsBtn.innerHTML;
    syncAudioCaptionsBtn.innerHTML = `<span>⏳</span> <span>Syncing...</span>`;
    syncAudioCaptionsBtn.disabled = true;

    const statusLabel = document.getElementById("captionStatusLabel") || document.querySelector(".ce-status-label");
    if (statusLabel) statusLabel.textContent = "Transcribing with Whisper AI...";

    try {
      const serverSegments = await fetchServerCaptions(editorState.clip);
      if (serverSegments && serverSegments.length) {
        editorState.segments = normalizeSegments(serverSegments);
        editorState.activeSegmentId = editorState.segments[0]?.id || null;
        persistCaptions();
        renderTimeline();
        syncCaptionOverlay();
        updateLivePreview();
        if (statusLabel) statusLabel.textContent = `Whisper AI Synced (${serverSegments.length} Segments)`;
      } else {
        if (statusLabel) statusLabel.textContent = "No new audio captions detected";
      }
    } catch (err) {
      console.error("Manual audio sync error:", err);
      if (statusLabel) statusLabel.textContent = "Audio sync failed — check server";
    } finally {
      syncAudioCaptionsBtn.innerHTML = origHtml;
      syncAudioCaptionsBtn.disabled = false;
    }
  });

  wordsPerRowGroup?.querySelectorAll(".ce-pill-opt").forEach((btn) => {
    btn.addEventListener("click", () => {
      const val = Number(btn.dataset.words) || 0;
      if (capWordsPerRow) capWordsPerRow.value = String(val);
      editorState.style.wordsPerRow = val;
      wordsPerRowGroup.querySelectorAll(".ce-pill-opt").forEach((b) => b.classList.toggle("is-active", b === btn));
      resetCaptionRenderCache();
      persistCaptions();
      syncCaptionOverlay();
      updateLivePreview();
    });
  });

  capPosX?.addEventListener("input", () => {
    editorState.style.positionX = Number(capPosX.value);
    editorState.style.position = "custom";
    applyStyleToOverlay();
    persistCaptions();
    syncCaptionOverlay();
  });
  capPosY?.addEventListener("input", () => {
    editorState.style.positionY = Number(capPosY.value);
    editorState.style.position = "custom";
    applyStyleToOverlay();
    persistCaptions();
    syncCaptionOverlay();
  });

  resetCenterBtn?.addEventListener("click", () => {
    editorState.style.positionX = 50;
    editorState.style.positionY = 82;
    editorState.style.position = "bottom";
    applyStyleToOverlay();
    persistCaptions();
    syncCaptionOverlay();
  });

  positionBtns?.querySelectorAll(".duration-btn").forEach((btn) =>
    btn.addEventListener("click", () => {
      if (btn.dataset.x && btn.dataset.y) {
        editorState.style.positionX = Number(btn.dataset.x);
        editorState.style.positionY = Number(btn.dataset.y);
      }
      editorState.style.position = btn.dataset.pos || "custom";
      applyStyleToOverlay();
      persistCaptions();
      syncCaptionOverlay();
    }),
  );

  bindColorSwatches();
}

// Init
async function init() {
  cacheDom();
  initTheme();
  bindTheme();
  bindControls();
  initCaptionDragging();

  let session = loadSession();

  const urlParams = new URLSearchParams(window.location.search);
  const paramIndex = urlParams.get("index");
  const hasParamIndex = paramIndex !== null && !isNaN(parseInt(paramIndex, 10));
  const requestedIdx = hasParamIndex ? parseInt(paramIndex, 10) : null;

  // If session is missing or session index does not match requested index, fetch from projects API
  if (
    (!session?.clip || (requestedIdx !== null && Number(session.index) !== requestedIdx)) &&
    requestedIdx !== null
  ) {
    try {
      const pRes = await fetch("/api/clips/projects");
      if (pRes.ok) {
        const pData = await pRes.json();
        const projects = pData.projects || [];
        for (const pSummary of projects) {
          if (pSummary.clipCount > requestedIdx) {
            const detailRes = await fetch(`/api/clips/projects/${pSummary.id}`);
            if (detailRes.ok) {
              const detailData = await detailRes.json();
              const fullProj = detailData.project;
              if (fullProj && fullProj.clips && fullProj.clips[requestedIdx]) {
                const clip = fullProj.clips[requestedIdx];
                session = {
                  clip,
                  index: requestedIdx,
                  captions:
                    (fullProj.clipCaptions && fullProj.clipCaptions[requestedIdx]) ||
                    clip.captions ||
                    [],
                  captionStyle: fullProj.captionStyle || null,
                };
                localStorage.setItem(SESSION_KEY, JSON.stringify(session));
                break;
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn("API project search fallback error:", err);
    }
  }

  if (!session?.clip) {
    if (editorShell) editorShell.style.display = "none";
    if (noClipState) noClipState.style.display = "flex";
    return;
  }

  editorState.clip = session.clip;
  editorState.clipIndex = Number(session.index) || 0;

  const savedStyle = localStorage.getItem(STYLE_KEY);
  if (savedStyle) {
    try {
      Object.assign(editorState.style, JSON.parse(savedStyle));
    } catch {}
  }

  if (session.captionStyle) {
    Object.assign(editorState.style, session.captionStyle);
  }

  editorState.style = normalizeStyle(editorState.style);

  if (clipTitleDisplay) {
    clipTitleDisplay.textContent =
      session.clip.hook ||
      session.clip.originalName ||
      session.clip.title ||
      `Clip #${editorState.clipIndex + 1}`;
  }

  if (editorShell) editorShell.style.display = "grid";
  if (noClipState) noClipState.style.display = "none";

  populateStyleControls();
  applyStyleToOverlay();
  renderPresetsUI();

  if (captionVideo) {
    const src = getClipSource(session.clip);
    if (src) {
      captionVideo.src = src;
      captionVideo.preload = "auto";
      captionVideo.load();
      try {
        captionVideo.currentTime = 0;
      } catch {}
    } else {
      console.warn("No video source found for clip:", session.clip);
    }
  }

  // 1. Try saved captions or embedded payload
  let initialSegments = normalizeSegments(session.captions || []);

  if (!initialSegments.length) {
    initialSegments = extractSegmentsFromPayload(
      session.clip?.captions ||
        session.clip?.segments ||
        session.clip?.subtitleSegments ||
        session.clip?.transcript,
    );
  }

  const isMock = isPlaceholderOrMockCaptions(initialSegments, session.clip);

  if (session.clip && (!initialSegments.length || isMock)) {
    const statusLabel = document.getElementById("captionStatusLabel") || document.querySelector(".ce-status-label");
    if (statusLabel) statusLabel.textContent = "Transcribing Audio with Whisper AI...";
    try {
      const serverSegments = await fetchServerCaptions(session.clip);
      if (serverSegments && serverSegments.length) {
        console.log("Real audio transcription loaded:", serverSegments.length, "segments");
        initialSegments = serverSegments;
        if (statusLabel) statusLabel.textContent = `Audio Transcribed (${serverSegments.length} Segments)`;
      }
    } catch (err) {
      console.warn("Could not fetch server captions during init:", err);
    }
  }

  // 2. If still empty, generate fallback so editor is never blank
  if (!initialSegments.length) {
    const clipDur = Number(captionVideo?.duration || session.clip?.duration || 30);
    initialSegments = generateSmartCaptionsForClip(session.clip, clipDur);
  }

  editorState.segments = normalizeSegments(initialSegments);
  editorState.activeSegmentId = editorState.segments[0]?.id || null;

  persistCaptions();
  renderTimeline();
  syncCaptionOverlay();
  startCaptionSync();
  updateLivePreview();
}

window.renderAnimatedCaption = renderAnimatedCaption;
window.applyTextBoxVisuals = applyTextBoxVisuals;
window.resetCaptionRenderCache = resetCaptionRenderCache;
window.syncStyleFromControls = syncStyleFromControls;
window.normalizeStyle = normalizeStyle;

if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", init);
else init();
