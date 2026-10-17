# Design notes

Decisions and the reasons for them. Change the code and this together.

## Product

- A huddle is a room; its id in the link is the only key (no accounts, no solo mode). Anyone in it can
  do anything: drop and vote on pins, set or clear the limit area, mark hours, rename the huddle.
- **Space**: pins on the map. Random drops land inside the limit area (box or freehand), away from other
  pins; a hand-placed pin within 100 m of another becomes a vote for that one. Votes are +1/−1/0 (an
  arrow again takes yours back). Pin owners label pins (≤ 30 chars) in the list.
- **Time**: a calendar of hours: 24 h a day from today in your own zone, with no end (it grows by four
  weeks as you scroll right, up to the server's 400-day window, and always reaches the furthest hour
  anyone marked or voted), or the limit everyone shares, in its zone. Without a limit, hours start at
  the minute most of the room's marked hours do, so zones half an hour off (India, Nepal,
  Newfoundland) share cells (theirs read 10:30–11:30). An hour the clocks skip is a gap. People mark
  hours, or say *Free anytime* or *Skip* (which clears their hours; anyone can still vote). Colours:
  nobody / 1 / 2+ / everyone. *Everyone* = all who count: people who marked hours plus anyone online
  who hasn't yet; free-anytime people and skippers don't count. Hours are voted ±1 like pins.
- Limits (area and time) are drawn, never tapped: a box needs a drag, so a stray tap can't narrow
  everyone's choice.
- **The pick**: the most-voted hour (score > 0; ties: more people free, then earlier) at the most-voted
  pin, picked automatically, shown in the room box with a button for an `.ics` (times in UTC, so every
  calendar shows its own zone). Its title is the huddle's name (editable in place at the top, also the
  tab title), else "Huddle at <label>".
- **Chat**: IRC-like (`<nick> text`, monospace, no timestamps). `#3` links pin 3 (shown on the map); `@Name`
  mentions a person (highlight, toast, a short chirp unless muted). Joins and leaves are announced.
- Map: OSM by default (OpenFreeMap Liberty, Latin labels; raster OSM as fallback), or Google's keyless
  embed per browser. No API keys anywhere.

## Layout

| width | layout |
|---|---|
| > 960px | panel at the right: controls and list above, chat below (two panes); Space / Time switch in the header |
| 601–960px | map or calendar on top; the panel below with the chat beside the list; tabs Space / Time |
| ≤ 600px | map or calendar on top; the panel below; tabs Space / Time / Chat |

- Stacked layouts have a strip on the panel (the grip, your name, the bell). Tapping it steps: open →
  just the list (the panel shrinks to it; in Chat, a shorter chat) → one row (buttons, or the message
  box) → open. Dragging resizes the current state. Switching tabs keeps the fold state; tapping a chat
  pop-up while folded unfolds to the chat.
- The list sits in its own bordered box with a heading bar; only it scrolls, with soft edge shades
  where there's more. Everything above it sits flat on the panel.
- The people list is a modal within its pane: from "N online" (room box) or the button by the message box.
- Open view, tab, sizes, fold state, theme and map choice survive a reload (see map.md for keys).

## Visual language

- Red (`--acc`) for main actions, selection and "most votes"; green (`--ok`) for the pick; slate blue
  (`--acc2`) for the chat bar; amber (`--hl`) only for the tutorial's highlight.
- Quiet depth: lighter top-lit surfaces, hairline borders, small shadows; fields and switch tracks are
  slightly recessed. Light and dark themes follow the system until the user picks one.
- The grip (strip and chat bar) is a dashed bar, with small triangles on the strip; under the pointer it
  turns into a penguin's face whose eyes follow the fold state (open, squinting, shut).
- Names are at most 16 characters. Touch screens get 16px fields (no zoom on focus).

## Tutorial

Five steps (`TUT` in `tutorial.js`): what Huddle is; share and limit area; marking free time; the pick
(with an example if nothing's picked); the chat with your name. It switches views as it goes and
returns to where you were.
