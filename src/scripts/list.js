/* ---------- pin list: the room's pins, newest or top first, with votes; sort and "Clear mine" ---------- */

function renderList() {
  const list = $('list');
  const mine = pins.filter((p) => p.by === cid).length;
  $('count').textContent = pins.length ? `Pins · ${pins.length}` : 'Pins';
  $('clear').hidden = !mine;
  $('clear').textContent = clearTimer ? `Click again to delete ${mine}` : 'Clear mine';   // (re-renders keep the confirm)
  $('sort').textContent = `Sort: ${sortMode === 'top' ? 'top' : 'newest'}`;
  updatePlaceBtn();
  renderDetail();
  // Room updates re-render the list; while a label is being typed in it, leave the rows (and focus) alone.
  if (labelEdit && list.contains(labelInput)) return;
  list.replaceChildren();
  if (!pins.length) {
    list.append(el('li', { className: 'empty' }, 'No pins yet.'));
    return;
  }
  const shown = sortMode === 'top' ? [...pins].sort((a, b) => score(b) - score(a) || b.ts - a.ts) : pins;
  for (const p of shown) {
    const c = colorOf(p.by);
    const li = el('li', { className: [p.id === pins[0].id && 'latest', c && 'owned', p.id === selectedId && 'sel'].filter(Boolean).join(' ') });
    if (c) li.style.setProperty('--pc', c);

    const v = myVote(p);
    const up = el('button', { type: 'button', title: 'Upvote', className: v === 1 ? 'on' : '' }, '▲');
    const down = el('button', { type: 'button', title: 'Downvote', className: v === -1 ? 'on' : '' }, '▼');
    up.addEventListener('click', (e) => { e.stopPropagation(); vote(p, 1); });
    down.addEventListener('click', (e) => { e.stopPropagation(); vote(p, -1); });

    const acts = el('div', { className: 'acts' });
    if (p.by === cid) {
      const del = el('button', { title: 'Delete pin', type: 'button' }, '×');
      del.addEventListener('click', (e) => { e.stopPropagation(); removePin(p.id); });
      acts.append(del);
    }

    // First line: the label, or the coordinates until there is one; on your own pins it's the click
    // target for editing the label. Second line (rooms): who dropped it. Then delete, then votes.
    const coords = `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
    const first = el('span', { className: p.label ? 'lbl' : 'll', title: p.label ? coords : '' }, p.label || coords);
    if (p.by === cid) {
      first.classList.add('mine');
      first.title = p.label ? `${coords} · click to edit the label` : 'Click to add a label';
      first.addEventListener('click', (e) => { e.stopPropagation(); startLabel(p); });
    }
    li.append(
      el('span', { className: 'num' }, String(p.n)),
      el('div', { className: 'meta' },
        labelEdit === p.id ? labelInput : el('div', { className: 'coords' }, p.manual ? el('span', { title: 'Placed by hand' }, '✋ ') : '', first),
        el('div', { className: 'when' }, nameOf(p.by))),
      acts,
      el('div', { className: 'votes seg' }, up, el('b', {}, String(score(p))), down),
    );
    li.addEventListener('click', () => select(p.id, true));
    list.append(li);
  }
}

$('sort').addEventListener('click', () => { sortMode = sortMode === 'top' ? 'new' : 'top'; store.set(K.sort, sortMode); renderList(); });

// Clear mine: a two-step confirm inline, since native confirm() is silently suppressed in some embedded
// browsers (and after "prevent additional dialogs").
let clearTimer = null;
$('clear').addEventListener('click', () => {
  if (!clearTimer) {
    clearTimer = setTimeout(() => { clearTimer = null; renderList(); }, 3000);
    renderList();
    return;
  }
  clearTimeout(clearTimer); clearTimer = null;
  selectedId = null;
  post({ type: 'clearMine' });
  renderList();
});
