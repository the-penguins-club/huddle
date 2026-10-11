/* ---------- map ---------- */

const map = L.map('map', { zoomControl: true, minZoom: 2, maxZoom: 19, zoomSnap: 0.25 });
// Plain OSM tiles: the fallback for the OSM option (see "Base map" below), added only when in use.
const raster = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
});

// Layout changes (panel folding, rotation, mobile toolbars) resize the map without a window resize event.
new ResizeObserver(() => map.invalidateSize()).observe(map.getContainer());

// Stacked layouts only: the strip on top of the panel. Tapping it steps through three states: open;
// just the list (the controls above it fold away, so the list gets the panel); folded to one row of
// buttons (so the map or calendar gets the screen); and back to open. Dragging it resizes the panel.
// The state and the height are the same in Space, Time and Chat, and remembered.
// Just the list: a shorter panel, the same height in every tab (like the open one), remembered. Folding
// to it from Space or Time sizes it to the list as it was (the controls above go); from the Chat tab, the
// first time, to a little over half. Dragging the strip then resizes it.
const FOLDS = ['open', 'list', 'folded'];
let fold = 'open', listPanelH = store.get(K.listH, null);
const clampPanelH = (h) => Math.round(Math.max(120, Math.min(window.innerHeight - 44 - 140, h)));   // leave the tabs and some map
function setListPanelH(h) {
  listPanelH = h == null ? null : clampPanelH(h);
  $('panel').style.setProperty('--list-panel-h', listPanelH ? `${listPanelH}px` : '55%');
}
function setFold(f) {
  f = FOLDS.includes(f) ? f : 'open';
  if (f === 'list' && fold === 'open') {
    const box = [...document.querySelectorAll('.listbox')].find((b) => b.getClientRects().length);
    if (box) {
      const m = getComputedStyle(box);
      setListPanelH($('panel').offsetHeight - $('scroller').offsetHeight + parseFloat(m.marginTop) + box.offsetHeight + parseFloat(m.marginBottom));
      store.set(K.listH, listPanelH);
    }
  }
  setListPanelH(listPanelH);
  fold = f;
  $('panel').classList.toggle('listonly', fold === 'list');
  $('panel').classList.toggle('folded', fold === 'folded');
  $('fold').setAttribute('aria-expanded', String(fold !== 'folded'));
  const next = { open: 'Show just the list', list: 'Hide the panel', folded: 'Show the panel' }[fold];
  $('fold').title = `Tap: ${next.toLowerCase()}; drag to resize`;
  $('fold').setAttribute('aria-label', `${next} (drag to resize)`);
  store.set(K.fold, fold);
}
const stepFold = () => setFold(FOLDS[(FOLDS.indexOf(fold) + 1) % FOLDS.length]);
function setPanelHeight(h) {
  if (!tabMQ.matches || h == null) { $('panel').style.height = ''; return; }
  $('panel').style.height = `${Math.max(160, clampPanelH(h))}px`;
}
let foldDrag = null, foldDragged = false;
$('fold').addEventListener('pointerdown', (e) => {
  if (!tabMQ.matches || e.button !== 0 || e.target.closest('button, input, .me')) return;
  foldDrag = { y: e.clientY, h: $('panel').offsetHeight, moved: false };
  foldDragged = false;
  $('fold').setPointerCapture(e.pointerId);
});
$('fold').addEventListener('pointermove', (e) => {
  if (!foldDrag) return;
  const dy = foldDrag.y - e.clientY;
  if (!foldDrag.moved && Math.abs(dy) < 6) return;   // still a tap
  foldDrag.moved = true;
  if (fold === 'folded') setFold('open');
  if (fold === 'list') setListPanelH(foldDrag.h + dy);
  else setPanelHeight(foldDrag.h + dy);
});
function endFoldDrag() {
  if (foldDrag?.moved) { foldDragged = true; store.set(fold === 'list' ? K.listH : K.panelH, $('panel').offsetHeight); }
  foldDrag = null;
}
$('fold').addEventListener('pointerup', endFoldDrag);
$('fold').addEventListener('pointercancel', endFoldDrag);
$('fold').addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === $('fold')) { e.preventDefault(); stepFold(); } });
$('fold').addEventListener('click', (e) => {
  if (e.target.closest('button, input, .me')) return;   // the bell or your name, not the strip
  if (foldDragged) { foldDragged = false; return; }   // that was a drag, not a tap
  stepFold();
});
{ const f = store.get(K.fold, 'open'); setFold(f === true ? 'folded' : f); }   // (an older version stored true/false)

