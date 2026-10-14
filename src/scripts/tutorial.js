/* ---------- first-run tutorial: once per browser ---------- */

// Each step shows its view (Space: the map; Time: the calendar), switching to it as it goes.
// A step's text can be a function, for things that change (your name).
const TUT = [
  { v: 'space', els: [], h: 'Huddle', t: 'Pick where and when the penguin huddle happens. Throw pins on the map and tell everyone when you\'re free, then vote on both. The huddle happens at the most-voted place and time.' },
  { v: 'space', els: ['share', 'draw'], h: 'Share, and limit the area', t: 'The share button copies a link for your huddle mates, so everyone can weigh in with pins, votes, and arguments in the chat. Limit area keeps pins inside an area; anyone can set or clear it.' },
  { v: 'time', els: ['tgrid', 'tany', 'tskip'], h: 'When you\'re free', t: 'Mark when you\'re free; the others mark theirs. Hours where everyone is free turn green; then vote on them. You can say Free anytime or Skip, and still vote either way.' },
  { v: 'time', els: ['pick', 'hname'], demo: true, h: 'The huddle', t: 'The most-voted place and time show up here: this is where the huddle happens. Add it to your calendar with the button; the event is named after the huddle, which anyone can rename at the top.' },
  { v: 'chat', els: ['chatform', 'me'], h: 'Chat', t: () => `Your name is ${myName} (click it to change it). Chat with the others here: type someone's name to notify them, and #3 to link pin 3.` },
];

// The "?" by the title: the tutorial again, any time.
$('help').addEventListener('click', () => { if (!$('tut')) tutorial(() => {}); });

function tutorial(done) {
  store.set(K.tut, true);   // once, even if the tab is closed halfway through
  // Afterwards, back to the view or tab (and fold) you were on.
  const before = { view, tab, fold };
  const steps = TUT.filter((s) => s.v === 'space' || roomId);
  // Stacked layouts: every step points at the panel, so make sure it's showing.
  if (tabMQ.matches) { setFold('open'); setTab('pins'); }
  // The chat is beside the lists except on phones, where it's a tab (over whichever view was last).
  const goTo = (v) => {
    if (v === 'chat') { if (phoneMQ.matches) setTab('chat'); return; }
    if (tabMQ.matches) { if (tab !== (v === 'time' ? 'time' : 'pins')) setTab(v === 'time' ? 'time' : 'pins'); }
    else if (view !== v) setView(v);
  };
  // The card floats over the middle of whatever's showing: the map or the calendar.
  const place = () => {
    const r = (view === 'time' ? $('time') : cont).getBoundingClientRect();
    card.style.left = `${r.left + r.width / 2}px`;
    card.style.top = `${r.top + r.height / 2}px`;
  };
  let i = 0, lit = [];
  const head = el('b', { id: 'tuth' }), step = el('span'), text = el('p');
  const skip = el('button', { type: 'button', className: 'link' }, 'Skip tutorial');
  const next = el('button', { type: 'button', className: 'btn primary' });
  const card = el('div', { id: 'tut', className: 'float' }, el('div', { className: 'th' }, head, step), text, el('div', { className: 'tb' }, skip, next));
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-labelledby', 'tuth');
  const unlight = () => lit.forEach((e) => e.classList.remove('tut-hl'));
  function show() {
    unlight();
    const s = steps[i];
    goTo(s.v);
    setDemo(!!s.demo);
    place();
    lit = s.els.map($).filter((e) => e?.getClientRects().length);   // only what's on screen (e.g. "mp" or "room")
    lit.forEach((e) => e.classList.add('tut-hl'));
    lit[0]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });   // the phone panel scrolls
    head.textContent = s.h; text.textContent = typeof s.t === 'function' ? s.t() : s.t;
    step.textContent = `${i + 1}/${steps.length}`;
    next.textContent = i === steps.length - 1 ? 'Done' : 'Next';
  }
  function close() {
    unlight(); card.remove();
    setDemo(false);
    document.removeEventListener('keydown', onKey, true);
    removeEventListener('resize', place);
    if (tabMQ.matches) {
      if (before.tab === 'chat') setView(before.view);   // the Chat tab keeps whichever view was above it
      setTab(before.tab);
      setFold(before.fold);
    } else setView(before.view);
    done();
  }
  const onKey = (e) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); close(); } };
  next.addEventListener('click', () => (++i < steps.length ? show() : close()));
  skip.addEventListener('click', close);
  document.addEventListener('keydown', onKey, true);
  addEventListener('resize', place);
  document.body.append(card);
  L.DomEvent.disableClickPropagation(card);
  L.DomEvent.disableScrollPropagation(card);
  show();
  next.focus();
}

