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
  isGenerating: false,
  activeGenerationJobId: null,
};
try { window.state = state; } catch {}

const STUDIO_SESSION_KEY = "clipflow-studio-session";
const ACTIVE_GENERATION_JOB_KEY = "clipflow-active-generation-job";

const ACTIVE_GENERATION_STATUSES = new Set([
  "QUEUED",
  "TRANSCRIBING",
  "ANALYZING",
  "SELECTING_MOMENTS",
  "DOWNLOADING",
  "RENDERING",
  "FINALIZING",
]);

function isGenerationJobActive(status) {
  return ACTIVE_GENERATION_STATUSES.has(String(status || "").toUpperCase());
}

function isActiveGenerationStatus(status) {
  return isGenerationJobActive(status);
}

function setActiveGenerationJob(jobId, meta = {}) {
  if (
    !jobId ||
    typeof jobId !== "string" ||
    jobId === "null" ||
    jobId === "undefined" ||
    !jobId.trim()
  ) {
    clearActiveGenerationJob();
    return;
  }
  const cleanId = jobId.trim();
  state.activeGenerationJobId = cleanId;
  state.isGenerating = true;
  try {
    localStorage.setItem(
      ACTIVE_GENERATION_JOB_KEY,
      JSON.stringify({ jobId: cleanId, ...meta, savedAt: Date.now() })
    );
  } catch {}
}

function getActiveGenerationJobId() {
  try {
    const raw = localStorage.getItem(ACTIVE_GENERATION_JOB_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const id = parsed?.jobId;
      if (
        id &&
        typeof id === "string" &&
        id !== "null" &&
        id !== "undefined" &&
        id.trim() !== ""
      ) {
        return id.trim();
      }
    }
    const legacyDirectKey = localStorage.getItem("activeGenerationJobId");
    if (
      legacyDirectKey &&
      typeof legacyDirectKey === "string" &&
      legacyDirectKey !== "null" &&
      legacyDirectKey !== "undefined" &&
      legacyDirectKey.trim() !== ""
    ) {
      return legacyDirectKey.trim();
    }
    return null;
  } catch {
    return null;
  }
}

