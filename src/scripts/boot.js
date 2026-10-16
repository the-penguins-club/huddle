/* ---------- boot: join the room, restore the view, first-run tutorial ---------- */

fetch('/api/info').then((r) => r.json()).then((i) => { serverInfo = i; }).catch(() => {});
connect(hash.room || roomCode(), hash.room ? null : hash.area);   // no room in the link: a new one
// Back to the view (Space or Time) and, in the stacked layouts, the tab that were open.
{
  const s = store.get(K.tab, null);
  setView(s?.view);
  if (s?.tab === 'chat') setTab('chat');
}
updateUrl();
if (store.get(K.tut, false)) locate(); else tutorial(locate);   // ask for location after the tutorial, not over it
