/* ---------- core: browser settings (localStorage), the default region, and $ ---------- */

// Browser settings: one key each, all prefixed randompin. (the project's old name; kept so settings survive).
const K = { theme: 'randompin.theme', view: 'randompin.view', cid: 'randompin.cid', name: 'randompin.name', fold: 'randompin.fold', panelH: 'randompin.panelHeight', shape: 'randompin.shape', mute: 'randompin.mute', chatH: 'randompin.chatHeight', listH: 'randompin.listHeight', tut: 'randompin.tutorial', tab: 'randompin.tab', sort: 'randompin.sort', base: 'randompin.basemap' };
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// Default region: Gabtoli (W), Kuril (N), Sadarghat (S), Aftabnagar (E), with a little margin.
const DHAKA = [[23.700, 90.335], [23.828, 90.450]];

const $ = (id) => document.getElementById(id);
