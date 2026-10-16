/* ---------- room: connecting to it, its state as it arrives, the room box and the people list ---------- */

function renderRoom() {
  $('dot').className = 'dot ' + status;
  const n = room.online.length;
  $('roomtxt').textContent = status === 'live' ? roomId
    : status === 'offline' ? `${roomId} · not connected` : `${roomId} · connecting…`;
  $('roomtxt').title = 'This huddle\'s id: it\'s in the link';
  $('onlinebtn').hidden = status !== 'live';
  $('onlinebtn').textContent = `${n} online ${membersOpen === 'room' ? '▴' : '▾'}`;
  $('onlinebtn').setAttribute('aria-expanded', String(membersOpen === 'room'));
  $('peoplebtn').innerHTML = `${PEOPLE_ICON}<span>${n}</span>`;
  $('peoplebtn').setAttribute('aria-label', `${n} online: who's here`);
  $('peoplebtn').setAttribute('aria-expanded', String(membersOpen === 'chat'));
  $('roomhelp').textContent = status === 'live' ? '' : helpText;
  $('roomhelp').hidden = !$('roomhelp').textContent;
  // Everyone, in the people list (with their avatars).
  const face = (c) => {
    const d = identicon ? avatarEl(c, 'av face') : el('i', { className: 'face' });
    d.style[identicon ? 'borderColor' : 'background'] = room.players[c]?.color || 'gray';
    return d;
  };
  if (status !== 'live') membersOpen = false;   // (not reopening by itself on reconnect)
  $('members').hidden = scrim.hidden = !membersOpen;
  if ($('members').hidden) return;
  const host = membersOpen === 'chat' ? $('chatform') : $('room');   // under "N online", or above the message box
  if ($('members').parentElement !== host) host.append($('members'));
  const pane = membersOpen === 'chat' ? $('chat') : $('scroller');   // a modal within that pane
  if (scrim.parentElement !== pane) pane.append(scrim);
  const row = (c, off) => {
    const r = el('div', { className: 'm' + (off ? ' off' : '') + (c === cid ? '' : ' can'), title: c === cid ? '' : 'Mention in chat' }, face(c), c === cid ? `${myName} (you)` : nameOf(c));
    if (c !== cid) r.addEventListener('click', () => mention(c));
    return r;
  };
  const on = [cid, ...room.online.filter((c) => c !== cid)];
  const gone = Object.keys(room.players).filter((c) => !room.online.includes(c));
  $('members').replaceChildren(
    el('h4', {}, `Online · ${on.length}`), ...on.map((c) => row(c, false)),
    ...(on.length === 1 ? [el('div', { className: 'alone' }, 'Nobody else yet: copy the share link')] : []),
    ...(gone.length ? [el('h4', {}, `Was here · ${gone.length}`), ...gone.map((c) => row(c, true))] : []));
}

// The people list opens from "N online" in the room box, or from the people button by the message box.
const PEOPLE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.5a6.5 6.5 0 0 1 3 5.5"/></svg>';
let membersOpen = false;   // false, 'room' or 'chat': where it's open
const scrim = el('div', { id: 'scrim', hidden: true });
$('onlinebtn').addEventListener('click', () => { membersOpen = membersOpen === 'room' ? false : 'room'; renderRoom(); });
$('peoplebtn').addEventListener('click', () => { membersOpen = membersOpen === 'chat' ? false : 'chat'; renderRoom(); });
document.addEventListener('click', (e) => {   // a click anywhere else closes it
  if (membersOpen && !e.target.closest('#members, #onlinebtn, #peoplebtn')) { membersOpen = false; renderRoom(); }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && membersOpen) { e.stopImmediatePropagation(); membersOpen = false; renderRoom(); }
}, true);

$('myname').value = myName;
// The box is as wide as the name (on phones, where its CSS width is auto), so it hugs the right edge.
const fitName = () => { $('myname').size = Math.max(6, $('myname').value.length + 1); };
fitName();
$('myname').addEventListener('input', fitName);
$('myname').addEventListener('change', () => {
  const v = $('myname').value.replace(/\s+/g, ' ').trim().slice(0, 16);   // (the server's MAX_NAME)
  $('myname').value = v || myName;
  fitName();
  if (!v) return;
  myName = v; store.set(K.name, v);
  post({ type: 'rename', name: v });
});

let firstState = true, seedArea = null, fitOnFirst = false, helpText = '';

