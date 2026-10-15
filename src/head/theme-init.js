  // Theme: follows the system unless you've picked the other one with the sun/moon button (remembered).
  // Resolved into <html data-theme> here, before the page paints, so there's no flash.
  (function () {
    var pick = null, mq = matchMedia('(prefers-color-scheme: dark)');
    try { pick = JSON.parse(localStorage.getItem('randompin.theme')); } catch (e) {}
    window.applyTheme = function (p) {
      pick = p;
      document.documentElement.dataset.theme = p === 'light' || p === 'dark' ? p : mq.matches ? 'dark' : 'light';
    };
    mq.addEventListener('change', function () { applyTheme(pick); });
    applyTheme(pick);
  })();
