const API_BASE = "/api";

const state = {
  uploadedProject: null,
  generatedClip: null,
  generatedClips: [],
  smartSuggestions: [],
  selectedDuration: 30,
  videoDurationSeconds: 0,
  clipsView: "story",
  activeModalClipIndex: null,
  savedProjectId: null,
  // Per-clip captions: { [clipIndex]: [{start, end, text}] }
  clipCaptions: {},
  // Caption style (shared)
  captionStyle: {
    fontFamily: "Inter, sans-serif",
    fontSize: 22,
    textColor: "#ffffff",
    bgColor: "#000000",
    bgOpacity: 70,
    position: "bottom",
    textShadow: true,
  },
};

const STUDIO_SESSION_KEY = "clipflow-studio-session";

function persistStudioSession() {
  try {
    localStorage.setItem(
      STUDIO_SESSION_KEY,
      JSON.stringify({
        uploadedProject: state.uploadedProject,
        savedProjectId: state.savedProjectId,
        generatedClip: state.generatedClip,
        generatedClips: state.generatedClips,
        smartSuggestions: state.smartSuggestions,
        selectedDuration: state.selectedDuration,
        videoDurationSeconds: state.videoDurationSeconds,
        clipsView: state.clipsView,
        clipCaptions: state.clipCaptions,
        captionStyle: state.captionStyle,
      }),
    );
  } catch {
    // ignore quota and serialization issues
  }
}

function restoreStudioSession() {
  const raw = localStorage.getItem(STUDIO_SESSION_KEY);
  if (!raw) return;

  try {
    const data = JSON.parse(raw);
    if (data.uploadedProject) state.uploadedProject = data.uploadedProject;
    if (data.savedProjectId) state.savedProjectId = data.savedProjectId;
    if (Array.isArray(data.generatedClips))
      state.generatedClips = data.generatedClips;
    if (Array.isArray(data.smartSuggestions))
      state.smartSuggestions = data.smartSuggestions;
    if (data.generatedClip) state.generatedClip = data.generatedClip;
    if (typeof data.selectedDuration === "number")
      state.selectedDuration = data.selectedDuration;
    if (typeof data.videoDurationSeconds === "number")
      state.videoDurationSeconds = data.videoDurationSeconds;
    state.clipsView = "story";
    if (data.clipCaptions && typeof data.clipCaptions === "object")
      state.clipCaptions = data.clipCaptions;
    if (data.captionStyle && typeof data.captionStyle === "object") {
      Object.assign(state.captionStyle, data.captionStyle);
    }
  } catch {
    // ignore malformed session payload
  }
}

function mergeCaptionEditorSession() {
  const raw = localStorage.getItem("clipflow-caption-clip");
  if (!raw) return;

  try {
    const data = JSON.parse(raw);
    const clipIndex = Number(data.index);

    if (!Number.isNaN(clipIndex) && Array.isArray(data.captions)) {
      state.clipCaptions[clipIndex] = data.captions;
    }

    if (
      !Number.isNaN(clipIndex) &&
      state.generatedClips[clipIndex] &&
      data.clip
    ) {
      state.generatedClips[clipIndex] = {
        ...state.generatedClips[clipIndex],
        ...data.clip,
      };
    }

    if (data.captionStyle && typeof data.captionStyle === "object") {
      Object.assign(state.captionStyle, data.captionStyle);
    }
  } catch {
    // ignore malformed caption editor payload
  }
}

// ─── Tab navigation ──────────────────────────────────────────────────────────
const tabButtons = document.querySelectorAll(".tab-btn");
const tabContents = document.querySelectorAll(".tab-content");
const pageTitle = document.getElementById("pageTitle");
const pageDesc = document.getElementById("pageDesc");
const clipControlsCard = document.getElementById("clipControlsCard");

const pageMap = {
  clips: { title: "NEW CLIP UNIVERSE", desc: "" },
  hooks: {
    title: "Hook workspace",
    desc: "Create short, catchy opening lines for your content.",
  },
  captions: {
    title: "Caption workspace",
    desc: "Style subtitles with fonts, colors, and live preview.",
  },
  schedule: {
    title: "Schedule workspace",
    desc: "Save post plans locally and export your final assets.",
  },
};

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;
    const target = document.getElementById(tab);
    if (!target) return;

    tabButtons.forEach((b) => b.classList.remove("active"));
    tabContents.forEach((c) => c.classList.remove("active"));

    btn.classList.add("active");
    target.classList.add("active");

    if (pageTitle) pageTitle.textContent = pageMap[tab]?.title || "Workspace";
    if (pageDesc) pageDesc.textContent = pageMap[tab]?.desc || "";
  });
});

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const videoInput = document.getElementById("videoInput");
const videoPreview = document.getElementById("videoPreview");
const youtubeEmbedPreview = document.getElementById("youtubeEmbedPreview");
const fetchedSourceCard = document.getElementById("fetchedSourceCard");
const fetchedSourceThumb = document.getElementById("fetchedSourceThumb");
const fetchedSourceTitle = document.getElementById("fetchedSourceTitle");
const fetchedSourceMeta = document.getElementById("fetchedSourceMeta");
const videoPlaceholder = document.getElementById("videoPlaceholder");
const projectName = document.getElementById("projectName");
const projectMeta = document.getElementById("projectMeta");
const startTimeInput = document.getElementById("startTime");
const endTimeInput = document.getElementById("endTime");
const aspectRatioInput = document.getElementById("aspectRatio");
const smartClipBtn = document.getElementById("smartClipBtn");
const saveProjectBtn = document.getElementById("saveProjectBtn");
const refreshProjectsBtn = document.getElementById("refreshProjectsBtn");
const projectHistoryList = document.getElementById("projectHistoryList");
const allProjectsCount = document.getElementById("allProjectsCount");
const savedProjectsCount = document.getElementById("savedProjectsCount");
const projectViewTabs = document.querySelectorAll("[data-project-view]");
const progressFill = document.getElementById("progressFill");
const progressLabel = document.getElementById("progressLabel");
const progressPercent = document.getElementById("progressPercent");
const progressEta = document.getElementById("progressEta");
const durationButtons = document.querySelectorAll(".duration-btn");
const videoLengthText = document.getElementById("videoLengthText");
const selectedDurationText = document.getElementById("selectedDurationText");
const possibleClipsText = document.getElementById("possibleClipsText");
const totalPossibleClips = document.getElementById("totalPossibleClips");
const clipLengthInfo = document.getElementById("clipLengthInfo");
const generatedClipsGrid = document.getElementById("generatedClipsGrid");
const downloadAllBtn = document.getElementById("downloadAllBtn");
const deleteAllBtn = document.getElementById("deleteAllBtn");
const gridViewBtn = document.getElementById("gridViewBtn");
const scrollViewBtn = document.getElementById("scrollViewBtn");
const generateHooksBtn = document.getElementById("generateHooksBtn");
const hooksOutput = document.getElementById("hooksOutput");
const ytUrlInput = document.getElementById("ytUrlInput");
const ytFetchBtn = document.getElementById("ytFetchBtn");
const ytInfoPreview = document.getElementById("ytInfoPreview");
const ytThumb = document.getElementById("ytThumb");
const ytTitle = document.getElementById("ytTitle");
const ytDuration = document.getElementById("ytDuration");
const ytFetchProgress = document.getElementById("ytFetchProgress");
const ytProgressFill = document.getElementById("ytProgressFill");
const ytProgressLabel = document.getElementById("ytProgressLabel");
const hookTopic = document.getElementById("hookTopic");
const hookStyle = document.getElementById("hookStyle");
const captionText = document.getElementById("captionText");
const fontFamily = document.getElementById("fontFamily");
const fontSize = document.getElementById("fontSize");
const fontSizeDisplay = document.getElementById("fontSizeDisplay");
const textColor = document.getElementById("textColor");
const bgColor = document.getElementById("bgColor");
const bgOpacity = document.getElementById("bgOpacity");
const bgOpacityDisplay = document.getElementById("bgOpacityDisplay");
const captionPosition = document.getElementById("captionPosition");
const captionPreview = document.getElementById("captionPreview");
const captionStage = document.querySelector(".caption-stage");
const applyCaptionStyleBtn = document.getElementById("applyCaptionStyleBtn");
const saveScheduleBtn = document.getElementById("saveScheduleBtn");
const scheduleOutput = document.getElementById("scheduleOutput");
const platformSelect = document.getElementById("platformSelect");
const postTitle = document.getElementById("postTitle");
const postTime = document.getElementById("postTime");
const downloadButtons = document.querySelectorAll(".download-item");
const themeToggle = document.getElementById("themeToggle");
const modePill = document.getElementById("modePill");
const clipModal = document.getElementById("clipModal");
const clipModalBackdrop = document.getElementById("clipModalBackdrop");
const clipModalClose = document.getElementById("clipModalClose");
const clipModalVideo = document.getElementById("clipModalVideo");
const clipModalTitle = document.getElementById("clipModalTitle");
const clipModalMeta = document.getElementById("clipModalMeta");
const clipModalEditBtn = document.getElementById("clipModalEditBtn");

// Caption overlays
const mainVideoCaptionOverlay = document.getElementById(
  "mainVideoCaptionOverlay",
);
const mainVideoCaptionText = document.getElementById("mainVideoCaptionText");
const modalCaptionOverlay = document.getElementById("modalCaptionOverlay");
const modalCaptionText = document.getElementById("modalCaptionText");

// Caption tab live controls
fontSize?.addEventListener("input", () => {
  if (fontSizeDisplay) fontSizeDisplay.textContent = fontSize.value;
  liveUpdateCaptionPreview();
});

bgOpacity?.addEventListener("input", () => {
  if (bgOpacityDisplay) bgOpacityDisplay.textContent = bgOpacity.value;
  liveUpdateCaptionPreview();
});

fontFamily?.addEventListener("change", liveUpdateCaptionPreview);
textColor?.addEventListener("input", liveUpdateCaptionPreview);
bgColor?.addEventListener("input", liveUpdateCaptionPreview);
captionPosition?.addEventListener("change", () => {
  if (captionStage) {
    captionStage.className = `caption-stage pos-${captionPosition.value}`;
  }
});

function liveUpdateCaptionPreview() {
  if (!captionPreview) return;
  const size = fontSize?.value || 24;
  const family = fontFamily?.value || "Inter, sans-serif";
  const tColor = textColor?.value || "#ffffff";
  const bColor = bgColor?.value || "#000000";
  const opacity = parseInt(bgOpacity?.value || "70") / 100;
  const [r, g, b] = hexToRgb(bColor);
  captionPreview.style.fontFamily = family;
  captionPreview.style.fontSize = `${size}px`;
  captionPreview.style.color = tColor;
  captionPreview.style.background = `rgba(${r},${g},${b},${opacity})`;
}

