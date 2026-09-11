/* Classic script: all content and state stay local, including on file:// URLs. */
(() => {
  const layoutNames = { sidebar: '侧栏报告', top: '顶部导航' };
  const viewNames = { report: '报告正文', evidence: '来源与证据' };
  let currentView = 'report';
  const status = document.querySelector('[role="status"]');

  function announce() {
    status.textContent = `当前布局：${layoutNames[document.body.dataset.layout]}；当前视图：${viewNames[currentView]}。`;
  }

  function setLayout(layout) {
    if (!Object.hasOwn(layoutNames, layout)) return;
    document.body.dataset.layout = layout;
    document.querySelectorAll('[data-layout-value]').forEach((button) => {
      const active = button.dataset.layoutValue === layout;
      button.setAttribute('aria-pressed', String(active));
      button.classList.toggle('btn-primary', active);
    });
    announce();
  }

  function setView(view) {
    if (!Object.hasOwn(viewNames, view)) return;
    currentView = view;
    Object.keys(viewNames).forEach((name) => {
      document.getElementById(`${name}-view`).hidden = name !== view;
    });
    document.querySelectorAll('nav [data-view-value]').forEach((button) => {
      const active = button.dataset.viewValue === view;
      button.setAttribute('aria-pressed', String(active));
      button.classList.toggle('active', active);
    });
    announce();
  }

  document.querySelectorAll('[data-layout-value]').forEach((button) => {
    button.addEventListener('click', () => setLayout(button.dataset.layoutValue));
  });
  document.querySelectorAll('[data-view-value]').forEach((button) => {
    button.addEventListener('click', () => {
      setView(button.dataset.viewValue);
      if (!button.closest('nav')) document.getElementById('main-content').focus();
    });
  });
  document.querySelectorAll('[data-open-evidence]').forEach((button) => {
    button.addEventListener('click', () => {
      const evidence = document.getElementById(`evidence-${button.dataset.openEvidence}`);
      if (!evidence) return;
      setView('evidence');
      evidence.open = true;
      evidence.querySelector('summary').focus();
    });
  });
  // A copied link ending in #layout=top opens the second layout directly.
  setLayout(new URLSearchParams(location.hash.slice(1)).get('layout') || 'sidebar');
})();
