/* One persisted preference across the Studio, editor, account and public pages. */
(() => {
  let syncing = false;
  function sync() {
    if (syncing) return;
    syncing = true;
    let dark = true;
    try { dark = localStorage.getItem('clipflow-theme') !== 'light'; } catch {}
    for (const node of [document.documentElement, document.body]) {
      node.classList.toggle('theme-dark', dark);
      node.classList.toggle('theme-light', !dark);
      if (node.dataset.cfTheme !== (dark ? 'dark' : 'light')) node.dataset.cfTheme = dark ? 'dark' : 'light';
    }
    syncing = false;
  }
  sync();
  // Existing page handlers own toggles; synchronize their result after they run.
  document.addEventListener('click', event => {
    if (event.target.closest('#themeSwitchBtn,#themeButton,#publicThemeButton')) queueMicrotask(sync);
  });
  addEventListener('storage', event => { if (event.key === 'clipflow-theme') sync(); });
})();
