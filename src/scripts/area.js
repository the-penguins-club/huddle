/* ---------- limit area: showing the room's, and drawing one ---------- */

// The limit area: a freehand shape, [[lat, lng], …] with unwrapped longitudes (see server.js).
// The area itself is just its dashed outline; everything outside it is dimmed instead.
const AREA_STYLE = { color: '#d93025', weight: 2, dashArray: '6 4', fill: false, interactive: false };
const SHADE_STYLE = { stroke: false, fillColor: '#000', fillOpacity: 0.22, interactive: false };
const MAX_AREA = 100;   // points kept after smoothing a stroke (the server takes up to 200)
let areaLayer = null;
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

// A user's area change, for the whole room. A shape drawn on a copy of the world east or west of the
// main one is moved onto it (whole turns), where pins land and inArea looks.
function commitArea(area) {
  const k = area && Math.round(area[0][1] / 360) * 360;
  post({ type: 'area', area: area && area.map(([lat, lng]) => [lat, r6(lng - k)]) });
}

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

/* drawing */

const cont = map.getContainer();
let drawMode = false, drag = null;   // drag: {id, pts: container points, layer}

// Two shapes: a box (drag corner to corner, the default) or freehand (trace the outline). While
// drawing, a switch over the map picks between them, the same with mouse or touch; the choice sticks.
let drawShape = store.get(K.shape, 'box') === 'free' ? 'free' : 'box';
const shapeSwitch = el('div', { id: 'shapesw', className: 'seg', hidden: true, role: 'group' });
shapeSwitch.setAttribute('aria-label', 'Area shape');
for (const [k, label] of [['box', '▭ Box'], ['free', '✎ Freehand']]) {
  const b = el('button', { type: 'button' }, label);
  b.dataset.k = k;
  b.addEventListener('click', () => { drawShape = k; store.set(K.shape, k); setDrawMode(true); });
  shapeSwitch.append(b);
}
cont.append(shapeSwitch);
L.DomEvent.disableClickPropagation(shapeSwitch);

function setDrawMode(on) {
  if (on && placeMode) setPlaceMode(false);
  drawMode = on;
  cont.classList.toggle('drawing', on);
  shapeSwitch.hidden = !on;
  for (const b of shapeSwitch.children) b.setAttribute('aria-pressed', String(b.dataset.k === drawShape));
  $('draw').setAttribute('aria-pressed', String(on));
  $('draw').textContent = !on ? (areaLayer ? 'Area limited ×' : 'Limit area') : drawShape === 'box' ? 'Drag a box… (Esc)' : 'Draw a shape… (Esc)';
  for (const h of ['dragging', 'touchZoom', 'doubleClickZoom', 'boxZoom']) map[h][on ? 'disable' : 'enable']();
  if (!on && drag) { drag.layer.remove(); drag = null; strokeZoom(true); }
}

// A box's four corners from two opposite container points (edges follow the map's grid).
const boxPts = (a, b) => [a, L.point(b.x, a.y), b, L.point(a.x, b.y)];

// The wheel and keys still zoom while drawing, between strokes; not during one, which they'd reshape.
const strokeZoom = (on) => { for (const h of ['scrollWheelZoom', 'keyboard']) map[h][on ? 'enable' : 'disable'](); };

const clampLat = (ll) => L.latLng(Math.max(-85, Math.min(85, ll.lat)), ll.lng);

cont.addEventListener('pointerdown', (e) => {
  if (!drawMode || e.button !== 0 || e.target.closest('.leaflet-control, #detail, #toasts, #tut, #shapesw')) return;
  if (drag) return;   // a second finger: the first one is drawing
  e.preventDefault(); e.stopPropagation();
  cont.setPointerCapture(e.pointerId);
  const pt = map.mouseEventToContainerPoint(e);
  strokeZoom(false);
  drag = { id: e.pointerId, pts: [pt], layer: L.polygon([clampLat(map.containerPointToLatLng(pt))], { ...AREA_STYLE, dashArray: null }).addTo(map) };
}, true);

// Box: the drag's start and current point are opposite corners. Freehand: one stroke traces the
// outline, and the shape closes itself on release.
cont.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const pt = map.mouseEventToContainerPoint(e);
  if (drawShape === 'box') {
    drag.pts = [drag.pts[0], pt];
    drag.layer.setLatLngs(boxPts(drag.pts[0], pt).map((q) => clampLat(map.containerPointToLatLng(q))));
    return;
  }
  if (pt.distanceTo(drag.pts.at(-1)) < 4) return;
  drag.pts.push(pt);
  drag.layer.addLatLng(clampLat(map.containerPointToLatLng(pt)));
});

const r6 = (x) => +x.toFixed(6);
function endDrag(e, commit) {
  if (!drag || e.pointerId !== drag.id) return;
  const { pts } = drag;
  drag.layer.remove(); drag = null;
  strokeZoom(true);
  const size = L.bounds(pts).getSize();
  if (!commit || pts.length < 2 || size.x < 8 || size.y < 8) return;   // ignore stray clicks
  let shape;
  if (drawShape === 'box') shape = boxPts(pts[0], pts[1]);
  else {
    // A stroke has a point every few pixels: smooth it down to at most MAX_AREA, keeping the shape.
    let tol = 1.5;
    do shape = L.LineUtil.simplify(pts, (tol *= 1.5)); while (shape.length > MAX_AREA);
    if (shape.length < 3) return;
  }
  commitArea(shape.map((p) => { const ll = clampLat(map.containerPointToLatLng(p)); return [r6(ll.lat), r6(ll.lng)]; }));
  setDrawMode(false);
}
cont.addEventListener('pointerup', (e) => endDrag(e, true));
cont.addEventListener('pointercancel', (e) => endDrag(e, false));

// One button for the area: draw one; while drawing, cancel; once set (highlighted), clear it.
$('draw').addEventListener('click', () => {
  if (drawMode) setDrawMode(false);
  else if (areaLayer) commitArea(null);
  else setDrawMode(true);
});