// ─── Theme ────────────────────────────────────────────────────────────────────
function initTheme() {
  const isDark = localStorage.getItem("clipflow-theme") === "dark";
  if (themeToggle) themeToggle.checked = isDark;
  updateModePill();
}

function updateModePill() {
  if (!modePill) return;
  modePill.textContent = themeToggle?.checked ? "Dark" : "Light";
}

themeToggle?.addEventListener("change", () => {
  localStorage.setItem(
    "clipflow-theme",
    themeToggle.checked ? "dark" : "light",
  );
  updateModePill();
});

// ─── Utilities ────────────────────────────────────────────────────────────────
async function apiFetch(url, options = {}) {
  const response = await fetch(url, options);
  const contentType = response.headers.get("content-type") || "";
  let data;

  if (contentType.includes("application/json")) {
    data = await response.json();
  } else {
    const text = await response.text();
    data = { error: text || "Request failed" };
  }

  if (!response.ok)
    throw new Error(data.details || data.error || "Request failed");
  return data;
}

function formatBytes(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatTime(sec) {
  const total = Math.floor(sec || 0);
  const hrs = String(Math.floor(total / 3600)).padStart(2, "0");
  const mins = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const secs = String(total % 60).padStart(2, "0");
  return hrs === "00" ? `${mins}:${secs}` : `${hrs}:${mins}:${secs}`;
}

function formatShortDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

function timeToSeconds(timeStr) {
  if (!timeStr) return 0;
  const parts = String(timeStr).split(":").map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

function secondsToTime(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const hrs = String(Math.floor(s / 3600)).padStart(2, "0");
  const mins = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const secs = String(s % 60).padStart(2, "0");
  return `${hrs}:${mins}:${secs}`;
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
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return [r, g, b];
}

// ─── Progress bar ────────────────────────────────────────────────────────────
let _currentProgress = 0;

function formatProgressText(value) {
  const safe = Math.max(0, Math.min(100, Number(value) || 0));
  if (safe >= 100) return "100%";
  if (safe < 1) return `${safe.toFixed(1)}%`;
  // Show one decimal place between 1–99.9
  const rounded = Math.round(safe * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}.0%` : `${rounded.toFixed(1)}%`;
}

function formatEtaText(seconds) {
  const safe = Math.max(0, Math.round(Number(seconds) || 0));

  if (safe <= 0) {
    return "ETA 0s";
  }

  const mins = Math.floor(safe / 60);
  const secs = safe % 60;

  if (mins >= 10) {
    return `ETA ${mins}m`;
  }

  if (mins >= 1 && secs) {
    return `ETA ${mins}m ${secs}s`;
  }

  if (mins >= 1) {
    return `ETA ${mins}m`;
  }

  return `ETA ${secs}s`;
}

function formatEtaText(seconds) {
  const safe = Math.max(0, Math.round(Number(seconds) || 0));

  if (safe <= 0) return "ETA 0s";

  const mins = Math.floor(safe / 60);
  const secs = safe % 60;

  if (mins >= 1 && secs > 0) return `ETA ${mins}m ${secs}s`;
  if (mins >= 1) return `ETA ${mins}m`;

  return `ETA ${secs}s`;
}

function updateProgress(percent, label = "Processing...", etaSeconds = null) {
  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  _currentProgress = p;

  if (progressFill) {
    progressFill.style.width = `${p}%`;
  }

  if (progressPercent) {
    progressPercent.textContent = formatProgressText(p);
  }

  if (progressLabel) {
    progressLabel.textContent = label;
  }

  if (progressEta) {
    if (etaSeconds !== null && etaSeconds !== undefined && p > 0 && p < 100) {
      progressEta.style.display = "inline-flex";
      progressEta.textContent = formatEtaText(etaSeconds);
    } else {
      progressEta.style.display = "none";
      progressEta.textContent = "";
    }
  }

  updateActiveProjectProgressCard();
}

function animateProgressTo(targetPercent, label = "Generating...") {
  return new Promise((resolve) => {
    if (progressLabel) progressLabel.textContent = label;
    let current = _currentProgress;
    const clampedTarget = Math.max(
      0,
      Math.min(100, Number(targetPercent) || 0),
    );
    const target = clampedTarget;

    const step = () => {
      const remaining = target - current;

      if (remaining <= 0.02) {
        updateProgress(target, label);
        resolve();
        return;
      }

      // More aggressive speed to ensure it always reaches target
      const speed = Math.max(
        0.08,
        Math.min(2.4, remaining * 0.055 + Math.random() * 0.42),
      );
      current = Math.min(target, current + speed);
      updateProgress(current, label);

      const delay = 18 + Math.random() * 44;
      setTimeout(step, delay);
    };

    step();
  });
}

let _crawlStop = null;

function startProgressCrawl(ceiling = 90, label = "Processing...") {
  let active = true;

  const startedAt = Date.now();
  const estimatedSeconds = 360;

  const crawl = () => {
    if (!active) return;

    const elapsedSeconds = (Date.now() - startedAt) / 1000;

    let nextProgress = 0;

    if (elapsedSeconds <= estimatedSeconds) {
      nextProgress = Math.min(
        ceiling,
        (elapsedSeconds / estimatedSeconds) * ceiling,
      );
    } else {
      nextProgress = Math.min(
        95,
        ceiling + Math.min(5, (elapsedSeconds - estimatedSeconds) * 0.03),
      );
    }

    const remainingSeconds =
      elapsedSeconds <= estimatedSeconds
        ? Math.max(1, Math.round(estimatedSeconds - elapsedSeconds))
        : null;

    updateProgress(
      Math.max(_currentProgress, nextProgress),
      label,
      remainingSeconds,
    );

    setTimeout(crawl, 700);
  };

  crawl();

  const stop = () => {
    active = false;
  };

  _crawlStop = stop;
  return stop;
}
// ─── Project info ─────────────────────────────────────────────────────────────
function setProjectInfo(name, meta) {
  if (projectName) {
    projectName.textContent = name || "";
  }

  if (projectMeta) {
    projectMeta.textContent = meta || "";
  }

  const sourceSummaryInline = document.getElementById("sourceSummaryInline");

  if (sourceSummaryInline) {
    sourceSummaryInline.style.display = "none";
    sourceSummaryInline.classList.remove("is-active");
  }
}

function clearLocalVideoPreview() {
  if (!videoPreview) {
    return;
  }

  videoPreview.pause();
  videoPreview.removeAttribute("src");
  videoPreview.load();
  videoPreview.style.display = "none";
}

function clearYoutubePreview() {
  if (youtubeEmbedPreview) {
    youtubeEmbedPreview.src = "";
    youtubeEmbedPreview.style.display = "none";
  }
  if (fetchedSourceCard) fetchedSourceCard.style.display = "none";
}

function setPreviewVideo(src) {
  if (!videoPreview) {
    return;
  }

  clearYoutubePreview();

  videoPreview.src = src;
  videoPreview.style.display = "block";
  videoPreview.load();

  if (videoPlaceholder) {
    videoPlaceholder.classList.add("is-hidden");
    videoPlaceholder.style.display = "none";
  }
}

function setFetchedSourceCard({ title, thumb, meta }) {
  clearLocalVideoPreview();

  if (fetchedSourceCard) {
    fetchedSourceCard.style.display = "none";
  }

  if (fetchedSourceThumb) {
    fetchedSourceThumb.src = thumb || "";
  }

  if (fetchedSourceTitle) {
    fetchedSourceTitle.textContent = title || "Fetched video ready";
  }

  if (fetchedSourceMeta) {
    fetchedSourceMeta.textContent = meta || "Ready for clipping";
  }

  if (videoPlaceholder) {
    videoPlaceholder.classList.add("is-hidden");
    videoPlaceholder.style.display = "none";
  }

  setProjectInfo(title || "Source ready", meta || "Ready for clipping");
}

function resetYoutubeFetchUi() {
  if (ytFetchBtn) ytFetchBtn.disabled = false;
  if (ytFetchProgress) ytFetchProgress.style.display = "none";
  if (ytProgressFill) ytProgressFill.style.width = "0%";
  if (ytProgressLabel) ytProgressLabel.textContent = "Fetching preview…";
}

function showClipControls() {
  return;
}

function getAutoSmartClipCount() {
  const duration = Number(
    state.videoDurationSeconds || state.uploadedProject?.duration || 0,
  );

  if (!duration || duration < 90) return 1;
  if (duration < 300) return 2; // < 5 min → 2
  if (duration < 600) return 3; // < 10 min → 3
  if (duration < 1200) return 4; // < 20 min → 4
  if (duration < 1800) return 5; // < 30 min → 5
  if (duration < 2700) return 6; // < 45 min → 6
  if (duration < 3600) return 7; // < 60 min → 7
  return 8; // 60+ min → 8
}

function updateClipPlanner() {
  const autoPicks = getAutoSmartClipCount();
  if (videoLengthText)
    videoLengthText.textContent = formatTime(state.videoDurationSeconds);
  if (selectedDurationText)
    selectedDurationText.textContent = `${state.selectedDuration}s`;
  if (possibleClipsText) possibleClipsText.textContent = `${autoPicks} picks`;
  if (totalPossibleClips)
    totalPossibleClips.textContent = `${autoPicks} smart picks`;
  if (clipLengthInfo)
    clipLengthInfo.textContent = `${state.selectedDuration}s target length • auto-ranked by transcript`;
}

function autoHookForClip(index) {
  const hooks = [
    "Think Better With Mental Models",
    "This Clip Changes Your Perspective",
    "A Smarter Way To Approach Life",
    "Stop Scrolling And Watch This",
    "The Advice Most People Miss",
    "A Powerful Mindset Shift",
    "Watch This Carefully",
    "This Is The Key Part",
  ];
  return hooks[index % hooks.length];
}

// ─── Caption overlay helpers ─────────────────────────────────────────────────
function applyOverlayStyle(textEl, overlayEl) {
  if (!textEl || !overlayEl) return;
  const s = state.captionStyle;
  const [r, g, b] = hexToRgb(s.bgColor || "#000000");
  const opacity = (s.bgOpacity ?? 70) / 100;

  textEl.style.fontFamily = s.fontFamily || "Inter, sans-serif";
  textEl.style.fontSize = `${s.fontSize || 22}px`;
  textEl.style.color = s.textColor || "#ffffff";
  textEl.style.background = `rgba(${r},${g},${b},${opacity})`;
  textEl.style.textShadow = s.textShadow ? "0 1px 4px rgba(0,0,0,.6)" : "none";

  // Position
  overlayEl.className = "caption-video-overlay";
  if (s.position === "center") overlayEl.classList.add("pos-center");
  else if (s.position === "top") overlayEl.classList.add("pos-top");
}

function showCaption(textEl, overlayEl, text) {
  if (!textEl || !overlayEl) return;
  if (textEl.textContent !== text) {
    textEl.textContent = text || "";
    if (text) {
      textEl.classList.remove("visible");
      // Force reflow
      void textEl.offsetWidth;
      textEl.classList.add("visible");
    }
  }
  overlayEl.style.opacity = text ? "1" : "0";
}

function syncCaptionsToVideo(video, textEl, overlayEl, clips, clipIndex) {
  if (!video || !textEl) return;
  const captions = state.clipCaptions[clipIndex] || [];
  if (!captions.length) {
    showCaption(textEl, overlayEl, "");
    return;
  }

  const t = video.currentTime;
  const active = captions.find((c) => t >= c.start && t <= c.end);
  showCaption(textEl, overlayEl, active ? active.text : "");
}

// Load captions from server for a generated clip
async function loadCaptionsForClip(clip, clipIndex) {
  if (state.clipCaptions[clipIndex]) return;

  const inputPath = getCaptionInputPath(clip);

  if (!inputPath) {
    state.clipCaptions[clipIndex] = generateMockCaptions(clip.duration || 30);
    return;
  }

  try {
    const result = await apiFetch(`${API_BASE}/captions/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inputPath }),
    });

    if (Array.isArray(result.segments) && result.segments.length) {
      state.clipCaptions[clipIndex] = result.segments;
      return;
    }

    if (result.trackUrl) {
      const vttText = await fetch(result.trackUrl).then((r) => r.text());
      const segments = parseVTT(vttText);
      state.clipCaptions[clipIndex] = segments.length
        ? segments
        : generateMockCaptions(clip.duration || 30);
      return;
    }

    state.clipCaptions[clipIndex] = generateMockCaptions(clip.duration || 30);
  } catch (error) {
    console.warn("Caption generation failed:", error);
    state.clipCaptions[clipIndex] = generateMockCaptions(clip.duration || 30);
  }
}

