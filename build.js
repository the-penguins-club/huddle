#!/usr/bin/env node
// Builds index.html (what server.js serves) from src/: src/index.html is the page with
// `<!-- @include path -->` lines, each replaced by that file from src/, verbatim and in order. The
// scripts are concatenated into one classic <script>, so they share one scope: order matters, and a
// file can use what an earlier one defined. No dependencies.
//
//   node build.js            write index.html
//   node build.js --check    exit 1 if index.html isn't what src/ builds (the pre-commit hook runs this)
//   node build.js --watch    rebuild whenever something in src/ changes
'use strict';
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'src');
const OUT = path.join(__dirname, 'index.html');
const INCLUDE = /^<!-- @include (\S+) -->\r?\n/gm;

function build() {
  const page = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
  const out = page.replace(INCLUDE, (_, file) => {
    const text = fs.readFileSync(path.join(SRC, file), 'utf8');
    if (!text.endsWith('\n')) throw new Error(`src/${file} must end with a newline`);
    return text;
  });
  const left = out.match(/^.*<!-- @include .*$/m);   // e.g. a stray space: it would ship as a comment
  if (left) throw new Error(`malformed include line in src/index.html: ${left[0].trim()}`);
  return out;
}

const mode = process.argv[2];
if (mode === '--check') {
  const want = build();
  const have = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (want !== have) {
    console.error('index.html is out of date: run `node build.js`');
    process.exit(1);
  }
  console.log('index.html is up to date');
} else if (mode === '--watch') {
  const write = () => {
    try { fs.writeFileSync(OUT, build()); console.log(`${new Date().toLocaleTimeString()} built index.html`); }
    catch (e) { console.error(e.message); }
  };
  write();
  let timer = null;
  fs.watch(SRC, { recursive: true }, () => { clearTimeout(timer); timer = setTimeout(write, 50); });
} else if (mode === undefined) {
  fs.writeFileSync(OUT, build());
  console.log('built index.html');
} else {
  console.error(`unknown option ${mode}; see the top of build.js`);
  process.exit(2);
}