// The limit area: a freehand shape, [[lat, lng], …] with unwrapped longitudes (see server.js).
// The area itself is just its dashed outline; everything outside it is dimmed instead.
const AREA_STYLE = { color: '#d93025', weight: 2, dashArray: '6 4', fill: false, interactive: false };
const SHADE_STYLE = { stroke: false, fillColor: '#000', fillOpacity: 0.22, interactive: false };
const MAX_AREA = 100;   // points kept after smoothing a stroke (the server takes up to 200)
let areaLayer = null;
function rectToArea([s, w, n, e]) { return [[s, w], [n, w], [n, e], [s, e]]; }   // older links and saved state
const areaArr = () => (areaLayer ? areaLayer.getLatLngs()[0].map((ll) => [ll.lat, ll.lng]) : null);
// Show the room's area (the server's; changes go through commitArea).
let areaShade = null;   // a polygon covering the world with the area cut out of it
function setArea(area) {
  areaLayer?.remove(); areaShade?.remove();
  areaLayer = area ? L.polygon(area, AREA_STYLE).addTo(map) : null;
  areaShade = null;
  if (area) {
    // Area longitudes are unwrapped, so the outer ring spans a full turn either side of them.
    const lngs = area.map(([, x]) => x), w = Math.min(...lngs) - 360, e = Math.max(...lngs) + 360;
    areaShade = L.polygon([[[-85.06, w], [85.06, w], [85.06, e], [-85.06, e]], area], SHADE_STYLE).addTo(map);
  }
  // The Limit area button doubles as the signal that an area is set (unless it's mid-drawing).
  $('draw').classList.toggle('set', !!area);
  $('draw').title = area ? 'Pins only land inside the area. Click to clear it.' : 'Draw an area for pins to land in';
  if (!map.getContainer().classList.contains('drawing')) $('draw').textContent = area ? 'Area limited ×' : 'Limit area';
}

// A user's area change, for the whole room.
const commitArea = (area) => post({ type: 'area', area });

const fitArea = () => map.fitBounds(areaLayer.getBounds().pad(0.15));

// Same rule as the server: even-odd ray casting in Web Mercator (x = lng, y = mercY(lat)), where the
// edges are drawn straight; area longitudes are unwrapped, so try the point's ±360 copies.
const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
function inArea(lat, lng) {
  const area = areaArr();
  if (!area) return true;
  const y = mercY(lat), ys = area.map(([a]) => mercY(a));
  return [-360, 0, 360].some((k) => {
    const x = lng + k;
    let inside = false;
    for (let i = 0, j = area.length - 1; i < area.length; j = i++) {
      const xi = area[i][1], xj = area[j][1];
      if ((ys[i] > y) !== (ys[j] > y) && x < ((xj - xi) * (y - ys[i])) / (ys[j] - ys[i]) + xi) inside = !inside;
    }
    return inside;
  });
}


// Initial view: the link's, then what this browser last showed, then Dhaka. The room (from the link,
// or a new one) supplies the area; an old area-only link seeds a new room's area.
let initialFit = null;
const hash = parseHash();
{
  const view = hash.view || (hash.area ? null : store.get(K.view, null));
  if (view) map.setView(view.center, view.zoom);
  else {
    initialFit = hash.area ? () => map.fitBounds(L.polygon(hash.area).getBounds().pad(0.15)) : () => map.fitBounds(DHAKA);
    initialFit();
  }
}
const fitSize = map.getSize();
// A mis-sized first paint can leave a wrong zoom; refit once if the container changed size.
window.addEventListener('load', () => {
  map.invalidateSize();
  if (initialFit && !map.getSize().equals(fitSize)) initialFit();
}, { once: true });

map.on('moveend', () => {
  const c = map.getCenter();
  store.set(K.view, { center: [c.lat, c.lng], zoom: map.getZoom() });
  updateUrl();
});
window.addEventListener('hashchange', () => {
  const h = parseHash();
  if (h.room && h.room !== roomId) connect(h.room);   // a link without a room just keeps this one
  if (h.view) map.setView(h.view.center, h.view.zoom);
});

// Reset: a map button (under the zoom buttons and map switch) back to the default view.
const ResetControl = L.Control.extend({
  options: { position: 'topleft' },
  onAdd() {
    const box = L.DomUtil.create('div', 'leaflet-bar resetc');
    const a = L.DomUtil.create('a', '', box);
    Object.assign(a, { href: '#', textContent: '⟲', title: 'Reset view' });
    a.setAttribute('role', 'button');
    a.setAttribute('aria-label', 'Reset view');
    L.DomEvent.on(a, 'click', (e) => { L.DomEvent.preventDefault(e); map.fitBounds(DHAKA); });
    L.DomEvent.disableClickPropagation(box);
    return box;
  },
});

