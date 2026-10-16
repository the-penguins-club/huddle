# Codebase map

## Top level

| | |
|---|---|
| `server.js` | rooms over HTTP + SSE, validation, persistence to `data/rooms.json` (no dependencies) |
| `index.html` | **built** from `src/` by `build.js`, not committed; what the server serves |
| `build.js` | replaces each `<!-- @include path -->` line in `src/index.html` with that file, compiling `.styl` with Stylus (`--watch`) |
| `package.json` | the build's one dependency (`stylus`, pinned; `package-lock.json`) and the npm scripts |
| `src/` | the page's source, below |
| `dev/dummies.js` | fake room members for trying the UI with several people (`node dev/dummies.js room 6 10`) |
| `Dockerfile`, `docker-compose.yml`, `.env.example` | one container behind Traefik (the image builds the page in a first stage); rooms on a volume |
| `.github/workflows/build.yml` | builds the Docker image and pushes it to `ghcr.io/<owner>/<repo>` (main, `v*` tags, or by hand); nothing else |
| `.githooks/pre-commit` | a build (the stylesheet must compile), `scripts/harness-sync.js --check`, `node --check`; refuses unstaged changes in what it checks |
| `scripts/harness-sync.js` | rewrites this map's generated sections from the code (`--check` to verify) |
| `.claude/` | agent hooks (rebuild and resync on edit; at stop, a nudge to update the docs) and the `verify-ui` skill |
| `docs/` | this map, `design.md` (decisions), `lessons.md` (gotchas) |

## Server (`server.js`)

