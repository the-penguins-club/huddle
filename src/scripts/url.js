/* ---------- the link: #room=id&map=lat/lng/zoom ---------- */

// The page keeps the room and the map's view in the address. Older links may also carry a limit area
// (&area=lat,lng_lat,lng_…, or before that &rect=s,w,n,e): read only, to seed a new room's area.
const num = (s) => (s !== '' && s != null && Number.isFinite(+s) ? +s : NaN);
const rectToArea = ([s, w, n, e]) => [[s, w], [n, w], [n, e], [s, e]];

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
  return { view, area, room: /^[a-z0-9]{6,24}$/.test(rm || '') ? rm : null };
}

const r5 = (x) => +x.toFixed(5);
function updateUrl() {
  const c = map.getCenter(), parts = [];
  if (roomId) parts.push(`room=${roomId}`);
  parts.push(`map=${r5(c.lat)}/${r5(c.lng)}/${map.getZoom()}`);
  try { history.replaceState(null, '', '#' + parts.join('&')); } catch {}
}
