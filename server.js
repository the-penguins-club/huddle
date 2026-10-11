#!/usr/bin/env node
// Huddle multiplayer server. No dependencies (Node >= 18).
//
//   node server.js                         # http://127.0.0.1:8765, this machine only
//   HOST=0.0.0.0 node server.js            # reachable on your LAN
//   PORT=3000 DATA_FILE=/data/rooms.json node server.js
//
// Rooms are created on first use and identified by an unguessable id in the share link.
// State is authoritative here: clients POST actions, everyone receives the full
// room state over Server-Sent Events after every change. Chat is the exception: a client gets
// the history once per connection, then each new message on its own ("chat" events).
'use strict';
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 8765;
const HOST = process.env.HOST || '127.0.0.1';
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'rooms.json');
const MAX_ROOMS = 500, MAX_PINS = 500, MAX_CONNS = 100, MAX_CHAT = 200, MAX_TEXT = 500, MAX_AREA = 200, MAX_LABEL = 30, MERGE_M = 100, ROOM_TTL = 14 * 864e5;
const ROOM_RE = /^[a-z0-9]{6,24}$/, CID_RE = /^[A-Za-z0-9-]{8,64}$/;

/** @type {Map<string, {area:number[][]|null, areaBy:string|null, pins:any[], players:Record<string,{name:string,color:string}>, chat:{id:string,ts:number,by:string,text:string}[], nextN:number, touched:number, conns:Set<any>}>} */
const rooms = new Map();

/* ---------- persistence ---------- */

try {
  const saved = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  for (const [id, r] of Object.entries(saved)) {
    if (!ROOM_RE.test(id) || Date.now() - r.touched > ROOM_TTL) continue;
    rooms.set(id, { event: r.event?.title ? { title: r.event.title } : null, range: r.range ?? null, avail: r.avail ?? {}, tstat: r.tstat ?? {}, tvotes: r.tvotes ?? {}, area: validArea(r.area) ?? rectToArea(r.rect), areaBy: r.areaBy ?? r.rectBy ?? null, pins: r.pins ?? [], players: r.players ?? {}, chat: Array.isArray(r.chat) ? r.chat : [], nextN: r.nextN ?? 1, touched: r.touched, conns: new Set() });
  }
  console.log(`loaded ${rooms.size} room(s) from ${DATA_FILE}`);
} catch (e) {
  if (e.code !== 'ENOENT') console.warn('could not load', DATA_FILE, e.message);
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const out = {};
    for (const [id, r] of rooms) out[id] = { event: r.event, range: r.range, avail: r.avail, tstat: r.tstat, tvotes: r.tvotes, area: r.area, areaBy: r.areaBy, pins: r.pins, players: r.players, chat: r.chat, nextN: r.nextN, touched: r.touched };
    const tmp = DATA_FILE + '.tmp';
    fs.writeFile(tmp, JSON.stringify(out), (err) => {
      if (err) return console.warn('save failed:', err.message);
      fs.rename(tmp, DATA_FILE, (e2) => e2 && console.warn('save failed:', e2.message));
    });
  }, 500);
}

/* ---------- room helpers ---------- */

function getRoom(id) {
  let r = rooms.get(id);
  if (r) return r;
  if (rooms.size >= MAX_ROOMS) {
    for (const [k, v] of rooms) if (!v.conns.size && Date.now() - v.touched > ROOM_TTL) rooms.delete(k);
    if (rooms.size >= MAX_ROOMS) return null;
  }
  r = { event: null, range: null, avail: {}, tstat: {}, tvotes: {}, area: null, areaBy: null, pins: [], players: {}, chat: [], nextN: 1, touched: Date.now(), conns: new Set() };
  rooms.set(id, r);
  return r;
}

