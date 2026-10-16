---
name: verify-ui
description: Check a Huddle UI change in the browser pane at desktop, tablet and phone widths, light and dark, including hover states. Use after any change to src/ that shows on screen, before saying it's done.
---

# Verify a UI change

1. Build (`node build.js`) and make sure the server runs (`node server.js`, port 8765). Page changes
   need only a reload; a `server.js` change needs a restart.
2. Open a throwaway room: `http://localhost:8765/#room=freeformtest1`, then `location.reload()` (a
   hash-only navigation doesn't reload). For several people: `node dev/dummies.js freeformtest1 6 10`.
3. Check each width the change can touch, in light and dark (`resize_window` with `colorScheme`):
   - desktop `1100×860`, tablet `800×1000`, phone preset `mobile`
   - Space and Time; on phones also Chat, and the strip's fold states (`setFold('open'|'list'|'folded')`)
   - if a screenshot is tiny or blank: `resize_window` `desktop`, then the size again
4. Prefer facts to pixels: `getComputedStyle`, `getBoundingClientRect`, `elementFromPoint`; zoom into
   the region for the look.
5. Hover states don't survive a screenshot. Copy their rules onto a test class, add it, look, remove it:

   ```js
   const css = [...document.styleSheets].flatMap((s) => { try { return [...s.cssRules]; } catch { return []; } })
     .flatMap((r) => (r instanceof CSSMediaRule ? [...r.cssRules] : [r])).map((r) => r.cssText)
     .filter((t) => t.includes(':hover, :active')).map((t) => t.replaceAll(':is(:hover, :active)', '.ptest')).join('\n');
   document.head.append(Object.assign(document.createElement('style'), { id: 'ptest', textContent: css }));
   // …add class "ptest" to the element, screenshot, then: document.getElementById('ptest').remove()
   ```

6. Check the console for errors (`read_console_messages`, pattern `Uncaught`).
7. Undo what the test changed in the room (votes, names, labels), reset the viewport to `desktop`.
8. Report what was checked at which sizes, and anything not checked.
