# Rank Line Touch Ergonomics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make placing a country in Rank the World comfortable one-handed on a phone, by replacing the touch drag-and-drop with a fixed-reticle scroll picker and a bottom-bar control row.

**Architecture:** The line becomes a scroll wheel. An insertion cursor is *derived* from scroll position — defined as "the gap nearest the list viewport's center line" — never stored independently. The card and its `▲ / Place / ▼` controls move to the bottom of the screen. Everything is gated on `pointer: coarse`; desktop drag-and-drop and the `↑↓/Enter` keyboard flow are left byte-for-byte intact.

**Tech Stack:** Vanilla ES modules, no build step, no bundler. `python3 -m http.server` for local serving. Canvas is not involved — this is DOM and CSS only.

**Spec:** `docs/superpowers/specs/2026-07-30-rank-line-touch-ergonomics-design.md`

## Testing Reality — Read This First

**This repo has no test infrastructure.** No runner, no assertion library, no build step, no `test` script in `package.json`. There is nowhere to put a unit test and nothing to execute it.

So the usual red-green-commit cycle does **not** apply, and this plan does not pretend otherwise. Do not scaffold a test framework — that is a much larger decision than this change and is explicitly out of scope. Instead every task ends with a **browser verification step** listing concrete observations, and you must actually perform them and report what you saw. "Looks right" is not a result; "cursor settled on the gap above Vietnam after a flick, first gap reachable" is.

Serve the app once at the start and leave it running:

```bash
npm start        # python3 -m http.server 8080 → http://localhost:8080
```

Verify with the `browse` skill at **390×844** with coarse-pointer emulation for touch checks, and at a desktop viewport with a mouse for the regression checks. Coarse-pointer emulation is what makes `@media (pointer: coarse)` and `matchMedia('(pointer: coarse)')` both report touch — if your browser tool cannot emulate it, say so rather than guessing, because every gated change in this plan depends on it.

Reach Rank the World from the menu: **Rank the World** card → pick any dataset (Total GDP is fine).

## Global Constraints

- **Every touch change is gated on `pointer: coarse`** — CSS via `@media (pointer: coarse)`, JS via `window.matchMedia('(pointer: coarse)').matches`. The two must never disagree.
- **No desktop behaviour change.** Drag-and-drop, the ghost, autoscroll, and `↑↓/Enter` must all work exactly as before, including the existing smooth `scrollIntoView` feel of keyboard navigation.
- **No new dependencies, no build step, no test framework.** Vanilla ES modules only.
- **No scoring, lives, dataset, or game-rule changes.** Placement input only.
- **Touch targets are min 48px** on interactive controls.
- **After Task 2, neither the identifier `_kbGapIndex` nor the CSS class `kb-active` may appear anywhere in the repo.** A leftover leaves dead CSS that silently never matches. Check with `grep -rn "kbGapIndex\|kb-active" js/ css/`.
- All files are at repo root: `js/rank-line-game.js`, `css/style.css`.
- Work on branch `feat/rank-touch-ergonomics` (already created, spec already committed).

---

### Task 1: Fix the viewport unit so bottom-anchored content is reachable

`body { height: 100vh }` makes the visual viewport taller than the visible area on mobile browsers, so anything at the bottom sits behind the browser's own chrome. Every later task puts controls at the bottom, so this is a hard prerequisite — not a polish item.

**Files:**
- Modify: `css/style.css:29`

**Interfaces:**
- Consumes: nothing.
- Produces: a viewport height that matches the visible area, which Tasks 3 and 6 rely on for their bottom bars to be tappable.

- [ ] **Step 1: Add the `dvh` height below the existing `vh` height**

In `css/style.css`, the `body` rule currently reads:

```css
body {
  font-family: 'Space Grotesk', system-ui, sans-serif;
  background: var(--bg);
  color: var(--text);
  overflow: hidden;
  height: 100vh;
  /* Prevent pull-to-refresh and bounce on mobile */
  overscroll-behavior: none;
  -webkit-user-select: none;
  user-select: none;
}
```

Change it to:

```css
body {
  font-family: 'Space Grotesk', system-ui, sans-serif;
  background: var(--bg);
  color: var(--text);
  overflow: hidden;
  /* 100vh first as a fallback: browsers without dvh support keep the old value,
     browsers with it override on the next line. Mobile chrome overlays 100vh,
     which would hide the bottom control bar. */
  height: 100vh;
  height: 100dvh;
  overscroll-behavior: none;
  -webkit-user-select: none;
  user-select: none;
}
```

Keep both declarations in that order. Do not replace the `100vh` line — it is the fallback, and deleting it breaks older browsers.

- [ ] **Step 2: Verify in the browser**

At 390×844 with coarse pointer, open Rank the World and start a GDP run.

