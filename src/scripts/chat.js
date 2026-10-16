/* ---------- chat: messages, mentions, pin links, pop-ups and the mention sound ---------- */

let chat = [], chatSig = '';   // chatSig: the players behind the rendered names (re-render on a rename)

// "#12" becomes a link to pin 12. Not after a word character or "&", so "a#1" and "&#1" stay text.
const PIN_REF = /(^|[^\w&])#(\d{1,6})(?!\w)/g;
function richText(text) {
  const out = [];
  let last = 0;
  for (const m of text.matchAll(PIN_REF)) {
    const at = m.index + m[1].length;
    const b = el('button', { type: 'button', className: 'pinref', title: `Show pin #${m[2]}` });
    b.dataset.n = m[2];
    fillPinRef(b);
    out.push(...mentions(text.slice(last, at)), b);
    last = at + 1 + m[2].length;
  }
  out.push(...mentions(text.slice(last)));
  return out;
}

// @mentions: "@Name" of anyone in the room is highlighted, and more so when it's you. Names have
// spaces, so match the room's actual names, longest first.
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const mentionRe = (names) => new RegExp(`@(${names.map(reEsc).join('|')})(?![\\p{L}\\p{N}])`, 'giu');
const roomNames = () => [...new Set([myName, ...Object.values(room.players).map((p) => p.name)])].filter(Boolean).sort((a, b) => b.length - a.length);
function mentions(str) {
  const names = roomNames();
  if (!str) return [str];
  const out = [];
  let last = 0;
  for (const m of str.matchAll(mentionRe(names))) {
    const me = m[1].toLowerCase() === myName.toLowerCase();
    out.push(str.slice(last, m.index), el('span', { className: me ? 'at me' : 'at' }, m[0]));
    last = m.index + m[0].length;
  }
  out.push(str.slice(last));
  return out;
}
// Matched against everyone's names, so "@Sam Lee" isn't a mention of Sam.
const mentionsMe = (m) => !m.sys && m.by !== cid && [...m.text.matchAll(mentionRe(roomNames()))].some((x) => x[1].toLowerCase() === myName.toLowerCase());

// Click a person (members list, or a nick in the chat) to start a message to them.
function mention(c) {
  const name = room.players[c]?.name;
  if (!name || c === cid) return;
  const box = $('chatin'), cur = box.value.trimEnd();
  box.value = `${cur}${cur ? ' ' : ''}@${name} `;
  membersOpen = false; renderRoom();
  setTab('chat');
  box.focus();
}

// The "(@)" in the tab title, while someone has mentioned you and you were elsewhere.
document.addEventListener('visibilitychange', () => { if (!document.hidden) document.title = huddleName(); });

// A pin link reads "#12 Label" (labels change, so links are refilled on every room update), and on
// your own pins ends in ✎, which shows the pin and opens its label in the pin list.
function fillPinRef(b) {
  const p = pins.find((x) => x.n === +b.dataset.n);
  b.replaceChildren(`#${b.dataset.n}`, ...(p?.label ? [` ${p.label}`] : []),
    ...(p?.by === cid ? [el('span', { className: 'pedit', title: p.label ? 'Edit label' : 'Add a label' }, '✎')] : []));
}
const refreshPinRefs = () => document.querySelectorAll('.pinref').forEach(fillPinRef);

document.addEventListener('click', (e) => {
  const b = e.target.closest?.('.pinref');
  if (!b) return;
  const p = pins.find((x) => x.n === +b.dataset.n);
  if (!p) return notice(`There is no pin #${b.dataset.n}.`);
  // ✎: to the pin list, to edit the label. Otherwise just show the pin: on the map, which the Chat tab
  // keeps above it, so the chat stays where it is.
  if (e.target.closest('.pedit') && p.by === cid) { setTab('pins'); select(p.id, true); startLabel(p); return; }
  if (view !== 'space') setView('space');
  select(p.id, true);
});

