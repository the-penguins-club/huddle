/* ---------- Base map: OSM (the default) or Google, one at a time, chosen per browser ---------- */

// Only the picture under the pins changes; pins, areas, drops and votes work the same either way.
// Google mode falls back to OSM (instead, not underneath) where Google can't be used: unreachable,
// slow to show up, or zoomed out past where the two line up.
//
// Google: the keyless embed behind google.com/maps "Share → Embed a map", centred with ll= so it
// draws no marker. Same Web Mercator tiles as OSM, so streets line up. Not part of Google's
// documented API. Leaflet keeps all the input: the iframe ignores the pointer and sits in a map pane,
// so it moves with the pins while dragging and scales with them while zooming. Once the view settles
// somewhere the current one doesn't cover, a fresh one loads on top and replaces it.
const gpane = map.createPane('google');
gpane.style.zIndex = 250;            // above OSM tiles (200), below the limit area (400) and pins (600)
gpane.style.pointerEvents = 'none';
const GM = 0.25;                     // extra map loaded past each edge, so short drags stay on Google
let base = store.get(K.base, 'osm') === 'google' ? 'google' : 'osm';   // OSM unless you've picked Google
let googleOk = true, gShown = null, gNext = null, gTimer = null, gCredit = false;

// The OSM option: OpenFreeMap's "Liberty" style (vector tiles from OSM data; no key, no stated limits),
// drawn by MapLibre GL inside Leaflet. MapLibre is ~1 MB, so it loads the first time OSM is needed;
// plain OSM tiles show meanwhile, and stay if it can't run (no WebGL, CDN or style server down).
// MapLibre 5: v6 is ES modules with a separate worker file, which a page can't start from a CDN.
const MAPLIBRE = 'https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/maplibre-gl';
const MAPLIBRE_LEAFLET = 'https://cdn.jsdelivr.net/npm/@maplibre/maplibre-gl-leaflet@0.1.4/leaflet-maplibre-gl.js';
const LIBERTY_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const LIBERTY_CREDIT = '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">&copy; OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
let liberty = null, libertyState = 'idle', osmWanted = false;   // idle | loading | ready | failed
const loadScript = (src) => new Promise((ok, fail) => document.head.append(Object.assign(document.createElement('script'), { src, onload: ok, onerror: fail })));
function hasWebGL() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}
async function loadLiberty() {
  libertyState = 'loading';
  try {
    if (!hasWebGL()) throw new Error('no WebGL');
    document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: `${MAPLIBRE}.css` }));
    await loadScript(`${MAPLIBRE}.js`);
    await loadScript(MAPLIBRE_LEAFLET);   // picks up the global maplibregl
    const style = latinLabels(await (await fetch(LIBERTY_STYLE)).json());
    // A fixed credit (the style's own): the plugin reads it from the live style, which is gone by the
    // time Leaflet removes the layer, so switching away would otherwise leave it in the credit line.
    liberty = L.maplibreGL({ style, attributionControl: { customAttribution: LIBERTY_CREDIT } });
    libertyState = 'ready';
  } catch (e) {
    console.warn('Liberty map unavailable, using plain OSM tiles:', e.message || e);
    libertyState = 'failed';
  }
  osmOn(osmWanted);
}

// MapLibre lays text out glyph by glyph, without the shaping Bangla (and other Indic scripts) need, so
// those names come out as broken letters. Where a name isn't in Latin script, label with its Latin
// form only (the tiles carry a transliteration in name:latin); Google's map shows the native names.
function latinLabels(style) {
  const latin = ['case', ['has', 'name:nonlatin'], ['get', 'name:latin'], ['coalesce', ['get', 'name_en'], ['get', 'name']]];
  for (const l of style.layers) {
    const tf = l.layout?.['text-field'];
    if (tf && JSON.stringify(tf).includes('name:nonlatin')) l.layout['text-field'] = latin;
  }
  return style;
}

// Show or hide the OSM option's map: Liberty when it works, else plain tiles. Liberty is swapped in
// only once its style has loaded, so the plain tiles never give way to a blank map.
function osmOn(on) {
  osmWanted = on;
  if (!on) { raster.remove(); liberty?.remove(); return; }
  if (libertyState === 'idle') loadLiberty();
  if (libertyState !== 'ready') { if (!map.hasLayer(raster)) raster.addTo(map); return; }
  if (map.hasLayer(liberty)) return;
  liberty.addTo(map);
  const ml = liberty.getMaplibreMap();
  if (ml.isStyleLoaded()) { raster.remove(); return; }
  ml.once('load', () => raster.remove());
  ml.once('error', (e) => {   // before the style loaded: the style or tile server is down
    if (ml.isStyleLoaded()) return;
    console.warn('Liberty map failed, using plain OSM tiles:', e.error?.message || e);
    libertyState = 'failed';
    liberty.remove();
    if (osmWanted && !map.hasLayer(raster)) raster.addTo(map);
  });
}

// Reachability only: an opaque no-cors response can't say whether the page works, a rejection says it can't load.
fetch('https://maps.google.com/maps?output=embed', { mode: 'no-cors', cache: 'no-store' })
  .catch(() => { googleOk = false; googleView(); });

