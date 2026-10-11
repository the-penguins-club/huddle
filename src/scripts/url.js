/* ---------- share URL: #[room=id&]map=lat/lng/zoom[&area=lat,lng_lat,lng_…] (older links: &rect=s,w,n,e) ---------- */

const num = (s) => (s !== '' && s != null && Number.isFinite(+s) ? +s : NaN);

function parseHash() {
  const q = new URLSearchParams(location.hash.replace(/^#/, ''));
  let view = null, area = null;
  const m = (q.get('map') || '').split('/').map(num);
  if (m.length === 3 && m.every(Number.isFinite) && Math.abs(m[0]) <= 90) view = { center: [m[0], m[1]], zoom: m[2] };
  const a = (q.get('area') || '').split('_').map((pt) => pt.split(',').map(num));
  if (a.length >= 3 && a.every((pt) => pt.length === 2 && pt.every(Number.isFinite))) area = a;
  const r = (q.get('rect') || '').split(',').map(num);
  if (!area && r.length === 4 && r.every(Number.isFinite) && r[0] < r[2] && r[1] < r[3]) area = rectToArea(r);
  const rm = q.get('room');
  return { view, area, room: /^[a-z0-9]{6,24}$/.test(rm || '') ? rm : null, present: !!(view || area) };
}

const r5 = (x) => +x.toFixed(5);
function updateUrl() {
  const c = map.getCenter(), parts = [];
  if (roomId) parts.push(`room=${roomId}`);
  parts.push(`map=${r5(c.lat)}/${r5(c.lng)}/${map.getZoom()}`);
  try { history.replaceState(null, '', '#' + parts.join('&')); } catch {}
}