function getCaptionInputPath(clip = {}) {
  return (
    clip.outputPath ||
    clip.filePath ||
    clip.localPath ||
    clip.inputPath ||
    clip.sourcePath ||
    clip.storageUrl ||
    ""
  );
}

function parseVTT(vttText) {
  const segments = [];
  if (!vttText) return segments;
  const lines = vttText.split(/\r?\n/);
  let i = 0;

  while (i < lines.length) {
    if (lines[i].includes("-->")) {
      const [startStr, rest] = lines[i].split("-->");
      const endStr = (rest || "").trim().split(" ")[0];
      const start = vttTimeToSeconds(startStr.trim());
      const end = vttTimeToSeconds(endStr.trim());
      let text = "";
      i++;
      while (i < lines.length && lines[i].trim() !== "") {
        text += (text ? "\n" : "") + lines[i].trim().replace(/<[^>]+>/g, "");
        i++;
      }
      if (text && !isNaN(start) && !isNaN(end)) {
        segments.push({ start, end, text });
      }
    } else {
      i++;
    }
  }
  return segments;
}

function vttTimeToSeconds(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.split(":");
  if (parts.length === 3) {
    return (
      parseFloat(parts[0]) * 3600 +
      parseFloat(parts[1]) * 60 +
      parseFloat(parts[2])
    );
  }
  return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
}

const MOCK_PHRASES = [
  "And that's the key insight.",
  "Let me break this down.",
  "What most people don't realize is—",
  "The real secret is consistency.",
  "Here's what changed everything.",
  "You need to understand this first.",
  "This is the most important part.",
  "Pay attention to this moment.",
  "This is where it gets interesting.",
  "Most people get this completely wrong.",
  "The thing nobody tells you is—",
  "Let's talk about why this matters.",
];

function generateMockCaptions(duration) {
  const segments = [];
  let t = 0.8;
  let idx = 0;
  while (t < duration) {
    const dur = 1.6 + Math.random() * 2.2;
    const gap = 0.3 + Math.random() * 0.7;
    segments.push({
      start: Math.round(t * 100) / 100,
      end: Math.round((t + dur) * 100) / 100,
      text: MOCK_PHRASES[idx % MOCK_PHRASES.length],
    });
    t += dur + gap;
    idx++;
  }
  return segments;
}

// ─── Clip views ───────────────────────────────────────────────────────────────
function applyClipsView() {
  if (!generatedClipsGrid) return;

  state.clipsView = "story";

  generatedClipsGrid.classList.remove("clips-view-grid");
  generatedClipsGrid.classList.remove("clips-view-scroll");
  generatedClipsGrid.classList.add("clips-story-row");
}

function deleteClip(index) {
  state.generatedClips.splice(index, 1);
  delete state.clipCaptions[index];
  state.generatedClip = state.generatedClips[0] || null;
  renderGeneratedClips();
  persistStudioSession();
}

function deleteAllClips() {
  state.generatedClips = [];
  state.smartSuggestions = [];
  state.generatedClip = null;
  state.clipCaptions = {};
  renderGeneratedClips();
  updateProgress(0, "Ready");
  _currentProgress = 0;
  persistStudioSession();
}

// ─── Modal ────────────────────────────────────────────────────────────────────
let _modalCaptionRAF = null;

function closeClipModal() {
  if (!clipModal || !clipModalVideo) return;
  if (_modalCaptionRAF) cancelAnimationFrame(_modalCaptionRAF);
  _modalCaptionRAF = null;
  clipModal.classList.remove("is-open");
  clipModal.setAttribute("aria-hidden", "true");
  clipModalVideo.pause();
  clipModalVideo.removeAttribute("src");
  clipModalVideo.load();
  document.body.style.overflow = "";
  if (modalCaptionText) modalCaptionText.textContent = "";
  state.activeModalClipIndex = null;
}

function startModalCaptionLoop(clipIndex) {
  if (_modalCaptionRAF) cancelAnimationFrame(_modalCaptionRAF);

  function loop() {
    if (!clipModalVideo) return;
    syncCaptionsToVideo(
      clipModalVideo,
      modalCaptionText,
      modalCaptionOverlay,
      state.clipCaptions,
      clipIndex,
    );
    _modalCaptionRAF = requestAnimationFrame(loop);
  }

  loop();
}

async function openClip(index) {
  const clip = state.generatedClips[index];
  if (!clip?.downloadUrl || !clipModal || !clipModalVideo) return;

  state.activeModalClipIndex = index;

  // Apply current style to modal overlay
  applyOverlayStyle(modalCaptionText, modalCaptionOverlay);

  clipModalVideo.src = clip.previewUrl || clip.downloadUrl;
  clipModalVideo.load();

  if (clipModalTitle) {
    clipModalTitle.textContent = clip.hook || autoHookForClip(index);
  }

  if (clipModalMeta) {
    const duration =
      clip.duration != null
        ? formatShortDuration(clip.duration)
        : formatShortDuration(
            Math.max(
              0,
              timeToSeconds(clip.endTime || "00:00:30") -
                timeToSeconds(clip.startTime || "00:00:00"),
            ),
          );
    clipModalMeta.textContent = `Clip #${index + 1} • ${duration} • ${aspectRatioInput?.value || "9:16"}`;
  }

  clipModal.classList.add("is-open");
  clipModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";

  // Load & display captions
  await loadCaptionsForClip(clip, index);
  startModalCaptionLoop(index);
}

// Navigate to caption editor for a specific clip
function editClipCaptions(index) {
  console.log("EDIT CLICKED:", index);

  const clip = state.generatedClips[index];
  if (!clip) {
    console.error("Clip not found");
    window.location.href = `captions.html?index=${index}`;
    return;
  }

  if (!clip.previewUrl && clip.fileName) {
    clip.previewUrl = `/api/files/download/${encodeURIComponent(clip.fileName)}`;
  }
  if (!clip.downloadUrl && clip.fileName) {
    clip.downloadUrl = `/api/files/download/${encodeURIComponent(clip.fileName)}`;
  }

  localStorage.setItem(
    "clipflow-caption-clip",
    JSON.stringify({
      clip,
      index,
      captions: state.clipCaptions[index] || [],
      captionStyle: state.captionStyle,
    }),
  );

  window.location.href = `captions.html?index=${index}`;
}

// ─── Clip card rendering ──────────────────────────────────────────────────────
const SVG_PLAY = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
const SVG_DOWNLOAD = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
const SVG_DELETE = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`;
const SVG_EDIT = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;

function renderGeneratedClips() {
  if (!generatedClipsGrid) return;
  applyClipsView();
  persistStudioSession();
  renderProjectHistory(lastProjectsCache);

  if (!state.generatedClips.length) {
    generatedClipsGrid.innerHTML = `<div class="empty-state">No smart clips generated yet.</div>`;
    return;
  }

  generatedClipsGrid.innerHTML = state.generatedClips
    .map((clip, index) => {
      const hook = escapeHtml(clip.hook || autoHookForClip(index));
      const downloadUrl = escapeHtml(clip.downloadUrl || "");
      const num = String(index + 1).padStart(2, "0");

      const exactDuration =
        clip.duration != null
          ? formatShortDuration(clip.duration)
          : formatShortDuration(
              Math.max(
                0,
                timeToSeconds(clip.endTime || "00:00:30") -
                  timeToSeconds(clip.startTime || "00:00:00"),
              ),
            );

      return `
      <article class="clip-card ${clip.smartScore ? "smart-generated-card" : ""}">
        <div class="clip-card-video">
  ${clip.smartScore ? `<div class="smart-score-badge">${Math.round(Number(clip.smartScore) || 0)}</div>` : ""}

  ${
    downloadUrl
      ? `
        <a
          class="clip-video-link"
          href="${downloadUrl}"
          target="_blank"
          rel="noopener noreferrer"
          title="Open clip in new tab"
        >
          <video src="${downloadUrl}" muted controls preload="metadata"></video>
        </a>
      `
      : `<video muted controls preload="metadata"></video>`
  }
</div>
        <div class="clip-card-footer">
          <div class="clip-card-info">
            <span class="clip-card-num">#${num}</span>
            <span class="clip-card-dur">${exactDuration}</span>
            <div class="clip-card-title">${hook}</div>
            ${clip.smartScore ? `<span class="smart-mini-meta">${escapeHtml(clip.smartReason || "Smart pick")}</span>` : ""}
            ${clip.previewText ? `<span class="smart-preview-line">${escapeHtml(clip.previewText)}</span>` : ""}
          </div>
          <div class="clip-icon-btns">
  <a
    class="clip-icon-btn"
    href="${downloadUrl || "#"}"
    target="_blank"
    rel="noopener noreferrer"
    data-action="preview"
    data-index="${index}"
    title="Preview / Open in new tab"
  >
    ${SVG_PLAY}
  </a>

  <a
    class="clip-icon-btn edit"
    href="captions.html?index=${index}"
    data-action="edit"
    data-index="${index}"
    title="Edit Captions"
  >
    ${SVG_EDIT}
  </a>

  <a
    class="clip-icon-btn"
    href="${downloadUrl || "#"}"
    target="_blank"
    rel="noopener noreferrer"
    data-action="download"
    data-index="${index}"
    title="Download / Open in new tab"
  >
    ${SVG_DOWNLOAD}
  </a>

  <button
    type="button"
    class="clip-icon-btn danger"
    data-action="delete"
    data-index="${index}"
    title="Delete"
  >
    ${SVG_DELETE}
  </button>
