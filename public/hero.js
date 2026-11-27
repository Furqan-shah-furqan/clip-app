/* Presentation adapter only. Existing app.js remains the sole generation owner. */
(() => {
  const byId = id => document.getElementById(id);
  const hero = document.querySelector('.hero-reference');
  if (!hero) return;
  const gauge = byId('heroLoadingGauge'), percent = byId('heroLoadingPercent');
  const arc = byId('heroLoadingArc'), status = byId('heroLoadingStatus');
  const generationStage = byId('heroGenerationStage');
  const video = byId('heroMediaVideo'), poster = byId('heroMediaPoster');
  const empty = byId('heroMediaEmpty'), thumb = byId('ytThumb');
  const generateButton = byId('smartClipBtn');
  const generateLabel = generateButton?.parentElement.querySelector('.text-overlay');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let displayed = 0, target = -1, frame = 0, objectUrl = '';
  if (generateButton && generateLabel) {
    const syncGenerateLabel = () => { generateLabel.textContent = generateButton.textContent.trim() || 'Generate clips'; };
    new MutationObserver(syncGenerateLabel).observe(generateButton, { childList: true, characterData: true, subtree: true });
    syncGenerateLabel();
  }
  document.getElementById('clipCardUpload')?.addEventListener('click', () => document.getElementById('videoInput').click());
  function paint(value) {
    const circumference = 2 * Math.PI * 60;
    [[0,10],[10,40],[40,80],[80,100]].forEach(([a,b],i) => {
      document.getElementById('clipCardSeg'+i)?.setAttribute('stroke-dasharray', `${Math.max(0, Math.min(value,b)-a)*circumference/100} ${circumference}`);
    });
    displayed = value;
    percent.textContent = `${Math.round(value)}%`;
    if (arc) arc.style.strokeDasharray = `${231 * value / 100} 308`;
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
      status.textContent = 'Frame Editor';
      generationStage.textContent = window.state?.uploadedProject ? 'Ready to frame your clip' : 'Add a video to get started';
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
    status.disabled = true;
    const nextStage = byId('progressLabel').textContent.trim() || 'Analyzing your video';
    if (generationStage.textContent !== nextStage) {
      generationStage.textContent = nextStage;
      if (!reduced.matches) generationStage.animate([{opacity:0,transform:'translateY(4px)'},{opacity:1,transform:'translateY(0)'}],{duration:220,easing:'cubic-bezier(.23,1,.32,1)'});
    }
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
  const editor = byId('clipEditorDialog');
  const layout = editor?.querySelector('.clip-editor-layout');
  let sizingFrame = 0;
  const sizeEditorPreviews = () => {
    cancelAnimationFrame(sizingFrame);
    sizingFrame = requestAnimationFrame(() => {
      if (!editor?.open || !layout) return;
      const style = getComputedStyle(layout);
      const width = layout.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const height = layout.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      const gap = parseFloat(style.columnGap) || 16;
      const sharedHeight = Math.max(1, Math.floor(Math.min(height, (width - gap) * .25 * 16 / 9)));
      layout.style.setProperty('--editor-preview-height', `${sharedHeight}px`);
    });
  };
  if (editor && layout) {
    new ResizeObserver(sizeEditorPreviews).observe(layout);
    new MutationObserver(sizeEditorPreviews).observe(editor, { attributes:true, attributeFilter:['open'] });
  }
  sync();
})();
