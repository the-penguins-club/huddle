/* ---------- pick: the most-voted time and place, the huddle's name, and its calendar file ---------- */

// The most-voted pin (ties: the newer one), or null while none has a positive score.
const topPin = () => [...pins].sort((a, b) => score(b) - score(a) || b.ts - a.ts).find((p) => score(p) > 0) || null;

// The calendar file's button (in the room box, with the pick).
const CAL_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18M12 14v4M10 16h4"/></svg>';

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
hname.addEventListener('change', () => {
  const title = hname.value.replace(/\s+/g, ' ').trim();
  room.event = title ? { title } : null;   // shown now (the tab title too); the server's state confirms it
  post({ type: 'event', title });
});
hname.addEventListener('blur', renderHname);   // renames that came in while it had focus
hname.addEventListener('keydown', (e) => { if (e.key === 'Enter') hname.blur(); else if (e.key === 'Escape') { hname.value = room.event?.title || ''; hname.blur(); } });

// An .ics file for the picked time and place (RFC 5545: CRLF lines, folded at 75 octets). Times are
// in UTC, which every calendar shows in its own zone; the location is the pin's link on the map you
// have selected (Google or OSM); the title is the huddle's name.
function downloadIcs(l, p) {
  const utc = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');   // 20261017T050000Z
  const text = (s) => String(s).replace(/[\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
  const bytes = (ch) => (ch.codePointAt(0) < 0x80 ? 1 : ch.codePointAt(0) < 0x800 ? 2 : ch.codePointAt(0) < 0x10000 ? 3 : 4);   // UTF-8
  const foldLine = (line) => {   // never splitting a character
    const out = [];
    let cur = '', n = 0;
    for (const ch of line) {
      if (n + bytes(ch) > (out.length ? 74 : 75)) { out.push(cur); cur = ''; n = 0; }
      cur += ch; n += bytes(ch);
    }
    return [...out, cur].join('\r\n ');
  };
  const ev = room.event || {};
  const mapLink = p ? (base === 'google' ? gmapsUrl(p) : osmUrl(p)) : '';
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Huddle//Huddle//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${roomId}-${l.slot}@huddle`,
    `DTSTAMP:${utc(Date.now())}`,
    `DTSTART:${utc(l.slot)}`,
    `DTEND:${utc(l.slot + (l.len || HOUR))}`,
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
