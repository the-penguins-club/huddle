#!/usr/bin/env node
// Huddle multiplayer server. No dependencies (Node >= 18).
//
//   node server.js                         # http://127.0.0.1:8765, this machine only
//   HOST=0.0.0.0 node server.js            # reachable on your LAN
//   PORT=3000 DATA_FILE=/data/rooms.json node server.js
//   TRUST_PROXY=1                          # behind a reverse proxy (Traefik): limits go by X-Forwarded-For
//   LAN_INFO=0                             # don't list this machine's addresses in /api/info
//
// A room exists once someone opens it (its event stream) and is identified by an unguessable id in the
// share link. State is authoritative here: clients POST actions, everyone receives the full room state
// over Server-Sent Events after every change. Chat is the exception: a client gets the history once
// per connection, then each new message on its own ("chat" events). Only a client connected to a room
// can act in it.
'use strict';
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 8765;
const HOST = process.env.HOST || '127.0.0.1';
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'rooms.json');
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const LAN_INFO = process.env.LAN_INFO !== '0';
const MAX_ROOMS = 500, MAX_PINS = 500, MAX_CHAT = 200, MAX_TEXT = 500, MAX_AREA = 200, MAX_LABEL = 30, MERGE_M = 100;
const MAX_CONNS = 100;          // event streams per room
const MAX_CONNS_PER_IP = 20;    // event streams from one address, across rooms
const MAX_PLAYERS = 300;        // people a room remembers (names and colours)
const MAX_VOTED_HOURS = 1000, MAX_SLOTS = 2000;   // per room; per person
const MAX_BUFFER = 1 << 20;     // bytes queued for a client that stopped reading, before it's dropped
const ROOM_TTL = 14 * 864e5;    // a room nobody has touched for this long is forgotten
const ROOM_RE = /^[a-z0-9]{6,24}$/, CID_RE = /^[A-Za-z0-9-]{8,64}$/;
// A client id; also used as an object key, so never one of Object.prototype's ("constructor", …).
const validCid = (c) => typeof c === 'string' && CID_RE.test(c) && !(c in Object.prototype);

// A room. Everything but `conns` is saved (PERSISTED).
//   event: {title} | null — the huddle's name;  range: the time limit (see validRange) | null
//   avail: {cid: [slot…]} free hours;  tstat: {cid: 'any'|'out'};  tvotes: {slot: {cid: ±1}}
//   area: [[lat, lng]…] | null, areaBy: cid;  pins: [{id, n, lat, lng, ts, by, votes: {cid: ±1}, label?, manual?}]
//   players: {cid: {name, color}};  chat: [{id, ts, by, text}];  nextN: next pin number;  touched: ms
//   conns: Set<{res, cid, ip}> — the open event streams
const PERSISTED = ['event', 'range', 'avail', 'tstat', 'tvotes', 'area', 'areaBy', 'pins', 'players', 'chat', 'nextN', 'touched'];
function blankRoom() {
  return { event: null, range: null, avail: {}, tstat: {}, tvotes: {}, area: null, areaBy: null, pins: [], players: {}, chat: [], nextN: 1, touched: Date.now(), conns: new Set() };
}
// Nothing in it worth keeping: such a room isn't saved, and is dropped when its last visitor leaves.
const isEmpty = (r) => !r.pins.length && !r.chat.length && !r.area && !r.event && !r.range
  && !Object.keys(r.avail).length && !Object.keys(r.tstat).length && !Object.keys(r.tvotes).length;

/** @type {Map<string, ReturnType<typeof blankRoom>>} */
const rooms = new Map();

/* ---------- persistence ---------- */

