(() => {
  const header = document.querySelector('header');
  if (!header) return;
  const icon = paths => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  const gear = icon('<path d="m9 3-.6 2.3-2 .9-2.1-.6L2 9.4l1.6 1.7v1.8L2 14.6l2.3 3.8 2.1-.6 2 .9L9 21h6l.6-2.3 2-.9 2.1.6 2.3-3.8-1.6-1.7v-1.8L22 9.4l-2.3-3.8-2.1.6-2-.9L15 3Z"/><circle cx="12" cy="12" r="3"/>');
  const person = icon('<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>');
  const arrow = icon('<path d="m14 6-6 6 6 6M8 12h12"/>');
  const theme = document.querySelector('#themeSwitchBtn, #publicThemeButton, #themeButton');
  const navigation = document.createElement('nav');
  navigation.className = 'cf-navigation';
  navigation.setAttribute('aria-label', 'Settings and profile');
  navigation.innerHTML = `<details class="cf-settings-menu"><summary class="cf-icon-control" aria-label="Settings and information" title="Settings and information">${gear}</summary><div class="cf-settings-links"><a href="/settings.html">Settings</a><a href="/welcome.html">About ClipFlow</a><a href="/privacy.html">Privacy Policy</a><a href="/terms.html">Terms</a><a href="/support.html">Support</a></div></details><details class="cf-profile-menu"><summary class="cf-icon-control" aria-label="Your profile" title="Your profile">${person}</summary><div class="cf-settings-links"><a href="/profile.html">Your profile</a><a href="/account.html" data-customer-guest>Sign in</a><a href="/account.html#register" data-customer-guest>Create account</a></div></details>`;
  if (theme) theme.after(navigation); else header.append(navigation);
  for (const menu of navigation.querySelectorAll('details')) {
  menu.addEventListener('keydown', event => { if (event.key === 'Escape') { menu.open = false; menu.querySelector('summary').focus(); } });
  document.addEventListener('click', event => { if (!menu.contains(event.target)) menu.open = false; });
  menu.addEventListener('toggle', () => { if (menu.open) for (const other of navigation.querySelectorAll('details')) if (other !== menu) other.open = false; });
  }
  let back = header.querySelector('#backBtn, .ce-back-btn');
  if (!back) {
    back = document.createElement('a');
    back.href = ['/','/index.html','/account.html'].includes(location.pathname) ? '/welcome.html' : '/index.html';
    (header.querySelector('.home-topbar-left') || header).prepend(back);
  }
  back.classList.add('cf-back-control');
  back.setAttribute('aria-label', 'Back to Studio');
  if (back.getAttribute('href') === '/welcome.html') back.setAttribute('aria-label', 'Back to ClipFlow');
  back.title = back.getAttribute('aria-label');
  back.innerHTML = arrow;
})();
