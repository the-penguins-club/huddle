# Huddle

Pick where and when a group meets: everyone drops pins on a map and marks the hours they're free, then
votes on both; the most-voted place and hour are the plan. One page (`index.html`, built from `src/`)
and one dependency-free Node server (`server.js`) holding rooms in memory, saved to `rooms.json`.

## Commands

| | |
|---|---|
| `node server.js` | serve on http://127.0.0.1:8765 (`HOST=0.0.0.0` for the LAN) |
| `node build.js` | build `index.html` from `src/` (`--watch` to rebuild on save, `--check` to verify) |
| `node dev/dummies.js [room] [n] [min]` | fill a room with fake members who pin, vote, chat, mark hours |
| `node scripts/harness-sync.js` | refresh `docs/map.md`'s generated sections (the hooks do this) |

The server reads `index.html` on every request: after a page change, build and reload. After a
`server.js` change, restart the server.

## Where things are

`docs/map.md` is the index: every file and `src/` part, the server's actions, the page's state and
stored settings. `docs/design.md` has the product and UI decisions (layouts, folding, the time model,
the visual language) and why. `docs/lessons.md` holds what bit us before. Read the relevant one before
changing an area.

## Rules

- Edit `src/`, never `index.html` by hand; build, and commit both (the pre-commit hook checks they
  match). `src/index.html` lists the parts in order; the scripts share one scope, so order matters.
- No dependencies, no bundler, no framework: plain HTML, CSS and a classic script; Leaflet and the
  map styles come from CDNs.
- CSS: components (`.btn`, `.seg`, `.field`, `.inline-edit`, `.float`, `.listbox`, `.gface`) are styled
  once in `src/styles/components/`; regions only place and size them. Colours, shadows, sizes and radii
  are tokens in `styles/tokens.css`, with a dark set. Reuse before adding.
- Layouts: desktop (> 960px), in between (601–960px), phones (≤ 600px). A change asked for one of them
  stays in that one unless the ask says otherwise; check all three anyway.
- Comments say why and what a reader would otherwise misread, in plain sentences, like the ones there.
- Server actions are validated and capped in `server.js`; keep `dev/dummies.js` working with them.
- Settings in the browser keep their `randompin.*` keys (renaming them would reset everyone's).
- Verify UI changes in the browser before saying they're done: the `verify-ui` skill.

## Commits

Imperative subject under 72 characters, a body that says what changed for the user and why; the
docs updates that go with a change go in the same commit. After cloning:
`git config core.hooksPath .githooks`.

## Keeping this harness current

This file and `docs/` are the project's memory; keep them true and short.

- The parts table and the action list in `docs/map.md` are generated from each part's first comment
  and the `case` comments in `server.js`: keep those comments descriptive. Agent hooks rebuild and
  resync after every edit, and the pre-commit hook checks both for everyone. The rest of map.md is
  hand-written: update it when files move.
- When an agent stops with code changed and none of the docs below, a hook asks it to check them.
- Changed behaviour or a UI decision: update `docs/design.md`.
- Learned something the hard way (a tool quirk, a regression and its cause): one entry in
  `docs/lessons.md`. Prune entries that stop being true.
- A procedure repeated three times: make it a skill in `.claude/skills/`.

Git history before 2026-10-16 is reconstructed: the project was developed without version control,
and the early commits add today's code part by part in the order the features were built. Only the
last commits are snapshots of a working app.