Expected observations, all of which you must state explicitly:
- The dataset picker's content is not clipped at the bottom.
- The rank line's bottom edge is visible, not cut off behind browser chrome.
- No new vertical scrollbar appeared on `body` (it is `overflow: hidden`, so a change here would indicate a layout regression).

Then check a desktop viewport: the menu and rank line look identical to before. `100dvh` equals `100vh` on desktop, so any visible difference means something else broke.

- [ ] **Step 3: Commit**

```bash
git add css/style.css
git commit -m "fix(css): use 100dvh so bottom-anchored UI clears mobile chrome

100vh is taller than the visible area on mobile browsers, so anything
anchored to the bottom hides behind the browser's own chrome. Keeps the
100vh line above as a fallback for browsers without dvh."
```

---

### Task 2: Unify the cursor concept — `_kbGapIndex` → `_cursorGap`, and split the highlight from the scroll

The keyboard's `_kbGapIndex` and the touch cursor Task 4 introduces are the same thing: the pending insertion index. Collapse them into one field now, before adding a second writer, so there is never a syncing problem to get wrong.

The important half of this task is splitting **highlighting** from **scrolling**. Today `_highlightKbGap` always calls `scrollIntoView`. Task 4's scroll handler must update the highlight *without* scrolling, or it would fight the user's thumb. So scrolling becomes an explicit opt-in argument.

This task is a pure refactor: **no behaviour changes at all**, on any device.

**Files:**
- Modify: `js/rank-line-game.js:38, 151-153, 400-424`
- Modify: `css/style.css:1538-1543`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `this._cursorGap` — integer pending insertion index, or `-1` for none. Replaces `_kbGapIndex`.
  - `_setCursor(index, { scroll })` — sets `_cursorGap` and moves the `.cursor` class. `scroll` is one of the strings `'none'` (default), `'nearest'`, `'center'`. Tasks 3 and 4 both call this.
  - CSS class `.rank-gap.cursor` replaces `.rank-gap.kb-active`.

- [ ] **Step 1: Rename the state field**

`js/rank-line-game.js` line 38, inside the constructor's keyboard-state block:

```js
    // keyboard state
    this._kbGapIndex = -1;
```

becomes:

```js
    // Pending insertion index — the gap the next placement will target.
    // Written by the keyboard on desktop, and by scroll position on touch.
    this._cursorGap = -1;
```

- [ ] **Step 2: Replace `_highlightKbGap` with `_setCursor`**

Delete this method (lines 416-424):

```js
  _highlightKbGap() {
    if (!this._listEl) return;
    this._listEl.querySelectorAll('.rank-gap.kb-active').forEach(g => g.classList.remove('kb-active'));
    const gap = this._listEl.querySelector(`.rank-gap[data-gap-index='${this._kbGapIndex}']`);
    if (gap) {
      gap.classList.add('kb-active');
      gap.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }
```

and put this in its place:

```js
  // Move the insertion cursor. `scroll` decides whether the list follows:
  //   'none'    — highlight only. Used by the touch scroll handler, which must
  //               never scroll or it would fight the user's own gesture.
  //   'nearest' — smooth, minimal scroll. Preserves the desktop keyboard feel.
  //   'center'  — instant, centered. Used by the touch nudge buttons: because
  //               the touch cursor is derived from center proximity, centering
  //               the target makes the resulting scroll event re-derive this
  //               same gap, so the two mechanisms agree without a lock flag.
  _setCursor(index, { scroll = 'none' } = {}) {
    this._cursorGap = index;
    if (!this._listEl) return;
    this._listEl.querySelectorAll('.rank-gap.cursor')
      .forEach((g) => g.classList.remove('cursor'));
    if (index < 0) return;
    const gap = this._listEl.querySelector(`.rank-gap[data-gap-index='${index}']`);
    if (!gap) return;
    gap.classList.add('cursor');
    if (scroll === 'nearest') gap.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    else if (scroll === 'center') gap.scrollIntoView({ block: 'center', behavior: 'auto' });
  }
```

- [ ] **Step 3: Update `_drawNext`**

Lines 147-154 currently read:

```js
  _drawNext() {
    if (this.lives <= 0) { this._showResults(); return; }
    if (this.deck.length === 0) { this._showResults(true); return; }
    this.current = this.deck.pop();
    this._kbGapIndex = Math.floor(this.placed.length / 2);
    this._render();
    this._highlightKbGap();
  }
```

Replace the last three lines so the cursor is set after render, through the new method:

```js
  _drawNext() {
    if (this.lives <= 0) { this._showResults(); return; }
    if (this.deck.length === 0) { this._showResults(true); return; }
    this.current = this.deck.pop();
    this._render();
    this._setCursor(Math.floor(this.placed.length / 2), { scroll: 'nearest' });
  }
```

This is why `_setCursor` assigns `_cursorGap` before the `this._listEl` guard: the assignment must happen even when the list is not yet available.

- [ ] **Step 4: Update `_handleKey`**

Lines 400-413 currently read:

