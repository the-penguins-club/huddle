/* ---------- theme: the light/dark button (the theme itself is set in <head>, before the page paints) ---------- */

// Light or dark: the button shows what it switches to. Picking the system's own theme goes back to
// following the system, so only a deliberate "the other one" is remembered.
const SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 1.5v2.5M12 20v2.5M1.5 12H4M20 12h2.5M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8"/></svg>';
const MOON = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.5 14.6A8.5 8.5 0 0 1 9.4 3.5a8.5 8.5 0 1 0 11.1 11.1z"/></svg>';
function renderTheme() {
  const dark = document.documentElement.dataset.theme === 'dark', b = $('theme');
  b.innerHTML = dark ? SUN : MOON;
  b.title = `Switch to the ${dark ? 'light' : 'dark'} theme`;
  b.setAttribute('aria-label', b.title);
}
$('theme').addEventListener('click', () => {
  const want = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  const pick = matchMedia('(prefers-color-scheme: dark)').matches === (want === 'dark') ? null : want;
  store.set(K.theme, pick);
  applyTheme(pick);
  renderTheme();
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', renderTheme);
renderTheme();