function applyState(s) {
  const first = firstState; firstState = false;
  const prev = new Map(pins.map((p) => [p.id, p]));
  const wasOnline = new Set(room.online);
  room.players = s.players; room.online = s.online;
  if (!first) presence(wasOnline, new Set(s.online));
  pins = s.pins;

  // Area: server is the source of truth. A room's creator seeds it once with their current area.
  const same = JSON.stringify(s.area) === JSON.stringify(areaArr());
  if (first && seedArea && !s.area) post({ type: 'area', area: seedArea });
  else if (!same) {
    setArea(s.area);
    if (!first && s.areaBy !== cid) notice(`${nameOf(s.areaBy)} ${s.area ? 'updated' : 'cleared'} the area`);
  }
  if (first && fitOnFirst && s.area) { initialFit = fitArea; fitArea(); }   // (and the load-time refit fits the area too)
  if (first) seedArea = null;

  // New pins: yours gets selected (and scrolled to in the list), others' get a note.
  const fresh = first ? [] : pins.filter((p) => !prev.has(p.id));
  const mine = fresh.find((p) => p.by === cid);
  if (mine) selectedId = mine.id;
  const theirs = fresh.filter((p) => p.by !== cid);
  if (theirs.length) notice(`${nameOf(theirs[0].by)} dropped pin #${theirs[0].n}${theirs.length > 1 ? ` (+${theirs.length - 1})` : ''}`);
  syncMarkers(fresh.map((p) => p.id));
  renderList();
  if (mine) $('list').querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
  renderRoom();
  const sig = JSON.stringify(s.players);   // chat names follow renames
  if (sig !== chatSig) { chatSig = sig; renderChat(); }
  refreshPinRefs();   // labels and owners behind "#n" links
  room.range = s.range; room.avail = s.avail; room.tstat = s.tstat; room.tvotes = s.tvotes; room.event = s.event; renderHname();
  renderTime();
}

function connect(id, seed = null) {
  for (const t of leaving.values()) clearTimeout(t);   // pending "left" notes belong to the old room
  leaving.clear();
  es?.close();
  roomId = id; seedArea = seed; firstState = true; status = 'connecting';
  fitOnFirst = !parseHash().view;
  room = blankRoom();   // nothing of the last room shows under the new id while this one loads
  pins = []; selectedId = null; chat = []; chatSig = '';
  syncMarkers(); renderList(); renderRoom(); renderChat(); renderHname(); renderTime();
  es = new EventSource(`/api/rooms/${id}/events?${new URLSearchParams({ cid, name: myName })}`);
  es.addEventListener('state', (e) => { status = 'live'; helpText = ''; applyState(JSON.parse(e.data)); });
  // Full history on every (re)connect, then one message per event.
  es.addEventListener('merge', (e) => showMerge(JSON.parse(e.data)));
  es.addEventListener('chat', (e) => {
    const d = JSON.parse(e.data);
    if (d.msg) addMsg(d.msg);
    else { chat = d.history; renderChat(); }
  });
  es.onerror = () => {
    const closed = es.readyState === EventSource.CLOSED;   // browser gave up (bad status / content type)
    status = closed ? 'offline' : 'reconnecting';
    helpText = closed ? 'Checking why…' : '';
    renderRoom();
    if (closed) diagnose(id).then((msg) => { if (roomId === id && status === 'offline') { helpText = msg; renderRoom(); } });
  };
}

const RUN_HINT = 'Run `node server.js` in the random-pin folder and open the URL it prints.';

// Work out *why* the stream failed, so the message says what to fix.
async function diagnose(id) {
  if (location.protocol === 'file:') return `This page was opened as a file. ${RUN_HINT}`;
  try { serverInfo = await (await fetch('/api/info')).json(); } catch {
    return `${location.host} is not running server.js (static files only, e.g. python -m http.server). ${RUN_HINT}`;
  }
  try {
    const r = await fetch(`/api/rooms/${id}/events?cid=${cid}`, { method: 'HEAD' });   // would it open? (without joining)
    return r.ok
      ? 'The server is up but the live stream is being cut off. A proxy or tunnel in front of it may be buffering event streams.'
      : `The server refused this room (HTTP ${r.status}).`;
  } catch { return 'Could not reach the server.'; }
}

// A fresh room, empty and with a new link; the old one carries on for whoever's still in it.
function newRoom() {
  setTab('pins');
  connect(roomCode());
  updateUrl();
  notice('New huddle. The link button next to Drop copies an invite link.');
}
$('leave').addEventListener('click', newRoom);

