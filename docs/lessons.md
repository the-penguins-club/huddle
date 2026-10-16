# Lessons

Things that cost time before. One line of cause, one of what to do. Prune what stops being true.

## Working on the UI

- **A change asked for one layout leaked into others.** Media and container queries both applied to
  the pick box at 560px. Scope rules to the layout asked about, then check all three widths.
- **Rules of equal specificity: the later one wins.** A phone rule placed before a container query lost
  to it. Put the narrower layout's rules after the wider ones'.
- **`:not(#a):not(#b)` adds two ids of specificity; `:not(#a, #b)` adds one.** Prefer the list form.
- **A `--var` set by one rule can feed another's `box-shadow`.** Used to keep "your hours" outlined
  under the most-voted glow (`--mine` in `regions/time.css`).
- **Phones zoom into fields under 16px.** Fields are 16px on `pointer: coarse` only; placeholders stay 12px.

## The browser pane (verifying)

- After `resize_window` to a custom size, screenshots can come out scaled down or blank: reset to
  `desktop`, set the size again, wait a second.
- A hash-only `navigate` doesn't reload the page: `location.reload()` after changing files.
- Hover doesn't survive a screenshot. To see a hover state, copy its rules onto a test class (see the
  `verify-ui` skill) and remove it afterwards.
- `document.styleSheets` style rules have an (empty) `cssRules` too: when flattening, only descend into
  `CSSMediaRule`s.
- `focus` events don't fire from script while the pane isn't focused; test with a real click.

## Data

- Test in throwaway rooms (`freeformtest1`, `tuttest1`), and undo test votes, names and labels.
- Settings keys are `randompin.*` from before the rename; keep them.
