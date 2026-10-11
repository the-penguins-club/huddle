/* ---------- markers ---------- */

// Player avatars: minidenticons (<1 KB, MIT) turns a player id into a small symmetric pixel avatar,
// the same on every screen. Pins show their dropper's avatar; if the library can't load they keep
// their numbers (numbers stay in the list, the card, chat links and the marker tooltip either way).
let identicon = null;
import('https://cdn.jsdelivr.net/npm/minidenticons@4.2.1/minidenticons.min.js')
  .then((m) => { identicon = m.minidenticon; syncMarkers(); renderRoom(); })
  .catch(() => {});
// The SVG is built from the id's hash alone (no text from the id ends up in it), so it's safe as HTML.
const avatarEl = (c, cls) => el('i', { className: cls, innerHTML: identicon(c) });

function pinIcon(p, latest) {
  const c = colorOf(p.by);
  const pin = el('div', { className: 'pin' }, identicon ? avatarEl(p.by, 'av') : el('span', {}, String(p.n)));
  if (c) pin.style.setProperty('--pc', c);
  return L.divIcon({
    className: 'pin-icon' + (latest ? ' latest' : '') + (c ? ' owned' : '') + (p.manual ? ' manual' : ''),
    // .size scales with votes; .drop is animated separately (bounce), so they must not share a transform
    html: el('div', { className: 'size' }, el('div', { className: 'drop' }, pin), el('b', { className: 'vb', hidden: true })),
    iconSize: [30, 30],
    iconAnchor: [15, 32],
  });
}

// Votes count as a share of the people voting, so the same +2 says more in a room of 4 than of 10,
// and everyone agreeing is the biggest a pin gets. √ makes the first vote or two already obvious
// (+1 of 8 ≈ 1.5×, +4 of 8 ≈ 2×, all 8 ≈ 2.4×); downvoted pins shrink and fade instead.
function voterCount() {
  const who = new Set(room.online);
  for (const p of pins) for (const c of Object.keys(p.votes)) who.add(c);   // votes from people who left still count
  return Math.max(who.size, 2);
}
function voteLook(s, n) {
  const f = Math.max(-1, Math.min(1, s / n)), r = Math.sqrt(Math.abs(f));
  return f >= 0 ? { scale: 1 + 1.4 * r, opacity: 1 } : { scale: 1 - 0.45 * r, opacity: 1 - 0.5 * r };
}
function sizeMarker(m, p, n) {
  const s = m.getElement()?.querySelector('.size');
  if (!s) return;
  const sc = score(p), { scale, opacity } = voteLook(sc, n);
  s.style.transform = `scale(${scale})`;
  s.style.opacity = opacity;
  s.classList.toggle('neg', sc < 0);
  const b = s.querySelector('.vb');
  b.hidden = !sc;
  b.textContent = sc > 0 ? `+${sc}` : String(sc);
  b.classList.toggle('down', sc < 0);
  b.style.transform = `scale(${1 / scale})`;
}

function bounce(marker) {
  const d = marker?.getElement()?.querySelector('.drop');
  if (d) d.animate(
    [{ transform: 'translateY(-36px)', opacity: 0 }, { transform: 'none', opacity: 1 }],
    { duration: 380, easing: 'cubic-bezier(.2,.8,.3,1.25)' });
}

// Make the map's markers match `pins`; animate the ids in `animate`.
function syncMarkers(animate = []) {
  const ids = new Set(pins.map((p) => p.id)), n = voterCount();
  for (const [id, m] of markers) if (!ids.has(id)) { m.remove(); markers.delete(id); }
  pins.forEach((p, i) => {
    let m = markers.get(p.id);
    if (!m) {
      m = L.marker([p.lat, p.lng], { title: `#${p.n}` }).addTo(map);
      m.on('click', () => select(p.id, false));
      markers.set(p.id, m);
    } else if (m.getLatLng().lat !== p.lat || m.getLatLng().lng !== p.lng) m.setLatLng([p.lat, p.lng]);   // a moved pin
    const sig = `${p.n}|${i === 0}|${colorOf(p.by)}|${!!identicon}`;
    if (m._sig !== sig) { m.setIcon(pinIcon(p, i === 0)); m._sig = sig; }
    if (m._label !== (p.label || '')) {
      m._label = p.label || '';
      m.unbindTooltip();
      if (m._label) m.bindTooltip(el('span', {}, m._label), { permanent: true, direction: 'bottom', offset: [0, 2], className: 'pin-tag', opacity: 1 });
    }
    sizeMarker(m, p, n);
    m.setZIndexOffset(i === 0 ? 1000 : Math.max(0, score(p)) * 10);   // popular pins sit on top
    if (animate.includes(p.id)) bounce(m);
  });
}

