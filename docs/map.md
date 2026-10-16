# Codebase map

## Top level

| | |
|---|---|
| `server.js` | rooms over HTTP + SSE, validation, persistence to `rooms.json` (no dependencies) |
| `index.html` | **built** from `src/` by `build.js`; served as is; committed so the repo runs without a build |
| `build.js` | replaces each `<!-- @include path -->` line in `src/index.html` with that file (`--check`, `--watch`) |
| `src/` | the page's source, below |
| `dev/dummies.js` | fake room members for trying the UI with several people (`node dev/dummies.js room 6 10`) |
| `Dockerfile`, `docker-compose.yml`, `.env.example` | one container behind Traefik; rooms on a volume |
| `.githooks/pre-commit` | `build.js --check` and `node --check` |
| `.claude/` | agent settings (rebuild on edit) and the `verify-ui` skill |
| `docs/` | this map, `design.md` (decisions), `lessons.md` (gotchas) |

## Server (`server.js`)

- `GET /` serves `index.html` (read per request); `GET /api/info` gives LAN addresses and port.
- `GET /api/rooms/:id/events?cid=&name=`: an SSE stream; being connected is being online. Events:
  `state` (the room's snapshot), `chat` (history first, then each message), `merge` (a pin joined another).
- `POST /api/rooms/:id/action` with `{cid, type, …}`. Types: `drop`, `place` (pins; within 100 m of one
  they merge into a vote for it), `vote`, `label`, `delete`, `clearMine`, `area`, `rename`, `chat`,
  `event` (the huddle's name), `range` (time limit), `avail` (free hours), `tstat` (hours / any / out),
  `tvote` (±1 or 0 on an hour). Limits are the constants at the top (`MAX_*`).
- Rooms expire after 14 idle days; saving is debounced into `DATA_FILE` (`rooms.json` locally).

## Page (`src/`)

`src/index.html` is the markup plus the include list. Parts, in build order:

**Head**: `head/theme-init.js` resolves the light/dark theme into `<html data-theme>` before first paint.

**Styles** (`src/styles/`)

| part | |
|---|---|
| `tokens.css` | the stylesheet's outline; colour, shadow, type and radius tokens, light and dark |
| `base.css` | element defaults, focus ring, placeholders |
| `components/` | `buttons`, `switch` (.seg), `fields` (.field, .inline-edit), `float`, `lists` (.listbox), `grip` (.gface, the penguin), `avatars` (.face) |
| `regions/` | `frame` (#app, #map), `panel`, `room`, `pick` (most-voted box), `time` (calendar grid, key), `chat`, `map` (pins, controls), `floating` (pin card, toasts), `tutorial` |
| `layouts/` | `desktop` (> 960px), `stacked` (≤ 960px: strip, folding, tabs), `phone` (≤ 600px), `tablet` (601–960px), `touch` (16px fields) |

**Scripts** (`src/scripts/`, one shared scope, in this order)

| part | what's in it |
|---|---|
| `core.js` | `K` (storage keys), `store`, `DHAKA`, `$` |
| `theme.js` | the sun/moon switch |
| `helpers.js` | `el`, ids (`rid`, `roomCode`), your `cid` and `myName` |
| `state.js` | `pins`, `room`, `roomId`, `selectedId`, `score`, `nameOf` |
| `url.js` | the `#room=…&map=…` hash: `parseHash`, `updateUrl` |
| `map.js` | the Leaflet map; the panel strip's fold states and heights (`setFold`, `setPanelHeight`); the limit area (`setArea`, `inArea`); initial view; reset control |
| `area.js` | drawing an area: box or freehand |
| `place.js` | placing a pin by hand |
| `share.js` | share link and copying |
| `notices.js` | the one-line notice under the room box |
| `markers.js` | pin icons (identicons, vote size and badge), `syncMarkers`, merge animation, `randomPoint` |
| `list.js` | the pin list (`renderList`) |
| `detail.js` | pin labels (edited in the list) and the selected pin's card |
| `basemap.js` | OSM (OpenFreeMap Liberty, raster fallback) or Google's keyless embed, per browser |
| `actions.js` | `post` and the pin actions |
| `chat.js` | tabs (`setTab`), the chat (IRC style, `#n` links, mentions, chirp), toasts, chat height |
| `multiplayer.js` | the room box and people list (`renderRoom`), your name, `applyState`, `connect`, new huddle |
| `locate.js` | first visit: start near the user |
| `tutorial.js` | the steps (`TUT`) and the walkthrough |
| `time.js` | Space/Time (`setView`); the calendar model (`timeModel`: who counts, hour states, the pick) and `renderTime`; painting strokes; the pick box (`renderPick`); the huddle's name (`renderHname`); `.ics` |
| `boot.js` | start-up: connect, restore the open view/tab, tutorial or locate |

## Browser settings (`localStorage`, keys `randompin.*`)

`cid`, `name`, `theme`, `basemap`, `view` (map position), `tab` (open view and tab), `sort`, `fold`,
`panelHeight`, `listHeight`, `chatHeight`, `mute`, `shape` (area tool), `tutorial` (seen).
