#!/usr/bin/env node
// Builds index.html (what server.js serves, next to it) from src/: src/index.html is the page with
// `<!-- @include path -->` lines, each replaced by that file from src/, in order. A .styl file (the
// stylesheet, which @imports its parts) is compiled by Stylus first; anything else goes in verbatim.
// The scripts are concatenated into one classic <script>, so they share one scope: order matters, and
// a file can use what an earlier one defined. Needs `npm install` (for Stylus) once.
//
//   node build.js            write index.html
//   node build.js --watch    rebuild whenever something in src/ changes
'use strict';
const fs = require('fs');
const path = require('path');
const stylus = require('stylus');

const SRC = path.join(__dirname, 'src');
const OUT = path.join(__dirname, 'index.html');
const INCLUDE = /^<!-- @include (\S+) -->\r?\n/gm;

function include(file) {
  const full = path.join(SRC, file), text = fs.readFileSync(full, 'utf8');
  if (!text.endsWith('\n')) throw new Error(`src/${file} must end with a newline`);
  return file.endsWith('.styl') ? stylus(text).set('filename', full).render() : text;
}

function build() {
  const page = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
  const out = page.replace(INCLUDE, (_, file) => include(file));
  const left = out.match(/^.*<!-- @include .*$/m);   // e.g. a stray space: it would ship as a comment
  if (left) throw new Error(`malformed include line in src/index.html: ${left[0].trim()}`);
  fs.writeFileSync(OUT, out);
}

const mode = process.argv[2];
if (mode === '--watch') {
  const write = () => {
    try { build(); console.log(`${new Date().toLocaleTimeString()} built index.html`); }
    catch (e) { console.error(e.message); }
  };
  write();
  let timer = null;
  fs.watch(SRC, { recursive: true }, () => { clearTimeout(timer); timer = setTimeout(write, 50); });
} else if (mode === undefined) {
  build();
  console.log('built index.html');
} else {
  console.error(`unknown option ${mode}; see the top of build.js`);
  process.exit(2);
}