```js
    const maxGap = this.placed.length; // gaps are 0..placed.length inclusive

    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (this._kbGapIndex < 0) this._kbGapIndex = Math.floor(maxGap / 2);
      else this._kbGapIndex += (e.key === 'ArrowUp' ? -1 : 1);
      this._kbGapIndex = Math.max(0, Math.min(maxGap, this._kbGapIndex));
      this._highlightKbGap();
      playNav();
    } else if (e.key === 'Enter' || e.key === ' ') {
      if (this._kbGapIndex < 0) return;
      e.preventDefault();
      this._resolve(this._kbGapIndex);
    }
```

Replace with:

```js
    const maxGap = this.placed.length; // gaps are 0..placed.length inclusive

    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const next = this._cursorGap < 0
        ? Math.floor(maxGap / 2)
        : this._cursorGap + (e.key === 'ArrowUp' ? -1 : 1);
      this._setCursor(Math.max(0, Math.min(maxGap, next)), { scroll: 'nearest' });
      playNav();
    } else if (e.key === 'Enter' || e.key === ' ') {
      if (this._cursorGap < 0) return;
      e.preventDefault();
      this._resolve(this._cursorGap);
    }
```

Note the preserved quirk: when the cursor is unset, the first arrow press jumps to the midpoint rather than stepping from it. That is existing behaviour — keep it.

- [ ] **Step 5: Rename the CSS class**

`css/style.css` lines 1538-1543:

```css
.rank-gap.kb-active {
  height: 32px;
  background: var(--accent-glow);
  border: 2px solid var(--accent);
  box-shadow: 0 0 10px var(--accent-glow);
}
```

becomes:

```css
.rank-gap.cursor {
  height: 32px;
  background: var(--accent-glow);
  border: 2px solid var(--accent);
  box-shadow: 0 0 10px var(--accent-glow);
}
```

- [ ] **Step 6: Confirm no old identifiers survive**

```bash
grep -rn "kbGapIndex\|kb-active\|_highlightKbGap" js/ css/
```

Expected: **no output at all.** Any hit is a bug — either dead CSS that will never match, or a runtime `TypeError` on a deleted method.

- [ ] **Step 7: Verify no behaviour changed**

This is a refactor, so the bar is "indistinguishable from before". On desktop with a mouse and keyboard, start a GDP run and confirm:
- Pressing `↑`/`↓` moves the highlighted gap one step and the list scrolls smoothly and minimally — same feel as before the change.
- The highlight is visually identical (same glow, same 32px height).
- `Enter` places at the highlighted gap.
- Dragging the card with the mouse still highlights gaps on hover and places on release.
- Clicking a gap directly still places.
- Clicking a placed row still opens the country panel.
- Browser console is clean — no `TypeError`, no reference errors.

- [ ] **Step 8: Commit**

```bash
git add js/rank-line-game.js css/style.css
git commit -m "refactor(rank): unify gap cursor state and make scrolling opt-in

_kbGapIndex and the upcoming touch cursor are the same concept — the
pending insertion index — so collapse them into _cursorGap before adding
a second writer.

_highlightKbGap always scrolled; _setCursor takes an explicit scroll mode
so a scroll-driven writer can update the highlight without fighting the
user's gesture. No behaviour change on any device."
```

---

### Task 3: Move the card to a bottom control bar on touch

The card moves from the top of the stage to the bottom, gains `▲ / Place / ▼` buttons, and stops being draggable. This alone makes the mode playable one-handed, because the nudge buttons drive `_setCursor` — the logic Task 2 just consolidated.

**Files:**
- Modify: `js/rank-line-game.js` — add module-level `isTouch`, rewrite `_render` and `_renderCardTray`, add `_renderTouchControls`
- Modify: `css/style.css` — extend the rank-mode block

**Interfaces:**
- Consumes: `_setCursor(index, { scroll })` from Task 2.
- Produces:
  - `isTouch()` — module-level predicate, `() => boolean`. Used by Tasks 4, 5, 6.
  - `_renderTouchControls()` — returns an `HTMLDivElement` with class `rank-touch-controls`.
  - CSS classes `.rank-touch-controls`, `.rank-nudge`, `.rank-place`.

- [ ] **Step 1: Add the touch predicate**

In `js/rank-line-game.js`, just below the existing constants at the top of the file:

```js
const FLAG_CDN = 'https://flagcdn.com/w40/';
const START_LIVES = 3;
```

add:

```js
// Touch layout is gated on pointer type, not screen width — a small window on a
// desktop still has a mouse. Evaluated per render rather than cached, so a
// device with both input types behaves correctly after switching.
const isTouch = () => window.matchMedia('(pointer: coarse)').matches;
```

- [ ] **Step 2: Make `_render` order-aware**

Lines 157-170 currently read:

