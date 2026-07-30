# Rank Line Mode — Touch Ergonomics — Design

**Date:** 2026-07-30
**Status:** Approved, ready for implementation planning
**Scope:** `js/rank-line-game.js`, `css/style.css` (rank-mode block + `body` height)

## Summary

Rank the World is uncomfortable to play on a phone one-handed. The card to place
sits at the top of the screen and must be dragged down into a 10px-tall gap,
and once the line is longer than the viewport the player has to hold a finger in
an edge zone and wait for autoscroll to crawl.

This replaces the touch interaction with a **fixed-reticle picker**: the line
becomes a scroll wheel, an insertion cursor is pinned at the vertical center of
the list, and the card plus its controls move to a bottom bar in the thumb zone.
Desktop drag-and-drop and the keyboard flow are untouched.

## Problem Detail

Each numbered item is a distinct cause, verified against the current code:

1. **Card is at the top.** `_render()` appends `(tray, line)` to `.rank-stage`
   (`rank-line-game.js:166-167`), putting the grab point directly under the
   header — the least reachable part of a phone held one-handed.
2. **Gap targets are 10px.** `.rank-gap { height: 10px }` (`style.css:1526`) is
   roughly a quarter of the 44px minimum touch target.
3. **A near-miss is punishing.** Rows carry a country-panel click handler
   (`rank-line-game.js:281-283`), so missing a gap by a few pixels opens a modal
   instead of placing the card.
4. **Long lines force drag-and-wait.** Past ~15 placed countries the list
   scrolls, so the player holds a finger inside the 60px edge zone while
   `_startAutoScroll` advances 12px per frame (`rank-line-game.js:347-361`).
5. **No touch equivalent of the keyboard flow.** ↑↓/Enter is the only
   precision-free path and it is keyboard-only, yet the on-screen hint
   advertises it to phone users (`rank-line-game.js:217`).
6. **`body { height: 100vh }`** (`style.css:29`) means anything bottom-anchored
   hides behind mobile browser chrome.

## Goals

- Placing a country on a phone requires no drag and no pixel precision.
- All per-turn controls sit within thumb reach at the bottom of the screen.
- Crossing a 40-country line is fast (a flick, not 40 taps).
- Desktop mouse and keyboard behaviour is unchanged.

## Non-Goals (YAGNI)

- No press-and-hold repeat on the nudge buttons. Flicking covers coarse
  movement; the nudges exist only for final adjustment.
- No haptics.
- No change to scoring, lives, datasets, or game rules.
- No change to the desktop drag-and-drop, ghost, or autoscroll code paths.
- No unified cross-device interaction model. Drag stays for mouse users.

## Decisions

Settled during brainstorming, recorded so implementation does not relitigate:

| Question | Decision |
|---|---|
| Scope of change | Rework the touch flow, not just reposition elements. Autoscroll-while-dragging cannot be made comfortable. |
| Direct tap-to-place | Keep it, with gaps enlarged to 28px on touch. It is the fast path when the target gap is already on screen. |
| Who gets the new flow | Touch only, gated on `pointer: coarse`. Desktop drag is not broken and is not replaced. |
| Country panel mid-turn | Inert rows while a card is pending. Tappable again between turns and on results. |
| Approach | Scroll-driven cursor (coarse) **plus** ▲▼ nudges (fine). Not competing options — the two halves of one control. |

## Architecture

### Touch detection

`const isTouch = () => window.matchMedia('(pointer: coarse)').matches;`

Evaluated at render time, not cached in the constructor, so a device with both
input types behaves correctly after a mode switch. The same media feature gates
the CSS, so the two never disagree.

### The cursor is derived, not stored

The insertion cursor is **defined** as "the gap whose center is nearest the
list viewport's center line". It is not an independently-tracked position that
must be kept in sync with scroll — it is a function of scroll offset.

`_kbGapIndex` and the touch cursor are the same concept (the pending insertion
index), so they collapse into a single field, **`_cursorGap`**, written by
keyboard on desktop and by the scroll handler on touch.

This rename touches every `_kbGapIndex` reference (`_drawNext`, `_handleKey`,
`_highlightKbGap`) and the `.rank-gap.kb-active` CSS selector
(`style.css:1538-1543`), which becomes `.rank-gap.cursor`. No `kb-active` or
`_kbGapIndex` identifier should survive the change — a leftover would leave dead
CSS that silently never matches.

`_highlightKbGap` splits into:

```
_setCursor(index, { scroll })
```

- Sets `_cursorGap`, moves the `.cursor` class.
- Calls `scrollIntoView` **only** when `scroll: true`.

The scroll handler calls it with `scroll: false`, so updating the highlight
never fights the user's thumb. The keyboard and nudge buttons pass
`scroll: true`.

