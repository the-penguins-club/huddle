/* ---------- time: when everyone is free (rooms) ---------- */

// The room's grid: `days` days from `start`, hours `from`..`to`, in time zone `tz` (see server.js).
// Each cell is an hour, stored as the absolute instant it starts, so the grid is drawn in the room's
// zone and anyone elsewhere is told so.
const HOUR = 3600e3;
const myTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
let view = 'space', tSel = null, paint = null;   // tSel: the hour clicked in the list (outlined on the calendar)

// Minutes `tz` is ahead of UTC at instant `ms`.
function tzOffset(ms, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(ms).map((x) => [x.type, x.value]));
  return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000) / 60e3;
}
// The instant it's `hour`:00 on day `start` + `day` in `tz`.
function zonedHour(start, day, hour, tz) {
  const [y, m, d] = start.split('-').map(Number), wall = Date.UTC(y, m - 1, d + day, hour);
  let t = wall;
  for (let i = 0; i < 2; i++) t = wall - tzOffset(t, tz) * 60e3;   // twice settles a DST edge
  return t;
}
const todayIn = (tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(Date.now());
// What the grid shows. With a time limit (someone's box, like the map's limit area): just that range,
// stretched to fill the view, the way the map zooms to its area. Without one: four weeks from today,
// all 24 hours, in your own time zone; either way 7 days fit at once and more scroll sideways.
const gridSpec = () => (room.range ? { ...room.range, fit: true } : { tz: myTz, start: todayIn(myTz), days: 28, from: 0, to: 24, fit: false });
let tLimitMode = false, limitBox = null;   // drawing a time limit: the box so far, {from: [d, h], to: [d, h]}
const fmtIn = (ms, tz, o) => new Intl.DateTimeFormat([], { timeZone: tz, ...o }).format(ms);
const hourLabel = (h) => `${String(h % 24).padStart(2, '0')}:00`;
// "Fri 16": built from parts, since some locales put the day first ("16 Fri").
const dayLabel = (ms, tz) => `${fmtIn(ms, tz, { weekday: 'short' })} ${fmtIn(ms, tz, { day: 'numeric' })}`;
const slotLabel = (ms, tz) => `${fmtIn(ms, tz, { weekday: 'short', day: 'numeric', month: 'short' })}, ${fmtIn(ms, tz, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}`;

function setView(v) {
  view = roomId ? v : 'space';
  store.set(K.tab, { view, tab });
  document.body.classList.toggle('view-time', view === 'time');
  $('time').hidden = view !== 'time';
  for (const b of $('views').children) b.setAttribute('aria-selected', String(b.dataset.v === view));
  (view === 'time' ? $('time') : cont).append(toasts);   // notes and chat pop-ups follow the visible view
  if (view !== 'time') setLimitMode(false);
  renderTime();
}
for (const b of $('views').children) b.addEventListener('click', () => setView(b.dataset.v));
// Crossing into the phone layout while on Time: show it as the Time tab.
tabMQ.addEventListener('change', () => { if (tabMQ.matches) setTab(view === 'time' ? 'time' : tab === 'time' ? 'pins' : tab); });
// Widening a phone past the Chat tab: back to the map or calendar tab.
phoneMQ.addEventListener('change', () => { if (tabMQ.matches) setTab(tab); });

// Limit time: draw a box on the calendar (days × hours) to set the range everyone picks and votes
// within; while one is set, the button clears it. Same idea as the map's Limit area.
function setLimitMode(on) {
  tLimitMode = on; limitBox = null;
  renderTime();
}
$('tlimit').addEventListener('click', () => {
  if (tLimitMode) setLimitMode(false);
  else if (room.range) { room.range = null; post({ type: 'range', range: null }); renderTime(); }
  else setLimitMode(true);
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && tLimitMode) { e.stopImmediatePropagation(); setLimitMode(false); } }, true);
// Re-fit the calendar when the view changes size.
new ResizeObserver(() => { if (view === 'time') renderTime(); }).observe($('time'));

