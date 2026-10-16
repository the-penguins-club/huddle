/* ---------- actions: sent to the server, which broadcasts the new state ---------- */

// Resolves to the error message, or null when the server took the action. Only a page connected to the
// room can act in it, so while it's (re)connecting nothing is sent.
async function post(action) {
  let err = status === 'live' ? null : 'Not connected right now: that was not sent.';
  if (!err) try {
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

$('drop').addEventListener('click', dropPin);

// Esc steps back out of the map's modes: drawing an area, placing a pin, then the selected pin. (The
// tutorial, the people list and the calendar's Limit time catch it first.)
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (drawMode) setDrawMode(false);
  else if (placeMode) setPlaceMode(false);
  else if (selectedId) { selectedId = null; renderList(); }
});