**Nudge buttons scroll instantly (`behavior: 'auto'`), not smoothly.** Because
the cursor is derived from center proximity, centering the target gap causes the
resulting scroll event to re-derive that same gap. The two mechanisms agree by
construction, so no "programmatic scroll in flight" flag is needed. A smooth
scroll would emit intermediate events and require one.

The scroll listener is throttled with `requestAnimationFrame`, and is
registered on `.rank-line-list` in `_renderLine()` (the element is recreated
each render, so no teardown bookkeeping is required beyond the existing
`innerHTML = ''`).

### Half-viewport spacers

Gap 0 sits at the top of the list. Once content exceeds the viewport height,
gap 0's center can never reach the center line, making the first and last gaps
unreachable by scrolling.

Fix: spacer elements at both ends of the list, each **half the list's
`clientHeight`**, measured in JS. Percentage padding is not usable here — it
resolves against width, not height. Spacers are sized:

- in `_renderLine()` after the list is in the DOM and has a measurable height, and
- on `resize` / orientation change, re-measuring without a full re-render.

The `resize` listener is registered **once in the constructor** (alongside the
existing `keydown` listener) and guards on `this._listEl` still being in the
document. It must not be registered per-render, which would leak one listener
per turn.

With spacers in place the extremes feel identical to the middle.

### Layout

`_render()` becomes order-aware:

```
if (isTouch()) stage.append(line, tray);
else           stage.append(tray, line);
```

Real DOM order, not a CSS `order` flip, so reading order and visual order stay
in sync.

No `position: sticky` is required: `.rank-line-list` is already `flex: 1` inside
the `.rank-stage` flex column, so the tray lands at the bottom on its own.

The tray gains `padding-bottom: env(safe-area-inset-bottom)`.

### Bottom bar contents

- The card (flag + name), no longer draggable.
- A control row: `[▲]` `[Place]` `[▼]`, each min 48px tall, `Place` widest.
- Hint text, touch variant: **"Scroll the line, then tap Place"**. The current
  string mentions ↑↓/Enter, which is meaningless on a phone.

`Place` resolves the turn via the existing `_resolve(this._cursorGap)`.

### Drag removal on touch

On touch the `pointerdown` listener is **not attached** to the card in
`_renderCardTray()`, rather than `_startDrag` returning early. The drag / ghost /
autoscroll path becomes unreachable instead of guarded, which keeps the desktop
code free of touch conditionals.

### Row inertness falls out of existing state

`_row()` attaches the country-panel listener and `is-clickable` class only when
`!(this.current && isTouch())`.

A card awaiting placement means `this.current` is set, so rows are inert during
a turn. Between turns and on the results screen it is `null`, so rows are
tappable again. No new flag is introduced.

### Cursor initialisation

`_drawNext()` currently sets the cursor to `Math.floor(placed.length / 2)`. On
touch it instead derives the cursor from the **current** scroll position, so the
line stays where the player left it rather than jumping to the middle each turn.
Desktop keeps the midpoint default for the keyboard flow.

The cursor is hidden whenever `this.current` is `null` (between turns), since
there is nothing to place.

## CSS Changes

Under `@media (pointer: coarse)`:

- `.rank-gap` height `10px` → `28px`.
- `.rank-gap.cursor` height `44px`, reticle styling (dashed accent border plus
  a centered "place here" affordance).
- `.rank-tray` control-row styling and safe-area padding.

Outside the media query:

- `body` gets `height: 100dvh`, with the existing `height: 100vh` line retained
  immediately above it as a fallback for browsers without `dvh`. **Without this
  the bottom bar hides behind mobile browser chrome and the whole design
  fails** — it is a prerequisite, not a nice-to-have.

## Adjacent Fix: Results Screen Reachability

After a 40-country run, `Play Again` and `Menu` sit below 40 rows inside the
scrollable `.rank-results-panel` (`rank-line-game.js:510-513`). On touch,
`.results-actions` becomes a sticky bottom bar so the run can be restarted
without scrolling. Same reachability problem, same code neighbourhood, so it
ships together.

## Verification

This repo has **no test infrastructure** — vanilla ES modules, no build step, no
runner — so this design does not claim automated coverage. Verification is
browser-driven via the `browse` skill at 390×844 with coarse-pointer emulation.

Checks:

1. Cursor tracks a flick and settles on a single gap when momentum ends.
2. First gap and last gap are both reachable by scrolling (spacer check).
3. Nudge buttons move the cursor by exactly one gap and do not fight the scroll
   handler.
4. `Place` resolves at the gap the reticle shows — the placed row lands where
   the cursor was.
5. Rows are inert mid-turn; tapping one does not open the country panel.
6. Rows are tappable between turns and on the results screen.
7. The bottom bar is fully clear of mobile browser chrome (`dvh` check).
8. Results actions reachable without scrolling after a long run.
9. Desktop regression: drag-and-drop unchanged; ↑↓/Enter unchanged.
10. Rotating the device re-measures spacers and keeps the extremes reachable.
