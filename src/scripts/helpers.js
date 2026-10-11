function el(tag, props = {}, ...kids) {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
}
// crypto.randomUUID() is missing on plain-http LAN addresses; getRandomValues is not.
function rid(bytes = 16) { return [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, '0')).join(''); }
function roomCode() { const A = 'abcdefghjkmnpqrstuvwxyz23456789'; return [...crypto.getRandomValues(new Uint8Array(10))].map((b) => A[b % A.length]).join(''); }

const cid = store.get(K.cid, null) || (() => { const v = rid(); store.set(K.cid, v); return v; })();
const ADJ = ['Quick', 'Calm', 'Brave', 'Lucky', 'Misty', 'Sunny', 'Witty', 'Bold', 'Merry', 'Swift'];
const ANI = ['Otter', 'Falcon', 'Panda', 'Heron', 'Lynx', 'Gecko', 'Koala', 'Tiger', 'Fox', 'Ibis'];
let myName = store.get(K.name, null) || (() => {
  const pick = (a) => a[crypto.getRandomValues(new Uint8Array(1))[0] % a.length];
  const v = `${pick(ADJ)} ${pick(ANI)}`; store.set(K.name, v); return v;
})();

