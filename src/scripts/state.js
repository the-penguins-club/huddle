/* ---------- state: the room as the server last sent it, and what's selected ---------- */

// Everything happens in a room (there's no solo mode): the room id in the link is the only key to it.
// The shapes are server.js's (see blankRoom there). Pin: {id, n, lat, lng, ts, by (cid), votes: {cid: 1|-1}, label?, manual?}
let pins = [];
let roomId = null, es = null, status = 'connecting';   // status: connecting | live | reconnecting | offline
const blankRoom = () => ({ players: {}, online: [], event: null, range: null, avail: {}, tstat: {}, tvotes: {} });
let room = blankRoom();
let selectedId = null, sortMode = store.get(K.sort, 'new') === 'top' ? 'top' : 'new';
let serverInfo = null;
const markers = new Map();

const score = (p) => Object.values(p.votes).reduce((a, b) => a + b, 0);
const myVote = (p) => p.votes[cid] || 0;
const nameOf = (c) => (c === cid ? 'You' : room.players[c]?.name || 'Someone');
const colorOf = (c) => room.players[c]?.color;

