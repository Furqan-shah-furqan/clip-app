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
    const value = Math.max(0, Math.min(100, parseFloat(byId('progressPercent').textContent) || 0));
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
    hero.dataset.loading = String(value > 0 && value < 100);
    status.textContent = byId('progressLabel').textContent.trim().replace(/^•\s*/, '') || 'Add a video to get started';
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