```js
  _render() {
    const c = this.container;
    c.innerHTML = '';

    c.appendChild(this._renderHeader());

    const stage = document.createElement('div');
    stage.className = 'rank-stage';

    stage.appendChild(this._renderCardTray());
    stage.appendChild(this._renderLine());

    c.appendChild(stage);
  }
```

Replace with:

```js
  _render() {
    const c = this.container;
    c.innerHTML = '';

    c.appendChild(this._renderHeader());

    const stage = document.createElement('div');
    stage.className = 'rank-stage';

    // On touch the card sits at the bottom, in the thumb zone. Swap real DOM
    // order rather than using CSS `order`, so reading order matches visual order.
    const tray = this._renderCardTray();
    const line = this._renderLine();
    if (isTouch()) stage.append(line, tray);
    else stage.append(tray, line);

    c.appendChild(stage);
  }
```

No `position: sticky` is needed: `.rank-line-list` is already `flex: 1` inside the `.rank-stage` flex column, so the tray is pushed to the bottom on its own.

- [ ] **Step 3: Rewrite `_renderCardTray`**

Lines 202-232 become:

```js
  _renderCardTray() {
    const touch = isTouch();
    const tray = document.createElement('div');
    tray.className = 'rank-tray';

    // Between turns there is no card to place — keep the tray height stable.
    if (!this.current) {
      const spacer = document.createElement('div');
      spacer.className = 'rank-card placeholder';
      spacer.innerHTML = '<span class="rank-card-name">…</span>';
      tray.appendChild(spacer);
      return tray;
    }

    const hint = document.createElement('div');
    hint.className = 'rank-hint';
    hint.textContent = touch
      ? 'Scroll the line, then tap Place'
      : 'Drag onto the line, or use ↑ ↓ then Enter';

    const card = document.createElement('div');
    card.className = 'rank-card';
    card.appendChild(this._flagImg(this.current.code));
    const name = document.createElement('span');
    name.className = 'rank-card-name';
    name.textContent = this.current.name;
    card.appendChild(name);

    // Touch never drags: not attaching the listener makes the drag/ghost/
    // autoscroll path unreachable, rather than guarded from the inside.
    if (!touch) card.addEventListener('pointerdown', (e) => this._startDrag(e, card));

    this._cardEl = card;
    if (touch) tray.append(hint, card, this._renderTouchControls());
    else tray.append(hint, card);
    return tray;
  }
```

The placeholder branch is unchanged — between turns there is nothing to place, so no controls are rendered either.

- [ ] **Step 4: Add `_renderTouchControls`**

Insert this method immediately after `_renderCardTray`:

```js
  // Bottom control row: coarse navigation is the flick gesture (Task 4), these
  // buttons are the fine adjustment and the commit.
  _renderTouchControls() {
    const row = document.createElement('div');
    row.className = 'rank-touch-controls';

    const nudge = (delta) => {
      if (!this.current || this.gameOver) return;
      const maxGap = this.placed.length;
      const from = this._cursorGap < 0 ? Math.floor(maxGap / 2) : this._cursorGap;
      this._setCursor(Math.max(0, Math.min(maxGap, from + delta)), { scroll: 'center' });
      playNav();
    };

    const up = document.createElement('button');
    up.className = 'btn rank-nudge';
    up.textContent = '▲';
    up.setAttribute('aria-label', 'Move insertion point up');
    up.addEventListener('click', () => nudge(-1));

    const place = document.createElement('button');
    place.className = 'btn btn-accent rank-place';
    place.textContent = 'Place';
    place.addEventListener('click', () => {
      if (!this.current || this.gameOver || this._cursorGap < 0) return;
      this._resolve(this._cursorGap);
    });

    const down = document.createElement('button');
    down.className = 'btn rank-nudge';
    down.textContent = '▼';
    down.setAttribute('aria-label', 'Move insertion point down');
    down.addEventListener('click', () => nudge(1));

    row.append(up, place, down);
    return row;
  }
```

`playNav` is already imported at the top of the file — no import change needed.

- [ ] **Step 5: Add the control-bar CSS**

Append to `css/style.css` immediately after the existing rank-mode `@media (max-width: 768px)` block (the one ending at line 1643 with `.rank-flag { width: 26px; }`):

```css
/* Touch layout: card and controls live at the bottom, in the thumb zone. */
@media (pointer: coarse) {
  .rank-tray {
    width: 100%;
    padding-bottom: env(safe-area-inset-bottom);
  }
  .rank-card {
    cursor: default;
    width: 100%;
    max-width: 420px;
  }
  .rank-touch-controls {
    display: flex;
    gap: 10px;
    width: 100%;
    max-width: 420px;
  }
  .rank-nudge {
    flex: 0 0 64px;
    min-height: 48px;
    font-size: 1.2rem;
    line-height: 1;
  }
  .rank-place {
    flex: 1;
    min-height: 48px;
    font-size: 1.05rem;
    font-weight: 600;
  }
}
```