// One pin per spot: a pin within MERGE_M of an existing one merges into it (see server.js).
const MERGE_M = 100;   // same as the server
function meters(aLat, aLng, bLat, bLng) {   // great-circle distance; longitudes may differ by a turn
  const rad = Math.PI / 180, dLng = ((((bLng - aLng) % 360) + 540) % 360) - 180;
  const h = Math.sin(((bLat - aLat) * rad) / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin((dLng * rad) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
}
function nearestPin(lat, lng) {
  let near = null, best = MERGE_M;
  for (const p of pins) { const d = meters(lat, lng, p.lat, p.lng); if (d <= best) { best = d; near = p; } }
  return near;
}

// A merge, for everyone in the room: a ghost pin slides from where it was placed into the pin it
// joined, which pulses, and a short note says what happened. Yours also selects that pin.
function showMerge(m) {
  const marker = markers.get(m.id), target = pins.find((p) => p.id === m.id);
  if (marker) {
    const a = map.latLngToContainerPoint([m.lat, m.lng]), b = map.latLngToContainerPoint(marker.getLatLng());
    const ghost = el('div', { className: 'ghost' });
    ghost.style.cssText = `left:${a.x}px;top:${a.y}px;--pc:${colorOf(m.by) || '#8e24aa'}`;
    cont.append(ghost);
    ghost.animate(
      [{ transform: 'translate(-50%, -100%)', opacity: 0.85 }, { transform: `translate(calc(-50% + ${b.x - a.x}px), calc(-100% + ${b.y - a.y}px)) scale(.5)`, opacity: 0 }],
      { duration: 600, easing: 'cubic-bezier(.4,0,.2,1)' },
    ).finished.then(() => {
      ghost.remove();
      marker.getElement()?.querySelector('.drop')?.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(1.35)' }, { transform: 'scale(1)' }].map((k) => ({ ...k, transformOrigin: '50% 100%' })),
        { duration: 450, easing: 'ease-out' });
    });
  }
  const name = `#${m.n}${target?.label ? ` ${target.label}` : ''}`;
  if (m.by === cid) {
    selectedId = m.id;
    renderList();
    mapNote(`Merged into ${name}${m.upvoted ? ' · +1' : ' (already voted)'}`);
  } else mapNote(`${nameOf(m.by)}'s pin merged into ${name}`);
}

// Uniform in screen space (Web Mercator), so pins don't bunch toward the poles in tall areas:
// random points in the area's bounding box (or the visible map) until one is inside the shape.
// Bounds are unwrapped, so areas crossing the antimeridian work; wrapLatLng folds the result back.
// Prefers spots at least MERGE_M from every pin, so a drop is a new place rather than a merge; when
// the area has none left, the first spot inside it (which then merges into its nearest pin).
function randomPoint() {
  const Z = 20, b = areaLayer ? areaLayer.getBounds() : map.getBounds();
  const a = map.project(b.getNorthWest(), Z), c = map.project(b.getSouthEast(), Z);
  const tries = Math.min(5000, Math.ceil(400000 / (pins.length + 1)));   // bound the distance checks
  let fallback = null;
  for (let i = 0; i < tries; i++) {
    const ll = map.wrapLatLng(map.unproject(L.point(a.x + Math.random() * (c.x - a.x), a.y + Math.random() * (c.y - a.y)), Z));
    const p = { lat: Math.max(-85, Math.min(85, ll.lat)), lng: ll.lng };
    if (!inArea(p.lat, p.lng)) continue;   // the server runs the same test
    if (!nearestPin(p.lat, p.lng)) return p;
    fallback ??= p;
  }
  return fallback;   // null: a sliver too thin to hit
}

