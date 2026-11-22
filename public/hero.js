/* Presentation adapter only. Existing app.js remains the sole generation owner. */
(() => {
  const byId = id => document.getElementById(id);
  const hero = document.querySelector('.hero-reference');
  if (!hero) return;
  const gauge = byId('heroLoadingGauge'), percent = byId('heroLoadingPercent');
  const arc = byId('heroLoadingArc'), status = byId('heroLoadingStatus');
  const video = byId('heroMediaVideo'), poster = byId('heroMediaPoster');
  const empty = byId('heroMediaEmpty'), thumb = byId('ytThumb');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let displayed = 0, target = -1, frame = 0, objectUrl = '';
  function paint(value) {
    displayed = value;
    percent.textContent = `${Math.round(value)}%`;
    arc.style.strokeDasharray = `${231 * value / 100} 308`;
  }
  function sync() {
    const isGenerating = Boolean(window.state?.isGenerating);
    const value = isGenerating ? Math.max(0, Math.min(100, parseFloat(byId('progressPercent').textContent) || 0)) : 0;
    hero.dataset.loading = String(isGenerating);
    if (!isGenerating) {
      cancelAnimationFrame(frame);
      target = 0;
      paint(0);
      percent.textContent = 'Ready';
      gauge.setAttribute('aria-valuenow', '0');
      status.textContent = window.state?.uploadedProject ? 'Open the editor to frame your clip' : 'Add a video to get started';
      status.disabled = !window.state?.uploadedProject;
      return;
    }
    if (value !== target) {
      target = value;
      cancelAnimationFrame(frame);
      gauge.setAttribute('aria-valuenow', String(value));
      const from = displayed, start = performance.now();
      function tick(now) {
        const elapsed = reduced.matches ? 1 : Math.min(1, (now - start) / 350);
        paint(from + (value - from) * elapsed);
        if (elapsed < 1) frame = requestAnimationFrame(tick);
      }
      frame = requestAnimationFrame(tick);
    }
    status.textContent = byId('progressLabel').textContent.trim().replace(/^•\s*/, '') || 'Finding strong moments';
    const image = thumb.getAttribute('src');
    if (!objectUrl && image && thumb.style.display !== 'none') {
      if (poster.getAttribute('src') !== image) poster.src = image;
      poster.hidden = false; empty.hidden = true;
    } else if (!objectUrl) { poster.hidden = true; empty.hidden = false; }
  }
  const observer = new MutationObserver(sync);
  for (const id of ['progressPercent','progressLabel','ytThumb']) {
    observer.observe(byId(id), {childList:true,subtree:true,characterData:true,attributes:true});
  }
  status.addEventListener('click', () => {
    if (status.disabled || window.state?.isGenerating) return;
    byId('smartClipBtn')?.click();
  });
  function clearMedia() {
    video.pause(); video.removeAttribute('src'); video.load(); video.hidden = true;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = ''; poster.hidden = true; empty.hidden = false; byId('heroMediaBadge').textContent = 'Source preview';
  }
  byId('videoInput').addEventListener('change', event => {
    const file = event.target.files?.[0];
    if (!file) return;
    clearMedia(); objectUrl = URL.createObjectURL(file); video.src = objectUrl;
    video.hidden = false; empty.hidden = true;
  });
  byId('ytUrlInput').addEventListener('input', () => { clearMedia(); sync(); });
  byId('clearUrlBtn').addEventListener('click', clearMedia);
  video.addEventListener('error', () => { clearMedia(); byId('heroMediaBadge').textContent = 'Preview unavailable'; });
  addEventListener('pagehide', () => { cancelAnimationFrame(frame); video.pause(); });
  addEventListener('pageshow', () => { target = -1; sync(); });
  sync();
})();
