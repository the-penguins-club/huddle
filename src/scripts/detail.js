/* ---------- selected-pin card: where is it, in Google Maps and OSM ---------- */

const detail = el('div', { id: 'detail', className: 'float', hidden: true });
cont.append(detail);
L.DomEvent.disableClickPropagation(detail);
L.DomEvent.disableScrollPropagation(detail);

const gmapsUrl = (p) => `https://www.google.com/maps/search/?api=1&query=${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
const COPY_ICON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 3.5v-1a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h1"/></svg>';
const osmUrl = (p) => `https://www.openstreetmap.org/?mlat=${p.lat.toFixed(6)}&mlon=${p.lng.toFixed(6)}#map=17/${p.lat.toFixed(6)}/${p.lng.toFixed(6)}`;

// Labels: a couple of words naming the spot (shop, park, …), set by whoever dropped the pin and
// edited in place in the pin list: click your pin's label (or "+ label") to type.
const MAX_LABEL = 30;   // same as the server
let labelEdit = null;   // id of the pin whose label is being typed
const labelInput = el('input', { className: 'inline-edit strong', maxLength: MAX_LABEL, placeholder: 'Shop, park, corner…', spellcheck: false, autocomplete: 'off', enterKeyHint: 'done' });
labelInput.setAttribute('aria-label', 'Pin label');
labelInput.addEventListener('click', (e) => e.stopPropagation());   // don't select the pin
labelInput.addEventListener('keydown', (e) => {
  if (e.isComposing) return;   // Enter that confirms a word in an input method (Chinese, Japanese…)
  if (e.key === 'Enter') { e.preventDefault(); endLabel(true); }
  else if (e.key === 'Escape') { e.stopPropagation(); endLabel(false); }   // cancel the edit, not deselect the pin
});
labelInput.addEventListener('blur', () => endLabel(true));
function startLabel(p) {
  labelEdit = p.id;
  labelInput.value = p.label || '';
  renderList();
  labelInput.scrollIntoView({ block: 'nearest' });
  labelInput.focus();
  labelInput.select();
}
function endLabel(save) {
  if (!labelEdit) return;
  const id = labelEdit;
  labelEdit = null;
  const p = pins.find((x) => x.id === id), v = labelInput.value.replace(/\s+/g, ' ').trim();
  if (save && p && v !== (p.label || '')) setLabel(p, v);
  renderList();
}
function setLabel(p, label) {
  post({ type: 'label', pin: p.id, label });
}

// Rebuilt only when what it shows changes, not on every room update: that would take the focus off its
// buttons and cut a copy's ✓ short.
let detailSig = '';
function renderDetail() {
  const p = pins.find((x) => x.id === selectedId);
  detail.hidden = !p;
  const sig = p ? [p.id, p.label, nameOf(p.by), p.manual].join('|') : '';
  if (!p || sig === detailSig) { detailSig = sig; return; }
  detailSig = sig;
  // Compact: a label, then open (↗) and copy buttons for its URL.
  const link = (label, url) => {
    const open = el('a', { className: 'btn sm', href: url, target: '_blank', rel: 'noopener', title: `Open in ${label}` }, '↗');
    const copy = el('button', { type: 'button', className: 'btn sm', title: `Copy ${label} link` });
    const icon = () => (copy.innerHTML = COPY_ICON);
    icon();
    copy.addEventListener('click', async () => {
      copy.textContent = (await copyText(url)) ? '✓' : '✗';
      setTimeout(icon, 1200);
    });
    open.setAttribute('aria-label', `Open in ${label}`);
    copy.setAttribute('aria-label', `Copy ${label} link`);
    return el('span', { className: 'lk' }, label, open, copy);
  };
  const close = el('button', { type: 'button', className: 'x', title: 'Close (Esc)' }, '×');
  close.addEventListener('click', () => { selectedId = null; renderList(); });
  const title = `#${p.n}${p.label ? ` ${p.label}` : ''} · ${nameOf(p.by)}${p.manual ? ' · by hand' : ''}`;
  detail.replaceChildren(
    el('div', { className: 'dhead' }, el('span', { title }, title), close),
    el('div', { className: 'dcoords' }, `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`),
    el('div', { className: 'links' }, link('Google', gmapsUrl(p)), link('OSM', osmUrl(p))),
  );
}

// Selecting a pin zooms in far enough to see shops and street names around it,
// but never zooms out. pan=false (a click on the marker itself) zooms around the marker instead.
const CLOSE_ZOOM = 17;
function select(id, pan) {
  selectedId = id;
  renderList();
  const p = pins.find((x) => x.id === id);
  if (!p) return;
  const z = Math.max(map.getZoom(), CLOSE_ZOOM);
  if (pan) map.setView([p.lat, p.lng], z);
  else if (map.getZoom() < z) map.setZoomAround([p.lat, p.lng], z);
  bounce(markers.get(id));
}

