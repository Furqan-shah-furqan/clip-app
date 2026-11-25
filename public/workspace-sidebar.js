(() => {
  const header = document.querySelector(".home-topbar-left, .creator-topbar-left");
  if (!header || document.getElementById("workspaceSidebar")) return;

  const icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
  const closeIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
  const toggle = document.createElement("button");
  toggle.className = "workspace-sidebar-toggle";
  toggle.type = "button";
  toggle.setAttribute("aria-label", "Open workspace menu");
  toggle.setAttribute("aria-controls", "workspaceSidebar");
  toggle.setAttribute("aria-expanded", "false");
  toggle.innerHTML = icon;
  header.prepend(toggle);

  const scrim = document.createElement("button");
  scrim.className = "workspace-sidebar-scrim";
  scrim.type = "button";
  scrim.tabIndex = -1;
  scrim.setAttribute("aria-label", "Close workspace menu");
  const sidebar = document.createElement("aside");
  sidebar.className = "workspace-sidebar";
  sidebar.id = "workspaceSidebar";
  sidebar.setAttribute("aria-label", "Workspace navigation");
  const activePath = location.pathname === "/index.html" ? "/" : location.pathname;
  const items = [
    ["/", "Studio", "<path d='m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z'/>"],
    ["/creators.html", "Creator monitor", "<circle cx='12' cy='12' r='8'/><path d='M12 8v4l3 2'/>"],
    ["/captions.html", "Caption editor", "<path d='M4 5h16v11H9l-5 4z'/><path d='M8 9h8M8 12h5'/>"],
    ["/publish.html", "Publishing", "<path d='M4 12h15M13 6l6 6-6 6'/><path d='M4 5v14'/>"],
  ];
  const nav = document.createElement("nav");
  nav.setAttribute("aria-label", "ClipFlow pages");
  for (const [href, label, path] of items) {
    const link = document.createElement("a");
    link.className = "workspace-sidebar-link";
    link.href = href;
    link.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg><span></span>`;
    link.querySelector("span").textContent = label;
    if (href === activePath) link.setAttribute("aria-current", "page");
    nav.append(link);
  }
  const brand = document.createElement("a");
  brand.className = "workspace-sidebar-brand";
  brand.href = "/";
  brand.innerHTML = '<span class="workspace-sidebar-mark">CF</span><span><strong>ClipFlow</strong><small>Studio workspace</small></span>';
  const close = document.createElement("button");
  close.className = "workspace-sidebar-close";
  close.type = "button";
  close.setAttribute("aria-label", "Close workspace menu");
  close.innerHTML = closeIcon;
  const head = document.createElement("div");
  head.className = "workspace-sidebar-head";
  head.append(brand, close);
  const sectionLabel = document.createElement("p");
  sectionLabel.className = "workspace-sidebar-label";
  sectionLabel.textContent = "Workspace";
  sidebar.append(head, sectionLabel, nav);
  document.body.prepend(scrim, sidebar);
  if (document.body.classList.contains("home-page")) {
    const controls = document.createElement("div");
    controls.className = "workspace-moved-controls";
    for (const selector of [".home-nav-tabs", ".home-topbar-right"]) {
      const element = document.querySelector(selector);
      if (element) controls.append(element);
    }
    sidebar.append(controls);
  }

  let previousFocus = null;
  const setOpen = open => {
    document.body.classList.toggle("workspace-sidebar-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close workspace menu" : "Open workspace menu");
    toggle.innerHTML = open ? closeIcon : icon;
    sidebar.setAttribute("aria-hidden", String(!open));
    if (open) {
      previousFocus = document.activeElement;
      requestAnimationFrame(() => sidebar.querySelector("a")?.focus());
    } else if (previousFocus instanceof HTMLElement) previousFocus.focus();
  };
  toggle.addEventListener("click", () => setOpen(!document.body.classList.contains("workspace-sidebar-open")));
  close.addEventListener("click", () => setOpen(false));
  scrim.addEventListener("click", () => setOpen(false));
  sidebar.addEventListener("keydown", event => {
    if (event.key === "Escape") { event.preventDefault(); setOpen(false); }
    if (event.key !== "Tab") return;
    const focusable = [...sidebar.querySelectorAll("a,button")].filter(node => !node.disabled);
    if (!focusable.length) return;
    if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1).focus(); }
    else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0].focus(); }
  });
})();
