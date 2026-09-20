(function (root) {
  function model({ clips = [], estimate = null, generating = false, completed = false } = {}) {
    const ready = clips.length;
    const known = Number.isFinite(estimate) && estimate > 0;
    const phase = generating ? 'loading' : completed || ready ? 'completed' : known ? 'estimated' : 'neutral';
    const total = phase === 'completed' ? ready : Math.max(ready, known ? Math.ceil(estimate) : 0);
    const active = total ? generating ? Math.min(ready, total - 1) : 0 : -1;
    return { phase, ready, total, estimate: known ? Math.ceil(estimate) : null, active,
      slots: Array.from({ length: total }, (_, index) => ({ index, clip: clips[index] || null, active: index === active })) };
  }
  function gridHtml(view, renderClip) {
    if (!view.total) return `<p class="smart-results-empty" role="status">${view.phase === 'completed' ? 'No clips were generated.' : view.phase === 'loading' ? 'Preparing your clips…' : 'Add a video to estimate your output.'}</p>`;
    return view.slots.map(slot => slot.clip
      ? renderClip(slot.clip, slot.index).replace('class="clip-card ', `class="clip-card smart-result-slot${slot.active ? ' is-current' : ''} `)
      : `<div class="smart-result-slot expected-preview${slot.active ? ' is-current' : ''}" aria-label="Estimated clip ${slot.index + 1}${slot.active && view.phase === 'loading' ? ', generating' : ''}"><span aria-hidden="true">▷</span></div>`).join('');
  }
  const api = { model, gridHtml };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SmartResults = api;
})(typeof window === 'undefined' ? this : window);
