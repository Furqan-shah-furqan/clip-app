(() => {
  const form = document.getElementById("creatorForm");
  if (!form) return;
  const input = document.getElementById("creatorUrl");
  const submit = document.getElementById("addCreatorButton");
  const status = document.getElementById("creatorStatus");
  const setup = document.getElementById("creatorSetup");
  const list = document.getElementById("creatorList");
  const count = document.getElementById("creatorCount");
  let channels = [];
  let setupReady = true;

  const request = async (url, options = {}) => {
    const response = await fetch(url, {
      credentials: "same-origin",
      ...options,
      headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) },
    });
    let data = {};
    try { data = await response.json(); } catch { /* response may be empty */ }
    if (!response.ok) {
      const error = new Error(data.error || `Request failed (${response.status})`);
      Object.assign(error, data);
      throw error;
    }
    return data;
  };
  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };
  const escapeUrl = value => {
    try {
      const url = new URL(value);
      return ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtu.be"].includes(url.hostname.toLowerCase()) ? url.href : "#";
    } catch { return "#"; }
  };
  const safeImageUrl = value => {
    try { const url = new URL(value); return url.protocol === "https:" ? url.href : "/favicon.ico"; }
    catch { return "/favicon.ico"; }
  };
  const dateLabel = value => {
    if (!value) return "Recently detected";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Recently detected" : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  };
  const jobLabel = video => {
    const state = video.generationJob?.status || video.status;
    return ({ QUEUED: "Queued", QUEUEING: "Queueing", TRANSCRIBING: "Finding moments", ANALYZING: "Finding moments", SELECTING_MOMENTS: "Selecting clips", DOWNLOADING: "Downloading", RENDERING: "Rendering clips", FINALIZING: "Finishing clips", AWAITING_UPLOAD: "Preparing clips", COMPLETED: "Clips ready", FAILED: "Generation failed", CANCELLED: "Cancelled" })[state] || "Queued";
  };
  const renderUpload = video => {
    const row = make("div", "creator-upload");
    const left = make("div", "creator-upload-copy");
    const link = make("a", "creator-upload-title", video.title || "New upload");
    link.href = escapeUrl(video.videoUrl);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    left.append(link, make("p", "creator-upload-meta", `Uploaded ${dateLabel(video.publishedAt)}`));
    const right = make("div");
    const state = video.generationJob?.status || video.status;
    const stateLabel = make("span", "creator-upload-status", jobLabel(video));
    stateLabel.dataset.status = state;
    right.append(stateLabel);
    if (state === "FAILED") {
      const retry = make("button", "creator-action", "Retry clips");
      retry.type = "button";
      retry.dataset.action = "retry-video";
      retry.dataset.channelId = video.creatorChannelId;
      retry.dataset.videoId = video.id;
      right.append(retry);
    }
    row.append(left, right);
    const clips = video.generationJob?.clips || [];
    if (clips.length) {
      const output = make("div", "creator-generated-clips");
      output.setAttribute("aria-label", "Generated clips");
      for (const [index, clip] of clips.entries()) {
        const card = make("article", "creator-generated-clip");
        const player = make("video", "creator-generated-preview");
        player.src = clip.downloadUrl;
        player.controls = true;
        player.preload = "metadata";
        player.playsInline = true;
        player.setAttribute("aria-label", `Preview ${clip.title || `clip ${index + 1}`}`);
        const title = make("span", "creator-generated-title", clip.title || `Clip ${index + 1}`);
        const download = make("a", "creator-generated-download", "Download");
        download.href = clip.downloadUrl;
        download.download = "";
        download.rel = "noopener noreferrer";
        card.append(player, title, download);
        output.append(card);
      }
      row.append(output);
    }
    return row;
  };
  const renderChannel = channel => {
    const card = make("article", "creator-channel-card");
    const head = make("div", "creator-channel-head");
    const avatar = make("img", "creator-avatar");
    avatar.alt = "";
    avatar.loading = "lazy";
    avatar.src = safeImageUrl(channel.thumbnailUrl);
    avatar.addEventListener("error", () => { avatar.hidden = true; }, { once: true });
    const title = make("div", "creator-channel-title");
    title.append(make("strong", "", channel.title));
    const channelLink = make("a", "", channel.channelUrl);
    channelLink.href = escapeUrl(channel.channelUrl);
    channelLink.target = "_blank";
    channelLink.rel = "noopener noreferrer";
    title.append(channelLink);
    const actions = make("div", "creator-channel-actions");
    const state = make("span", "creator-state", channel.active
      ? ({ ACTIVE: "Monitoring", PENDING: "Awaiting YouTube", ERROR: "Needs attention", UNSUBSCRIBING: "Updating" })[channel.subscriptionStatus] || "Connecting"
      : "Paused");
    state.dataset.state = channel.active ? channel.subscriptionStatus : "INACTIVE";
    actions.append(state);
    if (channel.active && channel.subscriptionStatus !== "ACTIVE") {
      const retry = make("button", "creator-action", "Retry connection");
      retry.type = "button";
      retry.dataset.action = "retry-connection";
      retry.dataset.channelId = channel.id;
      actions.append(retry);
    }
    const toggle = make("button", "creator-action", channel.active ? "Pause" : "Resume");
    toggle.type = "button";
    toggle.dataset.action = "toggle";
    toggle.dataset.channelId = channel.id;
    toggle.dataset.active = String(channel.active);
    actions.append(toggle);
    const remove = make("button", "creator-action", "Remove");
    remove.type = "button";
    remove.dataset.action = "remove";
    remove.dataset.channelId = channel.id;
    actions.append(remove);
    head.append(avatar, title, actions);
    card.append(head);

    if (channel.lastError) card.append(make("p", "creator-channel-error", channel.lastError));
    const activity = make("div", "creator-upload-list");
    activity.append(make("h3", "", "Recent new uploads"));
    if (channel.videos.length) channel.videos.forEach(video => {
      video.creatorChannelId = channel.id;
      activity.append(renderUpload(video));
    });
    else activity.append(make("div", "creator-empty", channel.active ? "Waiting for the next upload" : "Monitoring is paused"));
    card.append(activity);
    return card;
  };
  const draw = () => {
    count.textContent = `${channels.length} / 20`;
    list.replaceChildren();
    if (!channels.length) {
      const empty = make("div", "creator-empty");
      empty.append(make("strong", "", "No creators monitored yet"), make("span", "", "Add a channel above. New uploads will appear here as ClipFlow queues their clips."));
      list.append(empty);
      return;
    }
    channels.forEach(channel => list.append(renderChannel(channel)));
  };
  const load = async () => {
    list.setAttribute("aria-busy", "true");
    try {
      const data = await request("/api/creators");
      channels = data.channels || [];
      const issues = data.setupIssues || [];
      setupReady = issues.length === 0;
      setup.hidden = setupReady;
      setup.textContent = issues.join(" ");
      submit.disabled = !setupReady;
      draw();
      if (!status.classList.contains("is-error")) status.textContent = "";
    } catch (error) {
      list.replaceChildren(make("div", "creator-empty", error.message));
    } finally { list.removeAttribute("aria-busy"); }
  };
  const showError = message => { status.textContent = message; status.classList.add("is-error"); };
  form.addEventListener("submit", async event => {
    event.preventDefault();
    submit.disabled = true;
    status.classList.remove("is-error");
    status.textContent = "Resolving the YouTube channel and enabling upload notifications…";
    try {
      const data = await request("/api/creators", { method: "POST", body: JSON.stringify({ url: input.value }) });
      input.value = "";
      status.textContent = data.message || "Creator added.";
      await load();
    } catch (error) {
      showError(error.message);
      if (error.channelId) await load();
    } finally { submit.disabled = !setupReady; }
  });
  document.getElementById("refreshCreators").addEventListener("click", load);
  list.addEventListener("click", async event => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const { action, channelId, active, videoId } = button.dataset;
    button.disabled = true;
    status.classList.remove("is-error");
    try {
      if (action === "toggle") await request(`/api/creators/${encodeURIComponent(channelId)}`, { method: "PATCH", body: JSON.stringify({ active: active !== "true" }) });
      if (action === "retry-connection") await request(`/api/creators/${encodeURIComponent(channelId)}/retry-connection`, { method: "POST", body: "{}" });
      if (action === "remove") {
        if (!window.confirm("Remove this creator and stop monitoring new uploads?")) { button.disabled = false; return; }
        await request(`/api/creators/${encodeURIComponent(channelId)}`, { method: "DELETE" });
      }
      if (action === "retry-video") await request(`/api/creators/${encodeURIComponent(channelId)}/videos/${encodeURIComponent(videoId)}/retry`, { method: "POST", body: "{}" });
      status.textContent = action === "retry-connection" ? "Reconnection requested." : action === "retry-video" ? "Clip generation queued again." : "Creator monitor updated.";
      await load();
    } catch (error) { showError(error.message); button.disabled = false; }
  });
  load();
  window.setInterval(load, 30000);
})();