</div>
        </div>
      </article>
    `;
    })
    .join("");
}

generatedClipsGrid?.addEventListener("click", async (event) => {
  const btn = event.target.closest("[data-action]");
  if (!btn) return;

  const action = btn.dataset.action;
  const index = Number(btn.dataset.index);

  if (Number.isNaN(index)) return;

  // Keep normal left-click app actions working.
  // Right-click menu will still show "Open link in new tab" for <a> buttons.
  if (action === "preview") {
    event.preventDefault();
    openClip(index);
    return;
  }

  if (action === "edit") {
    event.preventDefault();
    editClipCaptions(index);
    return;
  }

  if (action === "download") {
    event.preventDefault();
    downloadClip(index);
    return;
  }

  if (action === "delete") {
    event.preventDefault();
    deleteClip(index);
  }
});

// Modal edit button
clipModalEditBtn?.addEventListener("click", () => {
  if (state.activeModalClipIndex !== null) {
    closeClipModal();
    editClipCaptions(state.activeModalClipIndex);
  }
});

clipModalClose?.addEventListener("click", closeClipModal);
clipModalBackdrop?.addEventListener("click", closeClipModal);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && clipModal?.classList.contains("is-open")) {
    closeClipModal();
  }
});

// ─── YouTube fetch ────────────────────────────────────────────────────────────
let _ytInfoTimer = null;
let _ytAutoFetchTimer = null;
let _ytIsFetching = false;
let _lastAutoFetchedUrl = "";

function isValidYouTubeUrl(value = "") {
  const url = String(value || "").trim();
  if (!url) return false;

  return (
    /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i.test(url) ||
    /^(https?:\/\/)?(m\.)?youtube\.com\//i.test(url)
  );
}

function setYoutubeFetchButtonHidden() {
  if (!ytFetchBtn) return;
  ytFetchBtn.style.display = "none";
  ytFetchBtn.setAttribute("aria-hidden", "true");
  ytFetchBtn.tabIndex = -1;
}

async function fetchYtInfo(url) {
  try {
    const r = await fetch(
      `${API_BASE}/youtube/info?url=${encodeURIComponent(url)}`,
    );
    if (!r.ok) return;
    const { title, duration, thumbnail } = await r.json();
    if (ytThumb) ytThumb.src = thumbnail;
    if (ytTitle) ytTitle.textContent = title || "Untitled";
    if (ytDuration)
      ytDuration.textContent = duration
        ? `${Math.floor(duration / 60)} min ${duration % 60} sec`
        : "";
    if (ytInfoPreview) ytInfoPreview.style.display = "flex";
  } catch {}
}

async function fetchYoutubeSource(url, options = {}) {
  const cleanUrl = String(url || "").trim();

  if (!cleanUrl) {
    if (!options.silent) alert("Please paste a YouTube URL first.");
    return;
  }

  if (!isValidYouTubeUrl(cleanUrl)) {
    if (!options.silent) alert("Please paste a valid YouTube link.");
    return;
  }

  if (_ytIsFetching) return;

  _ytIsFetching = true;
  _lastAutoFetchedUrl = cleanUrl;

  if (ytFetchBtn) ytFetchBtn.disabled = true;
  if (ytFetchProgress) ytFetchProgress.style.display = "flex";
  if (ytProgressFill) ytProgressFill.style.width = "10%";
  if (ytProgressLabel) ytProgressLabel.textContent = "Fetching source info…";

  try {
    updateProgress(10, "Fetching YouTube source…");

    const result = await apiFetch(`${API_BASE}/youtube/fetch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: cleanUrl }),
    });

    const project = result.project;

    if (!project) {
      throw new Error("Invalid fetch response");
    }

    // Force YouTube metadata so clip generation never falls into the upload branch.
    project.source = "youtube";
    project.sourceType = "youtube";
    project.sourceUrl = project.sourceUrl || project.youtubeUrl || cleanUrl;
    project.youtubeUrl = project.youtubeUrl || project.sourceUrl || cleanUrl;
    project.videoId = project.videoId || getVideoIdFromUrl(cleanUrl);

    // Save previous completed project before switching to a new video.
    upsertCurrentProjectToAllProjects();

    state.uploadedProject = project;
    state.savedProjectId = null;
    state.currentProjectCreatedAt = new Date().toISOString();
    state.generatedClip = null;
    state.generatedClips = [];
    state.smartSuggestions = [];
    state.clipCaptions = {};
    state.videoDurationSeconds = Number(project.duration || 0);

    setFetchedSourceCard({
      title: project.originalName || project.title || "Fetched video ready",
      thumb: project.thumbnail || "",
      meta: project.metaText || "Ready for clipping",
    });

    showClipControls();

    if (videoLengthText) {
      videoLengthText.textContent = formatTime(state.videoDurationSeconds);
    }

    if (startTimeInput && !startTimeInput.value) {
      startTimeInput.value = "00:00:00";
    }

    if (endTimeInput) {
      endTimeInput.value = secondsToTime(state.selectedDuration);
    }

    updateClipPlanner();

    setProjectInfo(
      project.originalName || project.title || "YouTube import ready",
      project.metaText || "Preview imported for editing",
    );

    if (ytProgressFill) ytProgressFill.style.width = "100%";
    if (ytProgressLabel) ytProgressLabel.textContent = "Source ready ✓";

    updateProgress(100, "YouTube source ready ✓");

    renderGeneratedClips();
    renderProjectHistory(lastProjectsCache);
    persistStudioSession();

    setTimeout(resetYoutubeFetchUi, 500);
  } catch (error) {
    console.error("YouTube fetch failed:", error);

    if (ytProgressLabel) {
      ytProgressLabel.textContent = `Error: ${error.message}`;
    }

    updateProgress(0, "YouTube fetch failed");
    _lastAutoFetchedUrl = "";

    if (!options.silent) {
      alert(`YouTube fetch failed: ${error.message}`);
    } else {
      alert(`YouTube fetch failed: ${error.message}`);
    }
  } finally {
    _ytIsFetching = false;
    if (ytFetchBtn) ytFetchBtn.disabled = false;
  }
}

function scheduleYoutubeAutoFetch() {
  clearTimeout(_ytInfoTimer);
  clearTimeout(_ytAutoFetchTimer);

  const url = ytUrlInput?.value?.trim() || "";

  if (!url) {
    if (ytInfoPreview) ytInfoPreview.style.display = "none";
    return;
  }

  if (!isValidYouTubeUrl(url)) {
    return;
  }

  _ytInfoTimer = setTimeout(() => fetchYtInfo(url), 250);

  _ytAutoFetchTimer = setTimeout(() => {
    const latestUrl = ytUrlInput?.value?.trim() || "";
    if (!isValidYouTubeUrl(latestUrl)) return;
    if (latestUrl === _lastAutoFetchedUrl) return;
    fetchYoutubeSource(latestUrl, { silent: true });
  }, 650);
}

setYoutubeFetchButtonHidden();
ytUrlInput?.addEventListener("input", scheduleYoutubeAutoFetch);
ytUrlInput?.addEventListener("paste", () => {
  setTimeout(scheduleYoutubeAutoFetch, 0);
});
ytFetchBtn?.addEventListener("click", () => {
  fetchYoutubeSource(ytUrlInput?.value?.trim() || "");
});

// ─── File upload ──────────────────────────────────────────────────────────────
function uploadWithXHR(url, formData) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = (event.loaded / event.total) * 88;
        updateProgress(percent, "Uploading video…");
      }
    };

    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText || "{}");
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(data);
        } else {
          reject(new Error(data.details || data.error || "Upload failed"));
        }
      } catch {
        reject(new Error("Invalid upload response"));
      }
    };

    xhr.onerror = () => reject(new Error("Network upload error"));
    xhr.send(formData);
  });
}

videoInput?.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  try {
    upsertCurrentProjectToAllProjects();

    state.uploadedProject = null;
    state.savedProjectId = null;
    state.currentProjectCreatedAt = new Date().toISOString();
    state.generatedClip = null;
    state.generatedClips = [];
    state.smartSuggestions = [];
    state.clipCaptions = {};

    clearYoutubePreview();
    setProjectInfo(file.name, formatBytes(file.size));
    setPreviewVideo(URL.createObjectURL(file));
    showClipControls();

    _currentProgress = 0;
    updateProgress(0, "Starting upload…");
    await animateProgressTo(4, "Uploading video…");

    const formData = new FormData();
    formData.append("video", file);
    const result = await uploadWithXHR(`${API_BASE}/clips/upload`, formData);

    state.uploadedProject = result.project;
    state.savedProjectId = null;
    setProjectInfo(file.name, formatBytes(file.size));
    renderGeneratedClips();

    await animateProgressTo(100, "Upload complete ✓");
  } catch (error) {
    setProjectInfo("Upload failed", error.message);
    updateProgress(0, "Upload failed");
    alert(`Upload failed: ${error.message}`);
  }
});

videoPreview?.addEventListener("loadedmetadata", () => {
  state.videoDurationSeconds = Math.floor(videoPreview.duration || 0);
  if (videoLengthText)
    videoLengthText.textContent = formatTime(videoPreview.duration);
  if (startTimeInput && !startTimeInput.value)
    startTimeInput.value = "00:00:00";
  if (endTimeInput) endTimeInput.value = secondsToTime(state.selectedDuration);
  showClipControls();
  updateClipPlanner();
});

// ─── Opus-style project shelf / save ─────────────────────────────────────────
let currentProjectView = "all";
let lastProjectsCache = [];

const ALL_PROJECTS_KEY = "clipflow_all_projects_v2";

function getCurrentProjectTitle() {
  return (
    state.uploadedProject?.originalName ||
    state.uploadedProject?.title ||
    state.generatedClips?.[0]?.hook ||
    "Untitled Clip Project"
  );
}

function getCurrentProjectThumb() {
  return (
    state.uploadedProject?.thumbnail ||
    state.uploadedProject?.thumbnailUrl ||
    state.generatedClips?.[0]?.thumbnail ||
    state.generatedClips?.[0]?.thumbnailUrl ||
    ""
  );
}

