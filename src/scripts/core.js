/* ---------- core: browser settings (localStorage), the default region, and $ ---------- */

// Browser settings: one key each, all prefixed huddle. (older randompin.* ones are moved over in head/settings.js).
const K = { theme: 'huddle.theme', view: 'huddle.view', cid: 'huddle.cid', name: 'huddle.name', fold: 'huddle.fold', panelH: 'huddle.panelHeight', shape: 'huddle.shape', mute: 'huddle.mute', chatH: 'huddle.chatHeight', listH: 'huddle.listHeight', tut: 'huddle.tutorial', tab: 'huddle.tab', sort: 'huddle.sort', base: 'huddle.basemap' };
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// Default region: Gabtoli (W), Kuril (N), Sadarghat (S), Aftabnagar (E), with a little margin.
const DHAKA = [[23.700, 90.335], [23.828, 90.450]];

const $ = (id) => document.getElementById(id);
