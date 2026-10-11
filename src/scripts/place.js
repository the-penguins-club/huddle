/* ---------- place one pin by hand ---------- */

let placeMode = false;
function setPlaceMode(on) {
  if (on && drawMode) setDrawMode(false);
  placeMode = on;
  cont.classList.toggle('placing', on);
  $('place').setAttribute('aria-pressed', String(on));
  updatePlaceBtn();
}
function updatePlaceBtn() {
  $('place').textContent = placeMode ? 'Click the map… (Esc)' : 'Place a pin';
}

map.on('click', (e) => {
  if (!placeMode) return;
  const ll = map.wrapLatLng(e.latlng);
  placePin(Math.max(-85, Math.min(85, ll.lat)), ll.lng);
});
$('place').addEventListener('click', () => setPlaceMode(!placeMode));