// Your answer: by default you paint your hours; "Free anytime" and "Skip" are toggles (press again to
// go back to painting). Skip clears your hours (the server does the same); votes stay, anyone can vote.
function setAnswer(v) {
  room.tstat = { ...room.tstat };
  if (v === 'hours') delete room.tstat[cid]; else room.tstat[cid] = v;
  if (v === 'out') { room.avail = { ...room.avail }; delete room.avail[cid]; }
  renderTime();
  post({ type: 'tstat', v });
}
$('tany').addEventListener('click', () => setAnswer(room.tstat?.[cid] === 'any' ? 'hours' : 'any'));
$('tskip').addEventListener('click', () => setAnswer(room.tstat?.[cid] === 'out' ? 'hours' : 'out'));

// The calendar file's button (in the room box, with the pick).
const CAL_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18M12 14v4M10 16h4"/></svg>';

// Clear mine: all your hours, with the same click-twice confirm as the pin list's.
let tClearTimer = null;
$('tclear').addEventListener('click', () => {
  const mine = room.avail?.[cid] || [];
  if (!tClearTimer) {
    $('tclear').textContent = `Click again to clear ${mine.length} hours`;
    tClearTimer = setTimeout(() => { tClearTimer = null; renderTime(); }, 3000);
    return;
  }
  clearTimeout(tClearTimer); tClearTimer = null;
  room.avail = { ...room.avail }; delete room.avail[cid];
  renderTime();
  if (mine.length) post({ type: 'avail', remove: mine });
});

// Who's free when: slot -> [cids], with the paint stroke in progress counted as already sent.
function freeBySlot() {
  const avail = { ...(room.avail || {}) };
  if (paint?.kind === 'paint') {   // (a limit box being drawn paints nothing)
    const mine = new Set(avail[cid] || []);
    for (const x of paint.add) mine.add(x);
    for (const x of paint.remove) mine.delete(x);
    avail[cid] = [...mine];
  }
  const m = new Map();
  for (const [c, list] of Object.entries(avail)) for (const x of list) (m.get(x) ?? m.set(x, []).get(x)).push(c);
  return m;
}
const topPin = () => [...pins].sort((a, b) => score(b) - score(a) || b.ts - a.ts).find((p) => score(p) > 0) || null;

// Who counts: everyone answering by hours, i.e. who hasn't said "free anytime" or "skip": the people
// who painted hours here, and anyone online who hasn't yet. An hour is everyone's (green) only when all
// of them are free in it. "Free anytime" people aren't counted into any hour (they'd make every hour
// look busier); they and skippers weigh in by voting.
function timeWho(slots, free) {
  const stat = room.tstat || {}, any = Object.keys(stat).filter((c) => stat[c] === 'any');
  const skip = Object.keys(stat).filter((c) => stat[c] === 'out');
  const painters = new Set();
  for (const x of slots) for (const c of free.get(x) || []) if (!stat[c]) painters.add(c);
  const waiting = [...new Set(room.online || [])].filter((c) => !stat[c] && !painters.has(c));
  const counted = [...painters, ...waiting];
  const freeAt = (x) => (free.get(x) || []).filter((c) => painters.has(c));
  return { any, skip, painters, waiting, counted, freeAt };
}

// An hour's state for colouring: nobody, one person, two or more, or everyone who counts (green, even
// when that's one person).
function hourState(who, N, x) {
  const f = who.freeAt(x), n = f.length, all = N >= 1 && n === N;
  return { f, n, all, cls: all ? 'all' : n >= 2 ? 'some' : n === 1 ? 'one' : 'nofree' };
}

