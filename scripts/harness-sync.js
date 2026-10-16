#!/usr/bin/env node
// Rewrites the generated sections of docs/map.md from the code, so the map can't drift from it:
// the page's parts in build order with the first comment line of each, and the server's actions with
// their comments. The rest of map.md is written by hand. The agent hooks run this after edits; it's
// also safe to run by hand: `node scripts/harness-sync.js` (`--check` exits 1 if map.md is stale).
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MAP = path.join(ROOT, 'docs/map.md');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

// The first comment in a file, as one line: its first sentence, without comment syntax. The
// stylesheet's numbered section markers ("---------- 3. components ----------") and its "=====" banner
// say where a part sits, not what it is, so they're skipped for the comment after them.
const MARKER = /^\s*(=====.*|-{3,}\s*\d+\.[^-]*-{3,})\s*$/s;
function summary(text) {
  const m = [...text.matchAll(/\/\*([\s\S]*?)\*\/|\/\/(.*)/g)].find((c) => !MARKER.test(c[1] ?? c[2]));
  if (!m) return '';
  let s = (m[1] ?? m[2]).replace(/\s+/g, ' ').replace(/-{3,}/g, '').trim();
  const dot = s.search(/\.(\s|$)/);
  if (dot > 0) s = s.slice(0, dot);
  return s.replace(/\|/g, '\\|');
}

function parts() {
  const files = [...read('src/index.html').matchAll(/^<!-- @include (\S+) -->$/gm)].map((m) => m[1]);
  return ['| part | what it is (its first comment) |', '|---|---|',
    ...files.map((f) => `| \`${f}\` | ${summary(read(path.join('src', f)))} |`)].join('\n');
}

function actions() {
  const src = read('server.js'), out = [];
  if (/a\.type === 'chat'/.test(src)) out.push("- `chat`: a message, sent to everyone (not part of the room's state)");
  for (const m of src.matchAll(/^\s*case '(\w+)':(.*)$/gm)) {
    const note = (m[2].match(/\/\/\s*(.*)$/) || [])[1];
    out.push(`- \`${m[1]}\`${note ? `: ${note}` : ''}`);
  }
  return out.join('\n');
}

const BLOCKS = { parts, actions };
const before = fs.readFileSync(MAP, 'utf8');
let after = before;
for (const [name, make] of Object.entries(BLOCKS)) {
  const re = new RegExp(`(<!-- generated: ${name} -->\\n)[\\s\\S]*?(<!-- /generated -->)`);
  if (!re.test(after)) { console.error(`docs/map.md has no "<!-- generated: ${name} -->" block`); process.exit(2); }
  after = after.replace(re, (_, open, close) => `${open}${make()}\n${close}`);
}
if (process.argv[2] === '--check') {
  if (after !== before) { console.error('docs/map.md is out of date: run `node scripts/harness-sync.js`'); process.exit(1); }
} else if (after !== before) {
  fs.writeFileSync(MAP, after);
  console.log('updated docs/map.md');
}