function googleCredit(on) {
  if (on === gCredit) return;
  gCredit = on;
  map.attributionControl[on ? 'addAttribution' : 'removeAttribution']('Map data &copy; Google');
}

// Google keeps its own view inside the world, so only use it where ours (plus margin) is inside too:
// zoomed far out, or panned past the top or bottom of the world, the two would disagree.
function googleFits() {
  const pb = map.getPixelBounds(), m = map.getSize().y * GM;
  return pb.min.y - m >= 0 && pb.max.y + m <= 256 * 2 ** map.getZoom();
}

// An iframe's position comes from its north-west corner and the whole zoom level it was loaded at.
function placeG(f, zoom = map.getZoom(), at = map.latLngToLayerPoint(f._nw)) {
  f.style.transform = `translate(${at.x}px, ${at.y}px) scale(${2 ** (zoom - f._z)})`;
}
map.on('zoom viewreset', () => { for (const f of gpane.children) placeG(f); });
map.on('zoomanim', (e) => {   // where the corner lands at the end of the animation (Leaflet's own formula)
  const origin = map.project(e.center, e.zoom).subtract(map.getSize().divideBy(2)).add(L.DomUtil.getPosition(map.getPane('mapPane'))).round();
  for (const f of gpane.children) placeG(f, e.zoom, map.project(f._nw, e.zoom).subtract(origin));
});

function googleView() {
  clearTimeout(gTimer);
  if (base !== 'google' || !googleOk || !googleFits()) {
    gpane.replaceChildren(); gShown = gNext = null;
    googleCredit(false); osmOn(true);
    return;
  }
  const z = Math.floor(map.getZoom());
  if (gShown && gShown._z === z && gShown._bounds.contains(map.getBounds())) { gNext?.remove(); gNext = null; return; }
  gTimer = setTimeout(() => {
    // The embed takes whole zoom levels: load the level below and scale it up to match.
    const k = 2 ** (map.getZoom() - z), size = map.getSize(), c = map.wrapLatLng(map.getCenter());
    const f = el('iframe', { tabIndex: -1, title: 'Google map', src: `https://maps.google.com/maps?ll=${c.lat.toFixed(6)},${c.lng.toFixed(6)}&z=${z}&output=embed` });
    f.setAttribute('aria-hidden', 'true');
    f._z = z;
    f._nw = map.containerPointToLatLng([-size.x * GM, -size.y * GM]);
    f._bounds = L.latLngBounds(f._nw, map.containerPointToLatLng([size.x * (1 + GM), size.y * (1 + GM)]));
    Object.assign(f.style, { opacity: '0', width: `${(size.x * (1 + 2 * GM)) / k}px`, height: `${(size.y * (1 + 2 * GM)) / k}px` });
    placeG(f);
    f.addEventListener('load', () => setTimeout(() => {   // the page loads a moment before its tiles draw
      if (gNext !== f) return;
      const old = [...gpane.children].filter((o) => o !== f);
      f.style.opacity = '1';
      gShown = f; gNext = null;
      setTimeout(() => {   // after the fade, so nothing flashes through
        old.forEach((o) => o.remove());
        if (gShown === f && base === 'google') osmOn(false);   // (unless OSM came back meanwhile)
      }, 250);
    }, 400));
    setTimeout(() => {   // never loaded: keep what's there
      if (gNext !== f) return;
      f.remove(); gNext = null;
      if (!gShown) googleCredit(false);
    }, 10000);
    gNext?.remove();
    gNext = f;
    gpane.append(f);
    googleCredit(true);
  }, 250);
}
map.on('moveend resize', googleView);
// No Google map within a few seconds of asking for one: show OSM until it arrives (it replaces OSM).
function googleWatchdog() { setTimeout(() => { if (base === 'google' && !gShown) osmOn(true); }, 4000); }

// The switch: one button under the zoom buttons, showing the map a click switches *to*.
const BASES = { google: { mark: 'G', name: 'Google', other: 'osm' }, osm: { mark: 'OSM', name: 'OpenStreetMap (Liberty)', other: 'google' } };
const BaseSwitch = L.Control.extend({
  options: { position: 'topleft' },
  onAdd() {
    const box = L.DomUtil.create('div', 'leaflet-bar basesw');
    const a = L.DomUtil.create('a', '', box);
    a.href = '#';
    a.setAttribute('role', 'button');
    L.DomEvent.on(a, 'click', (e) => { L.DomEvent.preventDefault(e); setBase(BASES[base].other); });
    L.DomEvent.disableClickPropagation(box);
    return box;
  },
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

const baseSwitch = new BaseSwitch().addTo(map);
new ResetControl().addTo(map);
function setBase(k) {
  base = k;
  store.set(K.base, k);
  const a = baseSwitch.getContainer().firstChild, cur = BASES[k], next = BASES[cur.other];
  a.className = cur.other;
  a.textContent = next.mark;
  a.title = `Switch to the ${next.name} map (now: ${cur.name})`;
  a.setAttribute('aria-label', a.title);
  googleView();
  if (k === 'google') googleWatchdog();
}
setBase(base);