// The calendar's hours, as instants (cached: working them out takes a while).
let slotCache = { key: '', slots: [] };
function rangeSlots(r) {
  const key = [r.tz, r.start, r.days, r.from, r.to].join('|');
  if (slotCache.key !== key) {
    const slots = [];
    for (let d = 0; d < r.days; d++) for (let h = r.from; h < r.to; h++) slots.push(zonedHour(r.start, d, h, r.tz));
    slotCache = { key, slots };
  }
  return slotCache.slots;
}
// Hour votes work like pin votes: ▲ +1 or ▼ −1 each, from anyone in the room.
const tVotesOf = (x) => room.tvotes?.[x] || {};
const tScore = (x) => Object.values(tVotesOf(x)).reduce((a, b) => a + b, 0);
const signed = (n) => (n > 0 ? `+${n}` : String(n));
// What the calendar and the room box both need: who counts, each hour's state, the hours worth listing
// (two or more free, everyone free, or voted on) best first, and the pick: the most-voted hour, picked
// automatically like the most-voted pin (ties: more people free, then earlier).
function timeModel() {
  const r = gridSpec(), slots = rangeSlots(r), free = freeBySlot();
  const who = timeWho(slots, free), N = who.counted.length;
  const st = new Map(slots.map((x) => [x, hourState(who, N, x)]));
  const ranked = slots.filter((x) => st.get(x).n >= 2 || st.get(x).all || Object.keys(tVotesOf(x)).length)
    .sort((a, b) => tScore(b) - tScore(a) || st.get(b).n - st.get(a).n || a - b);
  const top = ranked.length && tScore(ranked[0]) > 0 ? ranked[0] : null;
  return { r, slots, free, who, N, st, ranked, top };
}

