/* ---------- share ---------- */

function shareUrl() {
  updateUrl();
  const u = new URL(location.href);
  // localhost links are useless to anyone else: swap in the LAN address when the server exposes one.
  if (serverInfo?.lan?.length && /^(localhost|127\.0\.0\.1)$/.test(u.hostname)) u.hostname = serverInfo.lan[0];
  return u;
}

let shareTimer = null;
// navigator.clipboard needs a secure context (not plain-http LAN addresses); fall back to execCommand.
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {}
  const t = el('textarea', { value: text }); document.body.append(t); t.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch {}
  t.remove();
  return ok;
}

const LINK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
$('share').innerHTML = LINK_ICON;
// An icon button: it flashes ✓ (or ✗), and the note line says what happened.
$('share').addEventListener('click', async () => {
  const u = shareUrl(), href = u.href;
  const ok = await copyText(href);
  const local = /^(localhost|127\.0\.0\.1)$/.test(u.hostname);
  $('share').textContent = ok ? '✓' : '✗';
  notice(!ok ? 'Could not copy: use the address bar.' : local ? 'Link copied (works on this machine only).' : 'Share link copied.');
  clearTimeout(shareTimer);
  shareTimer = setTimeout(() => ($('share').innerHTML = LINK_ICON), 1500);
});

