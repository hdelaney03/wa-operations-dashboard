(() => {
  'use strict';
  const nudge = () => {
    try { window.dispatchEvent(new Event('resize')); } catch {}
  };
  window.addEventListener('load', () => {
    [60, 220, 500, 1100].forEach(ms => setTimeout(nudge, ms));
    const workspace = document.querySelector('.workspace');
    const drawer = document.getElementById('leftDrawer');
    if (window.MutationObserver) {
      const observer = new MutationObserver(() => [30, 260].forEach(ms => setTimeout(nudge, ms)));
      if (workspace) observer.observe(workspace, { attributes: true, attributeFilter: ['class', 'style'] });
      if (drawer) observer.observe(drawer, { attributes: true, attributeFilter: ['class', 'style'] });
    }
    if (window.ResizeObserver) {
      const map = document.getElementById('map');
      if (map) {
        const ro = new ResizeObserver(() => setTimeout(nudge, 30));
        ro.observe(map);
      }
    }
  });
})();