#!/usr/bin/env node
// Dev helper: fills a room with fake members, to see the app with several people in it. They join one
// every few seconds and, until they leave, keep busy: dropping a few pins each (inside the room's area),
// voting on each other's pins, chatting about them ("#12 looks fun") and labelling their own. In the
// Time tab, most mark a few blocks of free hours (leaning to the same afternoons and evenings, so they
// overlap), one is free anytime and one in six skips; all of them vote ▲▼ on hours where 2+ are free.
// Not part of the app; the Docker image doesn't copy it.
//
//   node dev/dummies.js [room] [count] [minutes]      # defaults: freeformtest1 6 10
//   QUIET=1 node dev/dummies.js myroom                # just be online, no activity
//   BASE=http://127.0.0.1:8765 node dev/dummies.js myroom
'use strict';
const room = process.argv[2] || 'freeformtest1';
const count = Math.min(Number(process.argv[3]) || 6, 10);   // at most 10 dummies
const minutes = Number(process.argv[4]) || 10;
const base = process.env.BASE || 'http://127.0.0.1:8765';
const quiet = !!process.env.QUIET;
const NAMES = ['Sunny Heron', 'Witty Lynx', 'Bold Gecko', 'Merry Koala', 'Swift Ibis', 'Lucky Panda', 'Misty Falcon', 'Calm Tiger', 'Quick Otter', 'Brave Fox'];
const LABELS = ['Tea stall', 'Rooftop cafe', 'Book market', 'Lake side', 'Street food', 'Old mosque', 'Art gallery', 'Bakery', 'Park bench', 'Fuchka cart'];
const CHAT = ['what about #N?', '#N looks fun', 'I vote #N', 'anyone been near #N?', "let's do #N", '#N is too far for me', 'ok #N it is'];
const GAP = 3000;   // between one joining (or leaving) and the next
const MAX_PINS = 5;   // per dummy, so a long run doesn't bury the map

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// Same inside-the-area test as the server: even-odd ray casting in Web Mercator.
const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
function inArea(area, lat, lng) {
  const y = mercY(lat);
  let inside = false;
  for (let i = 0, j = area.length - 1; i < area.length; j = i++) {
    const yi = mercY(area[i][0]), yj = mercY(area[j][0]), xi = area[i][1], xj = area[j][1];
    if ((yi > y) !== (yj > y) && lng < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function spot(area) {
  if (!area) return { lat: 23.75 + (Math.random() - 0.5) * 0.04, lng: 90.39 + (Math.random() - 0.5) * 0.04 };   // around central Dhaka
  const lats = area.map((p) => p[0]), lngs = area.map((p) => p[1]);
  for (let i = 0; i < 200; i++) {
    const lat = Math.min(...lats) + Math.random() * (Math.max(...lats) - Math.min(...lats));
    const lng = Math.min(...lngs) + Math.random() * (Math.max(...lngs) - Math.min(...lngs));
    if (inArea(area, lat, lng)) return { lat, lng };
  }
  return null;
}

// Time: the same hour arithmetic as the page (an hour's start in a zone, as an instant).
function tzOffset(ms, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(ms).map((x) => [x.type, x.value]));
  return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000) / 60e3;
}
function zonedHour(start, day, hour, tz) {
  const [y, m, d] = start.split('-').map(Number), wall = Date.UTC(y, m - 1, d + day, hour);
  let t = wall;
  for (let k = 0; k < 2; k++) t = wall - tzOffset(t, tz) * 60e3;
  return t;
}
// The room's time limit, or (none set) the next 7 days, 08:00-24:00, in Dhaka.
function timeRange(state) {
  if (state.range) return state.range;
  const tz = 'Asia/Dhaka', start = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(Date.now());
  return { tz, start, days: 7, from: 8, to: 24 };
}
// A block of 2-5 free hours on some day, starting at a popular hour (so people overlap).
function freeBlock(r) {
  const day = Math.floor(Math.random() * r.days), len = 2 + Math.floor(Math.random() * 4);
  const popular = [10, 13, 15, 17, 18, 19, 20].filter((h) => h >= r.from && h < r.to);
  const startH = Math.max(r.from, Math.min(r.to - 1, (popular.length ? pick(popular) : r.from) + Math.floor(Math.random() * 3) - 1));
  const out = [];
  for (let h = startH; h < Math.min(r.to, startH + len); h++) out.push(zonedHour(r.start, day, h, r.tz));
  return out;
}

async function member(i) {
  const name = NAMES[i % NAMES.length] + (i >= NAMES.length ? ` ${Math.floor(i / NAMES.length) + 1}` : '');
  const cid = `dummy-${room}-${i}`;
  await sleep(i * GAP);
  // Being "online" is holding the room's event stream open; it also tells us the room's state.
  const ac = new AbortController();
  const res = await fetch(`${base}/api/rooms/${room}/events?${new URLSearchParams({ cid, name })}`, { signal: ac.signal });
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  console.log(`+ ${name} joined`);
  let state = null;
  (async () => {
    const reader = res.body.getReader(), dec = new TextDecoder();
    let buf = '';
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        buf += dec.decode(value, { stream: true });
        let k;
        while ((k = buf.indexOf('\n\n')) >= 0) {
          const ev = buf.slice(0, k); buf = buf.slice(k + 2);
          if (ev.startsWith('event: state\n')) state = JSON.parse(ev.slice(ev.indexOf('data: ') + 6));
        }
      }
    } catch {}
  })();

  const act = (body) => fetch(`${base}/api/rooms/${room}/action`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cid, ...body }) })
    .then(async (r) => { if (!r.ok) console.log(`  ${name}: ${body.type} → ${(await r.json().catch(() => ({}))).error || r.status}`); });

  // Answer in the Time tab once the room's state is in.
  for (let k = 0; k < 20 && !state; k++) await sleep(250);
  if (!quiet && state) {
    if (i % 6 === 1) { await act({ type: 'tstat', v: 'any' }); console.log(`  ${name} is free anytime`); }
    else if (i % 6 === 5) { await act({ type: 'tstat', v: 'out' }); console.log(`  ${name} skips the time`); }
    else {
      const r = timeRange(state), add = [...new Set(Array.from({ length: 2 + Math.floor(Math.random() * 3) }, () => freeBlock(r)).flat())];
      await act({ type: 'tstat', v: 'hours' });
      await act({ type: 'avail', add });
      console.log(`  ${name} marked ${add.length} free hours`);
    }
  }

  const until = Date.now() + minutes * 60e3;   // everyone stays `minutes`, so they leave GAP apart
  while (Date.now() < until) {
    await sleep(Math.min(8000 + Math.random() * 12000, Math.max(0, until - Date.now())));
    if (quiet || !state || Date.now() >= until) continue;
    const others = state.pins.filter((p) => p.by !== cid), mine = state.pins.filter((p) => p.by === cid);
    const r = Math.random();
    if ((r < 0.2 || !state.pins.length) && mine.length < MAX_PINS) {
      const s = spot(state.area);
      if (s) { await act({ type: 'drop', ...s }); console.log(`  ${name} dropped a pin`); }
    } else if (r < 0.65 && others.length) {
      const p = pick(others);
      await act({ type: 'vote', pin: p.id, v: Math.random() < 0.8 ? 1 : -1 });
      console.log(`  ${name} voted on #${p.n}`);
    } else if (r < 0.75) {   // time: vote on an hour with 2+ free, or now and then mark another block
      const stat = state.tstat || {}, counts = new Map();
      for (const [c, list] of Object.entries(state.avail || {})) if (!stat[c]) for (const x of list) counts.set(x, (counts.get(x) || 0) + 1);
      const options = [...counts].filter(([, n]) => n >= 2).map(([x]) => x);
      if (options.length && Math.random() < 0.7) {
        const x = pick(options);
        const v = Math.random() < 0.8 ? 1 : -1;   // mostly for, sometimes against, like pins
        await act({ type: 'tvote', slot: x, v });
        console.log(`  ${name} voted ${v > 0 ? 'for' : 'against'} an hour`);
      } else if (!stat[cid]) {
        await act({ type: 'avail', add: freeBlock(timeRange(state)) });
        console.log(`  ${name} marked more free hours`);
      }
    } else if (r < 0.85) {
      const p = pick(state.pins);
      await act({ type: 'chat', text: pick(CHAT).replace('N', p.n) });
      console.log(`  ${name} chatted about #${p.n}`);
    } else {
      const p = mine.find((q) => !q.label);
      if (p) { await act({ type: 'label', pin: p.id, label: pick(LABELS) }); console.log(`  ${name} labelled #${p.n}`); }
    }
  }
  ac.abort();
  console.log(`- ${name} left`);
}

console.log(`${count} dummy members → room ${room} on ${base}, for ~${minutes} min${quiet ? ', quiet' : ''} (Ctrl-C to end early)`);
Promise.all(Array.from({ length: count }, (_, i) => member(i).catch((e) => console.error(e.message))))
  .then(() => console.log('done'));