try {
  const saved = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  for (const [id, s] of Object.entries(saved)) {
    if (!ROOM_RE.test(id) || !(Date.now() - s.touched < ROOM_TTL)) continue;
    const r = blankRoom();
    for (const k of PERSISTED) if (s[k] != null) r[k] = s[k];
    r.area = validArea(r.area);
    r.event = r.event?.title ? { title: String(r.event.title) } : null;
    if (!Array.isArray(r.chat)) r.chat = [];
    rooms.set(id, r);
  }
  console.log(`loaded ${rooms.size} room(s) from ${DATA_FILE}`);
} catch (e) {
  if (e.code !== 'ENOENT') {   // unreadable: keep it aside rather than overwrite it with the next save
    const aside = `${DATA_FILE}.bad-${Date.now()}`;
    try { fs.renameSync(DATA_FILE, aside); } catch {}
    console.warn(`could not load ${DATA_FILE} (${e.message}); moved it to ${aside}`);
  }
}

function diskState() {
  const out = {};
  for (const [id, r] of rooms) {
    if (isEmpty(r)) continue;
    out[id] = {};
    for (const k of PERSISTED) out[id][k] = r[k];
  }
  return JSON.stringify(out);
}
// Saves are throttled (at most one every half second, however busy the rooms are) and never overlap:
// a save asked for while one is writing runs after it.
let saveTimer = null, saving = false, saveAgain = false;
function save() {
  if (!saveTimer) saveTimer = setTimeout(writeSave, 500);
}
function writeSave() {
  saveTimer = null;
  if (saving) { saveAgain = true; return; }
  saving = true;
  const tmp = DATA_FILE + '.tmp', done = (err) => {
    if (err) console.warn('save failed:', err.message);
    saving = false;
    if (saveAgain) { saveAgain = false; save(); }
  };
  fs.writeFile(tmp, diskState(), (err) => (err ? done(err) : fs.rename(tmp, DATA_FILE, done)));
}
// On shutdown (docker stop sends SIGTERM): write what's pending, synchronously, then exit.
function saveNow() {
  clearTimeout(saveTimer);
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, diskState());
  fs.renameSync(tmp, DATA_FILE);
}
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    try { saveNow(); } catch (e) { console.warn('save on exit failed:', e.message); }
    process.exit(0);
  });
}

/* ---------- room helpers ---------- */

// The room, created if `create` (opening a room's event stream; actions never create one). At the cap,
// forget expired rooms, then the least recently used one nobody is in.
function getRoom(id, create) {
  let r = rooms.get(id);
  if (r || !create) return r ?? null;
  if (rooms.size >= MAX_ROOMS) {
    sweep();
    if (rooms.size >= MAX_ROOMS) {
      let oldest = null;
      for (const [k, v] of rooms) if (!v.conns.size && (!oldest || v.touched < rooms.get(oldest).touched)) oldest = k;
      if (!oldest) return null;
      rooms.delete(oldest);
    }
  }
  r = blankRoom();
  rooms.set(id, r);
  return r;
}
// Forget rooms untouched for ROOM_TTL that nobody is in.
function sweep() {
  for (const [k, v] of rooms) if (!v.conns.size && Date.now() - v.touched > ROOM_TTL) rooms.delete(k);
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

// Single line: control characters and runs of whitespace become one space. Cut by code point, not
// UTF-16 unit, so an emoji at the limit isn't split in half.
const cleanText = (s, max = MAX_TEXT) => [...String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()].slice(0, max).join('').trim();

function snapshot(r) {
  const online = [...new Set([...r.conns].map((c) => c.cid))];
  return { range: r.range, avail: r.avail, tstat: r.tstat, tvotes: r.tvotes, event: r.event, area: r.area, areaBy: r.areaBy, pins: r.pins, players: r.players, online };
}

const sse = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
// To everyone in the room. A client that has stopped reading (its queue past MAX_BUFFER) is dropped;
// its browser reconnects if it's still there.
function send(r, event, data) {
  const msg = sse(event, data);
  for (const c of r.conns) {
    if (c.res.writableLength > MAX_BUFFER) c.res.destroy();
    else c.res.write(msg);
  }
}
const broadcast = (r) => send(r, 'state', snapshot(r));

const wrapLng = (x) => (x >= -180 && x <= 180 ? x : ((((x + 180) % 360) + 360) % 360) - 180);
class Bad extends Error {}
const bad = (m) => new Bad(m);

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
// src/scripts/map.js has the same function: a point the page picks must pass here.
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

// The grid everyone paints on: `days` days from `start` (a date within a year or so of now), hours
// `from`..`to` (to = 24 is midnight), in time zone `tz`. Times are stored as absolute instants (UTC ms
// of each hour's start), so each viewer can be shown them correctly whatever their own zone.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function validRange(a) {
  if (!a || typeof a !== 'object') return null;
  const tz = String(a.tz ?? ''), start = String(a.start ?? ''), days = Number(a.days), from = Number(a.from), to = Number(a.to);
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); } catch { return null; }
  const t = Date.parse(start);
  // a real date (2026-02-31 parses, as 3 March: the round trip catches it), near enough for its hours to be valid slots
  if (!DATE_RE.test(start) || Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== start) return null;
  if (Math.abs(t - Date.now()) > 365 * 864e5) return null;
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
// drops pick a spot clear of other pins (src/scripts/markers.js), so they only merge when nothing clear
// was found. Returns the merge, for the room to animate, or null when a pin was added. At MAX_PINS the
// oldest pin goes.
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

