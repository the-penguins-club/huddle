/* ---------- state ---------- */

// Pin: {id, n, lat, lng, ts, by (cid), votes: {cid: 1|-1}}
const normalize = (p) => ({ ...p, by: p.by || cid, votes: p.votes || {} });
// Everything happens in a room (there's no solo mode): the room id in the link is the only key to it.
let pins = [];                         // the room's pins, from the server
let roomId = null, es = null, status = 'connecting';
let room = { players: {}, online: [] };
let selectedId = null, sortMode = store.get(K.sort, 'new') === 'top' ? 'top' : 'new';
let serverInfo = null;
const markers = new Map();

const score = (p) => Object.values(p.votes).reduce((a, b) => a + b, 0);
const myVote = (p) => p.votes[cid] || 0;
const nameOf = (c) => (c === cid ? 'You' : room.players[c]?.name || 'Someone');
const colorOf = (c) => room.players[c]?.color;