- [ ] **Step 6: Verify on touch**

At 390×844 with coarse pointer, start a GDP run. State each observation:
- The card is at the **bottom** of the screen, below the line, with `▲ Place ▼` beneath it.
- The hint reads "Scroll the line, then tap Place" — no mention of arrow keys.
- The `Place` button and both nudges are fully visible and tappable, not behind browser chrome (this is Task 1 paying off).
- Tapping `▲` moves the highlighted gap up one; `▼` moves it down one; the list jumps to center the highlighted gap instantly, with no smooth-scroll animation.
- Tapping `Place` places the country at the highlighted gap — the placed row lands exactly where the highlight was.
- Nudging past the top gap or below the bottom gap clamps instead of wrapping or erroring.
- **Dragging the card does nothing** — press and move it and confirm no ghost element appears.
- Between turns the placeholder card shows and no control row is rendered.
- Console is clean.

- [ ] **Step 7: Verify no desktop regression**

At a desktop viewport with a mouse: the card is back at the **top**, the hint mentions `↑ ↓ then Enter`, dragging works, and no `▲ Place ▼` row is rendered.

- [ ] **Step 8: Commit**

```bash
git add js/rank-line-game.js css/style.css
git commit -m "feat(rank): bottom-bar card and place controls on touch

The card sat directly under the header — the least reachable part of a
phone held one-handed — and had to be dragged down into the line. On
touch it now sits at the bottom with nudge and Place buttons, and the
drag listener is not attached at all. Desktop is untouched."
```

---

### Task 4: Derive the cursor from scroll position, with half-viewport spacers

This is the part that fixes long lines. Instead of stepping one gap at a time, the player flicks the list and the cursor tracks whichever gap is nearest the center line.

Two subtleties to get right:

**Spacers.** Gap 0 sits at the top of the list. Once content exceeds the viewport, gap 0's center can never reach the center line, so the first and last gaps would be unreachable by scrolling. Spacers of half the list height at each end fix this — the standard picker-wheel trick. Over-padding is harmless; under-padding breaks reachability, so do not try to subtract label heights.

**Scroll continuity.** `_render()` wipes `container.innerHTML` every turn, which resets `scrollTop` to 0. Without handling, every touch turn would start pinned at the highest-value end. So after rendering, center the row that was just placed — the player resumes looking at where their last country landed.

**Files:**
- Modify: `js/rank-line-game.js` — constructor listener, `_renderLine`, `_row`, `_drawNext`; add `_sizeSpacers`, `_attachScrollCursor`, `_syncCursorToScroll`, `_centerRow`
- Modify: `css/style.css` — spacer and sticky-label rules

**Interfaces:**
- Consumes: `isTouch()` (Task 3), `_setCursor(index, { scroll })` (Task 2).
- Produces:
  - `_sizeSpacers()` — measures and sets spacer heights. Idempotent, safe to call when no spacers exist.
  - `_syncCursorToScroll()` — derives and applies the cursor from current scroll position.
  - `_centerRow(index)` — instantly centers `.rank-row[data-row-index="index"]`.
  - `.rank-row` elements now carry `data-row-index`.
  - CSS class `.rank-line-pad`.

- [ ] **Step 1: Register the resize listener in the constructor**

The spacers depend on list height, so rotation and window resize must re-measure. Register **once in the constructor** — `_renderLine` runs every turn, so registering there would leak one listener per placement.

In `js/rank-line-game.js`, the constructor ends as follows **after Task 2's edits** — match this text, not the original file's:

```js
    // Pending insertion index — the gap the next placement will target.
    // Written by the keyboard on desktop, and by scroll position on touch.
    this._cursorGap = -1;
    this._picking = false;
    window.addEventListener('keydown', (e) => this._handleKey(e));
  }
```

Add the resize listener beside the keydown one:

```js
    this._picking = false;
    window.addEventListener('keydown', (e) => this._handleKey(e));
    // Spacer height depends on list height, so rotation must re-measure.
    // Registered once here — _renderLine runs every turn and would leak.
    window.addEventListener('resize', () => this._sizeSpacers());
  }
```

- [ ] **Step 2: Add spacers and the scroll listener to `_renderLine`**

`_renderLine` (lines 234-256) becomes:

```js
  _renderLine() {
    const list = document.createElement('div');
    list.className = 'rank-line-list';
    this._listEl = list;

    const touch = isTouch();

    // Half-viewport spacers let the first and last gaps reach the center line.
    // Touch only — desktop has no scroll-derived cursor and needs no padding.
    if (touch) list.appendChild(this._spacer());

    const topLabel = document.createElement('div');
    topLabel.className = 'rank-axis-label top';
    topLabel.textContent = this.dataset.higherFirst ? '▲ highest' : '▲ lowest';
    list.appendChild(topLabel);

    list.appendChild(this._gap(0));
    for (let i = 0; i < this.placed.length; i++) {
      list.appendChild(this._row(this.placed[i], i === this._justPlacedIndex, i));
      list.appendChild(this._gap(i + 1));
    }

    const botLabel = document.createElement('div');
    botLabel.className = 'rank-axis-label bottom';
    botLabel.textContent = this.dataset.higherFirst ? '▼ lowest' : '▼ highest';
    list.appendChild(botLabel);

    if (touch) {
      list.appendChild(this._spacer());
      this._attachScrollCursor(list);
    }

    return list;
  }

  _spacer() {
    const pad = document.createElement('div');
    pad.className = 'rank-line-pad';
    return pad;
  }
```