function nick(c) {
  const b = el('b', { className: 'nick' }, c === cid ? myName : nameOf(c));
  const col = room.players[c]?.color;
  if (col) b.style.setProperty('--pc', col);
  if (c !== cid) { b.classList.add('can'); b.title = 'Mention'; b.addEventListener('click', (e) => { e.stopPropagation(); mention(c); }); }
  return b;
}
// "<nick> text", or "-!- Peek has joined" (shown only here, never sent or saved).
function msgLine(m) {
  if (m.sys) return [`-!- ${m.text}`];
  return ['<', nick(m.by), '> ', ...richText(m.text)];
}
const msgLi = (m) => el('li', { className: m.sys ? 'sys' : mentionsMe(m) ? 'mention' : '' }, ...msgLine(m));

const nearBottom = () => { const l = $('msgs'); return l.scrollHeight - l.scrollTop - l.clientHeight < 40; };
const scrollChat = () => { const l = $('msgs'); l.scrollTop = l.scrollHeight; };

function renderChat() {
  const stick = nearBottom(), top = $('msgs').scrollTop;
  $('msgs').replaceChildren(...chat.map(msgLi));
  if (stick) scrollChat(); else $('msgs').scrollTop = top;
}

function addMsg(m) {
  const stick = nearBottom() || m.by === cid;
  chat.push(m);
  $('msgs').append(msgLi(m));
  if (stick) scrollChat();
  if (m.sys) mapNote(m.text);
  else if (m.by !== cid && !chatShown()) toast(m);   // shows the message, mention included
  else if (mentionsMe(m)) mapNote(`${nameOf(m.by)} mentioned you`);
  if (mentionsMe(m)) chirp();
  if (mentionsMe(m) && document.hidden) document.title = `(@) ${huddleName()}`;
}

// Side panel: drag the chat header up or down to resize the chat against the pin list (remembered);
// double-click it to go back to an even split. Phones show the chat as its own tab, so not there.
function setChatHeight(h) {
  const c = $('chat');
  if (h == null || tabMQ.matches) { c.style.flex = c.style.height = ''; return; }
  h = Math.max(90, Math.min($('panel').clientHeight - 140, h));   // keep some of the controls in view
  c.style.flex = 'none';
  c.style.height = `${h}px`;
}
{
  const bar = document.querySelector('#chat > .chatbar');
  bar.addEventListener('pointerdown', (e) => {
    if (tabMQ.matches || e.button !== 0 || e.target.closest('button, input, .me')) return;
    e.preventDefault();
    bar.setPointerCapture(e.pointerId);
    const y0 = e.clientY, h0 = $('chat').offsetHeight;
    let moved = false;   // a click (or the first of a double-click) leaves the split as it is
    const move = (ev) => {
      if (!moved && Math.abs(ev.clientY - y0) < 4) return;
      moved = true;
      setChatHeight(h0 + y0 - ev.clientY);
    };
    const done = () => {
      for (const [t, f] of [['pointermove', move], ['pointerup', done], ['pointercancel', done]]) bar.removeEventListener(t, f);
      if (moved) store.set(K.chatH, $('chat').offsetHeight);
    };
    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', done);
    bar.addEventListener('pointercancel', done);
  });
  bar.addEventListener('dblclick', (e) => { if (!e.target.closest('button, .me')) { store.set(K.chatH, null); setChatHeight(null); } });
}
setChatHeight(store.get(K.chatH, null));
tabMQ.addEventListener('change', () => setChatHeight(store.get(K.chatH, null)));

