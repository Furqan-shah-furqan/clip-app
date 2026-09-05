const PUBLISH_DRAFT_KEY = "clipflow-publish-draft";
const API_BASE = "/api";
const REALTIME_FAST_POLL_MS = 3000;
const REALTIME_IDLE_POLL_MS = 10000;

let publishRealtimeTimer = null;
let publishRealtimeInFlight = false;
let lastScheduleSignature = "";

let isSubmittingSchedule = false;

const state = {
  accounts: [],
  clips: [],
  schedules: [],
  draft: null,
  loading: false,
};

const els = {};

document.addEventListener("DOMContentLoaded", async () => {
  cacheDom();
  forceCloseEditModal();
  bindEvents();
  setDefaultScheduleTime();

  if (typeof setDefaultVisibilityPublic === "function") {
    setDefaultVisibilityPublic();
  }

  await loadPublishCenter({
    silent: false,
  });

  startPublishRealtimePolling();
});

function cacheDom() {
  els.refreshBtn = document.getElementById("refreshBtn");
  els.scheduleForm = document.getElementById("scheduleForm");
  els.accountSelect = document.getElementById("accountSelect");
  els.clipSelect = document.getElementById("clipSelect");
  els.manualClipId = document.getElementById("manualClipId");
  els.titleInput = document.getElementById("titleInput");
  els.captionInput = document.getElementById("captionInput");
  els.hashtagsInput = document.getElementById("hashtagsInput");
  els.visibilitySelect = document.getElementById("visibilitySelect");
  els.scheduledForInput = document.getElementById("scheduledForInput");
  els.formMessage = document.getElementById("formMessage");

  els.accountsCount = document.getElementById("accountsCount");
  els.queuedCount = document.getElementById("queuedCount");
  els.publishedCount = document.getElementById("publishedCount");
  els.failedCount = document.getElementById("failedCount");

  els.scheduleList = document.getElementById("scheduleList");
  els.statusFilter = document.getElementById("statusFilter");

  els.editModal = document.getElementById("editModal");
  els.closeEditModalBtn = document.getElementById("closeEditModalBtn");
  els.editForm = document.getElementById("editForm");
  els.editScheduleId = document.getElementById("editScheduleId");
  els.editTitleInput = document.getElementById("editTitleInput");
  els.editCaptionInput = document.getElementById("editCaptionInput");
  els.editHashtagsInput = document.getElementById("editHashtagsInput");
  els.editVisibilitySelect = document.getElementById("editVisibilitySelect");
  els.editScheduledForInput = document.getElementById("editScheduledForInput");

  els.selectedClipPreview = document.getElementById("selectedClipPreview");
  els.selectedClipVideo = document.getElementById("selectedClipVideo");
  els.selectedClipFallback = document.getElementById("selectedClipFallback");
  els.selectedClipTitle = document.getElementById("selectedClipTitle");
  els.selectedClipMeta = document.getElementById("selectedClipMeta");

  els.connectYoutubeBtn = document.getElementById("connectYoutubeBtn");
  els.connectInstagramBtn = document.getElementById("connectInstagramBtn");
  els.youtubeConnectHint = document.getElementById("youtubeConnectHint");
  els.instagramConnectHint = document.getElementById("instagramConnectHint");
  els.youtubeChannelBox = document.getElementById("youtubeChannelBox");
  els.youtubeChannelInput = document.getElementById("youtubeChannelInput");
  els.useYoutubeChannelBtn = document.getElementById("useYoutubeChannelBtn");
  els.youtubeChannelHint = document.getElementById("youtubeChannelHint");
}

function bindEvents() {
  els.refreshBtn?.addEventListener("click", () => {
    loadPublishCenter({
      silent: false,
    });
  });

  els.statusFilter?.addEventListener("change", renderSchedules);
  els.scheduleForm?.addEventListener("submit", handleCreateSchedule);
  els.editForm?.addEventListener("submit", handleEditSchedule);

  els.connectYoutubeBtn?.addEventListener(
    "click",
    startYouTubeOAuthFromPublish,
  );
  els.connectInstagramBtn?.addEventListener(
    "click",
    startInstagramOAuthFromPublish,
  );

els.accountSelect?.addEventListener("change", () => {
  if (els.accountSelect.value) {
    localStorage.setItem(
      "clipflow-selected-publish-account-id",
      els.accountSelect.value
    );

    localStorage.setItem(
      "clipflow-selected-youtube-account-id",
      els.accountSelect.value
    );
  }
});

  if (els.closeEditModalBtn) {
    els.closeEditModalBtn.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeEditModal();
    };
  }

  if (els.editModal) {
    els.editModal.addEventListener("click", (event) => {
      if (event.target === els.editModal) {
        closeEditModal();
      }
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isEditModalOpen()) {
      closeEditModal();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      refreshPublishCenterRealtime();
    }
  });

  els.scheduleList?.addEventListener("click", (event) => {
    const actionBtn = event.target.closest("[data-action]");
    if (!actionBtn) return;

    event.preventDefault();

    const id = actionBtn.dataset.id;
    const action = actionBtn.dataset.action;

    if (!id || !action) return;

    handleScheduleAction(action, id);
  });
}

function startYouTubeOAuthFromPublish() {
  localStorage.removeItem("clipflow-youtube-channel-link");

  if (els.connectYoutubeBtn) {
    els.connectYoutubeBtn.disabled = true;
    els.connectYoutubeBtn.textContent = "Opening Google OAuth...";
  }

  if (els.youtubeConnectHint) {
    els.youtubeConnectHint.textContent =
      "Choose the Google account that owns the YouTube channel you want to upload to.";
  }

  const returnTo = `${window.location.pathname}${window.location.search || ""}`;

  window.location.href = `${API_BASE}/auth/youtube?returnTo=${encodeURIComponent(returnTo)}`;
}

