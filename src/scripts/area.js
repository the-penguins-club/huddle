/* ---------- draw an area ---------- */

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
  if (!on && drag) { drag.layer.remove(); drag = null; }
}

// A box's four corners from two opposite container points (edges follow the map's grid).
const boxPts = (a, b) => [a, L.point(b.x, a.y), b, L.point(a.x, b.y)];

const clampLat = (ll) => L.latLng(Math.max(-85, Math.min(85, ll.lat)), ll.lng);

cont.addEventListener('pointerdown', (e) => {
  if (!drawMode || e.button !== 0 || e.target.closest('.leaflet-control, #detail, #toasts, #tut, #shapesw')) return;
  e.preventDefault(); e.stopPropagation();
  cont.setPointerCapture(e.pointerId);
  const pt = map.mouseEventToContainerPoint(e);
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
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (drawMode) setDrawMode(false);
  else if (placeMode) setPlaceMode(false);
  else if (selectedId) { selectedId = null; renderList(); }
});