function formatProjectDate(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return "";
  }
}

function normalizeString(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function getVideoIdFromUrl(value = "") {
  const raw = String(value || "");
  if (!raw) return "";

  try {
    const url = new URL(raw);

    if (url.hostname.includes("youtu.be")) {
      return url.pathname.replace("/", "").trim();
    }

    if (url.searchParams.get("v")) {
      return url.searchParams.get("v").trim();
    }

    const shortsMatch = url.pathname.match(/\/shorts\/([^/?#]+)/);
    if (shortsMatch) return shortsMatch[1].trim();

    const embedMatch = url.pathname.match(/\/embed\/([^/?#]+)/);
    if (embedMatch) return embedMatch[1].trim();
  } catch {
    const match = raw.match(
      /(?:v=|youtu\.be\/|shorts\/|embed\/)([a-zA-Z0-9_-]{6,})/,
    );
    if (match) return match[1].trim();
  }

  return "";
}

function getVideoIdFromThumb(value = "") {
  const raw = String(value || "");
  const match = raw.match(/\/vi\/([^/]+)\//);
  return match ? match[1].trim() : "";
}

function getProjectVideoId(project = {}) {
  return (
    project.videoId ||
    project.uploadedProject?.videoId ||
    getVideoIdFromUrl(project.sourceUrl) ||
    getVideoIdFromUrl(project.youtubeUrl) ||
    getVideoIdFromUrl(project.videoUrl) ||
    getVideoIdFromUrl(project.uploadedProject?.sourceUrl) ||
    getVideoIdFromUrl(project.uploadedProject?.youtubeUrl) ||
    getVideoIdFromThumb(project.thumbnail) ||
    getVideoIdFromThumb(project.uploadedProject?.thumbnail) ||
    ""
  );
}

function getProjectTitle(project = {}) {
  return (
    project.title ||
    project.name ||
    project.originalName ||
    project.uploadedProject?.originalName ||
    project.uploadedProject?.title ||
    project.clips?.[0]?.hook ||
    "Untitled Project"
  );
}

function getProjectThumb(project = {}) {
  return (
    project.thumbnail ||
    project.thumbnailUrl ||
    project.uploadedProject?.thumbnail ||
    project.uploadedProject?.thumbnailUrl ||
    project.clips?.[0]?.thumbnail ||
    project.clips?.[0]?.thumbnailUrl ||
    ""
  );
}

function getProjectClipCount(project = {}) {
  if (Array.isArray(project.clips)) return project.clips.length;
  return Number(project.clipCount || 0);
}

function getProjectIdentity(project = {}) {
  const videoId = normalizeString(getProjectVideoId(project));
  if (videoId) return `video:${videoId}`;

  const sourceUrl = normalizeString(
    project.sourceUrl ||
      project.youtubeUrl ||
      project.videoUrl ||
      project.uploadedProject?.sourceUrl ||
      project.uploadedProject?.youtubeUrl ||
      "",
  );

  if (sourceUrl) return `source:${sourceUrl}`;

  const thumb = normalizeString(getProjectThumb(project)).split("?")[0];
  const title = normalizeString(getProjectTitle(project));
  const clipCount = getProjectClipCount(project);

  if (thumb && title) return `thumb-title:${thumb}|${title}`;
  if (title) return `title-clips:${title}|${clipCount}`;

  return `id:${project.id || Math.random()}`;
}

function getProjectKey(project = {}) {
  return getProjectIdentity(project);
}

function getProjectSourceLabel(project = {}) {
  const source =
    project.source ||
    project.uploadedProject?.source ||
    (getProjectVideoId(project) ? "youtube" : "Auto");

  if (String(source).toLowerCase() === "youtube") return "YouTube";
  if (String(source).toLowerCase() === "upload") return "Upload";
  return String(source || "Auto");
}

function mergeProjectRecords(existing = {}, incoming = {}) {
  const existingClips = Array.isArray(existing.clips) ? existing.clips : [];
  const incomingClips = Array.isArray(incoming.clips) ? incoming.clips : [];

  const existingIsSaved =
    Boolean(existing.saved || existing.id) && !existing.localOnly;
  const incomingIsSaved =
    Boolean(incoming.saved || incoming.id) && !incoming.localOnly;
  const preferIncomingId = incomingIsSaved || !existingIsSaved;

  return {
    ...existing,
    ...incoming,
    id: preferIncomingId
      ? incoming.id || existing.id
      : existing.id || incoming.id,
    localOnly:
      existingIsSaved || incomingIsSaved
        ? false
        : Boolean(incoming.localOnly ?? existing.localOnly),
    saved: existingIsSaved || incomingIsSaved,
    title: getProjectTitle(incoming) || getProjectTitle(existing),
    thumbnail: getProjectThumb(incoming) || getProjectThumb(existing),
    uploadedProject:
      incoming.uploadedProject || existing.uploadedProject || null,
    clips: incomingClips.length ? incomingClips : existingClips,
    clipCount:
      incomingClips.length ||
      existingClips.length ||
      Number(incoming.clipCount || existing.clipCount || 0),
    clipCaptions: incoming.clipCaptions || existing.clipCaptions || {},
    captionStyle:
      incoming.captionStyle || existing.captionStyle || state.captionStyle,
    videoDurationSeconds:
      incoming.videoDurationSeconds ||
      existing.videoDurationSeconds ||
      incoming.uploadedProject?.duration ||
      existing.uploadedProject?.duration ||
      0,
    selectedDuration:
      incoming.selectedDuration ||
      existing.selectedDuration ||
      state.selectedDuration ||
      30,
    sourceUrl:
      incoming.sourceUrl ||
      existing.sourceUrl ||
      incoming.uploadedProject?.sourceUrl ||
      existing.uploadedProject?.sourceUrl ||
      "",
    videoId:
      incoming.videoId ||
      existing.videoId ||
      incoming.uploadedProject?.videoId ||
      existing.uploadedProject?.videoId ||
      "",
    source:
      incoming.source ||
      existing.source ||
      incoming.uploadedProject?.source ||
      existing.uploadedProject?.source ||
      "youtube",
    updatedAt:
      incoming.updatedAt || existing.updatedAt || new Date().toISOString(),
    createdAt:
      existing.createdAt || incoming.createdAt || new Date().toISOString(),
  };
}

function mergeProjectsByIdentity(projects = []) {
  const map = new Map();
  const order = [];

  projects.forEach((project) => {
    if (!project) return;

    const clipCount = getProjectClipCount(project);
    const title = normalizeString(getProjectTitle(project));

    if (!title || title === "untitled project") return;
    if (clipCount <= 0) return;

    const key = getProjectIdentity(project);

    if (!map.has(key)) {
      map.set(key, project);
      order.push(key);
      return;
    }

    map.set(key, mergeProjectRecords(map.get(key), project));
  });

  return order.map((key) => map.get(key)).filter(Boolean);
}

function dedupeProjects(projects = []) {
  return mergeProjectsByIdentity(projects);
}

function getLocalAllProjects() {
  try {
    const modern = JSON.parse(localStorage.getItem(ALL_PROJECTS_KEY) || "[]");
    if (Array.isArray(modern) && modern.length) return modern;

    const legacy = JSON.parse(
      localStorage.getItem("clipflow_all_projects") || "[]",
    );
    return Array.isArray(legacy) ? legacy : [];
  } catch {
    return [];
  }
}

function saveLocalAllProjects(projects = []) {
  localStorage.setItem(
    ALL_PROJECTS_KEY,
    JSON.stringify(mergeProjectsByIdentity(projects)),
  );
}

function getCleanSavedProjects(projects = []) {
  return mergeProjectsByIdentity(
    projects
      .filter((project) => {
        const clipCount = getProjectClipCount(project);
        const hasTitle = normalizeString(getProjectTitle(project));
        return clipCount > 0 && hasTitle;
      })
      .map((project) => ({
        ...project,
        saved: true,
        localOnly: false,
      })),
  );
}

function getCurrentProjectSnapshot() {
  if (!state.uploadedProject && !state.generatedClips.length) return null;

  const clipCount = Number(state.generatedClips?.length || 0);

  return {
    id:
      state.savedProjectId ||
      `local-${getProjectVideoId(state.uploadedProject || {}) || Date.now()}`,
    localOnly: !state.savedProjectId,
    saved: Boolean(state.savedProjectId),
    title: getCurrentProjectTitle(),
    thumbnail: getCurrentProjectThumb(),
    uploadedProject: state.uploadedProject,
    clips: state.generatedClips || [],
    clipCount,
    clipCaptions: state.clipCaptions,
    captionStyle: state.captionStyle,
    videoDurationSeconds: state.videoDurationSeconds,
    selectedDuration: state.selectedDuration,
    videoId: state.uploadedProject?.videoId || "",
    sourceUrl: state.uploadedProject?.sourceUrl || "",
    source: state.uploadedProject?.source || "youtube",
    status: clipCount > 0 ? "generated" : "generating",
    createdAt: state.currentProjectCreatedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function upsertProjectToAllProjects(project) {
  if (!project || getProjectClipCount(project) <= 0) return;

  const localProjects = getLocalAllProjects();
  const merged = mergeProjectsByIdentity([project, ...localProjects]);

  saveLocalAllProjects(merged);
}

function upsertCurrentProjectToAllProjects() {
  const current = getCurrentProjectSnapshot();
  if (!current || getProjectClipCount(current) <= 0) return;

  upsertProjectToAllProjects(current);
}

function removeProjectFromLocalAllProjects(project) {
  const key = getProjectIdentity(project);
  const localProjects = getLocalAllProjects().filter(
    (item) => getProjectIdentity(item) !== key,
  );

  saveLocalAllProjects(localProjects);
}

function findLocalProjectByIdOrKey(projectId, projectKey) {
  const safeId = String(projectId || "");
  const safeKey = String(projectKey || "");

  return getLocalAllProjects().find((project) => {
    return (
      String(project.id || "") === safeId || getProjectKey(project) === safeKey
    );
  });
}

function getProgressOverlayMarkup(percent = _currentProgress, eta = null) {
  const p = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  const etaText = eta || (p > 0 && p < 100 ? "ETA calculating" : "Ready");

  if (p <= 0 || p >= 100) return "";

  return `
    <div class="opus-project-progress-badge" data-active-project-progress>
      <span>◷</span>
      <strong>${p}%</strong>
      <em>(${escapeHtml(etaText)})</em>
    </div>
  `;
}

function updateProjectTabs() {
  projectViewTabs.forEach((tab) => {
    tab.classList.toggle(
      "active",
      tab.dataset.projectView === currentProjectView,
    );
  });
}

function updateActiveProjectProgressCard() {
  renderProjectHistory(lastProjectsCache);
}

function loadProjectIntoState(project = {}, options = {}) {
  state.savedProjectId = options.saved ? project.id || null : null;
  state.uploadedProject = project.uploadedProject || null;
  state.generatedClips = Array.isArray(project.clips) ? project.clips : [];
  state.generatedClip = state.generatedClips[0] || null;
  state.clipCaptions = project.clipCaptions || {};
  state.captionStyle = {
    ...state.captionStyle,
    ...(project.captionStyle || {}),
  };
  state.videoDurationSeconds = Number(
    project.videoDurationSeconds ||
      project.duration ||
      project.uploadedProject?.duration ||
      0,
  );
  state.selectedDuration = Number(
    project.selectedDuration || state.selectedDuration || 30,
  );

  _currentProgress = state.generatedClips.length ? 100 : 0;

  if (state.uploadedProject?.source === "youtube") {
    if (ytUrlInput) ytUrlInput.value = state.uploadedProject.sourceUrl || "";
    if (ytInfoPreview) ytInfoPreview.style.display = "flex";
    if (ytThumb) ytThumb.src = state.uploadedProject.thumbnail || "";
    if (ytTitle) {
      ytTitle.textContent =
        state.uploadedProject.originalName ||
        state.uploadedProject.title ||
        project.title ||
        "YouTube video";
    }
    if (ytDuration) {
      ytDuration.textContent = formatShortDuration(
        state.videoDurationSeconds || 0,
      );
    }

    setFetchedSourceCard({
      title:
        state.uploadedProject.originalName ||
        state.uploadedProject.title ||
        project.title ||
        "YouTube video",
      thumb: state.uploadedProject.thumbnail || "",
      meta: `${state.generatedClips.length} clip${
        state.generatedClips.length === 1 ? "" : "s"
      } loaded`,
    });
  } else if (state.uploadedProject?.filePath) {
    setPreviewVideo(`/uploads/${state.uploadedProject.fileName || ""}`);
  }

  setProjectInfo(
    project.title || getCurrentProjectTitle(),
    `${state.generatedClips.length} clip${
      state.generatedClips.length === 1 ? "" : "s"
    } loaded`,
  );

  showClipControls();
  renderGeneratedClips();
  updateClipPlanner();
  persistStudioSession();
}

function buildProjectCard(project, savedProjects = [], currentSnapshot = null) {
  const titleRaw = getProjectTitle(project);
  const title = escapeHtml(titleRaw);
  const thumb = escapeHtml(getProjectThumb(project));
  const id = escapeHtml(project.id || "");
  const projectKeyRaw = getProjectKey(project);
  const projectKey = escapeHtml(projectKeyRaw);
  const clipCount = getProjectClipCount(project);
  const source = escapeHtml(getProjectSourceLabel(project));
  const date = escapeHtml(
    formatProjectDate(project.updatedAt || project.createdAt),
  );

  const isCurrent =
    currentSnapshot && getProjectKey(currentSnapshot) === projectKeyRaw;

  const isSaved =
    Boolean(project.saved && !project.localOnly && project.id) ||
    savedProjects.some(
      (savedProject) => getProjectKey(savedProject) === projectKeyRaw,
    );

  let status = "Generated";

  if (isCurrent && _currentProgress > 0 && _currentProgress < 100) {
    status = "Generating";
  } else if (isSaved) {
    status = "Saved";
  } else if (clipCount > 0) {
    status = "Generated";
  }

  const openAction = isSaved && project.id ? "load" : "load-local";

  const saveButton = isSaved
    ? `<button type="button" disabled>Saved</button>`
    : `<button
        type="button"
        data-history-action="${isCurrent ? "save-current" : "save-local"}"
        data-project-id="${id}"
        data-project-key="${projectKey}"
      >
        Save
      </button>`;

  const openButton =
    clipCount > 0
      ? `<button
          type="button"
          data-history-action="${openAction}"
          data-project-id="${id}"
          data-project-key="${projectKey}"
        >
          Open
        </button>`
      : "";

  const deleteButton = `<button
      type="button"
      data-history-action="delete-any"
      data-project-id="${id}"
      data-project-key="${projectKey}"
    >
      Delete
    </button>`;

  return `
    <article class="opus-project-card" data-project-id="${id}" data-project-key="${projectKey}">
      <div class="opus-project-thumb">
        ${thumb ? `<img src="${thumb}" alt="">` : `<span>CF</span>`}
        <small>${escapeHtml(status)}</small>
        ${
          isCurrent && _currentProgress > 0 && _currentProgress < 100
            ? getProgressOverlayMarkup()
            : ""
        }
      </div>

      <strong title="${title}">${title}</strong>
      <p>${clipCount} clip${clipCount === 1 ? "" : "s"}${source ? ` • ${source}` : ""}</p>
      ${date ? `<em>${date}</em>` : ""}

      <div class="opus-project-card-actions">
        ${saveButton}
        ${openButton}
        ${deleteButton}
      </div>
    </article>
  `;
}

function renderProjectHistory(projects = lastProjectsCache) {
  if (!projectHistoryList) return;

  const backendSavedProjects = getCleanSavedProjects(projects);
  const localAllProjects = getLocalAllProjects();
  const currentSnapshot = getCurrentProjectSnapshot();

  let allProjects = [...localAllProjects, ...backendSavedProjects];

  if (currentSnapshot && getProjectClipCount(currentSnapshot) > 0) {
    const currentKey = getProjectKey(currentSnapshot);

    allProjects = allProjects.filter(
      (project) => getProjectKey(project) !== currentKey,
    );

    allProjects.unshift(currentSnapshot);
  }

  allProjects = dedupeProjects(allProjects);
  const savedProjects = dedupeProjects(backendSavedProjects);

  if (allProjectsCount)
    allProjectsCount.textContent = `(${allProjects.length})`;
  if (savedProjectsCount)
    savedProjectsCount.textContent = `(${savedProjects.length})`;

  const projectsToRender =
    currentProjectView === "saved" ? savedProjects : allProjects;

  if (!projectsToRender.length) {
    projectHistoryList.innerHTML = `
      <div class="opus-project-empty">
        No ${currentProjectView === "saved" ? "saved " : ""}projects yet.
      </div>
    `;
    return;
  }

  projectHistoryList.innerHTML = projectsToRender
    .map((project) => buildProjectCard(project, savedProjects, currentSnapshot))
    .join("");
}

async function loadProjectHistory() {
  if (!projectHistoryList) return;

  renderProjectHistory(lastProjectsCache);

  try {
    const data = await apiFetch(`${API_BASE}/clips/projects`);
    lastProjectsCache = Array.isArray(data.projects) ? data.projects : [];

    const savedProjects = getCleanSavedProjects(lastProjectsCache);
    const localProjects = getLocalAllProjects();
    saveLocalAllProjects([...savedProjects, ...localProjects]);

    renderProjectHistory(lastProjectsCache);
  } catch (error) {
    console.warn("Could not load backend projects:", error);
    renderProjectHistory([]);
  }
}

async function saveProjectPayload(projectPayload) {
  const data = await apiFetch(`${API_BASE}/clips/projects/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(projectPayload),
  });

  const savedProject = {
    ...(data.project || {}),
    saved: true,
    localOnly: false,
  };

  removeProjectFromLocalAllProjects(projectPayload);
  upsertProjectToAllProjects(savedProject);

  await loadProjectHistory();

  return savedProject;
}

async function saveCurrentProject() {
  if (!state.uploadedProject && !state.generatedClips.length) {
    alert("Generate or upload something first.");
    return;
  }

  if (!state.generatedClips.length) {
    alert("Generate clips first, then save the project.");
    return;
  }

  const oldText = saveProjectBtn?.innerHTML || saveProjectBtn?.textContent;

  if (saveProjectBtn) {
    saveProjectBtn.disabled = true;
    saveProjectBtn.innerHTML = `<span></span> Saving...`;
  }

  try {
    const projectPayload = {
      id: state.savedProjectId || null,
      title: getCurrentProjectTitle(),
      thumbnail: getCurrentProjectThumb(),
      uploadedProject: state.uploadedProject,
      clips: state.generatedClips,
      clipCount: state.generatedClips.length,
      clipCaptions: state.clipCaptions,
      captionStyle: state.captionStyle,
      videoDurationSeconds: state.videoDurationSeconds,
      selectedDuration: state.selectedDuration,
      sourceUrl: state.uploadedProject?.sourceUrl || "",
      videoId: state.uploadedProject?.videoId || "",
      source: state.uploadedProject?.source || "youtube",
      createdAt: state.currentProjectCreatedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const savedProject = await saveProjectPayload(projectPayload);

    state.savedProjectId = savedProject.id || state.savedProjectId;
    state.currentProjectCreatedAt =
      savedProject.createdAt ||
      state.currentProjectCreatedAt ||
      new Date().toISOString();

    upsertCurrentProjectToAllProjects();
    persistStudioSession();

    await loadProjectHistory();
  } catch (error) {
    alert(error.message || "Project save failed.");
  } finally {
    if (saveProjectBtn) {
      saveProjectBtn.disabled = false;
      saveProjectBtn.innerHTML = oldText || `<span></span> Auto-save`;
    }
  }
}

async function saveLocalProject(projectId, projectKey) {
  const localProject = findLocalProjectByIdOrKey(projectId, projectKey);

  if (!localProject) {
    alert("Project not found.");
    return;
  }

  if (getProjectClipCount(localProject) <= 0) {
    alert("This project has no clips to save.");
    return;
  }

  const savedProject = await saveProjectPayload({
    id: null,
    title: getProjectTitle(localProject),
    thumbnail: getProjectThumb(localProject),
    uploadedProject: localProject.uploadedProject || null,
    clips: Array.isArray(localProject.clips) ? localProject.clips : [],
    clipCount: getProjectClipCount(localProject),
    clipCaptions: localProject.clipCaptions || {},
    captionStyle: localProject.captionStyle || state.captionStyle,
    videoDurationSeconds:
      localProject.videoDurationSeconds ||
      localProject.uploadedProject?.duration ||
      0,
    selectedDuration:
      localProject.selectedDuration || state.selectedDuration || 30,
    sourceUrl:
      localProject.sourceUrl || localProject.uploadedProject?.sourceUrl || "",
    videoId:
      localProject.videoId || localProject.uploadedProject?.videoId || "",
    source:
      localProject.source || localProject.uploadedProject?.source || "youtube",
    createdAt: localProject.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  removeProjectFromLocalAllProjects(localProject);
  upsertProjectToAllProjects(savedProject);

  await loadProjectHistory();
}

async function openSavedProject(projectId) {
  if (!projectId) {
    alert("Saved project ID is missing.");
    return;
  }

  const data = await apiFetch(
    `${API_BASE}/clips/projects/${encodeURIComponent(projectId)}`,
  );

  const project = {
    ...(data.project || {}),
    saved: true,
    localOnly: false,
  };

  loadProjectIntoState(project, { saved: true });
  upsertProjectToAllProjects(project);
  renderProjectHistory(lastProjectsCache);
}

function openLocalProject(projectId, projectKey) {
  const localProject = findLocalProjectByIdOrKey(projectId, projectKey);

  if (!localProject) {
    alert("Local project not found.");
    return;
  }

  loadProjectIntoState(localProject, { saved: false });
  renderProjectHistory(lastProjectsCache);
}

async function deleteSavedProject(projectId) {
  if (!confirm("Delete this saved project?")) return;

  const projectToDelete = lastProjectsCache.find(
    (project) => String(project.id) === String(projectId),
  );

  await apiFetch(
    `${API_BASE}/clips/projects/${encodeURIComponent(projectId)}`,
    {
      method: "DELETE",
    },
  );

  if (projectToDelete) removeProjectFromLocalAllProjects(projectToDelete);

  if (state.savedProjectId === projectId) {
    state.savedProjectId = null;
    persistStudioSession();
  }

  await loadProjectHistory();
}

async function deleteProjectEverywhere(projectId, projectKey) {
  if (!confirm("Delete this project?")) return;

  const safeProjectKey = String(projectKey || "");

  const localProjects = getLocalAllProjects();
  const filteredLocalProjects = localProjects.filter(
    (project) => getProjectKey(project) !== safeProjectKey,
  );

  saveLocalAllProjects(filteredLocalProjects);

  const backendProject = lastProjectsCache.find(
    (project) =>
      String(project.id || "") === String(projectId || "") ||
      getProjectKey(project) === safeProjectKey,
  );

  if (backendProject?.id) {
    try {
      await apiFetch(
        `${API_BASE}/clips/projects/${encodeURIComponent(backendProject.id)}`,
        {
          method: "DELETE",
        },
      );
    } catch (error) {
      console.warn("Backend delete failed:", error);
    }

    lastProjectsCache = lastProjectsCache.filter(
      (project) => project.id !== backendProject.id,
    );
  }

  const currentSnapshot = getCurrentProjectSnapshot();
  const currentKey = currentSnapshot ? getProjectKey(currentSnapshot) : "";

  if (safeProjectKey && currentKey === safeProjectKey) {
    state.savedProjectId = null;
    state.uploadedProject = null;
    state.generatedClip = null;
    state.generatedClips = [];
    state.smartSuggestions = [];
    state.clipCaptions = {};
    state.videoDurationSeconds = 0;

    renderGeneratedClips();
    updateProgress(0, "Ready");
  }

  persistStudioSession();
  renderProjectHistory(lastProjectsCache);
}

saveProjectBtn?.addEventListener("click", saveCurrentProject);
refreshProjectsBtn?.addEventListener("click", loadProjectHistory);

projectViewTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    currentProjectView = tab.dataset.projectView || "all";
    updateProjectTabs();
    renderProjectHistory(lastProjectsCache);
  });
});

projectHistoryList?.addEventListener("click", async (event) => {
  const btn = event.target.closest("[data-history-action]");
  if (!btn) return;

  const projectId = btn.dataset.projectId || "";
  const projectKey = btn.dataset.projectKey || "";
  const action = btn.dataset.historyAction;

  try {
    if (action === "save-current") {
      await saveCurrentProject();
      return;
    }

    if (action === "save-local") {
      await saveLocalProject(projectId, projectKey);
      return;
    }

    if (action === "load") {
      await openSavedProject(projectId);
      return;
    }

    if (action === "load-local") {
      openLocalProject(projectId, projectKey);
      return;
    }

    if (action === "delete") {
      await deleteSavedProject(projectId);
      return;
    }

    if (action === "delete-any") {
      await deleteProjectEverywhere(projectId, projectKey);
      return;
    }
  } catch (error) {
    alert(error.message || "Project action failed.");
  }
});

// ─── Generate clips ───────────────────────────────────────────────────────────
async function generateSingleClip(startTime, endTime, clipIndex = 0) {
  if (!state.uploadedProject) {
    throw new Error("Please fetch or upload a video first.");
  }

  const sourceUrl =
    state.uploadedProject.sourceUrl ||
    state.uploadedProject.youtubeUrl ||
    ytUrlInput?.value?.trim() ||
    "";

  const isYoutubeSource = Boolean(
    String(state.uploadedProject.source || "").toLowerCase() === "youtube" ||
      String(state.uploadedProject.sourceType || "").toLowerCase() === "youtube" ||
      sourceUrl ||
      state.uploadedProject.videoId
  );

  const body = {
    startTime,
    endTime,
    aspectRatio: aspectRatioInput?.value || "9:16",
  };

  if (isYoutubeSource) {
    body.sourceType = "youtube";
    body.sourceUrl = sourceUrl;
    body.videoId = state.uploadedProject.videoId || getVideoIdFromUrl(sourceUrl);

    if (!body.sourceUrl && !body.videoId) {
      throw new Error("YouTube source URL is missing. Paste/fetch the video again.");
    }
  } else {
    body.sourceType = "upload";
    body.inputPath =
      state.uploadedProject.filePath ||
      state.uploadedProject.inputPath ||
      state.uploadedProject.localPath ||
      "";

    if (!body.inputPath) {
      throw new Error("Input video file is required.");
    }
  }

  const result = await apiFetch(`${API_BASE}/clips/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return {
    ...result,
    filePath: result.outputPath || result.filePath || "",
    outputPath: result.outputPath || result.filePath || "",
    downloadUrl: result.downloadUrl || "",
    previewUrl: result.previewUrl || result.downloadUrl || "",
    startTime,
    endTime,
    duration:
      result.duration != null
        ? Number(result.duration)
        : Math.max(0, timeToSeconds(endTime) - timeToSeconds(startTime)),
    hook: result.hook || autoHookForClip(clipIndex),
  };
}
function buildSmartSuggestBody() {
  if (!state.uploadedProject)
    throw new Error("Please fetch or upload a video first.");

  const maxClips = getAutoSmartClipCount();

  const body = {
    maxClips,
    minScore: 20,
    clipLengthSec: state.selectedDuration || 30,
    minDurationSec: Math.max(
      25,
      Math.min(45, Number(state.selectedDuration || 30) - 8),
    ),
    maxDurationSec: Math.max(
      45,
      Math.min(90, Number(state.selectedDuration || 60) + 25),
    ),
    videoDurationSec:
      state.videoDurationSeconds || Number(state.uploadedProject.duration || 0),
  };

  const sourceUrl =
    state.uploadedProject.sourceUrl ||
    state.uploadedProject.youtubeUrl ||
    ytUrlInput?.value?.trim() ||
    "";

  const isYoutubeSource = Boolean(
    String(state.uploadedProject.source || "").toLowerCase() === "youtube" ||
      String(state.uploadedProject.sourceType || "").toLowerCase() === "youtube" ||
      sourceUrl ||
      state.uploadedProject.videoId
  );

  if (isYoutubeSource) {
    body.sourceType = "youtube";
    body.sourceUrl = sourceUrl;
    body.videoId = state.uploadedProject.videoId || getVideoIdFromUrl(sourceUrl);
  } else {
    body.sourceType = "upload";
    body.inputPath =
      state.uploadedProject.filePath ||
      state.uploadedProject.inputPath ||
      state.uploadedProject.localPath ||
      "";
  }

  return body;
}
async function handleUploadForSmartClips(input, suggestions) {
  const file = input.files?.[0];
  if (!file) return;

  try {
    updateProgress(0, "Uploading source video...");

    const formData = new FormData();
    formData.append("video", file);
    const result = await uploadWithXHR(`${API_BASE}/clips/upload`, formData);

    state.uploadedProject = result.project;

    updateProgress(90, "Generating clips from your moments...");

    const body = {
      sourceType: "upload",
      inputPath: result.project.filePath,
      segments: suggestions,
      maxClips: 3,
      minScore: 0,
      clipLengthSec: state.selectedDuration || 30,
    };

    const data = await apiFetch(`${API_BASE}/clips/smart-generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const clips = Array.isArray(data.clips) ? data.clips : [];

    if (!clips.length) {
      updateProgress(0, "No clips generated. Try another video.");
      return;
    }

    state.generatedClips = [...clips, ...state.generatedClips];
    state.generatedClip = state.generatedClips[0] || null;

    upsertCurrentProjectToAllProjects();

    for (let i = 0; i < clips.length; i++) {
      await loadCaptionsForClip(clips[i], i);
    }

    renderGeneratedClips();
    persistStudioSession();

    await animateProgressTo(
      100,
      `Generated ${clips.length} smart clip${clips.length > 1 ? "s" : ""} ✓`,
    );
  } catch (error) {
    updateProgress(0, error.message || "Upload failed");
    alert(error.message || "Upload failed");
  }
}

function formatSmartReason(suggestion = {}) {
  const parts = [];
  if (suggestion.reason) parts.push(suggestion.reason);
  if (Array.isArray(suggestion.signals) && suggestion.signals.length) {
    parts.push(suggestion.signals.slice(0, 3).join(" + "));
  }
  return parts.join(" • ") || "Strong transcript moment";
}

function showUploadRequiredForSmartClips(data) {
  const message =
    data?.message ||
    "YouTube transcript analyzed! Upload the source video to generate these smart clips.";

  updateProgress(0, message);

  if (smartClipBtn) {
    smartClipBtn.disabled = false;
    smartClipBtn.textContent = "Get clips in 1 click";
  }

  const suggestions = Array.isArray(data?.suggestions) ? data.suggestions : [];

  if (suggestions.length && generatedClipsGrid) {
    generatedClipsGrid.innerHTML = `
      <div style="
        padding: 20px;
        background: #111;
        border-radius: 12px;
        margin-bottom: 16px;
        border: 1px solid #333;
      ">
        <p style="color:#facc15;font-weight:600;margin:0 0 8px;">
          ✅ Found ${suggestions.length} viral moments from transcript
        </p>
        <p style="color:#aaa;margin:0 0 16px;font-size:14px;">
          ${message}
        </p>
        <label style="
          display:inline-block;
          padding:10px 20px;
          background:#fff;
          color:#000;
          border-radius:8px;
          cursor:pointer;
          font-weight:600;
        ">
          Upload Source Video
          <input type="file" accept=".mp4,.mov,.mkv,.webm" style="display:none"
            onchange="handleUploadForSmartClips(this, ${JSON.stringify(suggestions).replace(/"/g, "&quot;")})">
        </label>
      </div>
      ${suggestions
        .slice(0, 5)
        .map((item, index) => {
          const score = Math.round(Number(item.score || 0));
          const title = escapeHtml(
            item.title || item.hook || `Smart Moment #${index + 1}`,
          );
          const reason = escapeHtml(
            item.reason || item.smartReason || "Strong transcript moment",
          );
          const start = escapeHtml(
            item.start || secondsToTime(item.startSec || 0),
          );
          const end = escapeHtml(item.end || secondsToTime(item.endSec || 0));
          const preview = escapeHtml(item.previewText || item.text || "");
          return `
          <article class="smart-upload-needed-card">
            <div class="smart-upload-needed-top">
              <strong>${title}</strong>
              <span>${score} Score</span>
            </div>
            <p>${reason}</p>
            <small>${start} → ${end}</small>
            ${preview ? `<div class="smart-upload-preview">${preview}</div>` : ""}
          </article>
        `;
        })
        .join("")}
    `;
  }

  throw new Error("NEEDS_UPLOAD");
}

async function generateSmartClipsFromSource() {
  const body = buildSmartSuggestBody(3);
  body.maxClips = getAutoSmartClipCount();
  body.minScore = 60;

  const controller = new AbortController();
  const timeoutMs = 6 * 60 * 1000;

  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const data = await apiFetch(`${API_BASE}/clips/smart-generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (data?.needsUpload) {
      showUploadRequiredForSmartClips(data);
      return [];
    }

    const clips = (Array.isArray(data.clips) ? data.clips : []).filter(
      (clip) => Number(clip.smartScore || clip.score || 0) >= 60,
    );

    return clips.map((clip, index) => ({
      ...clip,
      filePath: clip.filePath || clip.outputPath || "",
      outputPath: clip.outputPath || clip.filePath || "",
      startTime:
        clip.startTime || clip.start || secondsToTime(clip.startSec || 0),
      endTime: clip.endTime || clip.end || secondsToTime(clip.endSec || 0),
      duration:
        clip.duration != null
          ? Number(clip.duration)
          : Math.max(0, Number(clip.durationSec || 0)),
      hook: clip.hook || clip.title || `Smart Clip #${index + 1}`,
      smartScore: Number(clip.smartScore || clip.score || 0),
      smartReason: clip.smartReason || formatSmartReason(clip),
      previewText: clip.previewText || clip.text || "",
    }));
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(
        "Smart clipping timed out after 3 minutes. Try uploading the source video directly.",
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

smartClipBtn?.addEventListener("click", async () => {
  let stopCrawl = null;

  try {
    if (!state.uploadedProject) {
      alert("Please fetch or upload a video first.");
      return;
    }

    smartClipBtn.disabled = true;
    smartClipBtn.textContent = "Generating clips...";
    state.smartSuggestions = [];
    _currentProgress = 0;

    updateProgress(0, "Finding viral moments...", 300);
    stopCrawl = startProgressCrawl(88, "Finding and generating smart clips...");

    const newClips = await generateSmartClipsFromSource();

    stopCrawl();
    stopCrawl = null;

    let finalClips = newClips;

    if (!finalClips.length) {
  const fallbackCount = getAutoSmartClipCount();
  const duration = Number(
    state.videoDurationSeconds || state.uploadedProject?.duration || 0
  );
  const clipLength = Number(state.selectedDuration || 30);

  updateProgress(10, "No scored clips found. Creating real fallback clips...");

  finalClips = [];

  for (let index = 0; index < fallbackCount; index++) {
    const safeStart = Math.max(
      0,
      Math.floor((duration / (fallbackCount + 1)) * (index + 1))
    );

    const start = Math.max(0, safeStart - Math.floor(clipLength / 2));
    const end = Math.min(duration, start + clipLength);

    const startTime = secondsToTime(start);
    const endTime = secondsToTime(end);

    updateProgress(
      10 + ((index + 1) / fallbackCount) * 75,
      `Generating fallback clip ${index + 1} of ${fallbackCount}...`
    );

    const realClip = await generateSingleClip(startTime, endTime, index);

    finalClips.push({
      ...realClip,
      start,
      end,
      startTime,
      endTime,
      duration: Math.max(0, end - start),
      hook: autoHookForClip(index),
      smartScore: 40,
      smartReason: "Fallback real clip",
      previewText:
        "Real clip generated from fallback time range because no high-score moment was found.",
    });
  }
}

    updateProgress(96, "Adding scores and captions...", 8);
    state.generatedClips = [...finalClips, ...state.generatedClips];
    state.generatedClip = state.generatedClips[0] || null;

    upsertCurrentProjectToAllProjects();

    for (let i = 0; i < finalClips.length; i++) {
      await loadCaptionsForClip(finalClips[i], i);
    }

    renderGeneratedClips();
    persistStudioSession();
    await animateProgressTo(
  100,
  `Generated ${finalClips.length} smart clip${finalClips.length > 1 ? "s" : ""} ✓`
);

  } catch (error) {
    if (stopCrawl) {
      stopCrawl();
      stopCrawl = null;
    }
    const cleanMessage = getCleanSmartClipError(error);
    updateProgress(0, cleanMessage || "Smart clipping failed");
    if (cleanMessage !== "NEEDS_UPLOAD") {
      alert(cleanMessage || "Smart clipping failed.");
    }
  } finally {
    if (stopCrawl) {
      stopCrawl();
    }
    smartClipBtn.disabled = false;
    smartClipBtn.textContent = "Get clips in 1 click";
  }
});

durationButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    durationButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.selectedDuration = Number(btn.dataset.seconds || 30);
    const startSec = timeToSeconds(startTimeInput?.value || "00:00:00");
    if (endTimeInput)
      endTimeInput.value = secondsToTime(startSec + state.selectedDuration);
    updateClipPlanner();
    persistStudioSession();
  });
});

startTimeInput?.addEventListener("input", () => {
  const startSec = timeToSeconds(startTimeInput.value || "00:00:00");
  if (endTimeInput)
    endTimeInput.value = secondsToTime(startSec + state.selectedDuration);
});

state.clipsView = "story";

downloadAllBtn?.addEventListener("click", downloadAllClips);
deleteAllBtn?.addEventListener("click", deleteAllClips);

function getCleanSmartClipError(error) {
  const raw = String(error?.message || error || "");

  if (
    raw.includes("challenge solving failed") ||
    raw.includes("PO Token") ||
    raw.includes("HTTP Error 403") ||
    raw.includes("Sign in to confirm") ||
    raw.includes("not a bot")
  ) {
    return "This YouTube video could not be downloaded. Try Upload or update yt-dlp.";
  }

  if (
    raw.includes("Failed to resolve") ||
    raw.includes("getaddrinfo failed") ||
    raw.includes("ENOTFOUND")
  ) {
    return "Internet/DNS failed. Check your connection and try again.";
  }

  if (raw.includes("Failed to fetch")) {
    return "Server request failed. Make sure npm start is running.";
  }

  return (
    raw || "Smart clipping failed. Try another video or upload the source file."
  );
}

// ─── Hooks tab ────────────────────────────────────────────────────────────────
generateHooksBtn?.addEventListener("click", () => {
  const topic = hookTopic?.value?.trim() || "your topic";
  const style = hookStyle?.value || "Bold";
  const hooks = [
    `${style}: ${topic} starts with a surprising insight.`,
    `${style}: Why ${topic} matters more than people think.`,
    `${style}: The key lesson from ${topic} in one line.`,
    `${style}: This part of ${topic} changes everything.`,
  ];
  if (hooksOutput) hooksOutput.textContent = hooks.join("\n");
});

// ─── Captions tab ─────────────────────────────────────────────────────────────
applyCaptionStyleBtn?.addEventListener("click", () => {
  if (!captionPreview) return;

  // Save to state
  state.captionStyle = {
    fontFamily: fontFamily?.value || "Inter, sans-serif",
    fontSize: parseInt(fontSize?.value || "24"),
    textColor: textColor?.value || "#ffffff",
    bgColor: bgColor?.value || "#000000",
    bgOpacity: parseInt(bgOpacity?.value || "70"),
    position: captionPosition?.value || "bottom",
    textShadow: true,
  };

  // Apply to preview
  liveUpdateCaptionPreview();
  captionPreview.textContent =
    captionText?.value || "Your captions will look like this.";

  // Also update main video overlay
  applyOverlayStyle(mainVideoCaptionText, mainVideoCaptionOverlay);
  persistStudioSession();
});

// ─── Schedule tab ─────────────────────────────────────────────────────────────
saveScheduleBtn?.addEventListener("click", () => {
  const platform = platformSelect?.value || "YouTube";
  const title = postTitle?.value || "Untitled";
  const time = postTime?.value || "No time selected";
  const schedules = JSON.parse(
    localStorage.getItem("clipflow-schedules") || "[]",
  );
  schedules.push({ platform, title, time });
  localStorage.setItem("clipflow-schedules", JSON.stringify(schedules));

  if (scheduleOutput) {
    scheduleOutput.textContent = schedules
      .map(
        (item, i) =>
          `${i + 1}. ${item.platform} — ${item.title} — ${item.time}`,
      )
      .join("\n");
  }
});

downloadButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    alert(`${btn.textContent} action is not connected yet.`);
  });
});

// ─── Download helpers ─────────────────────────────────────────────────────────
async function triggerDirectDownload(url, filename = "") {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Download failed");
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename || "clip.mp4";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

async function downloadClip(index) {
  const clip = state.generatedClips[index];
  if (!clip?.downloadUrl) return;
  try {
    await triggerDirectDownload(
      clip.downloadUrl,
      clip.fileName || `clip-${index + 1}.mp4`,
    );
  } catch (error) {
    alert(`Download failed: ${error.message}`);
  }
}

async function downloadAllClips() {
  if (!state.generatedClips.length) {
    alert("No clips to download.");
    return;
  }
  for (let i = 0; i < state.generatedClips.length; i++) {
    const clip = state.generatedClips[i];
    if (!clip?.downloadUrl) continue;
    try {
      await triggerDirectDownload(
        clip.downloadUrl,
        clip.fileName || `clip-${i + 1}.mp4`,
      );
    } catch (error) {
      alert(`Download failed: ${error.message}`);
      break;
    }
    await new Promise((r) => setTimeout(r, 180));
  }
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
initTheme();
restoreStudioSession();
mergeCaptionEditorSession();
setYoutubeFetchButtonHidden();
updateProjectTabs();
updateClipPlanner();
renderProjectHistory([]);
renderGeneratedClips();
loadProjectHistory();

// Restore saved caption style
const savedStyle = localStorage.getItem("clipflow-caption-style");
if (savedStyle) {
  try {
    Object.assign(state.captionStyle, JSON.parse(savedStyle));
  } catch {}
}

// Apply initial overlay styles
applyOverlayStyle(mainVideoCaptionText, mainVideoCaptionOverlay);
persistStudioSession();