function startInstagramOAuthFromPublish() {
  if (els.connectInstagramBtn) {
    els.connectInstagramBtn.disabled = true;
    els.connectInstagramBtn.textContent = "Opening Instagram Login...";
  }

  if (els.instagramConnectHint) {
    els.instagramConnectHint.textContent =
      "Choose your business Instagram account for Reels publishing.";
  }

  const returnTo = `${window.location.pathname}${window.location.search || ""}`;

  window.location.href = `${API_BASE}/auth/instagram?returnTo=${encodeURIComponent(returnTo)}`;
}

function toggleYoutubeChannelBox() {
  if (!els.youtubeChannelBox || !els.connectYoutubeBtn) return;

  const willOpen = els.youtubeChannelBox.hidden;

  els.youtubeChannelBox.hidden = !willOpen;
  els.connectYoutubeBtn.classList.toggle("is-open", willOpen);

  if (willOpen) {
    els.connectYoutubeBtn.textContent = "Paste YouTube Channel Link";
    setTimeout(() => {
      els.youtubeChannelInput?.focus();
    }, 50);
  } else {
    els.connectYoutubeBtn.textContent = "+ Add Another YouTube Account";
    els.connectYoutubeBtn.classList.remove("is-valid");
  }

  updateYoutubeChannelState();
}

function isValidYoutubeChannelLink(value = "") {
  const link = String(value || "").trim();

  if (!link) return false;

  return /^https?:\/\/(www\.)?(youtube\.com|m\.youtube\.com)\/(@[a-zA-Z0-9._-]+|channel\/UC[a-zA-Z0-9_-]+|c\/[a-zA-Z0-9._-]+|user\/[a-zA-Z0-9._-]+)(\/)?(\?.*)?$/.test(
    link,
  );
}

function updateYoutubeChannelState() {
  const value = els.youtubeChannelInput?.value?.trim() || "";
  const isValid = isValidYoutubeChannelLink(value);

  els.connectYoutubeBtn?.classList.toggle("is-valid", isValid);
  els.useYoutubeChannelBtn?.classList.toggle("is-ready", isValid);

  if (els.useYoutubeChannelBtn) {
    els.useYoutubeChannelBtn.disabled = !isValid;
  }

  if (els.youtubeChannelHint) {
    if (!value) {
      els.youtubeChannelHint.textContent =
        "Paste a YouTube channel link like youtube.com/@channelname";
      els.youtubeChannelHint.className = "youtube-channel-hint";
    } else if (isValid) {
      els.youtubeChannelHint.textContent =
        "Channel link looks good. You can save it now.";
      els.youtubeChannelHint.className = "youtube-channel-hint is-valid";
    } else {
      els.youtubeChannelHint.textContent =
        "Invalid channel link. Use a link like https://www.youtube.com/@YourChannel";
      els.youtubeChannelHint.className = "youtube-channel-hint is-error";
    }
  }

  if (els.connectYoutubeBtn) {
    els.connectYoutubeBtn.textContent = isValid
      ? "YouTube Channel Link Added"
      : "Paste YouTube Channel Link";
  }
}

function saveYoutubeChannelLink() {
  const value = els.youtubeChannelInput?.value?.trim() || "";

  if (!isValidYoutubeChannelLink(value)) {
    updateYoutubeChannelState();
    return;
  }

  localStorage.setItem(
    "clipflow-youtube-channel-link",
    JSON.stringify({
      url: value,
      name: getYoutubeChannelNameFromUrl(value),
      savedAt: new Date().toISOString(),
    }),
  );

  state.accounts = state.accounts.filter((account) => {
    return (
      account.id !== "saved-youtube-channel-link" &&
      !isDemoYoutubeAccount(account)
    );
  });

  addSavedChannelLinkToDropdown();
  renderAccounts();

  if (els.accountSelect) {
    els.accountSelect.value = "saved-youtube-channel-link";
  }

  showMessage("YouTube channel link saved and selected.", "success");

  if (els.connectYoutubeBtn) {
    els.connectYoutubeBtn.textContent = "YouTube Channel Link Saved";
    els.connectYoutubeBtn.classList.add("is-valid");
  }

  if (els.youtubeChannelHint) {
    els.youtubeChannelHint.textContent =
      "Channel link saved. Upload will use your connected HOME VIBE account.";
    els.youtubeChannelHint.className = "youtube-channel-hint is-valid";
  }
}

function getSavedYoutubeChannelLink() {
  const raw = localStorage.getItem("clipflow-youtube-channel-link");

  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    return parsed?.url ? parsed : null;
  } catch {
    return null;
  }
}

