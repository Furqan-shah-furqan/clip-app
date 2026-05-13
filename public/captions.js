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
  textShadow: true,
  shadowColor: "#000000",
  shadowBlur: 8,
  shadowOffsetX: 0,
  shadowOffsetY: 2,
  animationStyle: "none",
  fontWeight: 800,
  textTransform: "none",
  letterSpacing: 0,
  borderRadius: 14,
  paddingX: 14,
  paddingY: 10,
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
      textShadow: true,
      shadowColor: "#00e5ff",
      shadowBlur: 26,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      animationStyle: "neon",
      fontWeight: 900,
      textTransform: "uppercase",
      letterSpacing: 2,
      borderRadius: 0,
      paddingX: 6,
      paddingY: 4,
    },
  },
  {
    id: "cinematic",
    name: "Cinematic",
    label: "Film strip",
    style: {
      fontFamily: "'Oswald', sans-serif",
      fontSize: 24,
      textColor: "#f5f0e8",
      bgColor: "#000000",
      bgOpacity: 94,
      position: "bottom",
      textShadow: false,
      shadowColor: "#000000",
      shadowBlur: 0,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      animationStyle: "cinematic",
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: 2.5,
      borderRadius: 4,
      paddingX: 18,
      paddingY: 10,
    },
  },
  {
    id: "pop",
    name: "Pop",
    label: "Bounce in",
    style: {
      fontFamily: "'Arial Black', sans-serif",
      fontSize: 30,
      textColor: "#ffffff",
      bgColor: "#e53e3e",
      bgOpacity: 95,
      position: "center",
      textShadow: true,
      shadowColor: "#7b0000",
      shadowBlur: 8,
      shadowOffsetX: 2,
      shadowOffsetY: 3,
      animationStyle: "pop",
      fontWeight: 900,
      textTransform: "uppercase",
      letterSpacing: 1,
      borderRadius: 20,
      paddingX: 20,
      paddingY: 12,
    },
  },
  {
    id: "reveal",
    name: "Reveal",
    label: "Blur fade",
    style: {
      fontFamily: "Inter, sans-serif",
      fontSize: 26,
      textColor: "#dce8ff",
      bgColor: "#0d1b3e",
      bgOpacity: 82,
      position: "bottom",
      textShadow: true,
      shadowColor: "#0d1b3e",
      shadowBlur: 10,
      shadowOffsetX: 0,
      shadowOffsetY: 2,
      animationStyle: "reveal",
      fontWeight: 700,
      textTransform: "none",
      letterSpacing: 0.2,
      borderRadius: 16,
      paddingX: 18,
      paddingY: 12,
    },
  },
  {
    id: "typewriter",
    name: "Type",
    label: "Word by word",
    style: {
      fontFamily: "'Courier New', monospace",
      fontSize: 22,
      textColor: "#39ff14",
      bgColor: "#0a0a0a",
      bgOpacity: 90,
      position: "bottom",
      textShadow: true,
      shadowColor: "#39ff14",
      shadowBlur: 12,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      animationStyle: "typewriter",
      fontWeight: 700,
      textTransform: "none",
      letterSpacing: 0.5,
      borderRadius: 8,
      paddingX: 16,
      paddingY: 10,
    },
  },
  {
    id: "oneword",
    name: "One Word",
    label: "Show one",
    style: {
      fontFamily: "'Montserrat', sans-serif",
      fontSize: 42,
      textColor: "#ffffff",
      bgColor: "#000000",
      bgOpacity: 0,
      position: "center",
      textShadow: true,
      shadowColor: "#000000",
      shadowBlur: 18,
      shadowOffsetX: 0,
      shadowOffsetY: 3,
      animationStyle: "oneword",
      fontWeight: 900,
      textTransform: "uppercase",
      letterSpacing: 2,
      borderRadius: 0,
      paddingX: 8,
      paddingY: 6,
    },
  },
  {
    id: "twoword",
    name: "Two Word",
    label: "Show two",
    style: {
      fontFamily: "'Montserrat', sans-serif",
      fontSize: 30,
      textColor: "#39ff14",
      bgColor: "#1a1a1a",
      bgOpacity: 92,
      position: "bottom",
      textShadow: true,
      shadowColor: "#000000",
      shadowBlur: 10,
      shadowOffsetX: 0,
      shadowOffsetY: 2,
      animationStyle: "twoword",
      fontWeight: 900,
      textTransform: "none",
      letterSpacing: 0.5,
      borderRadius: 12,
      paddingX: 18,
      paddingY: 10,
    },
  },
  {
    id: "wordcolor",
    name: "Word Color",
    label: "Color change",
    style: {
      fontFamily: "'Poppins', sans-serif",
      fontSize: 28,
      textColor: "#ffffff",
      bgColor: "#1a1a1a",
      bgOpacity: 90,
      position: "bottom",
      textShadow: false,
      shadowColor: "#000000",
      shadowBlur: 0,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      animationStyle: "wordcolor",
      fontWeight: 800,
      textTransform: "none",
      letterSpacing: 0,
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

let _lastRenderedSegId = null;
let _lastRenderedText = null;
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
let captionVideo, captionOverlay, captionOverlayText;
let captionLoadingState, captionSegmentsList;
let addSegmentBtn, regenerateBtn;
let timelineTabBtn, styleTabBtn, timelinePanel, stylePanel, timelineActions;
let capFontFamily, capFontSize, capFontSizeVal;
let capTextColor, capBgColor, capBgOpacity, capBgOpacityVal;
let capTextShadow, capShadowColor, capShadowBlur, capShadowBlurVal;
let capShadowOffsetX, capShadowOffsetY, shadowControlsGrid;
let positionBtns, captionLivePreview;
let applyStyleBtn, exportCaptionedVideoBtn;
let capAnimStyle, presetsGrid;
let colorSwatchButtons = [];

function cacheDom() {
  themeToggle = document.getElementById("themeToggle");
  modePill = document.getElementById("modePill");
  backBtn = document.getElementById("backBtn");
  goBackBtn = document.getElementById("goBackBtn");
  saveAndBackBtn = document.getElementById("saveAndBackBtn");
  noClipState = document.getElementById("noClipState");
  editorShell = document.getElementById("editorShell");
  clipTitleDisplay = document.getElementById("clipTitleDisplay");
  captionVideo = document.getElementById("captionVideo");
  captionOverlay = document.getElementById("captionOverlay");
  captionOverlayText = document.getElementById("captionOverlayText");
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
  capTextColor = document.getElementById("capTextColor");
  capBgColor = document.getElementById("capBgColor");
  capBgOpacity = document.getElementById("capBgOpacity");
  capBgOpacityVal = document.getElementById("capBgOpacityVal");
  capTextShadow = document.getElementById("capTextShadow");
  capShadowColor = document.getElementById("capShadowColor");
  capShadowBlur = document.getElementById("capShadowBlur");
  capShadowBlurVal = document.getElementById("capShadowBlurVal");
  capShadowOffsetX = document.getElementById("capShadowOffsetX");
  capShadowOffsetY = document.getElementById("capShadowOffsetY");
  shadowControlsGrid = document.getElementById("shadowControlsGrid");
  positionBtns = document.getElementById("positionBtns");
  captionLivePreview = document.getElementById("captionLivePreview");
  applyStyleBtn = document.getElementById("applyStyleBtn");
  exportCaptionedVideoBtn = document.getElementById("exportCaptionedVideoBtn");
  capAnimStyle = document.getElementById("capAnimStyle");
  presetsGrid = document.getElementById("presetsGrid");
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
  return (
    clip.previewUrl ||
    clip.downloadUrl ||
    clip.videoUrl ||
    clip.directUrl ||
    clip.url ||
    clip.src ||
    clip.fileUrl ||
    clip.assetUrl ||
    clip.localPath ||
    clip.filePath ||
    ""
  );
}

function wrapCaptionText(text, maxCharsPerLine) {
  if (!text) return text;
  const limit = Math.max(10, Math.round(maxCharsPerLine));
  if (text.length <= limit) return text;

  const words = text.split(/\s+/);
  const lines = [];
  let current = "";

  for (const word of words) {
    if (!current) {
      current = word;
    } else if (current.length + 1 + word.length <= limit) {
      current += " " + word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);

  return lines.join("\n");
}
function getPreviewCharsPerLine(style = editorState.style) {
  const previewW = captionVideo?.clientWidth || 265;
  const previewFs = Number(style?.fontSize || 28);
  return Math.max(12, Math.round((previewW * 0.88) / (previewFs * 0.55)));
}

function getParityDisplayText(segment, currentTime, style = editorState.style) {
  if (!segment) return "";

  const anim = style.animationStyle || "none";
  let text = segment.text || "";

  if (anim === "oneword") {
    text = getWordGroupText(segment, currentTime, 1);
  } else if (anim === "twoword") {
    text = getWordGroupText(segment, currentTime, 2);
  } else if (anim === "wordappend") {
    text = getWordAppendText(segment, currentTime);
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
    lineHeight: 1.4,
    maxWidthPercent: 88,
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
 * For oneword / twoword: returns the correct word group text based on
 * current playback position within a segment.
 */
function getWordGroupText(seg, currentTime, wordsPerGroup) {
  const words = seg.text.trim().split(/\s+/);
  if (words.length === 0) return "";
  const duration = Math.max(0.05, seg.end - seg.start);
  const elapsed = Math.max(0, currentTime - seg.start);
  const progress = Math.min(elapsed / duration, 0.99999);
  const wordIndex = Math.floor(progress * words.length);
  const groupIndex = Math.floor(wordIndex / wordsPerGroup);
  const startIdx = groupIndex * wordsPerGroup;
  const endIdx = Math.min(startIdx + wordsPerGroup, words.length);
  return words.slice(startIdx, endIdx).join(" ");
}

/**
 * For wordappend: returns progressively more words as video plays through segment.
 */
function getWordAppendText(seg, currentTime) {
  const words = seg.text.trim().split(/\s+/);
  if (words.length === 0) return "";
  const duration = Math.max(0.05, seg.end - seg.start);
  const elapsed = Math.max(0, currentTime - seg.start);
  const progress = Math.min(elapsed / duration, 0.99999);
  const wordCount = Math.max(1, Math.ceil(progress * words.length));
  return words.slice(0, wordCount).join(" ");
}

/**
 * For export: splits segments into smaller word-group segments so the
 * server can burn them as static subtitles that achieve the same timing effect.
 * Handles: oneword, twoword, wordappend, typewriter.
 */
function expandSegmentsForExport(segments, animStyle) {
  const wordByWordStyles = ["oneword", "twoword", "wordappend", "typewriter"];
  if (!wordByWordStyles.includes(animStyle)) return segments;

  const wordsPerGroup =
    animStyle === "oneword" || animStyle === "typewriter" ? 1 : 2;
  const expanded = [];

  for (const seg of segments) {
    const words = seg.text.trim().split(/\s+/);
    if (words.length <= 1) {
      expanded.push(seg);
      continue;
    }
    const duration = seg.end - seg.start;

    if (animStyle === "wordappend") {
      // Each sub-segment shows an increasing number of words
      const timePerWord = duration / words.length;
      for (let i = 0; i < words.length; i++) {
        const subStart =
          Math.round((seg.start + i * timePerWord) * 1000) / 1000;
        const subEnd =
          i < words.length - 1
            ? Math.round((seg.start + (i + 1) * timePerWord) * 1000) / 1000
            : Math.round(seg.end * 1000) / 1000;
        if (subEnd > subStart) {
          expanded.push({
            ...seg,
            id: `${seg.id}-append-${i}`,
            start: subStart,
            end: subEnd,
            text: words.slice(0, i + 1).join(" "),
          });
        }
      }
    } else {
      // Group words into chunks of wordsPerGroup
      const groups = [];
      for (let i = 0; i < words.length; i += wordsPerGroup) {
        groups.push(words.slice(i, i + wordsPerGroup).join(" "));
      }
      const timePerGroup = duration / groups.length;
      groups.forEach((text, i) => {
        const subStart =
          Math.round((seg.start + i * timePerGroup) * 1000) / 1000;
        const subEnd =
          i < groups.length - 1
            ? Math.round((seg.start + (i + 1) * timePerGroup) * 1000) / 1000
            : Math.round(seg.end * 1000) / 1000;
        if (subEnd > subStart) {
          expanded.push({
            ...seg,
            id: `${seg.id}-group-${i}`,
            start: subStart,
            end: subEnd,
            text,
          });
        }
      });
    }
  }

  // Re-sort and de-duplicate
  return expanded
    .filter((s) => s.text && s.end > s.start)
    .sort((a, b) => a.start - b.start);
}

// Session
function loadSession() {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
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

async function fetchServerCaptions(clip) {
  console.log("Fetching captions for clip:", clip);

  const embedded = extractSegmentsFromPayload(
    clip?.captions ||
      clip?.segments ||
      clip?.subtitleSegments ||
      clip?.transcript,
  );
  if (embedded.length) {
    console.log("Using embedded captions:", embedded.length);
    return embedded;
  }

  const controller = new AbortController();
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
  return { ...DEFAULT_STYLE, ...(style || {}) };
}

function styleMatchesPreset(style, presetStyle) {
  const current = normalizeStyle(style);
  const preset = normalizeStyle(presetStyle);
  const keys = [
    "fontFamily",
    "fontSize",
    "textColor",
    "bgColor",
    "bgOpacity",
    "position",
    "textShadow",
    "shadowColor",
    "shadowBlur",
    "shadowOffsetX",
    "shadowOffsetY",
    "animationStyle",
    "fontWeight",
    "textTransform",
    "letterSpacing",
    "borderRadius",
    "paddingX",
    "paddingY",
  ];
  return keys.every(
    (key) => String(current[key] ?? "") === String(preset[key] ?? ""),
  );
}

function applyTextBoxVisuals(element, style) {
  if (!element) return;
  const merged = normalizeStyle(style);
  const [r, g, b] = hexToRgb(merged.bgColor);
  const op = clamp(Number(merged.bgOpacity) || 0, 0, 100) / 100;

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
  element.style.padding = `${Number(merged.paddingY) || 10}px ${Number(merged.paddingX) || 14}px`;
  element.style.lineHeight = "1.4";
  element.style.maxWidth = "88%";
  element.style.whiteSpace = "pre-line";
  element.style.wordBreak = "break-word";
  element.style.overflowWrap = "anywhere";
}

function resetCaptionRenderCache() {
  _lastRenderedSegId = null;
  _lastRenderedText = null;
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

function moveTabsToNavbar() {
  const tabSwitcher =
    timelineTabBtn?.closest(".ce-tab-switcher") ||
    styleTabBtn?.closest(".ce-tab-switcher");
  const topbarCenter = document.querySelector(".ce-topbar-center");

  if (!tabSwitcher || !topbarCenter) return;
  if (topbarCenter.contains(tabSwitcher)) return;

  topbarCenter.classList.add("ce-topbar-center--tabs");
  tabSwitcher.classList.add("ce-tab-switcher--navbar");
  topbarCenter.appendChild(tabSwitcher);
}

function moveExportIntoPlacementSection() {
  const placementCard = positionBtns?.closest(".ce-card");
  if (!placementCard || !exportCaptionedVideoBtn) return;

  let exportBlock = placementCard.querySelector(".ce-export-block");
  if (!exportBlock) {
    exportBlock = document.createElement("div");
    exportBlock.className = "ce-export-block";
    exportBlock.innerHTML = `
      <div class="ce-card-section-divider"></div>
      <div class="ce-inline-section-head">
        <span class="ce-card-title">Export</span>
        <span class="ce-hint">Placement panel</span>
      </div>
    `;
    placementCard.appendChild(exportBlock);
  }

  exportCaptionedVideoBtn.classList.add("ce-btn--full", "ce-btn--brand");
  exportBlock.appendChild(exportCaptionedVideoBtn);
}

function moveShadowIntoColorsSection() {
  const colorsCard = capTextColor?.closest(".ce-card");
  const shadowCard = shadowControlsGrid?.closest(".ce-card");
  const shadowToggle = capTextShadow?.closest(".ce-toggle-row");

  if (!colorsCard || !shadowToggle || !shadowControlsGrid) return;

  let shadowSection = colorsCard.querySelector(".ce-shadow-inline-section");
  if (!shadowSection) {
    shadowSection = document.createElement("div");
    shadowSection.className = "ce-shadow-inline-section";
    shadowSection.innerHTML = `
      <div class="ce-card-section-divider"></div>
      <div class="ce-inline-section-head">
        <span class="ce-card-title">Shadow</span>
        <span class="ce-hint">Moved into colors</span>
      </div>
    `;
    colorsCard.appendChild(shadowSection);
  }

  shadowSection.appendChild(shadowToggle);
  shadowSection.appendChild(shadowControlsGrid);

  if (shadowCard && shadowCard !== colorsCard) {
    shadowCard.remove();
  }
}

function reorganizeStyleLayout() {
  moveTabsToNavbar();
  moveExportIntoPlacementSection();
  moveShadowIntoColorsSection();
}

// ─── ANIMATION RENDERERS ──────────────────────────────────

/**
 * Renders the 1-2 words currently visible for twoword/oneword mode.
 * text is ALREADY pre-filtered to the correct word group by syncCaptionOverlay.
 */
function renderWordGroupCaption(text, container, animClass) {
  const words = text.trim().split(/\s+/);
  container.innerHTML = words
    .map(
      (w, i) =>
        `<span class="cap-word ${animClass}" style="--word-delay:${(i * 0.05).toFixed(3)}s">${escapeHtml(w)}</span>`,
    )
    .join(" ");
}

function renderWordColorCaption(text, container) {
  const words = text.trim().split(/\s+/);
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
  // text is already the progressively-revealed subset; just render it cleanly
  const words = text.trim().split(/\s+/);
  container.innerHTML = words
    .map(
      (w, i) =>
        `<span class="cap-word cap-word--wordappend" style="--word-delay:${(i * 0.05).toFixed(3)}s">${escapeHtml(w)}</span>`,
    )
    .join(" ");
}

function renderHighlightImpactCaption(text, container) {
  const words = text.trim().split(/\s+/);
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

/**
 * Core caption renderer. For oneword/twoword/wordappend, the `text` parameter
 * is already the correctly time-sliced word(s) — computed in syncCaptionOverlay.
 */
function renderAnimatedCaption(text, segId) {
  if (!captionOverlayText) return;

  if (!text) {
    captionOverlayText.innerHTML = "";
    _lastRenderedSegId = null;
    _lastRenderedText = "";
    return;
  }

  const anim = editorState.style.animationStyle || "none";
  const isTimeBased = ["oneword", "twoword", "wordappend"].includes(anim);
  const needsRerender =
    isTimeBased || segId !== _lastRenderedSegId || text !== _lastRenderedText;

  if (!needsRerender) return;

  _lastRenderedSegId = segId;
  _lastRenderedText = text;

  const delay = ANIM_WORD_DELAY[anim] ?? 0.07;
  const words = text.trim().split(/\s+/);

  if (anim === "none" || anim === "classic") {
    captionOverlayText.textContent = text;
    return;
  }

  if (anim === "oneword") {
    renderWordGroupCaption(text, captionOverlayText, "cap-word--oneword");
    return;
  }

  if (anim === "twoword") {
    renderWordGroupCaption(text, captionOverlayText, "cap-word--twoword");
    return;
  }

  if (anim === "wordcolor") {
    renderWordColorCaption(text, captionOverlayText);
    return;
  }

  if (anim === "wordappend") {
    renderWordAppendCaption(text, captionOverlayText);
    return;
  }

  if (anim === "highlightimpact") {
    renderHighlightImpactCaption(text, captionOverlayText);
    return;
  }

  captionOverlayText.innerHTML = words
    .map(
      (w, i) =>
        `<span class="cap-word cap-word--${anim}" style="--word-delay:${(i * delay).toFixed(3)}s">${escapeHtml(w)}</span>`,
    )
    .join(" ");
}

function applyStyleToOverlay() {
  if (!captionOverlayText || !captionOverlay) return;
  const s = editorState.style;
  applyTextBoxVisuals(captionOverlayText, s);
  captionOverlay.className = "caption-video-overlay";
  if (s.position === "top") captionOverlay.classList.add("pos-top");
  if (s.position === "center") captionOverlay.classList.add("pos-center");
}

function getActiveSegmentByTime(time) {
  const t = Number.isFinite(Number(time)) ? Number(time) : 0;
  return editorState.segments.find((s) => t >= s.start && t < s.end) || null;
}

function syncCaptionOverlay() {
  if (!captionVideo || !captionOverlay || !captionOverlayText) return;

  const currentTime = safeVideoTime();
  const activeSegment = getActiveSegmentByTime(currentTime);
  const nextSegId = activeSegment?.id || null;
  const displayText = activeSegment
    ? getParityDisplayText(activeSegment, currentTime, editorState.style)
    : "";

  captionOverlay.style.opacity = displayText ? "1" : "0";
  renderAnimatedCaption(displayText, nextSegId);

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
  const currentSeg = getActiveSegmentByTime(currentTime);

  let sampleText = currentSeg
    ? getParityDisplayText(currentSeg, currentTime, s)
    : wrapCaptionText(
        editorState.segments[0]?.text || "Sample Caption",
        getPreviewCharsPerLine(s),
      );

  const anim = s.animationStyle || "none";
  const delay = ANIM_WORD_DELAY[anim] ?? 0.07;

  const cacheKey = [
    sampleText,
    anim,
    s.fontFamily,
    s.fontSize,
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

  if (anim === "none" || anim === "classic") {
    captionLivePreview.textContent = sampleText;
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
  if (capTextColor) capTextColor.value = s.textColor;
  if (capBgColor) capBgColor.value = s.bgColor;
  if (capBgOpacity) capBgOpacity.value = String(s.bgOpacity);
  if (capBgOpacityVal) capBgOpacityVal.textContent = String(s.bgOpacity);
  if (capTextShadow) capTextShadow.checked = s.textShadow;
  if (capShadowColor) capShadowColor.value = s.shadowColor;
  if (capShadowBlur) capShadowBlur.value = String(s.shadowBlur);
  if (capShadowBlurVal) capShadowBlurVal.textContent = String(s.shadowBlur);
  if (capShadowOffsetX) capShadowOffsetX.value = String(s.shadowOffsetX);
  if (capShadowOffsetY) capShadowOffsetY.value = String(s.shadowOffsetY);
  if (capAnimStyle) capAnimStyle.value = s.animationStyle || "none";
  positionBtns
    ?.querySelectorAll(".duration-btn")
    .forEach((btn) =>
      btn.classList.toggle("active", btn.dataset.pos === s.position),
    );
  updateShadowControlsState();
  updateColorSwatchState();
  renderPresetsUI();
  applyStyleToOverlay();
  updateLivePreview();
}
function syncStyleFromControls() {
  editorState.style = normalizeStyle(editorState.style);

  editorState.style.fontFamily =
    capFontFamily?.value || "'Montserrat', sans-serif";
  editorState.style.fontSize = clamp(
    parseInt(capFontSize?.value || "28", 10),
    14,
    72,
  );
  editorState.style.textColor = capTextColor?.value || "#fff";
  editorState.style.bgColor = capBgColor?.value || "#000";
  editorState.style.bgOpacity = clamp(
    parseInt(capBgOpacity?.value || "70", 10),
    0,
    100,
  );
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

  if (capFontSizeVal)
    capFontSizeVal.textContent = String(editorState.style.fontSize);
  if (capBgOpacityVal)
    capBgOpacityVal.textContent = String(editorState.style.bgOpacity);
  if (capShadowBlurVal)
    capShadowBlurVal.textContent = String(editorState.style.shadowBlur);

  updateShadowControlsState();
  updateColorSwatchState();
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
    const active = styleMatchesPreset(editorState.style, s);

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
            font-size:${Math.max(12, Math.round(Number(s.fontSize || 26) * 0.46))}px;
            font-weight:${s.fontWeight || 800};
            text-transform:${s.textTransform || "none"};
            letter-spacing:${Number(s.letterSpacing) || 0}px;
          "
        >Aa</div>
        <span class="preset-name">${preset.name}</span>
        <span class="preset-desc">${preset.label}</span>
      </button>
    `;
  }).join("");

  presetsGrid.querySelectorAll(".preset-card").forEach((card) => {
    card.addEventListener("click", () => applyPreset(card.dataset.presetId));
  });
}

/**
 * FIXED: Apply preset by fully resetting to DEFAULT_STYLE first, then
 * overlaying the preset values. This ensures every control reflects
 * exactly what the preset defines — no leftover values from prior state.
 */
function applyPreset(id) {
  const preset = STYLE_PRESETS.find((item) => item.id === id);
  if (!preset) return;

  editorState.style = normalizeStyle({
    ...DEFAULT_STYLE,
    ...preset.style,
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
  persistCaptions();
  stopCaptionSync();
  window.location.href = "index.html";
}

// Bind controls
function bindControls() {
  ensurePublishNavButton();

  backBtn?.addEventListener("click", goBack);
  goBackBtn?.addEventListener("click", goBack);

  saveAndBackBtn?.addEventListener("click", () => {
    syncStyleFromControls();
    goBack();
  });

  publishNavBtn?.addEventListener("click", goToPublishCenter);

  timelineTabBtn?.addEventListener("click", () => setActiveTab("timeline"));
  styleTabBtn?.addEventListener("click", () => setActiveTab("style"));
  addSegmentBtn?.addEventListener("click", addSegment);
  regenerateBtn?.addEventListener("click", regenerateCaptions);
  applyStyleBtn?.addEventListener("click", syncStyleFromControls);
  exportCaptionedVideoBtn?.addEventListener("click", exportCaptionedVideo);

  capFontFamily?.addEventListener("change", syncStyleFromControls);
  capFontSize?.addEventListener("input", syncStyleFromControls);
  capTextColor?.addEventListener("input", syncStyleFromControls);
  capBgColor?.addEventListener("input", syncStyleFromControls);
  capBgOpacity?.addEventListener("input", syncStyleFromControls);
  capTextShadow?.addEventListener("change", syncStyleFromControls);
  capShadowColor?.addEventListener("input", syncStyleFromControls);
  capShadowBlur?.addEventListener("input", syncStyleFromControls);
  capShadowOffsetX?.addEventListener("input", syncStyleFromControls);
  capShadowOffsetY?.addEventListener("input", syncStyleFromControls);
  capAnimStyle?.addEventListener("change", syncStyleFromControls);

  positionBtns?.querySelectorAll(".duration-btn").forEach((btn) =>
    btn.addEventListener("click", () => {
      editorState.style.position = btn.dataset.pos;
      populateStyleControls();
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
  reorganizeStyleLayout();
  initTheme();
  bindTheme();
  bindControls();
  setActiveTab("timeline");

  const session = loadSession();
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

  clipTitleDisplay.textContent =
    session.clip.hook ||
    session.clip.originalName ||
    `Clip #${editorState.clipIndex + 1}`;

  if (editorShell) editorShell.style.display = "grid";
  if (noClipState) noClipState.style.display = "none";

  populateStyleControls();
  applyStyleToOverlay();
  renderPresetsUI();

  if (captionVideo) {
    const src = getClipSource(session.clip);
    if (src) {
      captionVideo.src = src;
      captionVideo.load();
    }
  }

  let initialSegments = normalizeSegments(session.captions || []);

  if (!initialSegments.length) {
    initialSegments = extractSegmentsFromPayload(
      session.clip?.captions ||
        session.clip?.segments ||
        session.clip?.subtitleSegments ||
        session.clip?.transcript,
    );
  }

  if (!initialSegments.length) {
    showLoadingState("Loading captions...");
    try {
      initialSegments = await fetchServerCaptions(session.clip);
    } catch (err) {
      console.error("Initial caption fetch failed:", err);
    }
  }

  editorState.segments = normalizeSegments(initialSegments);
  editorState.activeSegmentId = editorState.segments[0]?.id || null;

  persistCaptions();
  showTimelineList();
  syncCaptionOverlay();
  startCaptionSync();
  updateLivePreview();
}

if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", init);
else init();
