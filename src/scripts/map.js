/* ---------- map: Leaflet, the starting view, and the view kept in the link ---------- */

// worldCopyJump: panning past the antimeridian jumps back to the main copy of the world, where the pins
// and areas are, rather than showing an empty copy of it.
const map = L.map('map', { zoomControl: true, minZoom: 2, maxZoom: 19, zoomSnap: 0.25, worldCopyJump: true });
// Plain OSM tiles: the fallback for the OSM option (see "Base map" below), added only when in use.
const raster = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
});

// Layout changes (panel folding, rotation, mobile toolbars) resize the map without a window resize event.
new ResizeObserver(() => map.invalidateSize()).observe(map.getContainer());

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