function getYoutubeChannelNameFromUrl(url = "") {
  const clean = String(url || "").trim();

  const handleMatch = clean.match(/youtube\.com\/@([^/?#]+)/i);
  if (handleMatch?.[1]) {
    return `@${handleMatch[1]}`;
  }

  const channelMatch = clean.match(/youtube\.com\/channel\/([^/?#]+)/i);
  if (channelMatch?.[1]) {
    return `Channel ${channelMatch[1].slice(0, 10)}...`;
  }

  const customMatch = clean.match(/youtube\.com\/(?:c|user)\/([^/?#]+)/i);
  if (customMatch?.[1]) {
    return customMatch[1];
  }

  return "Saved YouTube Channel";
}

function addSavedChannelLinkToDropdown() {
  const savedChannel = getSavedYoutubeChannelLink();
  if (!savedChannel?.url) return;

  const label =
    savedChannel.name || getYoutubeChannelNameFromUrl(savedChannel.url);

  const alreadyExists = state.accounts.some((account) => {
    return account.id === "saved-youtube-channel-link";
  });

  if (alreadyExists) return;

  state.accounts.push({
    id: "saved-youtube-channel-link",
    platform: "YOUTUBE",
    platformUsername: `${label} — Link Saved`,
    platformUserId: savedChannel.url,
    userId: "",
    isSavedChannelLinkOnly: true,
  });
}

async function loadPublishCenter(options = {}) {
  const silent = Boolean(options.silent);

  if (!silent) {
    setLoading(true);
    clearMessage();
  }

  loadPublishDraftFromStorage();

  try {
    const [accountsPayload, schedulesPayload, clipsPayload] =
      await Promise.allSettled([
        getJsonSafe(`${API_BASE}/accounts`),
        getJsonSafe(`${API_BASE}/schedules`),
        getJsonSafe(`${API_BASE}/clips`),
      ]);

    state.accounts = normalizeAccounts(
      accountsPayload.status === "fulfilled" ? accountsPayload.value : null,
    ).filter((account) => {
      return ["YOUTUBE", "INSTAGRAM"].includes(
        String(account.platform || "").toUpperCase(),
      );
    });

    state.schedules = normalizeSchedules(
      schedulesPayload.status === "fulfilled" ? schedulesPayload.value : null,
    );

    state.clips = normalizeClips(
      clipsPayload.status === "fulfilled" ? clipsPayload.value : null,
    );

    buildAccountsFromSchedulesIfNeeded();
    hydrateClipListFromLocalStorage();
    injectDraftClipIntoClipList();

    renderAccounts();
    renderClips();
    renderStats();
    renderSchedules();

    applyPublishDraftToForm();
    renderSelectedClipPreview();
    updatePublishLiveBadge();
  } catch (error) {
    console.error("Publish center load error:", error);

    if (!silent) {
      showMessage(
        "Some publish data could not load. Refresh or restart server.",
        "error",
      );
    }

    renderStats();
    renderSchedules();
    updatePublishLiveBadge();
  } finally {
    if (!silent) {
      setLoading(false);
    }
  }
}

function getScheduleSignature() {
  return state.schedules
    .map((schedule) => {
      return [
        schedule.id,
        schedule.status,
        schedule.updatedAt,
        schedule.publishedAt,
        schedule.platformPostId,
        schedule.errorMessage,
      ]
        .filter(Boolean)
        .join(":");
    })
    .join("|");
}

function hasActivePublishingJobs() {
  return state.schedules.some((schedule) => {
    return ["DRAFT", "QUEUED", "PROCESSING", "RETRYING"].includes(
      String(schedule.status || "").toUpperCase(),
    );
  });
}

function startPublishRealtimePolling() {
  stopPublishRealtimePolling();

  lastScheduleSignature = getScheduleSignature();

  const tick = async () => {
    if (!document.hidden) {
      await refreshPublishCenterRealtime();
    }

    const nextDelay = hasActivePublishingJobs()
      ? REALTIME_FAST_POLL_MS
      : REALTIME_IDLE_POLL_MS;

    publishRealtimeTimer = window.setTimeout(tick, nextDelay);
  };

  publishRealtimeTimer = window.setTimeout(tick, REALTIME_FAST_POLL_MS);
  updatePublishLiveBadge();
}

function stopPublishRealtimePolling() {
  if (publishRealtimeTimer) {
    window.clearTimeout(publishRealtimeTimer);
    publishRealtimeTimer = null;
  }
}

async function refreshPublishCenterRealtime() {
  if (publishRealtimeInFlight) return;

  publishRealtimeInFlight = true;

  try {
    const before = lastScheduleSignature;

    await loadPublishCenter({
      silent: true,
    });

    const after = getScheduleSignature();

    if (before !== after) {
      lastScheduleSignature = after;
      updatePublishLiveBadge("Updated just now");
    } else {
      updatePublishLiveBadge();
    }
  } catch (error) {
    console.error("Realtime publish refresh error:", error);
    updatePublishLiveBadge("Realtime paused");
  } finally {
    publishRealtimeInFlight = false;
  }
}

function updatePublishLiveBadge(customText = "") {
  let badge = document.getElementById("publishLiveBadge");

  if (!badge) {
    badge = document.createElement("div");
    badge.id = "publishLiveBadge";
    badge.className = "publish-live-badge";

    const topbarActions = document.querySelector(".topbar-actions");
    if (topbarActions) {
      topbarActions.insertBefore(badge, topbarActions.firstChild);
    }
  }

  const active = hasActivePublishingJobs();

  badge.classList.toggle("is-active", active);

  if (customText) {
    badge.textContent = customText;
    return;
  }

  badge.textContent = active ? "Live • watching jobs" : "Live • idle";
}

async function getJsonSafe(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url, {
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

function loadPublishDraftFromStorage() {
  const raw = localStorage.getItem(PUBLISH_DRAFT_KEY);

  if (!raw) {
    state.draft = null;
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    state.draft = parsed && parsed.source === "caption-editor" ? parsed : null;
  } catch {
    state.draft = null;
  }
}

function buildAccountsFromSchedulesIfNeeded() {
  const map = new Map();

  state.accounts.forEach((account) => {
    if (!account?.id) return;
    if (isDemoYoutubeAccount(account)) return;
    map.set(account.id, account);
  });

  state.schedules.forEach((schedule) => {
    const account = schedule.socialAccount;
    if (!account?.id) return;
    if (String(account.platform || "").toUpperCase() !== "YOUTUBE") return;
    if (isDemoYoutubeAccount(account)) return;

    map.set(account.id, account);
  });

  state.accounts = Array.from(map.values());
}

function normalizeAccounts(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;

  return (
    payload.accounts ||
    payload.socialAccounts ||
    payload.data ||
    payload.items ||
    []
  );
}

function normalizeSchedules(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;

  return (
    payload.schedules ||
    payload.scheduledPosts ||
    payload.posts ||
    payload.data ||
    payload.items ||
    []
  );
}

function normalizeClips(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;

  return (
    payload.clips || payload.data?.clips || payload.items || payload.data || []
  );
}

function hydrateClipListFromLocalStorage() {
  const known = new Map();

  state.clips.forEach((clip) => {
    const normalized = normalizeClipObject(clip);
    if (normalized.id) {
      known.set(String(normalized.id), normalized);
    }
  });

  const possibleKeys = [
    "clipflow-clips",
    "clipflow-generated-clips",
    "clipflow-exported-clips",
    "clipflow-caption-clip",
    "clipflow-publish-draft",
  ];

  possibleKeys.forEach((key) => {
    const raw = localStorage.getItem(key);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw);

      const candidates = Array.isArray(parsed)
        ? parsed
        : [
            ...(parsed.clips || []),
            ...(parsed.generatedClips || []),
            ...(parsed.exports || []),
            parsed.clip || null,
          ].filter(Boolean);

      candidates.forEach((clip) => {
        const normalized = normalizeClipObject({
          ...clip,
          title: clip.title || parsed.title || clip.fileName,
        });

        if (normalized.id && !known.has(String(normalized.id))) {
          known.set(String(normalized.id), normalized);
        }
      });
    } catch {
      // ignore invalid localStorage
    }
  });

  state.clips = Array.from(known.values());
}

function normalizeClipObject(clip = {}) {
  const source = getClipSource(clip);
  const fileName =
    clip.fileName ||
    clip.filename ||
    fileNameFromPath(source) ||
    fileNameFromPath(clip.localPath) ||
    fileNameFromPath(clip.filePath) ||
    "";

  const id =
    clip.id ||
    clip.clipId ||
    clip.dbClipId ||
    clip.databaseId ||
    clip.prismaClipId ||
    fileName ||
    `draft-${Date.now()}`;

  return {
    ...clip,
    id,
    clipId: clip.clipId || id,
    title:
      clip.title || clip.name || fileName || "Selected caption editor clip",
    fileName,
    previewUrl: clip.previewUrl || source,
    downloadUrl: clip.downloadUrl || source,
    videoUrl: clip.videoUrl || source,
    directUrl: clip.directUrl || source,
  };
}

function injectDraftClipIntoClipList() {
  if (!state.draft?.clip) return;

  const draftClip = normalizeClipObject({
    ...state.draft.clip,
    title:
      state.draft.title ||
      state.draft.clip.title ||
      state.draft.clip.fileName ||
      "Selected caption editor clip",
  });

  const exists = state.clips.some((clip) => clipsLookSame(clip, draftClip));

  if (!exists) {
    state.clips.unshift(draftClip);
  }
}

function clipsLookSame(a = {}, b = {}) {
  return Boolean(
    (a.id && b.id && String(a.id) === String(b.id)) ||
    (a.previewUrl && b.previewUrl && a.previewUrl === b.previewUrl) ||
    (a.downloadUrl && b.downloadUrl && a.downloadUrl === b.downloadUrl) ||
    (a.videoUrl && b.videoUrl && a.videoUrl === b.videoUrl) ||
    (a.directUrl && b.directUrl && a.directUrl === b.directUrl) ||
    (a.localPath && b.localPath && a.localPath === b.localPath) ||
    (a.filePath && b.filePath && a.filePath === b.filePath) ||
    (a.fileName && b.fileName && a.fileName === b.fileName),
  );
}

function applyPublishDraftToForm() {
  if (!state.draft) return;

  const draftClip = normalizeClipObject(state.draft.clip || {});

  injectDraftClipIntoClipList();

  if (els.clipSelect) {
    const matchingClip = state.clips.find((clip) =>
      clipsLookSame(clip, draftClip),
    );
    if (matchingClip) {
      els.clipSelect.value = matchingClip.id || matchingClip.clipId || "";
    }
  }

  if (els.titleInput) {
    els.titleInput.value =
      state.draft.title || draftClip.title || "YouTube Short";
  }

  if (els.captionInput) {
    els.captionInput.value = state.draft.caption || "";
  }

  if (els.hashtagsInput) {
    els.hashtagsInput.value =
      state.draft.hashtags || "#shorts #youtube #clipflow";
  }

  if (els.scheduledForInput && !els.scheduledForInput.value) {
    setDefaultScheduleTime();
  }

  setDefaultVisibilityPublic();
  renderSelectedClipPreview();
}
function isDemoYoutubeAccount(account = {}) {
  const username = String(
    account.platformUsername || account.username || account.name || "",
  ).toLowerCase();
  const platformUserId = String(account.platformUserId || "").toLowerCase();
  const id = String(account.id || "").toLowerCase();

  return (
    username.includes("demo youtube") ||
    username.includes("demo channel") ||
    platformUserId.includes("demo-channel") ||
    id.includes("demo")
  );
}

function renderAccounts() {
  if (!els.accountSelect) return;

  const currentSelectedValue = els.accountSelect.value;
  const lastSelectedAccountId =
    localStorage.getItem("clipflow-selected-publish-account-id") ||
    localStorage.getItem("clipflow-selected-youtube-account-id");

  const visibleAccounts = state.accounts.filter((account) => {
    const platform = String(account.platform || "").toUpperCase();

    return (
      account &&
      account.id &&
      account.userId &&
      ["YOUTUBE", "INSTAGRAM"].includes(platform) &&
      !account.isSavedChannelLinkOnly &&
      !isDemoYoutubeAccount(account)
    );
  });

  if (!visibleAccounts.length) {
    els.accountSelect.innerHTML = `
      <option value="">No YouTube or Instagram account connected</option>
    `;

    if (els.youtubeConnectHint) {
      els.youtubeConnectHint.textContent =
        "Connect a real YouTube or Instagram account before scheduling.";
    }

    return;
  }

  els.accountSelect.innerHTML = `
    <option value="">Select publish account</option>
    ${visibleAccounts
      .map((account) => {
        const platform = String(account.platform || "").toUpperCase();

        const label =
          account.platformUsername ||
          account.username ||
          account.name ||
          account.platformUserId ||
          account.id;

        const prefix = platform === "INSTAGRAM" ? "Instagram" : "YouTube";

        return `
          <option value="${escapeHtml(account.id)}">
            ${prefix} — ${escapeHtml(label)}
          </option>
        `;
      })
      .join("")}
  `;

  const currentStillExists = visibleAccounts.some((account) => {
    return String(account.id) === String(currentSelectedValue);
  });

  if (currentSelectedValue && currentStillExists) {
    els.accountSelect.value = currentSelectedValue;
    return;
  }

  const lastStillExists = visibleAccounts.some((account) => {
    return String(account.id) === String(lastSelectedAccountId);
  });

  if (lastSelectedAccountId && lastStillExists) {
    els.accountSelect.value = lastSelectedAccountId;
    return;
  }

  if (visibleAccounts.length === 1) {
    els.accountSelect.value = visibleAccounts[0].id;
    localStorage.setItem(
      "clipflow-selected-publish-account-id",
      visibleAccounts[0].id
    );
  }
}

function renderClips() {
  if (!els.clipSelect) return;

  if (!state.clips.length) {
    els.clipSelect.innerHTML = `
      <option value="">No selected clip found</option>
    `;
    return;
  }

  els.clipSelect.innerHTML = `
    ${state.clips
      .map((clip) => {
        const normalized = normalizeClipObject(clip);

        const detail = [
          normalized.aspectRatio,
          normalized.durationSeconds ? `${normalized.durationSeconds}s` : "",
        ]
          .filter(Boolean)
          .join(" · ");

        const label = detail
          ? `${normalized.title} — ${detail}`
          : normalized.title;

        return `<option value="${escapeHtml(normalized.id)}">${escapeHtml(label)}</option>`;
      })
      .join("")}
  `;
}

function renderStats() {
  const realAccounts = state.accounts.filter((account) => {
    return isRealUploadAccount(account);
  });

  const queued = state.schedules.filter((s) => s.status === "QUEUED").length;

  const published = state.schedules.filter(
    (s) => s.status === "PUBLISHED"
  ).length;

  const failed = state.schedules.filter((s) => s.status === "FAILED").length;

  setText(els.accountsCount, realAccounts.length);
  setText(els.queuedCount, queued);
  setText(els.publishedCount, published);
  setText(els.failedCount, failed);
}
function renderSchedules() {
  if (!els.scheduleList) return;

  const filter = els.statusFilter?.value || "ALL";

  const schedules = state.schedules
    .filter((schedule) => {
      const platform = String(schedule.platform || "").toUpperCase();

      if (!["YOUTUBE", "INSTAGRAM"].includes(platform)) {
        return false;
      }

      return filter === "ALL" || schedule.status === filter;
    })
    .sort((a, b) => {
      return (
        new Date(b.createdAt || b.scheduledFor) -
        new Date(a.createdAt || a.scheduledFor)
      );
    });

  if (!schedules.length) {
    els.scheduleList.innerHTML = `
      <div class="empty-state">
        No YouTube or Instagram schedules found.
      </div>
    `;
    return;
  }

  els.scheduleList.innerHTML = schedules.map(renderScheduleItem).join("");
}

function renderScheduleItem(schedule) {
const platform = String(schedule.platform || "YOUTUBE").toUpperCase();
const platformLabel = platform === "INSTAGRAM" ? "Instagram Reel" : "YouTube Post";

const title = schedule.title || `Untitled ${platformLabel}`;
const status = schedule.status || "UNKNOWN";

const accountName =
  schedule.socialAccount?.platformUsername ||
  schedule.socialAccount?.platformUserId ||
  `${platformLabel} account`;
  const clipName =
    schedule.clip?.title ||
    schedule.clip?.fileName ||
    schedule.clipId ||
    "Clip";

  const scheduledFor = schedule.scheduledFor
    ? formatDateTime(schedule.scheduledFor)
    : "No time";

  const publishedAt = schedule.publishedAt
    ? formatDateTime(schedule.publishedAt)
    : "";

  const videoUrl = schedule.platformPostId
    ? `https://www.youtube.com/watch?v=${schedule.platformPostId}`
    : "";

  const studioUrl = schedule.platformPostId
    ? `https://studio.youtube.com/video/${schedule.platformPostId}/edit`
    : "";

  const latestAttempt = Array.isArray(schedule.publishAttempts)
    ? schedule.publishAttempts[schedule.publishAttempts.length - 1]
    : null;

  const responsePayload = latestAttempt?.responsePayloadJson || {};
  const apiStatus = responsePayload.status || {};
  const apiSnippet = responsePayload.snippet || {};
  const apiChannelId =
    apiSnippet.channelId || schedule.socialAccount?.platformUserId || "";
  const apiUploadStatus = apiStatus.uploadStatus || "";
  const apiPrivacyStatus = apiStatus.privacyStatus || schedule.visibility || "";

  const canEdit = ["DRAFT", "QUEUED", "FAILED", "RETRYING"].includes(status);
  const canCancel = ["DRAFT", "QUEUED", "FAILED", "RETRYING"].includes(status);
  const canRetry = ["FAILED", "CANCELLED"].includes(status);
  const canRunNow = ["DRAFT", "QUEUED", "FAILED", "RETRYING"].includes(status);

  return `
    <article class="schedule-item">
      <div class="schedule-main">
        <div>
          <div class="schedule-title-row">
            <div class="schedule-title">${escapeHtml(title)}</div>
            <span class="status-badge status-${escapeHtml(status)}">${escapeHtml(status)}</span>
          </div>

          <div class="schedule-meta">
            <span class="meta-chip">Account: ${escapeHtml(accountName)}</span>
            <span class="meta-chip">Clip: ${escapeHtml(clipName)}</span>
            <span class="meta-chip">Visibility: ${escapeHtml(schedule.visibility || "private")}</span>
            <span class="meta-chip">Scheduled: ${escapeHtml(scheduledFor)}</span>
            ${
              publishedAt
                ? `<span class="meta-chip">Published: ${escapeHtml(publishedAt)}</span>`
                : ""
            }
          </div>
          ${
            schedule.platformPostId
              ? `<div class="youtube-debug-box">
        <strong>YouTube ID:</strong> ${escapeHtml(schedule.platformPostId)}
        ${apiChannelId ? `<span><strong>Channel ID:</strong> ${escapeHtml(apiChannelId)}</span>` : ""}
        ${apiUploadStatus ? `<span><strong>Upload:</strong> ${escapeHtml(apiUploadStatus)}</span>` : ""}
        ${apiPrivacyStatus ? `<span><strong>Privacy:</strong> ${escapeHtml(apiPrivacyStatus)}</span>` : ""}
      </div>`
              : ""
          }
        </div>

        <div class="schedule-actions">
          ${
            canEdit
              ? `<button class="action-btn" data-action="edit" data-id="${escapeHtml(schedule.id)}">Edit</button>`
              : ""
          }
          ${
            canCancel
              ? `<button class="action-btn danger" data-action="cancel" data-id="${escapeHtml(schedule.id)}">Cancel</button>`
              : ""
          }
          ${
            canRetry
              ? `<button class="action-btn green" data-action="retry" data-id="${escapeHtml(schedule.id)}">Retry</button>`
              : ""
          }
          ${
            canRunNow
              ? `<button class="action-btn blue" data-action="run-now" data-id="${escapeHtml(schedule.id)}">Run Now</button>`
              : ""
          }
          ${
            videoUrl
              ? `<a class="action-btn green" href="${escapeHtml(videoUrl)}" target="_blank" rel="noopener">Open Video</a>`
              : ""
          }
          ${
            studioUrl
              ? `<a class="action-btn blue" href="${escapeHtml(studioUrl)}" target="_blank" rel="noopener">Open Studio</a>`
              : ""
          }
        </div>
      </div>

      ${
        schedule.caption || schedule.hashtags
          ? `<div class="schedule-caption">
              ${escapeHtml([schedule.caption, schedule.hashtags].filter(Boolean).join(" "))}
            </div>`
          : ""
      }

      ${
        schedule.errorMessage
          ? `<div class="error-text">${escapeHtml(schedule.errorMessage)}</div>`
          : ""
      }
    </article>
  `;
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
    ""
  );
}

function getSelectedClipObject() {
  const selectedId = els.clipSelect?.value || "";

  if (selectedId) {
    const found = state.clips.find((clip) => {
      const normalized = normalizeClipObject(clip);
      return String(normalized.id) === String(selectedId);
    });

    if (found) return normalizeClipObject(found);
  }

  if (state.draft?.clip) {
    return normalizeClipObject(state.draft.clip);
  }

  return null;
}

function renderSelectedClipPreview() {
  if (!els.selectedClipPreview) return;

  const clip = getSelectedClipObject();

  if (!clip) {
    els.selectedClipPreview.classList.add("is-empty");

    if (els.selectedClipVideo) {
      els.selectedClipVideo.hidden = true;
      els.selectedClipVideo.removeAttribute("src");
      els.selectedClipVideo.load();
    }

    if (els.selectedClipFallback) {
      els.selectedClipFallback.hidden = false;
      els.selectedClipFallback.innerHTML = "<span>No clip selected</span>";
    }

    if (els.selectedClipTitle) {
      els.selectedClipTitle.textContent = "No clip selected yet";
    }

    if (els.selectedClipMeta) {
      els.selectedClipMeta.textContent =
        "Choose a clip or use the Publish button from caption editor.";
    }

    return;
  }

  els.selectedClipPreview.classList.remove("is-empty");

  const source = getClipSource(clip);

  if (els.selectedClipTitle) {
    els.selectedClipTitle.textContent = clip.title || "Selected clip";
  }

  if (els.selectedClipMeta) {
    const details = [
      clip.aspectRatio || "9:16",
      clip.durationSeconds ? `${clip.durationSeconds}s` : "",
      "Ready to schedule",
    ]
      .filter(Boolean)
      .join(" · ");

    els.selectedClipMeta.textContent = details;
  }

  if (source && els.selectedClipVideo) {
    els.selectedClipVideo.hidden = false;

    if (els.selectedClipVideo.getAttribute("src") !== source) {
      els.selectedClipVideo.src = source;
      els.selectedClipVideo.load();
    }

    if (els.selectedClipFallback) {
      els.selectedClipFallback.hidden = true;
    }
  } else {
    if (els.selectedClipVideo) {
      els.selectedClipVideo.hidden = true;
      els.selectedClipVideo.removeAttribute("src");
      els.selectedClipVideo.load();
    }

    if (els.selectedClipFallback) {
      els.selectedClipFallback.hidden = false;
      els.selectedClipFallback.innerHTML = "<span>Clip selected</span>";
    }
  }
}

async function prepareSelectedClipForScheduling(userId) {
  const clip = getSelectedClipObject();

  if (!clip) {
    throw new Error("Please select a clip first.");
  }

  const response = await fetch(`${API_BASE}/publish/prepare-clip`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      userId,
      clip,
    }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      data?.details ||
        data?.error ||
        "Could not prepare the selected clip for publishing.",
    );
  }

  if (!data?.clip?.id) {
    throw new Error("Prepared clip was missing from server response.");
  }

  return data.clip;
}

function isRealUploadAccount(account = {}) {
  return Boolean(
    account &&
    account.id &&
    account.userId &&
    !account.isSavedChannelLinkOnly &&
    ["YOUTUBE", "INSTAGRAM"].includes(
      String(account.platform || "").toUpperCase(),
    ) &&
    !isDemoYoutubeAccount(account),
  );
}

async function handleCreateSchedule(event) {
  event.preventDefault();
  clearMessage();

  const account = getSelectedRealPublishAccount();
  const platform = String(account?.platform || "").toUpperCase();
  const platformLabel = platform === "INSTAGRAM" ? "Instagram Reel" : "YouTube post";

  if (!account) {
    showMessage(
      "Please select the real YouTube or Instagram account you want to publish to.",
      "error",
    );
    return;
  }

  const selectedClip = getSelectedClipObject();

  if (!selectedClip) {
    showMessage("Please select a clip first.", "error");
    renderSelectedClipPreview();
    return;
  }

  const scheduledFor = fromLocalInputDateTime(els.scheduledForInput.value);

  if (!scheduledFor || new Date(scheduledFor).getTime() <= Date.now()) {
    showMessage("Schedule time must be in the future.", "error");
    return;
  }

  try {
    setSubmittingSchedule(true);

    showMessage(
      `Preparing selected clip for ${account.platformUsername || "selected account"}...`,
      "success",
    );

    const preparedClip = await prepareSelectedClipForScheduling(account.userId);

    showMessage(
      `Creating ${platformLabel} schedule for ${account.platformUsername || "selected account"}...`,
      "success",
    );

    const body = {
      userId: account.userId,
      socialAccountId: account.id,
      clipId: preparedClip.id,
      platform,
      title: els.titleInput.value.trim(),
      caption: els.captionInput.value.trim(),
      hashtags: els.hashtagsInput.value.trim(),
      visibility:
        platform === "INSTAGRAM"
          ? "public"
          : els.visibilitySelect.value || "public",
      scheduledFor,
    };

    const response = await fetch(`${API_BASE}/schedules`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(
        data?.details ||
          data?.error ||
          "Failed to create schedule.",
      );
    }

    localStorage.setItem("clipflow-selected-publish-account-id", account.id);
    localStorage.setItem("clipflow-selected-youtube-account-id", account.id);
    localStorage.removeItem(PUBLISH_DRAFT_KEY);

    showMessage(
      `${platformLabel} scheduled for ${account.platformUsername || "selected account"}. Watching status live...`,
      "success",
    );

    await loadPublishCenter({
      silent: true,
    });

    if (typeof startPublishRealtimePolling === "function") {
      startPublishRealtimePolling();
    }
  } catch (error) {
    console.error("Create schedule error:", error);
    showMessage(error.message || "Failed to create schedule.", "error");
  } finally {
    setSubmittingSchedule(false);
  }
}

function getSelectedRealYoutubeAccount() {
  const selectedAccountId = els.accountSelect?.value || "";

  if (!selectedAccountId) {
    return null;
  }

  const account = state.accounts.find((item) => {
    return String(item.id) === String(selectedAccountId);
  });

  if (
    account &&
    account.id &&
    account.userId &&
    String(account.platform || "").toUpperCase() === "YOUTUBE" &&
    !account.isSavedChannelLinkOnly &&
    !isDemoYoutubeAccount(account)
  ) {
    return account;
  }

  return null;
}

function getSelectedRealPublishAccount() {
  const selectedAccountId = els.accountSelect?.value || "";

  if (!selectedAccountId) {
    return null;
  }

  const account = state.accounts.find((item) => {
    return String(item.id) === String(selectedAccountId);
  });

  if (isRealUploadAccount(account)) {
    return account;
  }

  return null;
}

function getSelectedRealYoutubeAccount() {
  return getSelectedRealPublishAccount();
}

function handleScheduleAction(action, id) {
  const schedule = state.schedules.find((item) => item.id === id);
  if (!schedule) return;

  if (action === "edit") {
    openEditModal(schedule);
    return;
  }

  if (action === "cancel") {
    runScheduleMutation(id, "cancel", "Schedule cancelled.");
    return;
  }

  if (action === "retry") {
    runScheduleMutation(id, "retry", "Schedule retried.");
    return;
  }

  if (action === "run-now") {
    runScheduleMutation(id, "run-now", "Schedule is running now.");
  }
}

async function runScheduleMutation(id, endpoint, successMessage) {
  clearMessage();

  try {
    setLoading(true);

    const response = await fetch(`${API_BASE}/schedules/${id}/${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(
        data?.details || data?.error || "Schedule action failed.",
      );
    }

    showMessage(successMessage, "success");
    await loadPublishCenter({
      silent: true,
    });

    startPublishRealtimePolling();
  } catch (error) {
    console.error("Schedule mutation error:", error);
    showMessage(error.message || "Schedule action failed.", "error");
  } finally {
    setLoading(false);
  }
}

function openEditModal(schedule) {
  if (!schedule || !schedule.id || !els.editModal) return;

  clearEditMessage();

  if (els.editScheduleId) els.editScheduleId.value = schedule.id || "";
  if (els.editTitleInput) els.editTitleInput.value = schedule.title || "";
  if (els.editCaptionInput) els.editCaptionInput.value = schedule.caption || "";
  if (els.editHashtagsInput)
    els.editHashtagsInput.value = schedule.hashtags || "";
  if (els.editVisibilitySelect)
    els.editVisibilitySelect.value = schedule.visibility || "private";

  const currentScheduleTime = schedule.scheduledFor
    ? new Date(schedule.scheduledFor)
    : new Date(Date.now() + 30 * 60 * 1000);

  const safeFutureTime =
    currentScheduleTime.getTime() <= Date.now()
      ? new Date(Date.now() + 30 * 60 * 1000)
      : currentScheduleTime;

  if (els.editScheduledForInput) {
    els.editScheduledForInput.value = toLocalInputDateTime(safeFutureTime);
    els.editScheduledForInput.min = toLocalInputDateTime(
      new Date(Date.now() + 60 * 1000),
    );
  }

  els.editModal.hidden = false;
  els.editModal.style.display = "grid";
  els.editModal.classList.add("is-open");
  document.body.style.overflow = "hidden";
}

function closeEditModal() {
  if (!els.editModal) return;

  clearEditMessage();

  els.editModal.classList.remove("is-open");
  els.editModal.hidden = true;
  els.editModal.style.display = "none";
  document.body.style.overflow = "";

  if (els.editForm) {
    els.editForm.reset();
  }

  if (els.editScheduleId) {
    els.editScheduleId.value = "";
  }
}

async function handleEditSchedule(event) {
  event.preventDefault();
  event.stopPropagation();

  clearMessage();
  clearEditMessage();

  const id = els.editScheduleId?.value || "";
  const scheduledFor = fromLocalInputDateTime(
    els.editScheduledForInput?.value || "",
  );

  if (!id) {
    showEditMessage("Schedule ID missing. Close modal and try again.", "error");
    return;
  }

  if (!scheduledFor || new Date(scheduledFor).getTime() <= Date.now()) {
    showEditMessage("Schedule time must be in the future.", "error");
    return;
  }

  const body = {
    title: els.editTitleInput.value.trim(),
    caption: els.editCaptionInput.value.trim(),
    hashtags: els.editHashtagsInput.value.trim(),
    visibility: els.editVisibilitySelect.value,
    scheduledFor,
  };

  try {
    setLoading(true);

    const response = await fetch(`${API_BASE}/schedules/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(
        data?.details ||
          data?.error ||
          data?.message ||
          "Failed to update schedule.",
      );
    }

    closeEditModal();
    showMessage("Schedule updated successfully.", "success");
    await loadPublishCenter();
  } catch (error) {
    console.error("Edit schedule error:", error);
    showEditMessage(error.message || "Failed to update schedule.", "error");
  } finally {
    setLoading(false);
  }
}

function setDefaultScheduleTime() {
  if (!els.scheduledForInput) return;

  const future = new Date(Date.now() + 30 * 60 * 1000);
  els.scheduledForInput.value = toLocalInputDateTime(future);
  els.scheduledForInput.min = toLocalInputDateTime(
    new Date(Date.now() + 60 * 1000),
  );
}
function setDefaultVisibilityPublic() {
  if (els.visibilitySelect && !els.visibilitySelect.value) {
    els.visibilitySelect.value = "public";
  }

  if (els.visibilitySelect && els.visibilitySelect.value === "private") {
    els.visibilitySelect.value = "public";
  }
}

function toLocalInputDateTime(dateValue) {
  const date = new Date(dateValue);
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function fromLocalInputDateTime(value) {
  if (!value) return "";
  return new Date(value).toISOString();
}

function isEditModalOpen() {
  return Boolean(
    els.editModal &&
    !els.editModal.hidden &&
    els.editModal.classList.contains("is-open"),
  );
}

function forceCloseEditModal() {
  if (!els.editModal) return;

  els.editModal.hidden = true;
  els.editModal.classList.remove("is-open");
  els.editModal.style.display = "none";
  document.body.style.overflow = "";
}

function showEditMessage(message, type = "error") {
  if (!els.editForm) return;

  let messageBox = document.getElementById("editFormMessage");

  if (!messageBox) {
    messageBox = document.createElement("p");
    messageBox.id = "editFormMessage";
    messageBox.className = "edit-form-message";
    els.editForm.appendChild(messageBox);
  }

  messageBox.textContent = message;
  messageBox.className = `edit-form-message is-${type}`;
}

function clearEditMessage() {
  const messageBox = document.getElementById("editFormMessage");
  if (!messageBox) return;

  messageBox.textContent = "";
  messageBox.className = "edit-form-message";
}

function setLoading(isLoading) {
  state.loading = isLoading;

  if (els.refreshBtn) {
    els.refreshBtn.disabled = isLoading;
  }
}

function setSubmittingSchedule(isSubmitting) {
  isSubmittingSchedule = isSubmitting;

  const submitButton = els.scheduleForm?.querySelector("button[type='submit']");

  if (submitButton) {
    submitButton.disabled = isSubmitting;
    submitButton.textContent = isSubmitting
      ? "Scheduling..."
      : "Schedule YouTube Post";
  }
}

function showMessage(message, type = "success") {
  if (!els.formMessage) return;

  els.formMessage.textContent = message;
  els.formMessage.className = `form-message is-${type}`;
}

function clearMessage() {
  if (!els.formMessage) return;

  els.formMessage.textContent = "";
  els.formMessage.className = "form-message";
}

function setText(element, value) {
  if (element) {
    element.textContent = String(value);
  }
}

function formatDateTime(value) {
  if (!value) return "";

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function fileNameFromPath(value = "") {
  try {
    const clean = String(value || "")
      .split("?")[0]
      .replace(/\\/g, "/");
    return clean.split("/").pop() || "";
  } catch {
    return "";
  }
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
