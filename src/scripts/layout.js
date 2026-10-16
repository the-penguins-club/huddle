/* ---------- layout: the view, the tabs, and the stacked layouts' panel (folding, heights) ---------- */

// Breakpoints, the same as the CSS: at 960px and under the panel goes under the map or calendar, with
// tabs at the bottom; at 600px and under (phones) the chat is a tab of its own.
const tabMQ = matchMedia('(max-width: 960px)');
const phoneMQ = matchMedia('(max-width: 600px)');

// The view is what the main area shows: the map (Space) or the calendar (Time). The stacked layouts'
// tabs are Space | Time | on phones also Chat, which keeps the map or calendar above it. Outside the
// Chat tab the tab follows the view, in every layout, so both can be restored on reload.
let view = 'space', tab = 'pins';
function setView(v) {
  view = v === 'time' ? 'time' : 'space';
  if (tab !== 'chat') tab = view === 'time' ? 'time' : 'pins';
  store.set(K.tab, { view, tab });
  document.body.classList.toggle('view-time', view === 'time');
  document.body.classList.toggle('tab-chat', tab === 'chat');
  for (const b of $('views').children) b.setAttribute('aria-selected', String(b.dataset.v === view));
  for (const [id, t] of [['tabpins', 'pins'], ['tabtime', 'time'], ['tabchat', 'chat']]) $(id).setAttribute('aria-selected', String(tab === t));
  $('time').hidden = view !== 'time';
  (view === 'time' ? $('time') : cont).append(toasts);   // notes and chat pop-ups follow the visible view
  if (view !== 'time') setLimitMode(false);
  renderTime();
  chatSeen();
}
// Picking a tab leaves a folded panel folded. Off phones there's no Chat tab: it stays on the view's.
function setTab(t) {
  if (t === 'chat' && !phoneMQ.matches) t = view === 'time' ? 'time' : 'pins';
  tab = t;
  setView(t === 'time' ? 'time' : t === 'chat' ? view : 'space');
}
for (const b of $('views').children) b.addEventListener('click', () => setView(b.dataset.v));
$('tabpins').addEventListener('click', () => setTab('pins'));
$('tabtime').addEventListener('click', () => setTab('time'));
$('tabchat').addEventListener('click', () => setTab('chat'));
phoneMQ.addEventListener('change', () => setTab(tab));   // widening a phone past its Chat tab

// Is the chat's message list on screen? Beside the lists on desktop; in the stacked layouts, unless the
// panel is folded (and on phones, only in the Chat tab).
const chatShown = () => !tabMQ.matches || (fold !== 'folded' && (!phoneMQ.matches || tab === 'chat'));

// Your name box lives in the chat's title bar; in the stacked layouts, where that bar is hidden, at the
// right of the panel strip. The chat's bell likewise.
function placeMe() {
  const stacked = tabMQ.matches;
  const to = stacked ? $('foldme') : $('mebox');
  if ($('me').parentElement !== to) to.append($('me'));
  const bell = stacked ? $('foldmute') : document.querySelector('#chat > .chatbar .rt');
  if ($('mute').parentElement !== bell) bell.prepend($('mute'));
}
placeMe();

// Stacked layouts only: the strip on top of the panel. Tapping it steps through three states: open;
// just the list (the controls above it fold away, so the list gets the panel); folded to one row of
// buttons (so the map or calendar gets the screen); and back to open. Dragging it resizes the panel.
// The state and the heights are the same in Space, Time and Chat, and remembered.
// Just the list: a shorter panel, the same height in every tab. Stepping to it from open sizes it to the
// list box as it is then (the controls above go); dragging the strip then resizes it.
const FOLDS = ['open', 'list', 'folded'];
let fold = 'open', listPanelH = store.get(K.listH, null);
const clampPanelH = (h) => Math.round(Math.max(120, Math.min(window.innerHeight - 44 - 140, h)));   // leave the tabs and some map
function setListPanelH(h) {
  listPanelH = h == null ? null : clampPanelH(h);
  $('panel').style.setProperty('--list-panel-h', listPanelH ? `${listPanelH}px` : '55%');
}
// `measure`: a tap from open to just-the-list, which sizes it to the list box. Restoring a saved state
// (on load, after the tutorial) keeps the height the user left.
function setFold(f, measure = false) {
  f = FOLDS.includes(f) ? f : 'open';
  const box = measure && f === 'list' && fold === 'open' && [...document.querySelectorAll('.listbox')].find((b) => b.getClientRects().length);
  if (box) {
    const m = getComputedStyle(box);
    setListPanelH($('panel').offsetHeight - $('scroller').offsetHeight + parseFloat(m.marginTop) + box.offsetHeight + parseFloat(m.marginBottom));
    store.set(K.listH, listPanelH);
  }
  fold = f;
  $('panel').classList.toggle('listonly', fold === 'list');
  $('panel').classList.toggle('folded', fold === 'folded');
  $('fold').setAttribute('aria-expanded', String(fold !== 'folded'));
  const next = { open: 'Show just the list', list: 'Hide the panel', folded: 'Show the panel' }[fold];
  $('fold').title = `Tap: ${next.toLowerCase()}; drag to resize`;
  $('fold').setAttribute('aria-label', `${next} (drag to resize)`);
  store.set(K.fold, fold);
}
const stepFold = () => { setFold(FOLDS[(FOLDS.indexOf(fold) + 1) % FOLDS.length], true); chatSeen(); };
function setPanelHeight(h) {
  if (!tabMQ.matches || h == null) { $('panel').style.height = ''; return; }
  $('panel').style.height = `${Math.max(160, clampPanelH(h))}px`;
}
let foldDrag = null, foldDragged = false;
$('fold').addEventListener('pointerdown', (e) => {
  if (!tabMQ.matches || e.button !== 0 || e.target.closest('button, input, .me')) return;
  foldDrag = { y: e.clientY, h: $('panel').offsetHeight, moved: false };
  foldDragged = false;
  $('fold').setPointerCapture(e.pointerId);
});
$('fold').addEventListener('pointermove', (e) => {
  if (!foldDrag) return;
  const dy = foldDrag.y - e.clientY;
  if (!foldDrag.moved && Math.abs(dy) < 6) return;   // still a tap
  foldDrag.moved = true;
  if (fold === 'folded') setFold('open');
  if (fold === 'list') setListPanelH(foldDrag.h + dy);
  else setPanelHeight(foldDrag.h + dy);
});
function endFoldDrag() {
  if (foldDrag?.moved) { foldDragged = true; store.set(fold === 'list' ? K.listH : K.panelH, $('panel').offsetHeight); }
  foldDrag = null;
}
$('fold').addEventListener('pointerup', endFoldDrag);
$('fold').addEventListener('pointercancel', endFoldDrag);
$('fold').addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === $('fold')) { e.preventDefault(); stepFold(); } });
$('fold').addEventListener('click', (e) => {
  if (e.target.closest('button, input, .me')) return;   // the bell or your name, not the strip
  if (foldDragged) { foldDragged = false; return; }   // that was a drag, not a tap
  stepFold();
});
// Heights are clamped to the window: re-clamp when it changes (rotating a phone, say), and the
// desktop layout ignores them.
const fitPanel = () => { setPanelHeight(store.get(K.panelH, null)); setListPanelH(listPanelH); };
addEventListener('resize', fitPanel);
tabMQ.addEventListener('change', () => { fitPanel(); placeMe(); });
fitPanel();
{ const f = store.get(K.fold, 'open'); setFold(f === true ? 'folded' : f); }   // (an older version stored true/false)
