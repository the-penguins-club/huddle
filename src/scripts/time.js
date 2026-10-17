/* ---------- time: the calendar everyone marks their free hours on, and its list of hours ---------- */

// The room's grid: `days` days from `start`, hours `from`..`to`, in time zone `tz` (see server.js).
// Each cell is an hour, stored as the absolute instant it starts, so the grid is drawn in the room's
// zone and anyone elsewhere is told so.
const HOUR = 3600e3;
const myTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
let tSel = null, paint = null;   // tSel: the hour clicked in the list (outlined on the calendar)

// Date formatters are slow to make and the calendar formats thousands of times a render: keep them.
const dtfs = new Map();
function dtf(locale, o) {
  const k = `${locale}|${JSON.stringify(o)}`;
  if (!dtfs.has(k)) dtfs.set(k, new Intl.DateTimeFormat(locale || [], o));
  return dtfs.get(k);
}
const partsIn = (ms, tz) => Object.fromEntries(dtf('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  .formatToParts(ms).map((x) => [x.type, x.value]));
// Minutes `tz` is ahead of UTC at instant `ms`.
function tzOffset(ms, tz) {
  const p = partsIn(ms, tz);
  return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000) / 60e3;
}
// The instant it's `hour`:`min` on day `start` + `day` in `tz`, or null where the clocks skip that
// time (the hour lost when daylight saving starts: the calendar leaves a gap there).
function zonedHour(start, day, hour, tz, min = 0) {
  const [y, m, d] = start.split('-').map(Number), wall = Date.UTC(y, m - 1, d + day, hour, min);
  let t = wall;
  for (let i = 0; i < 2; i++) t = wall - tzOffset(t, tz) * 60e3;   // twice settles a DST edge
  return t + tzOffset(t, tz) * 60e3 === wall ? t : null;
}
const todayIn = (tz) => { const p = partsIn(Date.now(), tz); return `${p.year}-${p.month}-${p.day}`; };
// What the grid shows. With a time limit (someone's box, like the map's limit area): just that range,
// stretched to fill the view, the way the map zooms to its area. Without one: all 24 hours from today,
// in your own time zone, with no end: four weeks at first, four more whenever you scroll near the
// right edge, and always as far as anyone has marked or voted (so everyone's calendar, and pick, has
// every hour in play). It stops at MAX_DAYS: the server keeps hours within 400 days of now. Either
// way 7 days fit at once and more scroll sideways.
const DAYS = 28, MAX_DAYS = 390;
let tMoreDays = 0;   // days added by scrolling
function gridSpec() {
  if (room.range) return { ...room.range, min: 0, fit: true };
  const start = todayIn(myTz), t0 = zonedHour(start, 0, 0, myTz) ?? Date.now();
  let last = 0;
  for (const list of Object.values(room.avail)) for (const x of list) last = Math.max(last, x);
  for (const x of Object.keys(room.tvotes)) last = Math.max(last, +x);
  const marked = last > t0 ? Math.ceil((last - t0 + 1) / 864e5) + 1 : 0;   // (+1: days with a clock change aren't 24 hours)
  return { tz: myTz, start, days: Math.min(MAX_DAYS, Math.max(DAYS + tMoreDays, marked)), from: 0, to: 24, min: roomMinute(), fit: false };
}
// Without a limit everyone sees their own zone, but zones aren't all whole hours apart (India is
// +5:30, Nepal +5:45): there, hours start at the minute most of the room's marked hours start on, so
// "10:30" here is the "05:00" someone in London marked. With nothing marked yet, at :00.
function roomMinute() {
  const n = new Map();
  const count = (x) => { const k = (x / 60e3) % 60; n.set(k, (n.get(k) || 0) + 1); };   // the minute in UTC
  for (const list of Object.values(room.avail)) list.forEach(count);
  Object.keys(room.tvotes).forEach((x) => count(+x));
  if (!n.size) return 0;
  const [utcMin] = [...n].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
  return (((utcMin + tzOffset(Date.now(), myTz)) % 60) + 60) % 60;
}
let tLimitMode = false, limitBox = null;   // drawing a time limit: the box so far, {from: [d, h], to: [d, h]}
const fmtIn = (ms, tz, o) => dtf('', { timeZone: tz, ...o }).format(ms);
const hourLabel = (h, min) => `${String(h % 24).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
// "Fri 16": built from parts, since some locales put the day first ("16 Fri").
const dayLabel = (ms, tz) => `${fmtIn(ms, tz, { weekday: 'short' })} ${fmtIn(ms, tz, { day: 'numeric' })}`;
const slotLabel = (ms, tz) => `${fmtIn(ms, tz, { weekday: 'short', day: 'numeric', month: 'short' })}, ${fmtIn(ms, tz, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}`;

// Limit time: draw a box on the calendar (days × hours) to set the range everyone picks and votes
// within; while one is set, the button clears it. Same idea as the map's Limit area. It takes a drag
// across at least two cells: a tap would limit everyone to a single hour.
function setLimitMode(on) {
  tLimitMode = on; limitBox = null;
  if (paint?.kind === 'limit') paint = null;   // Esc mid-drag: drop the box
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
// Near the right edge (within half a view) of an unlimited calendar: four more weeks.
$('time').addEventListener('scroll', () => {
  const tv = $('time');
  if (view !== 'time' || room.range || DAYS + tMoreDays >= MAX_DAYS) return;
  if (tv.scrollLeft + tv.clientWidth < tv.scrollWidth - tv.clientWidth / 2) return;
  tMoreDays += DAYS;
  renderTime();
}, { passive: true });

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

// The calendar's hours, as instants, day by day (null in a DST gap; cached: working them out takes a while).
let slotCache = { key: '', slots: [] };
function rangeSlots(r) {
  const key = [r.tz, r.start, r.days, r.from, r.to, r.min].join('|');
  if (slotCache.key !== key) {
    const slots = [];
    for (let d = 0; d < r.days; d++) for (let h = r.from; h < r.to; h++) slots.push(zonedHour(r.start, d, h, r.tz, r.min));
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
  const r = gridSpec(), cells = rangeSlots(r), slots = cells.filter((x) => x != null), free = freeBySlot();
  const who = timeWho(slots, free), N = who.counted.length;
  const st = new Map(slots.map((x) => [x, hourState(who, N, x)]));
  const ranked = slots.filter((x) => st.get(x).n >= 2 || st.get(x).all || Object.keys(tVotesOf(x)).length)
    .sort((a, b) => tScore(b) - tScore(a) || st.get(b).n - st.get(a).n || a - b);
  const top = ranked.length && tScore(ranked[0]) > 0 ? ranked[0] : null;
  return { r, cells, free, who, N, st, ranked, top };
}

function renderTime() {
  const m = timeModel();
  renderPick(m);
  if (view !== 'time') return;
  const { r, cells: slots, free, who, N, st, ranked, top } = m, tz = r.tz;
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
    return x == null ? { x, cls: 'gap', n: 0 } : { x, ...st.get(x), mine: (free.get(x) || []).includes(cid) };
  };
  for (let h = r.from; h < r.to; h++) {
    cells.push(el('div', { className: 'hh' }, hourLabel(h, r.min)));
    for (let d = 0; d < r.days; d++) {
      const q = at(d, h), up = at(d, h - 1), down = at(d, h + 1), { x, f, n, all, mine } = q;
      if (x == null) {   // skipped by the clocks
        const c = el('div', { className: 'c gap', title: 'This hour doesn\'t happen here: the clocks go forward' });
        c.dataset.d = d; c.dataset.h = h;
        cells.push(c);
        continue;
      }
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
    if (hold || paint) {   // a second finger: a pinch or a scroll, not a stroke
      if (hold) { clearTimeout(hold.timer); hold = null; }
      return;
    }
    hold = { id: e.pointerId, x: e.clientX, y: e.clientY, cell: c, timer: setTimeout(() => {
      const h = hold;
      if (!h) return;
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
  const r = gridSpec(), slots = rangeSlots(r), [d0, h0] = paint.from, [d1, h1] = paint.to, cells = new Set();
  for (let d = Math.min(d0, d1); d <= Math.max(d0, d1); d++) {
    for (let h = Math.min(h0, h1); h <= Math.max(h0, h1); h++) {
      const x = slots[d * (r.to - r.from) + (h - r.from)];
      if (x != null) cells.add(x);
    }
  }
  if (paint.mode === 'add') { paint.add = cells; paint.remove = new Set(); } else { paint.remove = cells; paint.add = new Set(); }
  renderTime();
}
const addDays = (start, n) => { const [y, m, d] = start.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
function endStroke() {
  if (!paint) return;
  if (paint.kind === 'limit') {   // the box becomes the room's range
    const r = gridSpec(), [d0, h0] = paint.from, [d1, h1] = paint.to;
    if (d0 === d1 && h0 === h1) {   // a tap, not a drag: it would limit everyone to one hour
      paint = null; limitBox = null;
      renderTime();
      return mapNote('Drag across the days and hours to limit to.');
    }
    const range = { tz: r.tz, start: addDays(r.start, Math.min(d0, d1)), days: Math.abs(d1 - d0) + 1, from: Math.min(h0, h1), to: Math.max(h0, h1) + 1 };
    paint = null;
    room.range = range;
    post({ type: 'range', range });
    setLimitMode(false);
    $('time').scrollTo(0, 0);
    return;
  }
  const { add, remove } = paint, before = room.avail[cid];
  const mine = new Set(before || []);
  for (const x of add) mine.add(x);
  for (const x of remove) mine.delete(x);
  const after = [...mine];
  room.avail = { ...room.avail, [cid]: after };   // shown now; the server's state confirms it
  paint = null;
  renderTime();
  if (!add.size && !remove.size) return;
  post({ type: 'avail', add: [...add], remove: [...remove] }).then((err) => {
    if (!err || room.avail[cid] !== after) return;   // taken, or newer state has arrived since
    room.avail = { ...room.avail, [cid]: before };   // refused: take the stroke back
    if (!before) delete room.avail[cid];
    renderTime();
  });
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
