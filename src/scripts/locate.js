/* ---------- first visit: start near the user ---------- */

// Only when nothing else chose the view (shared link, saved view or area, room), and only until
// the user touches the app: a late answer must not yank the map away from what they're doing.
let touched = false;
for (const t of ['pointerdown', 'wheel', 'keydown']) {
  $('app').addEventListener(t, () => { touched = true; }, { capture: true, passive: true });   // (the tutorial's card is outside #app)
}
function locate() {
  if (!initialFit || areaLayer || hash.room || hash.area || !window.isSecureContext || !navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition((pos) => {
    if (touched) return;
    const { latitude, longitude, accuracy } = pos.coords;
    initialFit = null;   // the load-time refit must not undo this
    // Coarse fixes (Wi-Fi / IP) can be kilometres off: show more around them.
    map.fitBounds(L.latLng(latitude, longitude).toBounds(Math.min(Math.max(accuracy * 4, 8000), 300000)), { maxZoom: 15 });
  }, () => {}, { timeout: 15000, maximumAge: 10 * 60e3 });
}