const MAX_NAME = 16;   // a name fits the chat's title bar and the panel strip
const cleanName = (s) => String(s ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
// Player colours: 18 that are told apart easily (most distinct first), none a colour the maps are full
// of (park green, water's light blue, road yellow, grey). Each newcomer gets the first one nobody in
// the room has, so colours only repeat past 18 people.
const PALETTE = ['#d81b60', '#ef6c00', '#6a1b9a', '#00897b', '#c62828', '#1a237e', '#212121', '#0277bd', '#880e4f',
  '#2e7d32', '#4e342e', '#f06292', '#5c6bc0', '#827717', '#bf360c', '#00acc1', '#ab47bc', '#ff8a65'];
function nextColor(r) {
  const used = new Set(Object.values(r.players).map((p) => p.color));
  return PALETTE.find((c) => !used.has(c)) ?? PALETTE[Object.keys(r.players).length % PALETTE.length];
}
// Recolour saved rooms in joining order, so rooms from before this palette get distinct colours too.
for (const r of rooms.values()) Object.values(r.players).forEach((pl, i) => { pl.color = PALETTE[i % PALETTE.length]; });

// Single line: control characters and runs of whitespace become one space. Cut by code point, not
// UTF-16 unit, so an emoji at the limit isn't split in half.
const cleanText = (s, max = MAX_TEXT) => [...String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()].slice(0, max).join('').trim();

// Returns true when the player is new, i.e. the room's player list changed.
function ensurePlayer(r, cid, name) {
  if (r.players[cid]) return false;
  r.players[cid] = { name: cleanName(name) || 'Player', color: nextColor(r) };
  return true;
}

function snapshot(r) {
  const online = [...new Set([...r.conns].map((c) => c.cid))];
  return { range: r.range, avail: r.avail, tstat: r.tstat, tvotes: r.tvotes, event: r.event, area: r.area, areaBy: r.areaBy, pins: r.pins, players: r.players, online };
}

const sse = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
function send(r, event, data) {
  const msg = sse(event, data);
  for (const c of r.conns) c.res.write(msg);
}
const broadcast = (r) => send(r, 'state', snapshot(r));

const wrapLng = (x) => (x >= -180 && x <= 180 ? x : ((((x + 180) % 360) + 360) % 360) - 180);
class Bad extends Error {}
const bad = (m) => new Bad(m);

function validRect(a) {
  if (!Array.isArray(a) || a.length !== 4) return null;
  const [s, w, n, e] = a.map(Number);
  if (![s, w, n, e].every(Number.isFinite)) return null;
  if (!(s < n) || !(w < e) || s < -85.06 || n > 85.06 || Math.abs(w) > 1080 || Math.abs(e) > 1080) return null;
  return [s, w, n, e];
}

// Rooms saved before freeform areas have a rect [s, w, n, e]: it becomes a four-corner area.
// A function declaration: the loader at the top of the file runs before this line.
function rectToArea(rect) {
  const v = validRect(rect);
  if (!v) return null;
  const [s, w, n, e] = v;
  return [[s, w], [n, w], [n, e], [s, e]];
}

// A limit area: 3–MAX_AREA [lat, lng] vertices, drawn freehand. Longitudes are unwrapped (a shape
// drawn across the antimeridian keeps counting past 180), as the map reports them.
function validArea(a) {
  if (!Array.isArray(a)) return null;
  const pts = a.map((p) => (Array.isArray(p) && p.length === 2 ? [Number(p[0]), Number(p[1])] : [NaN, NaN]));
  if (pts.length > 1 && pts[0][0] === pts.at(-1)[0] && pts[0][1] === pts.at(-1)[1]) pts.pop();   // closed ring: drop the repeat
  if (pts.length < 3 || pts.length > MAX_AREA) return null;
  return pts.every(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 85.06 && Math.abs(lng) <= 1080) ? pts : null;
}

// Is (lat, lng) inside? Even-odd ray casting in Web Mercator (x = lng, y = mercY(lat)), where the
// map draws the edges as straight lines. Area longitudes are unwrapped, so try the ±360 copies.
// index.html has the same function: a point the page picks must pass here.
const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
function inArea(area, lat, lng) {
  const y = mercY(lat);
  return [-360, 0, 360].some((k) => {
    const x = lng + k;
    let inside = false;
    for (let i = 0, j = area.length - 1; i < area.length; j = i++) {
      const yi = mercY(area[i][0]), yj = mercY(area[j][0]), xi = area[i][1], xj = area[j][1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  });
}

/* ---------- time: when everyone is free ---------- */

// The grid everyone paints on: `days` days from `start` (a date), hours `from`..`to` (to = 24 is
// midnight), in time zone `tz`. Times are stored as absolute instants (UTC ms of each hour's start),
// so each viewer can be shown them correctly whatever their own zone.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/, MAX_SLOTS = 2000;
function validRange(a) {
  if (!a || typeof a !== 'object') return null;
  const tz = String(a.tz ?? ''), start = String(a.start ?? ''), days = Number(a.days), from = Number(a.from), to = Number(a.to);
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); } catch { return null; }
  if (!DATE_RE.test(start) || Number.isNaN(Date.parse(start))) return null;
  if (![days, from, to].every(Number.isInteger) || days < 1 || days > 31 || from < 0 || to > 24 || from >= to) return null;
  return { tz, start, days, from, to };
}
// A slot is an hour's start: whole minutes (a zone can be offset by 30 or 45), within a sane window.
const validSlot = (x) => Number.isInteger(x) && x % 60e3 === 0 && Math.abs(x - Date.now()) < 400 * 864e5;

// Great-circle distance in metres; longitudes may differ by a turn of the globe.
function meters(aLat, aLng, bLat, bLng) {
  const rad = Math.PI / 180, dLng = ((((bLng - aLng) % 360) + 540) % 360) - 180;
  const h = Math.sin(((bLat - aLat) * rad) / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin((dLng * rad) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

// One pin per spot: a pin landing within MERGE_M of an existing one (the nearest, if several) isn't
// added; it counts as the dropper's upvote for that pin, unless they've already voted on it. Random
// drops pick a spot clear of other pins (index.html), so they only merge when nothing clear was found.
// Returns the merge, for the room to animate, or null when a pin was added.
function addPin(r, cid, a, manual) {
  const lat = Number(a.lat), lng = Number(a.lng);
  if (!(Math.abs(lat) <= 85.06) || !Number.isFinite(lng) || Math.abs(lng) > 1080) throw bad('bad coordinates');
  if (r.area && !inArea(r.area, lat, lng)) throw bad('outside the limit area');
  const w = wrapLng(lng);
  let near = null, best = MERGE_M;
  for (const p of r.pins) {
    const d = meters(lat, w, p.lat, p.lng);
    if (d <= best) { best = d; near = p; }
  }
  if (near) {
    const upvoted = !(cid in near.votes);
    if (upvoted) near.votes[cid] = 1;
    return { id: near.id, n: near.n, by: cid, lat, lng: w, upvoted };
  }
  if (r.pins.length >= MAX_PINS) r.pins.pop();
  const pin = { id: crypto.randomUUID(), n: r.nextN++, lat, lng: w, ts: Date.now(), by: cid, votes: {} };
  if (manual) pin.manual = true;
  r.pins.unshift(pin);
  return null;
}

function apply(r, cid, a) {
  const added = ensurePlayer(r, cid);
  if (a.type === 'chat') {
    const text = cleanText(a.text);
    if (!text) throw bad('empty message');
    const msg = { id: crypto.randomUUID(), ts: Date.now(), by: cid, text };
    r.chat.push(msg);
    if (r.chat.length > MAX_CHAT) r.chat.splice(0, r.chat.length - MAX_CHAT);
    r.touched = Date.now();
    save();
    if (added) broadcast(r);   // so everyone can put a name to the sender
    send(r, 'chat', { msg });
    return;
  }
  let merged = null;
  switch (a.type) {
    case 'drop': merged = addPin(r, cid, a, false); break;
    case 'place': merged = addPin(r, cid, a, true); break;
    case 'vote': {
      const p = r.pins.find((x) => x.id === a.pin);
      if (!p) throw bad('no such pin');
      if (a.v === 0) delete p.votes[cid];
      else if (a.v === 1 || a.v === -1) p.votes[cid] = a.v;
      else throw bad('bad vote');
      break;
    }
    case 'area': {
      const next = a.area === null ? null : validArea(a.area);
      if (a.area !== null && !next) throw bad('bad area');
      r.area = next;
      r.areaBy = cid;
      break;
    }
    case 'label': {   // a couple of words naming the spot (shop, park, …); only whoever dropped the pin
      const p = r.pins.find((x) => x.id === a.pin);
      if (!p) throw bad('no such pin');
      if (p.by !== cid) throw bad('can only label your own pins');
      const label = cleanText(a.label, MAX_LABEL);
      if (label) p.label = label; else delete p.label;
      break;
    }
    case 'range': {   // the time limit everyone picks within; null clears it (the whole calendar again)
      const next = a.range === null ? null : validRange(a.range);
      if (a.range !== null && !next) throw bad('bad range');
      r.range = next;   // availability outside it is kept, just not shown
      break;
    }
    case 'avail': {   // painting: hours to add to and remove from your free time
      const add = Array.isArray(a.add) ? a.add : [], remove = Array.isArray(a.remove) ? a.remove : [];
      if (![...add, ...remove].every(validSlot)) throw bad('bad slots');
      const mine = new Set(r.avail[cid] ?? []);
      for (const x of add) mine.add(x);
      for (const x of remove) mine.delete(x);
      if (mine.size > MAX_SLOTS) throw bad('too many slots');
      if (mine.size) r.avail[cid] = [...mine].sort((x, y) => x - y); else delete r.avail[cid];
      break;
    }
    case 'event': {   // the huddle's name, also the title of everyone's calendar event: anyone can change it
      const title = cleanText(a.title, 80);
      r.event = title ? { title } : null;
      break;
    }
    case 'tstat': {   // your answer: pick hours (the default), free anytime, or skip
      if (!['hours', 'any', 'out'].includes(a.v)) throw bad('bad answer');
      if (a.v === 'hours') delete r.tstat[cid]; else r.tstat[cid] = a.v;
      if (a.v === 'out') delete r.avail[cid];   // skipping takes back your hours (your votes stay: anyone can vote)
      break;
    }
    case 'tvote': {   // vote an hour up (1) or down (-1), or take it back (0), like pins; as many hours as you like
      if (!validSlot(a.slot) || ![-1, 0, 1].includes(a.v)) throw bad('bad vote');
      const k = String(a.slot), votes = r.tvotes[k] ?? {};
      if (a.v) votes[cid] = a.v; else delete votes[cid];
      if (Object.keys(votes).length) r.tvotes[k] = votes; else delete r.tvotes[k];
      if (Object.keys(r.tvotes).length > 1000) throw bad('too many voted hours');
      break;
    }
    case 'delete': {
      const p = r.pins.find((x) => x.id === a.pin);
      if (!p) break;
      if (p.by !== cid) throw bad('can only delete your own pins');
      r.pins = r.pins.filter((x) => x !== p);
      break;
    }
    case 'clearMine': r.pins = r.pins.filter((p) => p.by !== cid); break;
    case 'rename': {
      const n = cleanName(a.name);
      if (n) r.players[cid].name = n;
      break;
    }
    default: throw bad('unknown action');
  }
  r.touched = Date.now();
  save();
  broadcast(r);
  if (merged) send(r, 'merge', merged);   // after the state, so clients already have the vote
}

/* ---------- http ---------- */

const buckets = new Map();   // cid -> {t, n}: 30 actions / 10 s
function limited(cid) {
  const now = Date.now(), b = buckets.get(cid);
  if (!b || now - b.t > 10000) { buckets.set(cid, { t: now, n: 1 }); return false; }
  return ++b.n > 30;
}
setInterval(() => { const now = Date.now(); for (const [k, b] of buckets) if (now - b.t > 10000) buckets.delete(k); }, 60000).unref();

function json(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req, limit = 4096) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { req.pause(); reject(bad('body too large')); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}')); } catch { reject(bad('invalid JSON')); } });
    req.on('error', reject);
  });
}

function lanAddresses() {
  if (HOST !== '0.0.0.0' && HOST !== '::') return [];
  return Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const parts = url.pathname.split('/').filter(Boolean);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      return res.end(fs.readFileSync(path.join(__dirname, 'index.html')));
    }
    if (req.method === 'GET' && url.pathname === '/api/info') return json(res, 200, { lan: lanAddresses(), port: PORT });

    if (parts[0] === 'api' && parts[1] === 'rooms' && ROOM_RE.test(parts[2] || '')) {
      const id = parts[2];
      if (req.method === 'GET' && parts[3] === 'events') {
        const cid = url.searchParams.get('cid') || '';
        if (!CID_RE.test(cid)) return json(res, 400, { error: 'bad cid' });
        const r = getRoom(id);
        if (!r) return json(res, 503, { error: 'too many rooms' });
        if (r.conns.size >= MAX_CONNS) return json(res, 503, { error: 'room is full' });
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
        res.write('retry: 2000\n\n');
        ensurePlayer(r, cid, url.searchParams.get('name'));
        const conn = { res, cid };
        r.conns.add(conn);
        r.touched = Date.now();
        save();
        broadcast(r);   // includes this connection: initial snapshot + presence for everyone else
        res.write(sse('chat', { history: r.chat }));   // after the snapshot, so senders have names
        req.on('close', () => { r.conns.delete(conn); broadcast(r); });
        return;
      }
      if (req.method === 'POST' && parts[3] === 'action') {
        if (!/^application\/json/.test(req.headers['content-type'] || '')) return json(res, 415, { error: 'expected application/json' });
        const body = await readBody(req, 32768);   // an area is up to MAX_AREA points; a paint stroke a few hundred slots
        if (!CID_RE.test(body.cid || '')) return json(res, 400, { error: 'bad cid' });
        if (limited(body.cid)) return json(res, 429, { error: 'slow down' });
        const r = getRoom(id);
        if (!r) return json(res, 503, { error: 'too many rooms' });
        apply(r, body.cid, body);
        res.writeHead(204); return res.end();
      }
    }
    json(res, 404, { error: 'not found' });
  } catch (e) {
    if (e instanceof Bad && e.message === 'body too large') {
      res.writeHead(413, { 'Content-Type': 'application/json', Connection: 'close' });
      return res.end('{"error":"body too large"}', () => req.destroy());
    }
    if (e instanceof Bad) return json(res, 400, { error: e.message });
    console.error(e);
    if (!res.headersSent) json(res, 500, { error: 'server error' });
  }
});

setInterval(() => { for (const r of rooms.values()) for (const c of r.conns) c.res.write(':hb\n\n'); }, 20000).unref();

server.listen(PORT, HOST, () => {
  console.log(`Huddle on http://${HOST}:${PORT}`);
  for (const ip of lanAddresses()) console.log(`  LAN: http://${ip}:${PORT}`);
  if (HOST === '127.0.0.1') console.log('  (this machine only; HOST=0.0.0.0 to share on your network, or put a tunnel in front)');
});