// An action from `cid`, who is connected to the room (so a player in it). Throws Bad when it's invalid.
function apply(r, cid, a) {
  if (a.type === 'chat') {
    const text = cleanText(a.text);
    if (!text) throw bad('empty message');
    const msg = { id: crypto.randomUUID(), ts: Date.now(), by: cid, text };
    r.chat.push(msg);
    if (r.chat.length > MAX_CHAT) r.chat.splice(0, r.chat.length - MAX_CHAT);
    r.touched = Date.now();
    save();
    send(r, 'chat', { msg });
    return;
  }
  let merged = null;
  switch (a.type) {
    case 'drop': merged = addPin(r, cid, a, false); break;   // a random pin (the page picks the spot)
    case 'place': merged = addPin(r, cid, a, true); break;   // a pin placed by hand
    case 'vote': {   // on a pin: 1 or -1, or 0 to take yours back
      const p = r.pins.find((x) => x.id === a.pin);
      if (!p) throw bad('no such pin');
      if (a.v === 0) delete p.votes[cid];
      else if (a.v === 1 || a.v === -1) p.votes[cid] = a.v;
      else throw bad('bad vote');
      break;
    }
    case 'area': {   // the limit area random pins land in; null clears it; anyone can set it
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
      if (a.v && !r.tvotes[k] && Object.keys(r.tvotes).length >= MAX_VOTED_HOURS) throw bad('too many voted hours');
      if (a.v) votes[cid] = a.v; else delete votes[cid];
      if (Object.keys(votes).length) r.tvotes[k] = votes; else delete r.tvotes[k];
      break;
    }
    case 'delete': {   // one of your own pins
      const p = r.pins.find((x) => x.id === a.pin);
      if (!p) break;
      if (p.by !== cid) throw bad('can only delete your own pins');
      r.pins = r.pins.filter((x) => x !== p);
      break;
    }
    case 'clearMine': r.pins = r.pins.filter((p) => p.by !== cid); break;   // all your pins
    case 'rename': {   // your name in this room
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

// The client's address: the connection's, or behind a trusted proxy the one it adds last to
// X-Forwarded-For (anything before that is whatever the client claimed).
function clientIp(req) {
  if (TRUST_PROXY) {
    const xff = String(req.headers['x-forwarded-for'] ?? '').split(',').pop().trim();
    if (xff) return xff;
  }
  return req.socket.remoteAddress ?? '';
}

const buckets = new Map();   // ip -> {t, n}: 30 actions / 10 s from one address
function limited(ip) {
  const now = Date.now(), b = buckets.get(ip);
  if (!b || now - b.t > 10000) { buckets.set(ip, { t: now, n: 1 }); return false; }
  return ++b.n > 30;
}
const connsFrom = new Map();   // ip -> open event streams
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (now - b.t > 10000) buckets.delete(k);
  sweep();
}, 60000).unref();

function json(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { req.pause(); reject(bad('body too large')); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}')); } catch { reject(bad('invalid JSON')); } });
    req.on('error', reject);
  });
}

