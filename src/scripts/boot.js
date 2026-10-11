/* ---------- boot ---------- */

fetch('/api/info').then((r) => r.json()).then((i) => { serverInfo = i; }).catch(() => {});
syncMarkers();
renderList();
renderRoom();
connect(hash.room || roomCode(), hash.room ? null : hash.area);   // no room in the link: a new one
// Back to the view (Space or Time) and, in the stacked layouts, the tab that were open.
{
  const s = store.get(K.tab, null);
  if (s?.view === 'time' || s?.view === 'space') setView(s.view);
  if (tabMQ.matches && ['pins', 'time', 'chat'].includes(s?.tab)) setTab(s.tab);
}
updateUrl();
if (store.get(K.tut, false)) locate(); else tutorial(locate);   // ask for location after the tutorial, not over it