- `GET /` serves `index.html` (read per request, so a rebuild shows on reload); `GET /api/info` gives LAN addresses (unless `LAN_INFO=0`) and port.
- `GET /api/rooms/:id/events?cid=&name=`: an SSE stream; opening it creates the room, being connected is
  being online. Events: `state` (the room's snapshot), `chat` (history first, then each message),
  `merge` (a pin joined another). `HEAD` on it only says whether it would open.
- `POST /api/rooms/:id/action` with `{cid, type, …}`, only from a `cid` connected to the room (else 403).
  Caps are the `MAX_*` constants at the top; limits go per IP (`TRUST_PROXY=1`: the proxy's
  `X-Forwarded-For`). Types:

<!-- generated: actions -->
- `chat`: a message, sent to everyone (not part of the room's state)
- `drop`: a random pin (the page picks the spot)
- `place`: a pin placed by hand
- `vote`: on a pin: 1 or -1, or 0 to take yours back
- `area`: the limit area random pins land in; null clears it; anyone can set it
- `label`: a couple of words naming the spot (shop, park, …); only whoever dropped the pin
- `range`: the time limit everyone picks within; null clears it (the whole calendar again)
- `avail`: painting: hours to add to and remove from your free time
- `event`: the huddle's name, also the title of everyone's calendar event: anyone can change it
- `tstat`: your answer: pick hours (the default), free anytime, or skip
- `tvote`: vote an hour up (1) or down (-1), or take it back (0), like pins; as many hours as you like
- `delete`: one of your own pins
- `clearMine`: all your pins
- `rename`: your name in this room
<!-- /generated -->

- Rooms expire after 14 idle days; a room left with nothing in it is dropped when its last visitor
  goes; at `MAX_ROOMS` the least recently used empty-of-people room goes. Saving is throttled into
  `DATA_DIR/rooms.json` (`data/` locally, `/app/data` in Docker: mount it to keep rooms),
  synchronous on SIGTERM/SIGINT; an unreadable file is moved aside.

## Page (`src/`)

`src/index.html` is the markup plus the include list. The stylesheet is `styles/index.styl`, which
`@import`s its parts in cascade order and compiles into one `<style>`; the scripts go into one
`<script>` with one shared scope. The parts, in build order, each described by its first comment:

<!-- generated: parts -->
| part | what it is (its first comment) |
|---|---|
| `head/theme-init.js` | Theme: follows the system unless you've picked the other one with the sun/moon button (remembered) |
| `styles/index.styl` | Huddle's stylesheet, in cascade order: build.js compiles this file into the page's <style> |
| `styles/helpers.styl` | Stylus helpers, for CSS that Stylus would otherwise read as its own |
| `styles/tokens.styl` | Tokens: colours, shadows, type and shape, for the light theme and then the dark one |
| `styles/base.styl` | Base: box sizing, type, focus rings, placeholders, headings, and [hidden] |
| `styles/components/buttons.styl` | Buttons |
| `styles/components/switch.styl` | Segmented switch (.seg): a recessed track; the chosen option is a raised chip |
| `styles/components/fields.styl` | Text fields |
| `styles/components/float.styl` | Floating boxes (.float): over the map, calendar or panel (the pin card, toasts, the people dropdown, the tutorial) |
| `styles/components/lists.styl` | Lists (pins and times): a box (.listbox) with a heading bar (.listhead) and a scrolling area (.listscroll) under it, since that's where people vote |
| `styles/components/grip.styl` | The grip (.gface) on the panel's strip (stacked layouts) and the chat's title bar (desktop): a dashed bar (.beak); on the strip, between two small triangles (.eye): ▼ - - ▼, or ▲ - - ▲ when the panel's folded (the chat bar's only show as eyes) |
| `styles/components/avatars.styl` | Avatars: a person's identicon in a ring of their colour (the pins draw their own, see the map) |
| `styles/regions/frame.styl` | The frame: the app's box (the map or calendar, and the panel), whatever the layout |
| `styles/regions/panel.styl` | The panel: the controls (header), then the list box, which fills the rest and scrolls itself; on desktop the chat sits under them |
| `styles/regions/room.styl` | The room box: status, people, and the pick |
| `styles/regions/pick.styl` | The pick, one layout at every size: a vote badge (★ over the count), the time over the place (the same size), and the calendar button |
| `styles/regions/time.styl` | Time: a calendar of days × hours (the main area) everyone paints their free hours on |
| `styles/regions/chat.styl` | The chat: an IRC-style log, sized for a narrow panel |
| `styles/regions/map.styl` | The map: drawing and placing cursors, the Google base map, Leaflet's controls, and the pins |
| `styles/regions/floating.styl` | Floating boxes (.float): the selected pin's card, toasts |
| `styles/regions/tutorial.styl` | The tutorial: a card over the map or calendar; what it talks about gets an amber outline |
| `styles/layouts/desktop.styl` | Desktop: the panel at the side, as two panes on the canvas (controls and lists, then the chat; drag the chat's title bar to resize) |
| `styles/layouts/stacked.styl` | Stacked (phones and the in-between layout): the map or calendar on top, the panel under it, tabs at the bottom |
| `styles/layouts/phone.styl` | Phones: Space \| Time \| Chat tabs; Chat swaps the panel's contents for the chat |
| `styles/layouts/tablet.styl` | In between (tablets, narrow windows): the panel takes the bottom half, with the chat beside the lists rather than behind a tab, so the tabs are just Space \| Time |
| `styles/layouts/touch.styl` | Touch screens zoom into a field whose text is under 16px when it's focused |
| `scripts/core.js` | core: browser settings (localStorage), the default region, and $ |
| `scripts/theme.js` | theme: the light/dark button (the theme itself is set in <head>, before the page paints) |
| `scripts/helpers.js` | helpers: building elements, random ids, and who you are (your id and name) |
| `scripts/state.js` | state: the room as the server last sent it, and what's selected |
| `scripts/url.js` | the link: #room=id&map=lat/lng/zoom |
| `scripts/layout.js` | layout: the view, the tabs, and the stacked layouts' panel (folding, heights) |
| `scripts/map.js` | map: Leaflet, the starting view, and the view kept in the link |
| `scripts/area.js` | limit area: showing the room's, and drawing one |
| `scripts/place.js` | place one pin by hand |
| `scripts/share.js` | share: the room's link, copied to the clipboard |
| `scripts/notices.js` | notices: the one-line status note in the room box (read out by screen readers) |
| `scripts/markers.js` | markers: pins on the map (avatars, size by votes), merges, and random spots |
| `scripts/list.js` | pin list: the room's pins, newest or top first, with votes; sort and "Clear mine" |
| `scripts/detail.js` | selected-pin card: where is it, in Google Maps and OSM |
| `scripts/basemap.js` | Base map: OSM (the default) or Google, one at a time, chosen per browser |
| `scripts/actions.js` | actions: sent to the server, which broadcasts the new state |
| `scripts/chat.js` | chat: messages, mentions, pin links, pop-ups and the mention sound |
| `scripts/multiplayer.js` | room: connecting to it, its state as it arrives, the room box and the people list |
| `scripts/locate.js` | first visit: start near the user |
| `scripts/tutorial.js` | first-run tutorial: once per browser |
| `scripts/time.js` | time: the calendar everyone marks their free hours on, and its list of hours |
| `scripts/pick.js` | pick: the most-voted time and place, the huddle's name, and its calendar file |
| `scripts/boot.js` | boot: join the room, restore the view, first-run tutorial |
<!-- /generated -->

## Browser settings (`localStorage`, keys `randompin.*`)

`cid`, `name`, `theme`, `basemap`, `view` (map position), `tab` (open view and tab), `sort`, `fold`,
`panelHeight`, `listHeight`, `chatHeight`, `mute`, `shape` (area tool), `tutorial` (seen).