// Mention sound: a short rising two-note chirp with a little warble on the second note (old IRC
// client meets TARDIS), synthesised here, no audio file. Quiet, under 0.3 s, and only when someone
// else mentions you. Browsers only allow sound after the page has been clicked or typed in once (a touch
// counts when the finger lifts).
let muted = store.get(K.mute, false), actx = null;
function unlockAudio() {
  try {
    actx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
  } catch {}
}
for (const t of ['pointerdown', 'pointerup', 'keydown']) document.addEventListener(t, unlockAudio, { capture: true, passive: true });
function chirp(force = false) {
  if ((muted && !force) || !actx || actx.state !== 'running') return;
  const t0 = actx.currentTime + 0.01, out = actx.createGain();
  out.gain.value = 0.06;
  out.connect(actx.destination);
  for (const [f, at, wobble] of [[880, 0, 0], [1318.5, 0.1, 14]]) {   // A5, then E6 with vibrato
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(f, t0 + at);
    o.frequency.exponentialRampToValueAtTime(f * 1.05, t0 + at + 0.14);
    if (wobble) {
      const lfo = actx.createOscillator(), depth = actx.createGain();
      lfo.frequency.value = 11; depth.gain.value = wobble;
      lfo.connect(depth).connect(o.frequency);
      lfo.start(t0 + at); lfo.stop(t0 + at + 0.18);
    }
    g.gain.setValueAtTime(0, t0 + at);
    g.gain.linearRampToValueAtTime(1, t0 + at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + at + 0.17);
    o.connect(g).connect(out);
    o.start(t0 + at); o.stop(t0 + at + 0.18);
  }
}
function renderMute() {
  $('mute').textContent = muted ? '🔕' : '🔔';
  $('mute').title = muted ? 'Mention sound is off: click to turn on' : 'Mention sound is on: click to mute';
  $('mute').setAttribute('aria-label', $('mute').title);
  $('mute').setAttribute('aria-pressed', String(muted));
}
$('mute').addEventListener('click', () => {
  muted = !muted;
  store.set(K.mute, muted);
  renderMute();
  if (!muted) { unlockAudio(); setTimeout(() => chirp(true), 30); }   // a preview, so you know what it sounds like
});
renderMute();

// Joins and leaves, as a chat line plus a short silent note. A leave waits a few seconds, so a
// dropped connection that comes straight back (phones locking, flaky wifi) isn't announced at all.
const leaving = new Map();   // cid -> timer
function presence(before, after) {
  for (const c of after) {
    if (c === cid || before.has(c)) continue;
    if (leaving.has(c)) { clearTimeout(leaving.get(c)); leaving.delete(c); continue; }   // back already
    addMsg({ sys: true, text: `${nameOf(c)} has joined` });
  }
  for (const c of before) {
    if (c === cid || after.has(c) || leaving.has(c)) continue;
    leaving.set(c, setTimeout(() => {
      leaving.delete(c);
      if (!room.online.includes(c)) addMsg({ sys: true, text: `${nameOf(c)} has left` });
    }, 5000));
  }
}

// While the chat is out of sight (stacked layouts: folded, or on phones another tab), new messages float
// over the map or calendar. Tap one to open the chat.
const toasts = el('div', { id: 'toasts', role: 'status' });
cont.append(toasts);
L.DomEvent.disableClickPropagation(toasts);
L.DomEvent.disableScrollPropagation(toasts);
function mapNote(text) {   // a short, unclickable note in the same spot as chat toasts
  const t = el('div', { className: 'toast note float' }, text);
  toasts.append(t);
  while (toasts.children.length > 3) toasts.firstChild.remove();
  setTimeout(() => t.remove(), 3500);
}
function toast(m) {
  const t = el('div', { className: 'toast float' }, ...msgLine(m));
  t.addEventListener('click', (e) => {
    if (e.target.closest('.pinref')) return;
    if (fold === 'folded') setFold('open');
    setTab('chat');
  });
  toasts.append(t);
  while (toasts.children.length > 3) toasts.firstChild.remove();
  setTimeout(() => t.remove(), 5000);
}

$('chatform').addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = $('chatin').value.trim();
  if (!text) return;
  $('chatin').value = '';
  if (await post({ type: 'chat', text }) && !$('chatin').value) $('chatin').value = text;   // failed: give it back
});

// The chat just came into view: the pop-ups it replaces go, and it shows the latest messages.
function chatSeen() {
  if (!chatShown()) return;
  toasts.replaceChildren();
  scrollChat();
}