Two changes to note: the axis labels gain `top` / `bottom` classes (they become sticky in Step 6, so they stay visible instead of floating alone in the spacer's blank area), and `_row` now takes an index.

- [ ] **Step 3: Give rows an index attribute**

`_row` (lines 270-285) currently starts:

```js
  _row(entry, highlight) {
    const row = document.createElement('div');
    row.className = 'rank-row' + (highlight ? ' just-placed' : '');
```

Change the signature and set the attribute — `_centerRow` needs it to find its target:

```js
  _row(entry, highlight, index) {
    const row = document.createElement('div');
    row.className = 'rank-row' + (highlight ? ' just-placed' : '');
    row.dataset.rowIndex = index;
```

Leave the rest of the method as it is; Task 5 changes its click handling.

- [ ] **Step 4: Add the spacer, scroll, and centering methods**

Insert these after `_spacer`:

```js
  // Over-padding is harmless (you can scroll slightly past the ends);
  // under-padding makes the extreme gaps unreachable. So use a full half
  // and do not try to subtract label or gap heights.
  _sizeSpacers() {
    if (!this._listEl || !this._listEl.isConnected) return;
    const pads = this._listEl.querySelectorAll('.rank-line-pad');
    if (!pads.length) return;
    const h = Math.round(this._listEl.clientHeight / 2);
    pads.forEach((p) => { p.style.height = h + 'px'; });
  }

  _attachScrollCursor(list) {
    let raf = null;
    list.addEventListener('scroll', () => {
      if (raf) return; // coalesce a burst of scroll events into one frame
      raf = requestAnimationFrame(() => {
        raf = null;
        this._syncCursorToScroll();
      });
    });
  }

  // The cursor IS "the gap nearest the viewport centre" — derived, never stored
  // independently, so it cannot drift out of sync with the scroll position.
  _syncCursorToScroll() {
    if (!this.current || this.gameOver || !this._listEl) return;
    const r = this._listEl.getBoundingClientRect();
    const mid = r.top + r.height / 2;
    let best = -1;
    let bestDist = Infinity;
    this._listEl.querySelectorAll('.rank-gap').forEach((g) => {
      const gr = g.getBoundingClientRect();
      const d = Math.abs(gr.top + gr.height / 2 - mid);
      if (d < bestDist) { bestDist = d; best = parseInt(g.dataset.gapIndex, 10); }
    });
    // scroll: 'none' — highlight only. Scrolling here would fight the gesture.
    if (best >= 0 && best !== this._cursorGap) this._setCursor(best);
  }

  _centerRow(index) {
    if (!this._listEl || index == null || index < 0) return;
    const row = this._listEl.querySelector(`.rank-row[data-row-index='${index}']`);
    if (row) row.scrollIntoView({ block: 'center', behavior: 'auto' });
  }
```

- [ ] **Step 5: Branch `_drawNext` for touch**

`_drawNext` (as left by Task 2) becomes:

```js
  _drawNext() {
    if (this.lives <= 0) { this._showResults(); return; }
    if (this.deck.length === 0) { this._showResults(true); return; }
    this.current = this.deck.pop();
    this._render();

    if (isTouch()) {
      // _render() wiped the list, so scrollTop is 0. Restore continuity by
      // centring the row just placed, then derive the cursor from there.
      this._sizeSpacers();
      if (this._justPlacedIndex != null) this._centerRow(this._justPlacedIndex);
      else this._centerGap(Math.floor(this.placed.length / 2));
      this._syncCursorToScroll();
    } else {
      this._setCursor(Math.floor(this.placed.length / 2), { scroll: 'nearest' });
    }
  }
```

That needs one small helper for the first turn, when nothing has been placed yet. Add it next to `_centerRow`:

```js
  _centerGap(index) {
    if (!this._listEl) return;
    const gap = this._listEl.querySelector(`.rank-gap[data-gap-index='${index}']`);
    if (gap) gap.scrollIntoView({ block: 'center', behavior: 'auto' });
  }
```

- [ ] **Step 6: Add spacer and sticky-label CSS**

Add these rules inside the `@media (pointer: coarse)` block created in Task 3:

```css
  /* Height is set in JS from the list's measured height. */
  .rank-line-pad { flex-shrink: 0; }

  /* Spacers leave blank space at the ends, so pin the axis labels rather than
     letting them drift out of view inside it. */
  .rank-axis-label.top,
  .rank-axis-label.bottom {
    position: sticky;
    z-index: 2;
    background: var(--surface);
  }
  .rank-axis-label.top { top: 0; }
  .rank-axis-label.bottom { bottom: 0; }
```

`var(--surface)` matches `.rank-line-list`'s own background, so rows scroll underneath the labels cleanly.

- [ ] **Step 7: Verify on touch**

At 390×844 with coarse pointer, play a GDP run until at least 12 countries are placed — the behaviour only gets interesting once the line is taller than the viewport. State each observation:
- Flicking the list moves the highlighted gap, and it settles on exactly one gap when momentum ends.
- The highlighted gap is at or very near the vertical center of the list area.
- **Scroll all the way to the top: the very first gap (above the highest-value country) can be highlighted.** This is the spacer check — if it cannot be reached, the spacers are too small or missing.
- **Scroll all the way to the bottom: the last gap can be highlighted.**
- The `▲ highest` and `▼ lowest` labels stay pinned at the top and bottom of the list while scrolling.
- Tapping `▲`/`▼` still moves exactly one gap. Do this right after a flick and confirm the cursor does not jump somewhere unrelated — that would mean the nudge and the scroll handler are fighting.
- After placing, the next turn opens with the just-placed row near the center, **not** scrolled back to the top of the list.
- **Between turns no gap shows the cursor highlight** — during the pause after a placement there is nothing to place, so the reticle should be absent, and scrolling during that window must not light one up.
- Rotate to landscape (844×390): the extreme gaps are still reachable, proving the resize listener re-measured.
- Play three or four turns, then confirm the console is clean and there is no sign of accumulating listeners (no progressive slowdown).

- [ ] **Step 8: Verify no desktop regression**

Desktop with mouse and keyboard: no spacers appear (no blank areas at the ends of the list), labels are not sticky, `↑↓` still scrolls smoothly and minimally, drag still works, and the console is clean.

- [ ] **Step 9: Commit**

```bash
git add js/rank-line-game.js css/style.css
git commit -m "feat(rank): derive the touch cursor from scroll position

Crossing a long line previously meant holding a finger in the edge zone
waiting on 12px-per-frame autoscroll. Now the line is a scroll wheel: the
cursor is defined as the gap nearest the viewport centre, so a flick
moves it as far as you like.

Half-viewport spacers let the first and last gaps reach the centre line,
and the just-placed row is re-centred after each render so the view does
not snap back to the top every turn."
```

---

### Task 5: Enlarge gap targets and stop rows stealing placement taps

Two remaining hazards on touch: gaps are 10px (about a quarter of the 44px minimum), and rows carry a country-panel click handler, so missing a gap opens a modal mid-placement.

Row inertness needs no new flag — it falls out of existing state. `this.current` is set exactly when a card is awaiting placement, so that is the condition.

**Files:**
- Modify: `js/rank-line-game.js:270-285` (`_row`)
- Modify: `css/style.css` — the `@media (pointer: coarse)` block

**Interfaces:**
- Consumes: `isTouch()` (Task 3), `_row(entry, highlight, index)` (Task 4).
- Produces: no new API. `.rank-gap.cursor` gains a "place here" reticle label on touch.

- [ ] **Step 1: Make rows inert while a card is pending**

`_row` currently ends:

```js
    row.append(name, val);
    row.classList.add('is-clickable');
    row.title = `View ${entry.name}`;
    row.addEventListener('click', () => openCountryPanel(entry.code));
    return row;
  }
```

Replace with:

```js
    row.append(name, val);

    // While a card is pending on touch, every tap on the line is about placing,
    // so rows must not open the country panel — a near-miss on a gap would pop
    // a modal instead. `this.current` is set exactly during a live turn, so
    // rows go live again between turns and on the results screen for free.
    const inert = isTouch() && !!this.current;
    if (!inert) {
      row.classList.add('is-clickable');
      row.title = `View ${entry.name}`;
      row.addEventListener('click', () => openCountryPanel(entry.code));
    }
    return row;
  }
```

- [ ] **Step 2: Enlarge the gaps and add the reticle**

Add these rules inside the `@media (pointer: coarse)` block:

```css
  /* 10px is a quarter of the minimum touch target. */
  .rank-gap { height: 28px; }
  .rank-gap.cursor {
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .rank-gap.cursor::after {
    content: 'place here';
    font-size: 0.7rem;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: var(--accent);
  }
```

The `.rank-gap.cursor` rule from Task 2 already supplies the glow, accent border, and background — these declarations only add size and the label, so do not restate the colours.

- [ ] **Step 3: Verify on touch**

At 390×844 with coarse pointer, mid-run with 10+ countries placed:
- Gaps are visibly taller and comfortably tappable with a thumb.
- The cursor gap reads "place here" and is clearly the tallest element in the line.
- **Tapping a gap directly places the country there** — the shortcut still works alongside the cursor flow.
- **Tapping a placed row mid-turn does nothing** — no country panel opens.
- Tap a row **between** turns (during the ~750ms after a correct placement, or on the results screen): the country panel **does** open.
- Rows show no hover/pointer affordance mid-turn, since `is-clickable` is not applied.

- [ ] **Step 4: Verify no desktop regression**

Desktop with a mouse: gaps are still 10px, the cursor gap is still 32px with no "place here" text, and clicking any row opens the country panel — including mid-turn, because `isTouch()` is false.

- [ ] **Step 5: Commit**

```bash
git add js/rank-line-game.js css/style.css
git commit -m "feat(rank): touch-sized gap targets, inert rows mid-turn

Gaps were 10px — a quarter of the minimum touch target — and rows opened
the country panel, so missing a gap by a few pixels popped a modal
instead of placing. Gaps go to 28px (cursor 44px, labelled 'place here'),
and rows drop their click handler while a card is pending. Both gated on
pointer: coarse."
```

---

### Task 6: Make the results actions reachable after a long run

After a 40-country run, `Play Again` and `Menu` sit below 40 rows inside the scrollable results panel. Same reachability problem as the card was, same code neighbourhood.

**Files:**
- Modify: `css/style.css` — the `@media (pointer: coarse)` block

**Interfaces:**
- Consumes: nothing. CSS only — the existing `.results-actions` markup in `_showResults` is unchanged.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Pin the results actions on touch**

Add to the `@media (pointer: coarse)` block:

```css
  /* Scoped to .rank-results-panel: .results-actions is shared with other
     modes' results screens, which are not long enough to need this. */
  .rank-results-panel .results-actions {
    position: sticky;
    bottom: 0;
    z-index: 2;
    margin-top: auto;
    padding: 10px 0;
    padding-bottom: calc(10px + env(safe-area-inset-bottom));
    background: var(--bg);
  }
```

The `.rank-results-panel .results-actions` descendant selector matters — `.results-actions` is used by the drawing mode's results screen too, and pinning it there is not wanted.

- [ ] **Step 2: Verify on touch**

At 390×844 with coarse pointer, you need a results screen with a long final line. Play a GDP run and place correctly until 15+ countries are on the line, then deliberately misplace three times to end the run quickly:
- `Play Again` and `Menu` are visible without scrolling, pinned at the bottom.
- They stay visible while scrolling the final line.
- Result rows scroll **behind** the buttons, not through them — this is the `background` and `z-index` working.
- Both buttons are clear of browser chrome and tappable.
- The score summary at the top is still reachable by scrolling up.

- [ ] **Step 3: Verify no regression elsewhere**

- Desktop rank results: buttons are at the natural end of the panel, not pinned.
- On touch, finish a **drawing** mode round and confirm its results actions are **not** pinned — that panel uses the same `.results-actions` class and must be unaffected.

- [ ] **Step 4: Commit**

```bash
git add css/style.css
git commit -m "feat(rank): pin results actions on touch

After a long run, Play Again and Menu sat below 40 rows of scrolling.
Scoped to .rank-results-panel so other modes' results screens keep their
natural layout."
```

---

## Final Verification

Run this after Task 6, before merging. This is the whole-feature pass — the per-task checks caught regressions in isolation, this one catches interactions between them.

- [ ] **Full touch playthrough.** 390×844, coarse pointer. Play a GDP run to game over, using a mix of flick-to-cursor, nudge buttons, and direct gap taps. Confirm: no drag ever engages, no accidental country panels, every placement lands where the reticle showed, the bottom bar never hides behind chrome, and the console stays clean start to finish.

- [ ] **Rotation mid-run.** Rotate to landscape and back mid-placement. Extreme gaps stay reachable both ways.

- [ ] **Full desktop playthrough.** Play a run using drag-and-drop only, then another using `↑↓/Enter` only. Both must feel exactly as they did before this branch. Spot-check against `main` if anything feels off:

```bash
git stash list                     # confirm nothing stashed
git diff main --stat -- js/ css/   # review the whole surface changed
```

- [ ] **Dead identifier sweep.**

```bash
grep -rn "kbGapIndex\|kb-active\|_highlightKbGap" js/ css/
```

Expected: no output.

- [ ] **Listener leak check.** On touch, play 10+ turns, then confirm scrolling is still smooth and the cursor still tracks in one frame. Progressive lag would indicate a `scroll` or `resize` listener accumulating per render.

- [ ] **Squash-merge to main** per the repo convention (no PR needed for hobby projects):

```bash
git checkout main
git merge --squash feat/rank-touch-ergonomics
git commit    # write a combined message with the Co-Authored-By trailer
git push
```

- [ ] **Update `TODO.md`** if it carries an entry for phone ergonomics in rank mode.
