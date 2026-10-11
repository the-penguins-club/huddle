/* ---------- actions: sent to the server, which broadcasts the new state ---------- */

// Resolves to the error message, or null when the server took the action.
async function post(action) {
  let err = null;
  try {
    const r = await fetch(`/api/rooms/${roomId}/action`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cid, ...action }),
    });
    if (!r.ok) err = (await r.json().catch(() => ({}))).error || `Server error ${r.status}`;
  } catch { err = 'Offline: that action was not sent.'; }
  if (err) notice(err);
  return err;
}

function dropPin() {
  const pt = randomPoint();
  if (!pt) return notice('Could not find a spot inside the limit area. Try drawing a wider one.');
  post({ type: 'drop', lat: pt.lat, lng: pt.lng });
}

function placePin(lat, lng) {
  if (!inArea(lat, lng)) { notice('That spot is outside the limit area.'); return; }   // stay in place mode
  setPlaceMode(false);
  post({ type: 'place', lat, lng });
}

function vote(p, v) {
  const nv = myVote(p) ? 0 : v;   // a vote steps through 0: either arrow takes back yours, then ▲ +1 / ▼ −1
  post({ type: 'vote', pin: p.id, v: nv });
}

function removePin(id) {
  if (selectedId === id) selectedId = null;
  post({ type: 'delete', pin: id });
}

// Two-step confirm inline: native confirm() is silently suppressed in some
// embedded browsers / after "prevent additional dialogs", which made this a no-op.
let clearTimer = null;
function resetClearBtn() { clearTimeout(clearTimer); clearTimer = null; renderList(); }
$('clear').addEventListener('click', () => {
  const mine = pins.filter((p) => p.by === cid).length;
  if (!clearTimer) {
    $('clear').textContent = `Click again to delete ${mine}`;
    clearTimer = setTimeout(resetClearBtn, 3000);
    return;
  }
  clearTimeout(clearTimer); clearTimer = null;
  selectedId = null;
  post({ type: 'clearMine' });
  renderList();
});

$('drop').addEventListener('click', dropPin);