function lanAddresses() {
  if (!LAN_INFO || (HOST !== '0.0.0.0' && HOST !== '::')) return [];
  return Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
}

// Why `cid` can't open room `id` right now, as [status, message], or null if it can.
function refusal(id, cid, ip) {
  if (!validCid(cid)) return [400, 'bad cid'];
  if ((connsFrom.get(ip) ?? 0) >= MAX_CONNS_PER_IP) return [429, 'too many connections'];
  const r = rooms.get(id);
  if (r && (r.conns.size >= MAX_CONNS || (!r.players[cid] && Object.keys(r.players).length >= MAX_PLAYERS))) return [503, 'room is full'];
  return null;
}

// Opening a room: the event stream. Being connected is being online in it. HEAD only asks whether it
// would open (the page's "why can't I connect" check), without joining.
function openStream(req, res, id, url) {
  const cid = url.searchParams.get('cid') || '', ip = clientIp(req), no = refusal(id, cid, ip);
  if (req.method === 'HEAD') { res.writeHead(no ? no[0] : 200, { 'Cache-Control': 'no-store' }); return res.end(); }
  if (no) return json(res, no[0], { error: no[1] });
  const r = getRoom(id, true);
  if (!r) return json(res, 503, { error: 'too many rooms' });
  r.players[cid] ??= { name: cleanName(url.searchParams.get('name')) || 'Player', color: nextColor(r) };
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write('retry: 2000\n\n');
  const conn = { res, cid, ip };
  r.conns.add(conn);
  connsFrom.set(ip, (connsFrom.get(ip) ?? 0) + 1);
  r.touched = Date.now();
  save();
  broadcast(r);   // includes this connection: initial snapshot + presence for everyone else
  res.write(sse('chat', { history: r.chat }));   // after the snapshot, so senders have names
  req.on('close', () => {
    r.conns.delete(conn);
    const n = (connsFrom.get(ip) ?? 1) - 1;
    if (n > 0) connsFrom.set(ip, n); else connsFrom.delete(ip);
    if (!r.conns.size && isEmpty(r)) rooms.delete(id);   // opened and left without doing anything
    else broadcast(r);
  });
}

async function postAction(req, res, id) {
  if (!/^application\/json/.test(req.headers['content-type'] || '')) return json(res, 415, { error: 'expected application/json' });
  if (limited(clientIp(req))) return json(res, 429, { error: 'slow down' });
  const body = await readBody(req, 32768);   // an area is up to MAX_AREA points; "clear mine" sends up to MAX_SLOTS slots
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw bad('expected an object');
  if (!validCid(body.cid)) return json(res, 400, { error: 'bad cid' });
  const r = getRoom(id, false);
  if (!r || ![...r.conns].some((c) => c.cid === body.cid)) return json(res, 403, { error: 'not connected to this room' });
  apply(r, body.cid, body);
  res.writeHead(204);
  res.end();
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  let url;
  try { url = new URL(req.url, 'http://x'); } catch { return json(res, 400, { error: 'bad URL' }); }
  try {
    const parts = url.pathname.split('/').filter(Boolean);
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      return res.end(fs.readFileSync(path.join(__dirname, 'index.html')));
    }
    if (req.method === 'GET' && url.pathname === '/api/info') return json(res, 200, { lan: lanAddresses(), port: PORT });
    if (parts[0] === 'api' && parts[1] === 'rooms' && ROOM_RE.test(parts[2] || '')) {
      if ((req.method === 'GET' || req.method === 'HEAD') && parts[3] === 'events') return openStream(req, res, parts[2], url);
      if (req.method === 'POST' && parts[3] === 'action') return await postAction(req, res, parts[2]);
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