function getActiveGenerationJob() {
  try {
    const raw = localStorage.getItem(ACTIVE_GENERATION_JOB_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed?.jobId &&
      typeof parsed.jobId === "string" &&
      parsed.jobId !== "null" &&
      parsed.jobId !== "undefined" &&
      parsed.jobId.trim() !== ""
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function clearActiveGenerationJob() {
  state.activeGenerationJobId = null;
  state.isGenerating = false;
  try {
    localStorage.removeItem(ACTIVE_GENERATION_JOB_KEY);
    localStorage.removeItem("activeGenerationJobId");
  } catch {}
}

function clearActiveGenerationReference() {
  clearActiveGenerationJob();
}

function migrateOldBrowserStorage() {
  try {
    const sessionKeys = [
      STUDIO_SESSION_KEY,
      "clipflow-session",
      "studioSession",
      "generationState",
      "projectState",
    ];

    for (const key of sessionKeys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          let sessionDirty = false;
          const staleKeys = [
            "isGenerating",
            "generationInProgress",
            "generating",
            "buttonDisabled",
            "generationButtonText",
            "activeGenerationJobId",
            "generationProgress",
            "progress",
            "progressPercent",
            "generationStage",
            "stage",
            "showGenerationProgress",
            "showCancelButton",
          ];
          for (const k of staleKeys) {
            if (parsed[k] !== undefined) {
              delete parsed[k];
              sessionDirty = true;
            }
          }
          if (sessionDirty) {
            localStorage.setItem(key, JSON.stringify(parsed));
          }
        }
      } catch {
        localStorage.removeItem(key);
      }
    }

    const rawJob = localStorage.getItem(ACTIVE_GENERATION_JOB_KEY);
    if (rawJob) {
      try {
        const parsedJob = JSON.parse(rawJob);
        const jobId = parsedJob?.jobId;
        if (
          !jobId ||
          typeof jobId !== "string" ||
          jobId === "null" ||
          jobId === "undefined" ||
          !jobId.trim()
        ) {
          localStorage.removeItem(ACTIVE_GENERATION_JOB_KEY);
        }
      } catch {
        localStorage.removeItem(ACTIVE_GENERATION_JOB_KEY);
      }
    }

    const legacyId = localStorage.getItem("activeGenerationJobId");
    if (
      legacyId === "null" ||
      legacyId === "undefined" ||
      legacyId === "" ||
      !legacyId ||
      typeof legacyId !== "string" ||
      !legacyId.trim()
    ) {
      localStorage.removeItem("activeGenerationJobId");
    }
  } catch (err) {
    console.warn("[GenerationUI] Storage migration warning:", err);
  }
}

function checkGenerationStateInvariant() {
  const isUploadActive = Boolean(
    state.uploadedProject &&
    (state.uploadedProject.source === "upload" || state.uploadedProject.sourceType === "upload")
  );
  const ytEmpty = !ytUrlInput?.value?.trim();

  // Step 9: No source = idle invariant
  // If UI is displaying generating and YouTube input is empty and no active upload job
  if (state.isGenerating && ytEmpty && !isUploadActive) {
    console.warn(
      "[GenerationUI] Defensive invariant triggered: isGenerating true with empty YouTube input and no active upload job. Resetting UI to idle."
    );
    clearActiveGenerationReference();
    resetGenerationUIVisuals();
    return false;
  }

  if (
    state.isGenerating &&
    (!state.activeGenerationJobId ||
      typeof state.activeGenerationJobId !== "string" ||
      state.activeGenerationJobId === "null" ||
      state.activeGenerationJobId === "undefined" ||
      !state.activeGenerationJobId.trim())
  ) {
    console.warn(
      "[GenerationUI] Defensive invariant triggered: isGenerating true without valid activeGenerationJobId. Resetting UI to idle."
    );
    clearActiveGenerationReference();
    resetGenerationUIVisuals();
    return false;
  }
  return true;
}

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

// ─── Top navigation tabs (Generate Clips vs All Projects & Saved) ─────────────
const topTabGenerate = document.getElementById("topTabGenerate");
const topTabProjects = document.getElementById("topTabProjects");
const viewGenerate = document.getElementById("viewGenerate");
const viewProjects = document.getElementById("viewProjects");
const topProjectsCountBadge = document.getElementById("topProjectsCountBadge");

function switchHomeView(viewName) {
  const isGen = viewName === "generate";
  if (topTabGenerate) {
    topTabGenerate.classList.toggle("is-active", isGen);
    topTabGenerate.setAttribute("aria-selected", isGen ? "true" : "false");
  }
  if (topTabProjects) {
    topTabProjects.classList.toggle("is-active", !isGen);
    topTabProjects.setAttribute("aria-selected", !isGen ? "true" : "false");
  }
  if (viewGenerate) {
    viewGenerate.style.display = isGen ? "flex" : "none";
    viewGenerate.classList.toggle("is-active", isGen);
  }
  if (viewProjects) {
    viewProjects.style.display = !isGen ? "flex" : "none";
    viewProjects.classList.toggle("is-active", !isGen);
    if (!isGen) {
      loadProjectHistory();
    }
  }
}

topTabGenerate?.addEventListener("click", () => switchHomeView("generate"));
topTabProjects?.addEventListener("click", () => switchHomeView("projects"));

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
const cancelGenerationBtn = document.getElementById("cancelGenerationBtn");
const generationActionRow = document.getElementById("generationActionRow");

function renderGenerationControls(mode = "idle") {
  const normalized = String(mode || "idle").toLowerCase();

  if (normalized === "starting") {
    if (cancelGenerationBtn) {
      cancelGenerationBtn.classList.add("is-hidden");
      cancelGenerationBtn.disabled = true;
    }
    if (smartClipBtn) {
      smartClipBtn.disabled = true;
      smartClipBtn.textContent = "Starting...";
      smartClipBtn.classList.remove("is-generating", "is-cancelling");
      smartClipBtn.classList.add("is-starting");
    }
    return;
  }

  if (normalized === "active") {
    if (cancelGenerationBtn) {
      cancelGenerationBtn.classList.remove("is-hidden");
      cancelGenerationBtn.disabled = false;
      cancelGenerationBtn.textContent = "✕";
      cancelGenerationBtn.title = "Cancel generation";
      cancelGenerationBtn.setAttribute("aria-label", "Cancel clip generation");
    }
    if (smartClipBtn) {
      smartClipBtn.disabled = true;
      smartClipBtn.textContent = "Generating clips...";
      smartClipBtn.classList.remove("is-starting", "is-cancelling");
      smartClipBtn.classList.add("is-generating");
    }
    return;
  }

  if (normalized === "cancelling") {
    if (cancelGenerationBtn) {
      cancelGenerationBtn.classList.remove("is-hidden");
      cancelGenerationBtn.disabled = true;
      cancelGenerationBtn.textContent = "…";
      cancelGenerationBtn.title = "Cancelling...";
      cancelGenerationBtn.setAttribute("aria-label", "Cancelling clip generation");
    }
    if (smartClipBtn) {
      smartClipBtn.disabled = true;
      smartClipBtn.textContent = "Cancelling...";
      smartClipBtn.classList.remove("is-starting", "is-generating");
      smartClipBtn.classList.add("is-cancelling");
    }
    return;
  }

  // Default: IDLE
  if (cancelGenerationBtn) {
    cancelGenerationBtn.classList.add("is-hidden");
    cancelGenerationBtn.disabled = false;
    cancelGenerationBtn.textContent = "✕";
    cancelGenerationBtn.title = "Cancel generation";
    cancelGenerationBtn.setAttribute("aria-label", "Cancel clip generation");
  }
  if (smartClipBtn) {
    smartClipBtn.disabled = false;
    smartClipBtn.textContent = "Generate Clips";
    smartClipBtn.classList.remove("is-starting", "is-generating", "is-cancelling");
  }
}

function hideGenerationProgress() {
  const heroCard = document.getElementById("heroInputCard");
  if (heroCard) {
    heroCard.style.display = "block";
  }
  const mpCard = document.getElementById("modernProgressCard");
  if (mpCard) {
    mpCard.classList.remove("is-active");
    mpCard.classList.add("is-hidden");
    mpCard.style.display = "none";
    mpCard.style.backgroundImage = "";
  }
  const mpVideoTitle = document.getElementById("mpVideoTitle");
  if (mpVideoTitle) {
    mpVideoTitle.textContent = "";
  }
  if (progressFill) progressFill.style.width = "0%";
  if (progressPercent) progressPercent.textContent = "0%";
  if (progressLabel) progressLabel.textContent = "";
  if (progressEta) {
    progressEta.style.display = "none";
    progressEta.textContent = "";
  }
  _currentProgress = 0;
}

function showGenerationProgress(job = {}) {
  const heroCard = document.getElementById("heroInputCard");
  if (heroCard) {
    heroCard.style.display = "none";
  }
  const mpCard = document.getElementById("modernProgressCard");
  if (mpCard) {
    mpCard.classList.remove("is-hidden");
    mpCard.classList.add("is-active");
    mpCard.style.display = "block";
  }

  const queuedElapsed =
    job.status === "QUEUED" && job.createdAt
      ? Date.now() - new Date(job.createdAt).getTime()
      : 0;
  const stageMsg =
    job.status === "QUEUED" && queuedElapsed > 60000
      ? "Waiting for generation worker (worker may be spinning up)..."
      : job.stage ||
        job.message ||
        (job.status === "QUEUED"
          ? "Waiting for generation worker..."
          : "Generating clips...");
  const progressVal =
    job.status === "QUEUED"
      ? 5
      : typeof job.progress === "number" && job.progress > 0
      ? job.progress
      : 10;

  updateProgress(progressVal, stageMsg);
}

function resetGenerationUIVisuals() {
  renderGenerationControls("idle");
  hideGenerationProgress();
}

function resetGenerationUIVisualsOnly() {
  resetGenerationUIVisuals();
}

function resetGenerationUI() {
  state.isGenerating = false;
  state.activeGenerationJobId = null;

  clearGenerationPolling();
  clearActiveGenerationJob();
  resetGenerationUIVisuals();
}

function showActiveGenerationUI(job = {}) {
  const jobId = job.id || job.jobId || state.activeGenerationJobId;
  state.isGenerating = true;
  state.activeGenerationJobId = jobId;

  if (jobId) {
    setActiveGenerationJob(jobId);
  }

  renderGenerationControls("active");
  showGenerationProgress(job);
}

function setGenerationCancellingUI() {
  renderGenerationControls("cancelling");
}

function setGenerationUIState(uiState, label) {
  if (uiState === "generating") {
    showActiveGenerationUI({ stage: label });
  } else if (uiState === "cancelling") {
    setGenerationCancellingUI();
  } else {
    resetGenerationUI();
  }
}
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
const themeSwitchBtn = document.getElementById("themeSwitchBtn");
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
function updateThemeState() {
  const saved = localStorage.getItem("clipflow-theme");
  const isDark = themeToggle ? themeToggle.checked : (saved !== "light");
  document.body.classList.toggle("theme-dark", isDark);
  document.body.classList.toggle("theme-light", !isDark);
  if (modePill) modePill.textContent = isDark ? "Dark" : "Light";
  if (themeSwitchBtn) {
    themeSwitchBtn.setAttribute("aria-checked", isDark ? "true" : "false");
    themeSwitchBtn.classList.toggle("is-day", !isDark);
    themeSwitchBtn.classList.toggle("is-night", isDark);
  }
}

function initTheme() {
  const saved = localStorage.getItem("clipflow-theme");
  const isDark = saved === null ? true : saved === "dark";
  if (themeToggle) themeToggle.checked = isDark;
  updateThemeState();
}

function updateModePill() {
  updateThemeState();
}

function toggleTheme() {
  const saved = localStorage.getItem("clipflow-theme");
  const isDark = themeToggle ? themeToggle.checked : (saved !== "light");
  const newDark = !isDark;
  if (themeToggle) themeToggle.checked = newDark;
  localStorage.setItem("clipflow-theme", newDark ? "dark" : "light");
  updateThemeState();
}

themeSwitchBtn?.addEventListener("click", toggleTheme);
themeSwitchBtn?.addEventListener("keydown", (e) => {
  if (e.key === " " || e.key === "Enter") {
    e.preventDefault();
    toggleTheme();
  }
});

themeToggle?.addEventListener("change", () => {
  localStorage.setItem(
    "clipflow-theme",
    themeToggle.checked ? "dark" : "light",
  );
  updateThemeState();
});

// ─── Utilities ────────────────────────────────────────────────────────────────
async function apiFetch(url, options = {}) {
  const response = await fetch(url, options);
  const contentType = (response && response.headers && typeof response.headers.get === "function") ? (response.headers.get("content-type") || "") : "application/json";
  let data;

  if (contentType.includes("application/json")) {
    data = await response.json();
  } else {
    const text = await response.text();
    data = { error: text || "Request failed" };
  }

  if (!response.ok) {
    const err = new Error(data.details || data.error || "Request failed");
    err.status = response.status;
    throw err;
  }
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
  return `${Math.round(safe)}%`;
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

function updateSteppedProgressUI(p, label) {
  const s = String(label || "").toLowerCase();

  // Determine active step 1 to 5
  let activeStep = 1;
  if (p >= 100 || s.includes("completed") || s.includes("ready in studio")) activeStep = 5;
  else if (p >= 90 || s.includes("finalizing") || s.includes("ready")) activeStep = 5;
  else if (p >= 45 || s.includes("trimming") || s.includes("clipping") || s.includes("downloading") || s.includes("moment")) activeStep = 4;
  else if (p >= 25 || s.includes("analyzing") || s.includes("viral") || s.includes("hooks") || s.includes("moments")) activeStep = 3;
  else if (p >= 10 || s.includes("transcript") || s.includes("audio") || s.includes("script") || s.includes("extracting")) activeStep = 2;

  // 1. Update SVG Circular Progress Ring
  const progressRingCircle = document.getElementById("progressRingCircle");
  if (progressRingCircle) {
    const radius = 28;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (p / 100) * circumference;
    progressRingCircle.style.strokeDashoffset = offset;
  }

  // 2. Update Connecting Horizontal Line Fill
  const lpcLineFill = document.getElementById("lpcLineFill");
  if (lpcLineFill) {
    const fillPercent = Math.min(100, Math.max(0, ((activeStep - 1) / 4) * 100));
    lpcLineFill.style.width = `${fillPercent}%`;
  }

  // 3. Update 5 Connected Nodes
  for (let step = 1; step <= 5; step++) {
    const node = document.getElementById(`pillSeg${step}`);
    if (!node) continue;

    const isCompleted = step < activeStep || p >= 100;
    const isActive = step === activeStep && p < 100;

    node.className = "lpc-node";
    const circle = node.querySelector(".lpc-node-circle") || node;

    if (isCompleted) {
      node.classList.add("is-completed");
      circle.innerHTML = `
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
          <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
        </svg>
      `;
    } else if (isActive) {
      node.classList.add("is-active");
      circle.innerHTML = `<span class="lpc-node-dot"></span><span class="lpc-node-num">${step}</span>`;
    } else {
      node.classList.add("is-pending");
      circle.innerHTML = `<span class="lpc-node-num">${step}</span>`;
    }
  }

  // 4. Update Live Dynamic Count Status Pill
  const momentMatch = s.match(/moment\s+(\d+)\s+of\s+(\d+)/i) || s.match(/clip\s+(\d+)\s+of\s+(\d+)/i);
  if (progressLabel) {
    if (momentMatch) {
      progressLabel.textContent = `• Downloading & clipping moment ${momentMatch[1]} of ${momentMatch[2]}...`;
    } else if (label) {
      const clean = String(label).trim();
      progressLabel.textContent = clean.startsWith("•") ? clean : `• ${clean}`;
    }
  }
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

  updateSteppedProgressUI(p, label);
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
  const mpCard = document.getElementById("modernProgressCard");
  if (mpCard) {
    mpCard.classList.remove("is-active");
    mpCard.classList.add("is-hidden");
    mpCard.style.display = "none";
    mpCard.style.backgroundImage = "";
    const mpTrackEl = mpCard.querySelector(".mp-track");
    if (mpTrackEl) mpTrackEl.style.display = "none";
  }
  const mpVideoTitle = document.getElementById("mpVideoTitle");
  if (mpVideoTitle) {
    mpVideoTitle.textContent = "";
    mpVideoTitle.style.display = "none";
  }
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

function hideModernProgressCard() {
  const mpCard = document.getElementById("modernProgressCard");
  if (mpCard) {
    mpCard.classList.remove("is-active");
    mpCard.classList.add("is-hidden");
    mpCard.style.display = "none";
    mpCard.style.backgroundImage = "";
    const mpTrackEl = mpCard.querySelector(".mp-track");
    if (mpTrackEl) mpTrackEl.style.display = "none";
  }
  const mpVideoTitle = document.getElementById("mpVideoTitle");
  if (mpVideoTitle) {
    mpVideoTitle.textContent = "";
    mpVideoTitle.style.display = "none";
  }
}

function showModernProgressCard(thumbUrl, titleText) {
  const mpCard = document.getElementById("modernProgressCard");
  if (!mpCard) return;

  const ytThumb = document.getElementById("ytThumb");
  const thumbPlaceholder = document.getElementById("steppedThumbPlaceholder");
  if (thumbUrl && ytThumb) {
    ytThumb.src = thumbUrl;
    ytThumb.style.display = "block";
    if (thumbPlaceholder) thumbPlaceholder.style.display = "none";
  } else if (ytThumb) {
    ytThumb.style.display = "none";
    if (thumbPlaceholder) thumbPlaceholder.style.display = "flex";
  }

  const mpVideoTitle = document.getElementById("mpVideoTitle");
  if (mpVideoTitle && titleText) {
    mpVideoTitle.textContent = titleText;
    mpVideoTitle.title = titleText;
  }

  const ytDuration = document.getElementById("ytDuration");
  if (ytDuration && state.videoDurationSeconds) {
    ytDuration.textContent = formatTime(state.videoDurationSeconds);
  }

  mpCard.classList.remove("is-hidden");
  mpCard.classList.add("is-active");
  mpCard.style.display = "block";
}

function resetYoutubeFetchUi() {
  if (ytFetchBtn) ytFetchBtn.disabled = false;
  if (ytFetchProgress) ytFetchProgress.style.display = "none";
  const url = ytUrlInput?.value?.trim() || "";
  if (!url) {
    hideModernProgressCard();
  }
}

function showClipControls() {
  return;
}

function getAutoSmartClipCount() {
  const duration = Number(
    state.videoDurationSeconds || state.uploadedProject?.duration || 0,
  );
  const minutes = Math.floor(duration / 60);
  if (minutes < 15) return 3;           // < 15 min: 3 clips
  if (minutes < 35) return 4;           // 15 - 35 min: 4 clips
  if (minutes < 65) return 6;           // 35 - 65 min: 5 to 6 clips
  if (minutes < 100) return 7;          // 65 - 100 min: 7 clips
  return Math.min(10, Math.max(8, Math.floor(minutes / 12))); // 100+ min: 8 to 10 clips
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
  if (!clip || !clipModal || !clipModalVideo) return;

  const rawFn = clip.fileName || (clip.outputPath ? clip.outputPath.split(/[/\\]/).pop() : "");
  if (!clip.downloadUrl && rawFn) {
    clip.downloadUrl = `/api/files/download/${encodeURIComponent(rawFn)}`;
  }
  if (!clip.previewUrl && rawFn) {
    clip.previewUrl = `/api/files/download/${encodeURIComponent(rawFn)}`;
  }
  if (!clip.downloadUrl && !clip.previewUrl) return;

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

// Sync top or selected clip to caption editor session
function syncActiveClipToCaptionSession(index = 0) {
  const clip = state.generatedClips[index];
  if (!clip) return;

  const rawFn = clip.fileName || (clip.outputPath ? clip.outputPath.split(/[/\\]/).pop() : "");
  if (!clip.previewUrl && rawFn) {
    clip.previewUrl = `/api/files/download/${encodeURIComponent(rawFn)}`;
  }
  if (!clip.downloadUrl && rawFn) {
    clip.downloadUrl = `/api/files/download/${encodeURIComponent(rawFn)}`;
  }
  if (!clip.thumbnail && state.uploadedProject?.thumbnail) {
    clip.thumbnail = state.uploadedProject.thumbnail;
  }

  try {
    localStorage.setItem(
      "clipflow-caption-clip",
      JSON.stringify({
        clip,
        index,
        captions: state.clipCaptions[index] || clip.captions || [],
        captionStyle: state.captionStyle,
        updatedAt: Date.now(),
      }),
    );
  } catch (err) {
    console.warn("Could not sync caption session:", err);
  }
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

  syncActiveClipToCaptionSession(index);
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

  // Automatically keep caption session synced to the newest top clip
  syncActiveClipToCaptionSession(0);

  generatedClipsGrid.innerHTML = state.generatedClips
    .map((clip, index) => {
      const hook = escapeHtml(clip.hook || autoHookForClip(index));
      const rawFn = clip.fileName || (clip.outputPath ? clip.outputPath.split(/[/\\]/).pop() : "");
      let downloadUrl = clip.downloadUrl || "";
      if (!downloadUrl && rawFn) {
        downloadUrl = `/api/files/download/${encodeURIComponent(rawFn)}`;
        clip.downloadUrl = downloadUrl;
      }
      const safeDownloadUrl = escapeHtml(downloadUrl);
      const videoSrc = downloadUrl ? (downloadUrl.includes("#t=") ? downloadUrl : `${downloadUrl}#t=0.001`) : "";
      const posterUrl = escapeHtml(clip.thumbnail || state.uploadedProject?.thumbnail || "");
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
      <article class="clip-card ${clip.smartScore ? "smart-generated-card" : ""}" data-card-index="${index}" style="cursor: pointer;" title="Click to edit captions">
        <div class="clip-card-video">
          ${clip.smartScore ? `<div class="smart-score-badge">${Math.round(Number(clip.smartScore) || 0)}</div>` : ""}

          ${
            videoSrc
              ? `<video src="${videoSrc}" poster="${posterUrl}" muted loop playsinline preload="auto"></video>`
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
              href="${safeDownloadUrl || "#"}"
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
              href="${safeDownloadUrl || "#"}"
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

  // Attach interactive preview and frame decode hooks to every card
  generatedClipsGrid.querySelectorAll(".clip-card").forEach((card) => {
    const vid = card.querySelector("video");
    const idx = Number(card.dataset.cardIndex);

    if (vid) {
      vid.addEventListener("loadedmetadata", () => {
        if (vid.currentTime === 0) {
          try { vid.currentTime = 0.001; } catch {}
        }
      });
      vid.addEventListener("error", () => {
        const curSrc = vid.getAttribute("src") || vid.src || "";
        if (curSrc.includes("/api/files/download/")) {
          const fn = curSrc.split("/api/files/download/")[1]?.split(/[?#]/)[0];
          if (fn && !vid.dataset.triedExports) {
            vid.dataset.triedExports = "true";
            vid.src = `/exports/${fn}#t=0.001`;
            vid.load();
          }
        }
      });
    }

    card.addEventListener("mouseenter", () => {
      if (vid) {
        vid.play().catch(() => {});
      }
    });

    card.addEventListener("mouseleave", () => {
      if (vid) {
        vid.pause();
        try { vid.currentTime = 0.001; } catch {}
      }
    });

    // Clicking anywhere on the card (except action buttons) opens Edit Captions
    card.addEventListener("click", (evt) => {
      if (evt.target.closest("[data-action]")) return;
      if (!Number.isNaN(idx)) {
        editClipCaptions(idx);
      }
    });
  });
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
    // Populate hidden data holders
    if (ytThumb) ytThumb.src = thumbnail || "";
    if (ytTitle) ytTitle.textContent = title || "Untitled";
    if (ytDuration)
      ytDuration.textContent = duration
        ? `${Math.floor(duration / 60)} min ${duration % 60} sec`
        : "";
    // Set thumbnail as card background image & show card with title
    showModernProgressCard(thumbnail || "", title || "YouTube video");
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
  if (ytFetchProgress) ytFetchProgress.style.display = "none";

  try {
    updateProgress(15, "Fetching YouTube source…");

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

    // Populate hidden data holders
    if (ytThumb && project.thumbnail) ytThumb.src = project.thumbnail;
    const videoTitle = project.originalName || project.title || "YouTube video";
    if (ytTitle) ytTitle.textContent = videoTitle;
    if (ytDuration) {
      ytDuration.textContent = project.duration
        ? `${Math.floor(project.duration / 60)} min ${project.duration % 60} sec`
        : (project.metaText || "");
    }
    // Set thumbnail as card background image and show card
    showModernProgressCard(project.thumbnail || "", videoTitle);

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
    hideModernProgressCard();
    return;
  }

  if (!isValidYouTubeUrl(url)) {
    hideModernProgressCard();
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
const clearUrlBtn = document.getElementById("clearUrlBtn");
if (clearUrlBtn && ytUrlInput) {
  const syncClearBtn = () => {
    clearUrlBtn.style.display = ytUrlInput.value.trim() ? "flex" : "none";
  };
  ytUrlInput.addEventListener("input", syncClearBtn);
  ytUrlInput.addEventListener("change", syncClearBtn);
  clearUrlBtn.addEventListener("click", () => {
    ytUrlInput.value = "";
    clearUrlBtn.style.display = "none";
    ytUrlInput.focus();
    renderGenerationControls("idle");
  });
}
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

    // Show progress card for upload (clear any previous thumbnail bg)
    showModernProgressCard("", file.name.replace(/\.[^.]+$/, ""));

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

const THIRTY_ONE_DAYS_MS = 31 * 24 * 60 * 60 * 1000;

function isProjectFresh(project) {
  if (!project) return false;
  const dateVal = project.updatedAt || project.createdAt;
  if (!dateVal) return true;
  const ts = new Date(dateVal).getTime();
  if (!ts || isNaN(ts)) return true;
  return (Date.now() - ts) <= THIRTY_ONE_DAYS_MS;
}

function mergeProjectsByIdentity(projects = []) {
  const map = new Map();
  const order = [];

  projects.forEach((project) => {
    if (!project || !isProjectFresh(project)) return;

    const title = normalizeString(getProjectTitle(project));
    if (!title || title === "untitled project") return;

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
    let list = Array.isArray(modern) && modern.length ? modern : [];
    if (!list.length) {
      const legacy = JSON.parse(
        localStorage.getItem("clipflow_all_projects") || "[]",
      );
      list = Array.isArray(legacy) ? legacy : [];
    }
    const fresh = list.filter(isProjectFresh);
    if (fresh.length !== list.length) {
      localStorage.setItem(ALL_PROJECTS_KEY, JSON.stringify(fresh));
      localStorage.removeItem("clipflow_all_projects");
    }
    return fresh;
  } catch {
    return [];
  }
}

function saveLocalAllProjects(projects = []) {
  const fresh = (Array.isArray(projects) ? projects : []).filter(isProjectFresh);
  localStorage.setItem(
    ALL_PROJECTS_KEY,
    JSON.stringify(mergeProjectsByIdentity(fresh)),
  );
}

function getCleanSavedProjects(projects = []) {
  return mergeProjectsByIdentity(
    projects
      .filter((project) => {
        if (!isProjectFresh(project)) return false;
        const hasTitle = normalizeString(getProjectTitle(project));
        return Boolean(hasTitle);
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

  // If uploadedProject is missing or partial, reconstruct it from project fields
  if (!state.uploadedProject) {
    const isYt = Boolean(
      project.sourceUrl ||
      project.videoId ||
      project.youtubeUrl ||
      project.source === "youtube"
    );
    if (isYt) {
      const vId = project.videoId || (project.sourceUrl ? getVideoIdFromUrl(project.sourceUrl) : "");
      state.uploadedProject = {
        source: "youtube",
        sourceType: "youtube",
        sourceUrl: project.sourceUrl || (vId ? `https://www.youtube.com/watch?v=${vId}` : ""),
        videoId: vId,
        title: project.title || "YouTube video",
        originalName: project.title || "YouTube video",
        thumbnail: project.thumbnail || (vId ? `https://i.ytimg.com/vi/${vId}/hqdefault.jpg` : ""),
        duration: state.videoDurationSeconds || 0,
      };
    } else if (project.filePath || project.fileName) {
      state.uploadedProject = {
        source: "upload",
        sourceType: "upload",
        filePath: project.filePath || "",
        fileName: project.fileName || "",
        originalName: project.originalName || project.title || "Uploaded video",
        duration: state.videoDurationSeconds || 0,
      };
    }
  }

  _currentProgress = state.generatedClips.length ? 100 : 0;

  if (state.uploadedProject?.source === "youtube" || state.uploadedProject?.sourceUrl || state.uploadedProject?.videoId) {
    const sUrl = state.uploadedProject.sourceUrl || (state.uploadedProject.videoId ? `https://www.youtube.com/watch?v=${state.uploadedProject.videoId}` : "");
    if (ytUrlInput && sUrl) ytUrlInput.value = sUrl;
    const savedThumb = state.uploadedProject.thumbnail || project.thumbnail || "";
    const savedTitle = state.uploadedProject.originalName || state.uploadedProject.title || project.title || "YouTube video";
    if (savedThumb || savedTitle) {
      showModernProgressCard(savedThumb, savedTitle);
      const mpCard = document.getElementById("modernProgressCard");
      const mpTrackEl = mpCard?.querySelector(".mp-track");
      if (mpTrackEl) mpTrackEl.style.display = "none";
    }
    if (ytThumb) ytThumb.src = savedThumb;
    if (ytTitle) ytTitle.textContent = savedTitle;
    if (ytDuration) {
      ytDuration.textContent = formatShortDuration(
        state.videoDurationSeconds || state.uploadedProject.duration || 0,
      );
    }

    setFetchedSourceCard({
      title:
        state.uploadedProject.originalName ||
        state.uploadedProject.title ||
        project.title ||
        "YouTube video",
      thumb: state.uploadedProject.thumbnail || project.thumbnail || "",
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

  const openButton = `<button
      type="button"
      data-history-action="${openAction}"
      data-project-id="${id}"
      data-project-key="${projectKey}"
    >
      Open
    </button>`;

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
  const topProjectsCountBadgeEl = document.getElementById("topProjectsCountBadge");
  if (topProjectsCountBadgeEl) {
    topProjectsCountBadgeEl.textContent = `(${allProjects.length})`;
  }

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

  let project = null;
  try {
    const data = await apiFetch(
      `${API_BASE}/clips/projects/${encodeURIComponent(projectId)}`,
    );
    if (data && data.project) {
      project = {
        ...data.project,
        saved: true,
        localOnly: false,
      };
    }
  } catch (err) {
    console.warn("Could not fetch project from backend, falling back to cache/local:", err);
  }

  if (!project) {
    project =
      lastProjectsCache.find((p) => String(p.id) === String(projectId)) ||
      findLocalProjectByIdOrKey(projectId, "");
  }

  if (!project) {
    alert("Project not found.");
    return;
  }

  loadProjectIntoState(project, { saved: true });
  upsertProjectToAllProjects(project);
  renderProjectHistory(lastProjectsCache);

  switchHomeView("generate");
  document.querySelector(".home-content-scroll")?.scrollTo({ top: 0, behavior: "smooth" });
}

function openLocalProject(projectId, projectKey) {
  const localProject = findLocalProjectByIdOrKey(projectId, projectKey);

  if (!localProject) {
    alert("Local project not found.");
    return;
  }

  loadProjectIntoState(localProject, { saved: false });
  renderProjectHistory(lastProjectsCache);

  switchHomeView("generate");
  document.querySelector(".home-content-scroll")?.scrollTo({ top: 0, behavior: "smooth" });
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
  if (btn) {
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
    return;
  }

  // Click on the project card directly (thumbnail, title, body)
  const card = event.target.closest(".opus-project-card");
  if (card) {
    const projectId = card.dataset.projectId || "";
    const projectKey = card.dataset.projectKey || "";
    try {
      if (projectId) {
        await openSavedProject(projectId);
      } else if (projectKey) {
        openLocalProject(projectId, projectKey);
      }
    } catch (error) {
      console.warn("Card open failed:", error);
    }
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
    body.storageUrl =
      state.uploadedProject.storageUrl ||
      "";
  }

  return body;
}
function getCleanSmartClipError(error) {
  const msg = String(error?.message || error || "");
  if (msg.includes("RAPIDAPI_KEY is not configured")) {
    return "RAPIDAPI_KEY is not configured on the server. Please add your key in Render environment settings.";
  }
  if (msg.includes("RapidAPI file preparation timed out") || msg.includes("Timed out waiting for RapidAPI")) {
    return "RapidAPI CDN video preparation timed out. Try another video or upload directly.";
  }
  if (msg.includes("HTTP 403") || msg.includes("Forbidden")) {
    return "RapidAPI authentication failed. Please verify your RAPIDAPI_KEY.";
  }
  return msg || "Smart clipping failed. Try uploading the source video directly.";
}

async function createSmartGenerationJob(payload) {
  const res = await apiFetch(`${API_BASE}/clips/smart-generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res || !res.jobId) {
    throw new Error(res?.error || "Failed to create generation job");
  }

  setActiveGenerationJob(res.jobId, {
    sourceType: payload.sourceType,
  });

  return res;
}

let pollGenerationVersion = 0;
let generationPollTimer = null;

function clearGenerationPolling() {
  pollGenerationVersion++;
  if (generationPollTimer) {
    clearTimeout(generationPollTimer);
    generationPollTimer = null;
  }
}

function invalidateGenerationPolling() {
  clearGenerationPolling();
}

cancelGenerationBtn?.addEventListener("click", async (e) => {
  e.preventDefault();
  const currentJobId = state.activeGenerationJobId;

  // 1. Immediately invalidate active status polling token so in-flight GET cannot resurrect UI
  invalidateGenerationPolling();

  if (!currentJobId) {
    resetGenerationUI();
    return;
  }

  // 2. Prevent duplicate clicks & temporarily show cancelling UI
  renderGenerationControls("cancelling");

  // 3. Clear activeGenerationJobId from frontend state & localStorage immediately
  clearActiveGenerationReference();

  // 4. Request backend cancellation
  try {
    await apiFetch(
      `${API_BASE}/clips/generation-jobs/${encodeURIComponent(currentJobId)}/cancel`,
      { method: "POST" }
    );
  } catch (err) {
    console.warn("[CancelGeneration] Backend cancel error (ignored, UI reset):", err.message);
  }

  // 5. Reset generation UI to idle immediately
  resetGenerationUI();
  console.log("[GenerationUI] Job cancelled, resetting active state to idle");
});

async function pollGenerationJob(jobId, onProgress, requestVersion) {
  const pollIntervalMs = 2000;
  let consecutiveNetworkErrors = 0;
  const maxConsecutiveNetworkErrors = 15;

  while (true) {
    // Stop polling if cancelled, invalidated, or replaced
    if (requestVersion !== pollGenerationVersion || state.activeGenerationJobId !== jobId) {
      console.log("[GenerationUI] Poll response ignored because job changed");
      return { status: "CANCELLED" };
    }

    let responseData = null;
    try {
      responseData = await apiFetch(`${API_BASE}/clips/generation-jobs/${encodeURIComponent(jobId)}`);
      consecutiveNetworkErrors = 0;
    } catch (fetchErr) {
      if (requestVersion !== pollGenerationVersion || state.activeGenerationJobId !== jobId) {
        console.log("[GenerationUI] Poll response ignored because job changed");
        return { status: "CANCELLED" };
      }

      // If server returned 404, the job no longer exists
      if (fetchErr.status === 404) {
        throw fetchErr;
      }

      consecutiveNetworkErrors++;
      console.warn(
        `[JobPolling] Temporary network issue fetching job ${jobId} (attempt ${consecutiveNetworkErrors}/${maxConsecutiveNetworkErrors}):`,
        fetchErr.message
      );

      if (consecutiveNetworkErrors >= maxConsecutiveNetworkErrors) {
        throw new Error(
          "Network connection to server lost while checking clip generation. Generation is still running on the server. Please refresh the page to reconnect."
        );
      }

      await new Promise((r) => {
        generationPollTimer = setTimeout(r, Math.min(5000, 1000 * Math.pow(1.3, consecutiveNetworkErrors)));
      });
      continue;
    }

    if (requestVersion !== pollGenerationVersion || state.activeGenerationJobId !== jobId) {
      console.log("[GenerationUI] Poll response ignored because job changed");
      return { status: "CANCELLED" };
    }

    const job = responseData?.job || responseData;
    if (!job) {
      throw new Error("Invalid response received from generation job status endpoint");
    }

    const { stage, message, needsUpload, suggestions, error, createdAt, startedAt } = job;
    const status = String(job.status || responseData?.status || "").toUpperCase();
    const progress = job.progress !== undefined ? job.progress : responseData?.progress;
    const clips = job.clips || responseData?.clips || job.resultJson?.clips || [];

    let displayStage = stage || message || "Processing...";
    let displayProgress = progress != null ? progress : 0;

    if (status === "QUEUED") {
      displayProgress = 5;
      const queuedElapsedMs = createdAt ? (Date.now() - new Date(createdAt).getTime()) : 0;
      if (queuedElapsedMs > 60000 && !startedAt) {
        displayStage = "Waiting for generation worker (worker may be spinning up)...";
      } else {
        displayStage = stage || "Waiting for generation worker...";
      }
    }

    if (onProgress && typeof onProgress === "function") {
      onProgress(displayProgress, displayStage);
    }

    if (status === "COMPLETED" || Number(progress) === 100) {
      return {
        status: "COMPLETED",
        clips: Array.isArray(clips) ? clips : [],
        suggestions: Array.isArray(suggestions) ? suggestions : [],
      };
    }

    if (status === "AWAITING_UPLOAD" || needsUpload) {
      return {
        status: "AWAITING_UPLOAD",
        needsUpload: true,
        message: message || stage || "YouTube transcript analyzed. Upload source video to clip moments:",
        suggestions: Array.isArray(suggestions) ? suggestions : [],
      };
    }

    if (status === "FAILED") {
      throw new Error(error || message || "Smart clip generation failed");
    }

    if (status === "CANCELLED") {
      return { status: "CANCELLED" };
    }

    // Still processing (QUEUED, TRANSCRIBING, SELECTING_MOMENTS, DOWNLOADING, RENDERING, FINALIZING)
    await new Promise((r) => {
      generationPollTimer = setTimeout(r, pollIntervalMs);
    });
  }
}

function startGenerationPolling(jobId) {
  clearGenerationPolling();
  const currentVersion = pollGenerationVersion;

  pollGenerationJob(
    jobId,
    (progress, stage) => {
      if (currentVersion !== pollGenerationVersion || state.activeGenerationJobId !== jobId) {
        console.log("[GenerationUI] Poll response ignored because job changed");
        return;
      }
      updateProgress(progress, stage);
    },
    currentVersion
  )
    .then(async (result) => {
      if (currentVersion !== pollGenerationVersion || state.activeGenerationJobId !== jobId) {
        console.log("[GenerationUI] Poll response ignored because job changed");
        return;
      }

      if (result?.status === "COMPLETED") {
        console.log("[GenerationUI] Job completed, immediately rendering clips");
        await consumeCompletedClips(result.clips);
        clearActiveGenerationReference();
        resetGenerationUI();
        renderGeneratedClips();
      } else if (result?.needsUpload || result?.status === "AWAITING_UPLOAD") {
        clearActiveGenerationReference();
        resetGenerationUI();
        showUploadRequiredForSmartClips(result);
      } else if (result?.status === "CANCELLED") {
        console.log("[GenerationUI] Job cancelled, resetting active state");
        clearActiveGenerationReference();
        resetGenerationUI();
      } else if (result?.status === "FAILED") {
        console.log("[GenerationUI] Job failed, resetting active state");
        clearActiveGenerationReference();
        resetGenerationUI();
      }
    })
    .catch((err) => {
      if (currentVersion !== pollGenerationVersion || state.activeGenerationJobId !== jobId) {
        console.log("[GenerationUI] Poll response ignored because job changed");
        return;
      }
      console.error("[GenerationUI] Polling error:", err);
      clearActiveGenerationReference();
      resetGenerationUI();
    });
}

async function consumeCompletedClips(rawClips = []) {
  const clips = Array.isArray(rawClips) ? rawClips : [];

  if (!clips.length) {
    console.warn("[GenerationUI] No clips in completed payload");
    clearActiveGenerationJob();
    setGenerationUIState("idle");
    return;
  }

  const formattedClips = clips.map((clip, index) => ({
    ...clip,
    fileName: clip.fileName || (clip.outputPath ? clip.outputPath.split(/[/\\]/).pop() : `clip_${index + 1}.mp4`),
    filePath: clip.filePath || clip.outputPath || "",
    outputPath: clip.outputPath || clip.filePath || "",
    startTime: clip.startTime || clip.start || secondsToTime(clip.startSec || 0),
    endTime: clip.endTime || clip.end || secondsToTime(clip.endSec || 0),
    duration:
      clip.duration != null
        ? Number(clip.duration)
        : Math.max(0, Number(clip.durationSec || 0)),
    hook: clip.hook || clip.title || `Smart Clip #${index + 1}`,
    smartScore: Number(clip.smartScore || clip.score || 85),
    smartReason: clip.smartReason || formatSmartReason(clip),
    previewText: clip.previewText || clip.text || "",
  }));

  state.generatedClips = formattedClips;
  state.generatedClip = formattedClips[0] || null;

  upsertCurrentProjectToAllProjects();

  renderGeneratedClips();
  persistStudioSession();
  clearActiveGenerationJob();
  setGenerationUIState("idle");

  const resultsSection = document.querySelector(".created-clips-strip");
  if (resultsSection) {
    resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  for (let i = 0; i < formattedClips.length; i++) {
    loadCaptionsForClip(formattedClips[i], i).catch(() => {});
  }
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

    updateProgress(5, "Queuing clip generation from uploaded video...");

    const body = {
      sourceType: "upload",
      inputPath: result.project.filePath,
      segments: suggestions,
      isContinuation: true,
      maxClips: Array.isArray(suggestions) && suggestions.length ? suggestions.length : 3,
      minScore: 0,
      clipLengthSec: state.selectedDuration || 30,
    };

    const createRes = await createSmartGenerationJob(body);
    const jobId = createRes?.jobId;
    if (!jobId) throw new Error("No job ID returned from generation creation");

    showActiveGenerationUI({
      id: jobId,
      status: "QUEUED",
      stage: "Queuing clip generation from uploaded video...",
      progress: 5,
    });

    startGenerationPolling(jobId);
  } catch (error) {
    resetGenerationUI();
    updateProgress(0, error.message || "Upload failed");
    alert(error.message || "Upload failed");
  } finally {
    checkGenerationStateInvariant();
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
  state.uploadRequiredActive = true;
  clearActiveGenerationJob();
  resetGenerationUI();

  if (data?.isUnavailable) {
    const unavailMsg = data.message || "This video is unavailable, private, or has been removed on YouTube. Please check the URL.";
    updateProgress(0, unavailMsg);
    alert(unavailMsg);
    return;
  }

  // Sanitize user-facing message - never show raw yt-dlp stderr walls or stack traces to normal users
  let cleanMessage = data?.message || "YouTube blocked automatic source download. Upload the source video to generate these clips.";
  if (
    cleanMessage.includes("ERROR:") ||
    cleanMessage.includes("All download strategies exhausted") ||
    cleanMessage.includes("yt-dlp") ||
    cleanMessage.includes("github.com") ||
    cleanMessage.includes("Sign in to confirm") ||
    cleanMessage.includes("bot") ||
    cleanMessage.includes("Sign in") ||
    cleanMessage.includes("failed")
  ) {
    cleanMessage = "YouTube blocked automatic source download. Upload the source video to generate these clips.";
  }

  updateProgress(0, cleanMessage);

  const suggestions = Array.isArray(data?.suggestions) ? data.suggestions : [];

  if (suggestions.length && generatedClipsGrid) {
    generatedClipsGrid.innerHTML = `
      <div style="
        padding: 24px;
        background: #111;
        border-radius: 12px;
        margin-bottom: 20px;
        border: 1px solid #333;
        grid-column: 1 / -1;
      ">
        <p style="color:#facc15;font-weight:700;margin:0 0 8px;font-size:16px;">
          Found ${suggestions.length} viral moments from transcript
        </p>
        <p style="color:#ccc;margin:0 0 16px;font-size:14px;line-height:1.5;">
          ${escapeHtml(cleanMessage)}
        </p>
        <label style="
          display:inline-block;
          padding:12px 24px;
          background:#fff;
          color:#000;
          border-radius:8px;
          cursor:pointer;
          font-weight:700;
          font-size:14px;
        ">
          Upload Source Video
          <input type="file" accept=".mp4,.mov,.mkv,.webm" style="display:none"
            onchange="handleUploadForSmartClips(this, ${JSON.stringify(suggestions).replace(/"/g, "&quot;")})">
        </label>
      </div>
      <div style="grid-column: 1 / -1; display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));">
      ${suggestions
        .slice(0, 5)
        .map((item, index) => {
          const score = Math.round(Number(item.score || 0));
          const title = escapeHtml(item.title || item.hook || `Smart Moment #${index + 1}`);
          const reason = escapeHtml(item.reason || item.smartReason || "Strong transcript moment");
          const start = escapeHtml(item.start || secondsToTime(item.startSec || 0));
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
      </div>
    `;
  }
}

smartClipBtn?.addEventListener("click", async () => {
  try {
    const url = ytUrlInput?.value?.trim() || "";
    const isUploadMode = Boolean(
      state.uploadedProject &&
      (state.uploadedProject.source === "upload" || state.uploadedProject.sourceType === "upload")
    );

    // Step 18: Validate source before changing button to active mode
    if (!isUploadMode) {
      // YouTube mode
      if (!url) {
        alert("Please enter a YouTube video URL first.");
        renderGenerationControls("idle");
        hideGenerationProgress();
        return;
      }
      if (!isValidYouTubeUrl(url)) {
        alert("Please enter a valid YouTube video link.");
        renderGenerationControls("idle");
        hideGenerationProgress();
        return;
      }

      if (!state.uploadedProject) {
        const vId = getVideoIdFromUrl(url);
        state.uploadedProject = {
          source: "youtube",
          sourceType: "youtube",
          sourceUrl: url,
          youtubeUrl: url,
          videoId: vId,
          title: "YouTube video",
          thumbnail: vId ? `https://i.ytimg.com/vi/${vId}/hqdefault.jpg` : "",
        };
      }
    } else {
      // Upload mode
      const hasFile = Boolean(
        state.uploadedProject.filePath ||
        state.uploadedProject.inputPath ||
        state.uploadedProject.fileName
      );
      if (!hasFile) {
        alert("Please select or upload a video file first.");
        renderGenerationControls("idle");
        hideGenerationProgress();
        return;
      }
    }

    if (state.activeGenerationJobId && state.isGenerating) {
      console.warn("Generation job already in progress:", state.activeGenerationJobId);
      return;
    }

    // Step 19: Only transition to active AFTER job creation succeeds
    // 1. Temporarily show "Starting...", keep cancel button hidden
    renderGenerationControls("starting");

    state.smartSuggestions = [];
    state.uploadRequiredActive = false;
    _currentProgress = 0;

    const body = buildSmartSuggestBody();
    body.maxClips = Math.min(3, getAutoSmartClipCount());
    body.minScore = 30;

    // 2. POST create job - only transition to active after receiving valid jobId
    const createRes = await createSmartGenerationJob(body);
    const jobId = createRes?.jobId;
    if (!jobId) {
      throw new Error("Failed to receive job ID from server");
    }

    // 3. Transition to active state
    state.isGenerating = true;
    state.activeGenerationJobId = jobId;
    setActiveGenerationJob(jobId, { sourceType: body.sourceType });
    renderGenerationControls("active");
    showGenerationProgress({
      id: jobId,
      status: "QUEUED",
      stage: "Queuing smart generation job...",
      progress: 5,
    });

    // 4. Start polling
    startGenerationPolling(jobId);
  } catch (error) {
    console.error("[SmartClip] Generation error:", error);
    resetGenerationUI();
    const cleanMsg = getCleanSmartClipError(error);
    alert(cleanMsg);
  } finally {
    checkGenerationStateInvariant();
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
    raw.includes("Sign in to confirm") ||
    raw.includes("not a bot")
  ) {
    return "This YouTube video could not be downloaded from cloud servers. Try uploading the video directly.";
  }

  if (raw.includes("403") || raw.includes("Forbidden")) {
    return "Video downloader received HTTP 403 Forbidden. RapidAPI host/key might need verification, or use Upload.";
  }

  if (
    raw.includes("Failed to resolve") ||
    raw.includes("getaddrinfo failed") ||
    raw.includes("ENOTFOUND")
  ) {
    return "Internet or DNS connection failed. Please check your connection and try again.";
  }

  if (raw.includes("Failed to fetch") || raw.includes("NetworkError")) {
    return "Cloud server request timed out or was interrupted. Try uploading the video file directly.";
  }

  return (
    raw || "Smart clipping failed. Try another video or upload the source file directly."
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

async function reconcileActiveGeneration() {
  // Step 1: Force generation visuals to IDLE at start
  resetGenerationUIVisuals();

  const jobId = getActiveGenerationJobId();

  if (!jobId || typeof jobId !== "string" || !jobId.trim() || jobId === "null" || jobId === "undefined") {
    clearActiveGenerationReference();
    resetGenerationUIVisuals();
    return;
  }

  const cleanJobId = jobId.trim();
  console.log(`[GenerationUI] Reconciling active job reference: ${cleanJobId}`);

  let job = null;
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    attempts++;
    try {
      const res = await apiFetch(`${API_BASE}/clips/generation-jobs/${encodeURIComponent(cleanJobId)}`);
      job = res?.job || null;
      break;
    } catch (fetchErr) {
      const status = fetchErr?.status;
      const msg = String(fetchErr?.message || "").toLowerCase();

      // Step 13: 404 / Nonexistent job: stale local reference!
      if (status === 404 || msg.includes("404") || msg.includes("not found")) {
        console.warn(`[GenerationUI] Stale job reference (404 for ${cleanJobId}), clearing from storage.`);
        clearActiveGenerationReference();
        resetGenerationUIVisuals();
        return;
      }

      // 401 / 403 / Access forbidden: clear stale local identity
      if (status === 401 || status === 403) {
        console.warn(`[GenerationUI] Access denied to job (${status}), clearing.`);
        clearActiveGenerationReference();
        resetGenerationUIVisuals();
        return;
      }

      // 500 / Network Error: retry limited times
      console.warn(
        `[GenerationUI] Network error fetching job (attempt ${attempts}/${maxAttempts}):`,
        fetchErr.message
      );
      if (attempts < maxAttempts) {
        await new Promise((r) => setTimeout(r, 1200));
      } else {
        console.warn("[GenerationUI] Could not reconnect to job after retries. Resetting UI to idle.");
        clearActiveGenerationReference();
        resetGenerationUIVisuals();
        return;
      }
    }
  }

  if (!job) {
    console.warn(`[GenerationUI] No job object returned from server for ${cleanJobId}. Resetting to idle.`);
    clearActiveGenerationReference();
    resetGenerationUIVisuals();
    return;
  }

  console.log(`[GenerationUI] Reconciling job ${job.id}: status=${job.status}, sourceType=${job.sourceType}`);

  // CONDITION A: Server job must be actively generating
  if (isGenerationJobActive(job.status)) {
    const isYt = job.sourceType === "youtube" || (!job.sourceType && Boolean(job.sourceUrl));
    const isUpload = job.sourceType === "upload" || Boolean(job.hasUploadSource);

    // CONDITION B: Valid source must exist
    if (isYt) {
      const sUrl = String(job.sourceUrl || "").trim();

      // Step 7: Active YouTube job WITHOUT sourceUrl is an INVALID state for frontend recovery
      if (!sUrl) {
        console.warn("[GenerationUI] Active YouTube job has no source URL; clearing stale UI reference.");
        clearActiveGenerationReference();
        resetGenerationUIVisuals();
        return;
      }

      // Step 6: RESTORE SOURCE URL INTO INPUT FIRST!
      if (ytUrlInput) {
        ytUrlInput.value = sUrl;
      }

      if (!state.uploadedProject) {
        const vId = getVideoIdFromUrl(sUrl);
        state.uploadedProject = {
          source: "youtube",
          sourceType: "youtube",
          sourceUrl: sUrl,
          youtubeUrl: sUrl,
          videoId: vId,
          title: "YouTube video",
          thumbnail: vId ? `https://i.ytimg.com/vi/${vId}/hqdefault.jpg` : "",
        };
      }

      // Quietly fetch video info to restore title/thumbnail if available
      try {
        fetchYtInfo(sUrl);
      } catch {}

      // ONLY AFTER SOURCE IS RESTORED INTO INPUT: Show active generation UI
      state.isGenerating = true;
      state.activeGenerationJobId = job.id;
      renderGenerationControls("active");
      showGenerationProgress(job);
      startGenerationPolling(job.id);
      return;
    } else if (isUpload) {
      // Step 8: Upload jobs
      const hasValidUpload = Boolean(
        job.hasUploadSource ||
        job.sourceName ||
        (state.uploadedProject && state.uploadedProject.source === "upload")
      );

      if (!hasValidUpload) {
        console.warn("[GenerationUI] Active upload job has no valid upload source reference; clearing stale UI reference.");
        clearActiveGenerationReference();
        resetGenerationUIVisuals();
        return;
      }

      if (!state.uploadedProject) {
        state.uploadedProject = {
          source: "upload",
          sourceType: "upload",
          originalName: job.sourceName || "Uploaded video",
          title: job.sourceName || "Uploaded video",
        };
      }

      state.isGenerating = true;
      state.activeGenerationJobId = job.id;
      renderGenerationControls("active");
      showGenerationProgress(job);
      startGenerationPolling(job.id);
      return;
    } else {
      console.warn("[GenerationUI] Active job has no verified source; clearing stale reference.");
      clearActiveGenerationReference();
      resetGenerationUIVisuals();
      return;
    }
  }

  // Step 10: Completed job
  if (job.status === "COMPLETED") {
    console.log("[GenerationUI] Job completed, consuming clips and resetting active state");
    await consumeCompletedClips(job.clips);
    clearActiveGenerationReference();
    resetGenerationUIVisuals();
    return;
  }

  // Step 14: Awaiting upload
  if (job.status === "AWAITING_UPLOAD" || job.needsUpload) {
    clearActiveGenerationReference();
    resetGenerationUIVisuals();
    showUploadRequiredForSmartClips(job);
    return;
  }

  // Step 11: Cancelled job
  if (job.status === "CANCELLED") {
    console.log("[GenerationUI] Job cancelled, resetting active state");
    clearActiveGenerationReference();
    resetGenerationUIVisuals();
    return;
  }

  // Step 12: Failed job
  if (job.status === "FAILED") {
    console.log("[GenerationUI] Job failed, resetting active state:", job.error);
    clearActiveGenerationReference();
    resetGenerationUIVisuals();
    return;
  }

  // Any other terminal/unexpected status: reset to idle
  clearActiveGenerationReference();
  resetGenerationUIVisuals();
}

async function reconcileGenerationJob() {
  return reconcileActiveGeneration();
}
async function resumeActiveGenerationJobIfAny() {
  return reconcileActiveGeneration();
}
try { window.reconcileActiveGeneration = reconcileActiveGeneration; } catch {}
try { window.reconcileGenerationJob = reconcileActiveGeneration; } catch {}

// ─── Boot ─────────────────────────────────────────────────────────────────────
initTheme();
// Step 1: ALWAYS initialize generation UI as IDLE first
resetGenerationUIVisuals();
// Step 2: Clean and migrate old browser storage (remove any saved UI flags)
migrateOldBrowserStorage();
// Step 3: Restore saved studio/project state (ignoring UI-only generation flags)
restoreStudioSession();
mergeCaptionEditorSession();
// Step 4: Reconcile active generation job strictly against server (awaits response before switching UI)
reconcileActiveGeneration();
// Step 5: Defensive invariant check
checkGenerationStateInvariant();

setYoutubeFetchButtonHidden();
updateProjectTabs();
updateClipPlanner();
renderProjectHistory([]);
renderGeneratedClips();
loadProjectHistory();

// Defensive guard: ensure progress card is hidden on initial boot unless generation is active
;(function guardProgressCard() {
  if (state.activeGenerationJobId && state.isGenerating) return;
  hideGenerationProgress();
})();

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