function renderTime() {
  const m = roomId ? timeModel() : null;
  renderPick(m);
  if (view !== 'time' || !m) return;
  const { r, slots, free, who, N, st, ranked, top } = m, tz = r.tz;
  $('ttz').textContent = tz === myTz ? '' : `Times in ${tz} (you're in ${myTz})`;
  $('tlimit').textContent = tLimitMode ? 'Drag a box… (Esc)' : room.range ? 'Time limited ×' : 'Limit time';
  $('tlimit').classList.toggle('set', !!room.range && !tLimitMode);
  $('tlimit').setAttribute('aria-pressed', String(tLimitMode));
  $('tlimit').title = tLimitMode ? 'Drag a box over the days and hours everyone picks within' : room.range ? 'Everyone picks and votes within this range. Click to clear it.' : 'Drag a box on the calendar to set the days and hours everyone picks within';
  const myStat = room.tstat?.[cid] || 'hours';
  $('tany').setAttribute('aria-pressed', String(myStat === 'any'));
  $('tskip').setAttribute('aria-pressed', String(myStat === 'out'));
  if (!tClearTimer) { $('tclear').textContent = 'Clear mine'; $('tclear').hidden = !(room.avail?.[cid] || []).length; }

  const names = (cs) => cs.map((c) => (c === cid ? 'you' : nameOf(c))).join(', ');
  $('tpeople').textContent = [who.waiting.length && `no hours yet: ${names(who.waiting)}`, who.any.length && `free anytime: ${names(who.any)}`, who.skip.length && `skipping: ${names(who.skip)}`].filter(Boolean).join(' · ');
  if (tSel != null && !st.has(tSel)) tSel = null;

  // Grid: an hour column, then a column per day.
  const g = $('tgrid');
  g.classList.toggle('inactive', myStat !== 'hours' && !tLimitMode);
  g.classList.toggle('limiting', tLimitMode);
  // Fit the view: all the hours shown (24, or the limit's) share the height, and 7 days (or the limit's,
  // if fewer) share the width; more days than that scroll sideways.
  const tv = $('time'), shown = Math.min(r.days, 7);
  const colW = Math.max(36, Math.floor((tv.clientWidth - 56 - 4 * (shown - 1)) / shown));
  g.style.gridTemplateColumns = `auto repeat(${r.days}, ${colW}px)`;
  g.style.setProperty('--rowh', `${Math.max(14, Math.min(72, Math.floor((tv.clientHeight - 58) / (r.to - r.from))))}px`);
  const inBox = (d, h) => limitBox && d >= Math.min(limitBox.from[0], limitBox.to[0]) && d <= Math.max(limitBox.from[0], limitBox.to[0])
    && h >= Math.min(limitBox.from[1], limitBox.to[1]) && h <= Math.max(limitBox.from[1], limitBox.to[1]);
  const cells = [el('div')];
  for (let d = 0; d < r.days; d++) cells.push(el('div', { className: 'dh' }, dayLabel(zonedHour(r.start, d, 12, tz), tz)));
  const at = (d, h) => {
    if (h < r.from || h >= r.to) return null;
    const x = slots[d * (r.to - r.from) + (h - r.from)];
    return { x, ...st.get(x), mine: (free.get(x) || []).includes(cid) };
  };
  for (let h = r.from; h < r.to; h++) {
    cells.push(el('div', { className: 'hh' }, hourLabel(h)));
    for (let d = 0; d < r.days; d++) {
      const q = at(d, h), up = at(d, h - 1), down = at(d, h + 1), { x, f, n, all, mine } = q;
      const same = (o) => o && o.cls === q.cls && o.n === q.n;
      const cls = ['c', q.cls, h === r.from && 'first', h === r.to - 1 && 'last',
        n && !same(up) && 'runtop', n && !same(down) && 'runend',
        mine && 'mine', mine && !up?.mine && 'mtop', mine && !down?.mine && 'mend',   // (kept while free anytime too)
        x === tSel && 'sel', x === top && 'top', inBox(d, h) && 'lim'];
      const c = el('div', { className: cls.filter(Boolean).join(' ') });
      c.dataset.s = x; c.dataset.d = d; c.dataset.h = h;
      if (x === top) c.textContent = `★ ${signed(tScore(x))}`;
      else if ((n >= 2 || all) && !same(up)) c.textContent = all ? '✓' : String(n);   // how many free, once per stretch
      const nv = Object.keys(tVotesOf(x)).length;
      c.title = `${slotLabel(x, tz)} · ${n ? `${all ? 'everyone' : n} free: ${names(f)}` : 'nobody free yet'}${nv ? ` · votes ${signed(tScore(x))}` : ''}`;
      cells.push(c);
    }
  }
  g.replaceChildren(...cells);

  // The list (like the pin list): the hours worth listing, most votes first. A row: how many are free
  // (coloured like the grid), the time, who can't make it, and ▲ score ▼ (a vote steps through 0, like
  // a pin's: either arrow takes yours back). Clicking a row outlines its hour on the calendar.
  const list = ranked.filter((x, i) => i < 12 || Object.keys(tVotesOf(x)).length);   // voted hours always stay listed, so votes can be taken back
  $('tcount').textContent = ranked.length ? `Times · ${ranked.length}` : 'Times';
  $('tlist').replaceChildren(...(list.length ? list.map((x) => {
    const { f, n, all, cls } = st.get(x), mine = tVotesOf(x)[cid] || 0, missing = who.counted.filter((c) => !f.includes(c));
    const vote = (v) => (e) => { e.stopPropagation(); post({ type: 'tvote', slot: x, v: mine ? 0 : v }); };
    const up = el('button', { type: 'button', className: mine > 0 ? 'on' : '', title: mine ? 'Take back your vote' : 'Vote for this time' }, '▲');
    const down = el('button', { type: 'button', className: mine < 0 ? 'on' : '', title: mine ? 'Take back your vote' : 'Vote against this time' }, '▼');
    up.addEventListener('click', vote(1));
    down.addEventListener('click', vote(-1));
    const voters = Object.entries(tVotesOf(x)).map(([c, v]) => `${c === cid ? 'you' : nameOf(c)} ${v > 0 ? '▲' : '▼'}`).join(', ');
    const li = el('li', { className: x === tSel ? 'sel' : '', title: voters ? `Votes: ${voters}` : '' },
      el('span', { className: `num ${cls}` }, all ? '✓' : String(n)),
      el('div', { className: 'meta' }, el('div', { className: 'coords' }, el('b', {}, `${x === top ? '★ ' : ''}${slotLabel(x, tz)}`)),
        el('div', { className: 'when' }, all ? 'everyone' : n ? `not: ${names(missing)}` : 'nobody marked it')),
      el('div', { className: 'votes seg' }, up, el('b', {}, String(tScore(x))), down));
    li.addEventListener('click', () => {
      tSel = tSel === x ? null : x;
      renderTime();
      $('tgrid').querySelector('.c.sel')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
    return li;
  }) : [el('li', { className: 'empty' }, !N ? 'Nobody has marked any hours yet.' : 'No hour has two or more people free yet.')]));
}

// Strokes on the grid: painting your free hours, or (Limit time) drawing the range box. Both take the
// rectangle between the pressed cell and the one under the pointer (as in When2meet), so a fast drag
// can't skip cells and dragging back shrinks it. Mouse or pen: press and drag. Touch: a drag scrolls
// the calendar, a tap marks one hour, and press-and-hold (about 1/3 s) then drag paints a block.
// A paint stroke shows at once and is sent as one change when it ends.
const cellAt = (e) => document.elementFromPoint(e.clientX, e.clientY)?.closest('#tgrid .c');
let hold = null;   // touch: {id, x, y, cell, timer}, until it becomes a stroke, a tap or a scroll
function beginStroke(c, pointerId) {
  if (!tLimitMode && (room.tstat?.[cid] || 'hours') !== 'hours') return mapNote('You said "free anytime" or "skip": turn that off to paint hours.');
  try { $('tgrid').setPointerCapture(pointerId); } catch {}
  const at = [+c.dataset.d, +c.dataset.h];
  if (tLimitMode) { paint = { kind: 'limit', from: at, to: at }; limitBox = { from: at, to: at }; return renderTime(); }
  paint = { kind: 'paint', from: at, to: at, add: new Set(), remove: new Set(), mode: (room.avail?.[cid] || []).includes(+c.dataset.s) ? 'remove' : 'add' };
  fillStroke();
}
$('tgrid').addEventListener('pointerdown', (e) => {
  const c = e.target.closest('.c');
  if (!c || e.button !== 0) return;
  if (e.pointerType === 'touch') {
    hold = { id: e.pointerId, x: e.clientX, y: e.clientY, cell: c, timer: setTimeout(() => {
      const h = hold;
      hold = null;
      navigator.vibrate?.(10);
      beginStroke(h.cell, h.id);
    }, 350) };
    return;
  }
  e.preventDefault();
  beginStroke(c, e.pointerId);
});
function strokeTo(c) {
  if (!c || (+c.dataset.d === paint.to[0] && +c.dataset.h === paint.to[1])) return;
  paint.to = [+c.dataset.d, +c.dataset.h];
  if (paint.kind === 'limit') { limitBox.to = paint.to; renderTime(); } else fillStroke();
}
$('tgrid').addEventListener('pointermove', (e) => {
  if (hold && e.pointerId === hold.id && Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > 8) { clearTimeout(hold.timer); hold = null; return; }   // a scroll
  if (!paint) return;
  paint.pt = { x: e.clientX, y: e.clientY };
  strokeTo(cellAt(e));
  if (!paint.raf) paint.raf = requestAnimationFrame(edgeScroll);
});
// While painting on touch, the finger paints instead of scrolling.
$('tgrid').addEventListener('touchmove', (e) => { if (paint) e.preventDefault(); }, { passive: false });
// Held near (or past) an edge of the grid area: scroll that way, and keep the stroke under the
// pointer (taking the cell just inside the edge), so a stroke can reach days or hours out of view.
function edgeScroll() {
  if (!paint) return;
  paint.raf = null;
  const box = $('time').getBoundingClientRect(), m = 36, { x, y } = paint.pt;
  const dx = x < box.left + m + 40 ? -12 : x > box.right - m ? 12 : 0;   // + the hour labels on the left
  const dy = y < box.top + m + 20 ? -12 : y > box.bottom - m ? 12 : 0;   // + the day labels on top
  if (!dx && !dy) return;
  $('time').scrollBy(dx, dy);
  const cx = Math.min(Math.max(x, box.left + m + 44), box.right - m), cy = Math.min(Math.max(y, box.top + m + 24), box.bottom - m);
  strokeTo(cellAt({ clientX: cx, clientY: cy }));
  paint.raf = requestAnimationFrame(edgeScroll);
}
function fillStroke() {
  const r = gridSpec(), [d0, h0] = paint.from, [d1, h1] = paint.to, cells = new Set();
  for (let d = Math.min(d0, d1); d <= Math.max(d0, d1); d++) {
    for (let h = Math.min(h0, h1); h <= Math.max(h0, h1); h++) cells.add(zonedHour(r.start, d, h, r.tz));
  }
  if (paint.mode === 'add') { paint.add = cells; paint.remove = new Set(); } else { paint.remove = cells; paint.add = new Set(); }
  renderTime();
}
const addDays = (start, n) => { const [y, m, d] = start.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
function endStroke() {
  if (!paint) return;
  if (paint.kind === 'limit') {   // the box becomes the room's range
    const r = gridSpec(), [d0, h0] = paint.from, [d1, h1] = paint.to;
    const range = { tz: r.tz, start: addDays(r.start, Math.min(d0, d1)), days: Math.abs(d1 - d0) + 1, from: Math.min(h0, h1), to: Math.max(h0, h1) + 1 };
    paint = null;
    room.range = range;
    post({ type: 'range', range });
    setLimitMode(false);
    $('time').scrollTo(0, 0);
    return;
  }
  const { add, remove } = paint;
  const mine = new Set(room.avail?.[cid] || []);
  for (const x of add) mine.add(x);
  for (const x of remove) mine.delete(x);
  room.avail = { ...room.avail, [cid]: [...mine] };   // shown now; the server's state confirms it
  paint = null;
  renderTime();
  if (add.size || remove.size) post({ type: 'avail', add: [...add], remove: [...remove] });
}
$('tgrid').addEventListener('pointerup', (e) => {
  if (hold && e.pointerId === hold.id) {   // a tap: just that hour
    clearTimeout(hold.timer);
    const c = hold.cell;
    hold = null;
    beginStroke(c, e.pointerId);
    return endStroke();
  }
  endStroke();
});
$('tgrid').addEventListener('pointercancel', (e) => {
  if (hold && e.pointerId === hold.id) { clearTimeout(hold.timer); hold = null; return; }
  endStroke();
});

// The tutorial's example pick, shown in the room box while it points there and nothing's picked yet.
let tutDemo = false;
function setDemo(on) {
  if (on === tutDemo) return;
  tutDemo = on && $('pick').hidden;
  if (!tutDemo) { renderTime(); return; }
  const d = new Date(); d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7)); d.setHours(18, 0, 0, 0);   // next Saturday, 18:00
  const ics = el('button', { type: 'button', className: 'btn icon', disabled: true, title: 'Add to your calendar (.ics)' });
  ics.innerHTML = CAL_ICON;
  $('pick').hidden = false;
  $('pick').replaceChildren(el('div', { className: 'pick' },
    el('div', { className: 'pick-head', title: 'Most voted (an example)' }, el('span', {}, '★'), el('span', { className: 'pick-label' }, 'Most voted, example'), el('span', {}, 'e.g.')),
    el('div', { className: 'pick-when' }, slotLabel(d.getTime(), myTz)),
    el('div', { className: 'pick-where' }, 'at ', el('b', {}, '#1 Rooftop cafe')), ics));
}

// The pick, in the room box (both views): the most-voted hour, at the most-voted pin if there is one,
// and a button to add it to your calendar.
function renderPick(m) {
  const box = $('pick'), x = m?.top ?? null;
  if (tutDemo) return;   // the tutorial's example is showing
  if (x == null) { box.replaceChildren(); box.hidden = true; return; }
  const p = topPin(), l = { slot: x, len: HOUR };
  const ics = el('button', { type: 'button', className: 'btn icon', title: 'Add to your calendar (.ics)', ariaLabel: 'Add to calendar' });
  ics.innerHTML = CAL_ICON;
  ics.addEventListener('click', () => downloadIcs(l, p));
  box.hidden = false;
  box.replaceChildren(el('div', { className: 'pick' },
    el('div', { className: 'pick-head', title: `Most voted: ${signed(tScore(x))}` }, el('span', {}, '★'), el('span', { className: 'pick-label' }, 'Most voted:'), el('span', {}, signed(tScore(x)))),
    el('div', { className: 'pick-when', title: slotLabel(x, m.r.tz) }, slotLabel(x, m.r.tz)),
    ...(p ? [el('div', { className: 'pick-where', title: `at #${p.n}${p.label ? ` ${p.label}` : ''}` }, 'at ', el('b', {}, `#${p.n}${p.label ? ` ${p.label}` : ''}`))] : []), ics));
}
// The huddle's name, at the top: editable in place by anyone, the title of everyone's calendar event,
// and the browser tab's. Empty, it reads "Huddle". The box is as wide as the name.
const hname = $('hname');
const huddleName = () => room.event?.title || 'Huddle';
const fitHname = () => { hname.size = Math.max(6, (hname.value || hname.placeholder).length + 1); hname.title = hname.value || 'This huddle\'s name, and its calendar event\'s title: click to change it'; };
function renderHname() {
  if (document.activeElement !== hname) hname.value = room.event?.title || '';
  fitHname();
  if (!document.title.startsWith('(@)')) document.title = huddleName();   // (an unseen mention keeps its mark)
}
hname.addEventListener('input', fitHname);
fitHname();
hname.addEventListener('change', () => post({ type: 'event', title: hname.value }));
hname.addEventListener('keydown', (e) => { if (e.key === 'Enter') hname.blur(); else if (e.key === 'Escape') { hname.value = room.event?.title || ''; hname.blur(); } });

// An .ics file for the picked time and place (RFC 5545: CRLF lines, folded at 75 octets). The time is
// written in your own time zone; the location is the pin's link on the map you have selected (Google
// or OSM); the title is the huddle's name.
function downloadIcs(l, p) {
  const stamp = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const wall = (ms) => {   // local wall-clock time in myTz, as 20261017T110000
    const q = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: myTz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(ms).map((x) => [x.type, x.value]));
    return `${q.year}${q.month}${q.day}T${q.hour}${q.minute}${q.second}`;
  };
  const off = (ms) => { const m = tzOffset(ms, myTz), a = Math.abs(m); return `${m < 0 ? '-' : '+'}${String(Math.floor(a / 60)).padStart(2, '0')}${String(a % 60).padStart(2, '0')}`; };
  const text = (s) => String(s).replace(/[\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
  const foldLine = (line) => {
    const out = [];
    let cur = '';
    for (const ch of line) {
      if (new TextEncoder().encode(cur + ch).length > (out.length ? 74 : 75)) { out.push(cur); cur = ''; }
      cur += ch;
    }
    return [...out, cur].join('\r\n ');
  };
  const ev = room.event || {}, end = l.slot + (l.len || HOUR);
  const mapLink = p ? (base === 'google' ? gmapsUrl(p) : osmUrl(p)) : '';
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Huddle//Huddle//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    // The zone's offset at the event (zones that change offset are approximated by that one offset).
    'BEGIN:VTIMEZONE', `TZID:${myTz}`, 'BEGIN:STANDARD', 'DTSTART:19700101T000000', `TZOFFSETFROM:${off(l.slot)}`, `TZOFFSETTO:${off(l.slot)}`, 'END:STANDARD', 'END:VTIMEZONE',
    'BEGIN:VEVENT',
    `UID:${roomId}-${l.slot}@huddle`,
    `DTSTAMP:${stamp(Date.now())}`,
    `DTSTART;TZID=${myTz}:${wall(l.slot)}`,
    `DTEND;TZID=${myTz}:${wall(end)}`,
    `SUMMARY:${text(ev.title || (p?.label ? `Huddle at ${p.label}` : 'Huddle'))}`,
    ...(p ? [`LOCATION:${text(mapLink)}`, `GEO:${p.lat.toFixed(6)};${p.lng.toFixed(6)}`] : []),
    `DESCRIPTION:${text([p && `Place: #${p.n}${p.label ? ` ${p.label}` : ''}`, `Room: ${shareUrl().href}`].filter(Boolean).join('\n'))}`,
    `URL:${shareUrl().href}`,
    'END:VEVENT', 'END:VCALENDAR',
  ];
  const a = el('a', { href: URL.createObjectURL(new Blob([lines.map(foldLine).join('\r\n') + '\r\n'], { type: 'text/calendar' })), download: 'huddle.ics' });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

