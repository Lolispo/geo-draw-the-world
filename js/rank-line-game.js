// Rank Line game module
// Timeline-style mini-game: drag a country onto a sorted line where it ranks
// by a numeric metric. Dataset-agnostic — driven by a dataset config.

import { playPlace, playSkip, playScoreReveal, playClick, playNav } from './sounds.js';
import { getHighScore, saveScore } from './high-scores.js';
import { loadDatasets, loadEntities, inCountryPool, getDataset, getDatasetList, getEntries, formatValue } from './datasets.js';
import { openCountryPanel } from './country-panel.js';
import { flagUrl } from './flags.js';
import { getIncludeTerritories, setIncludeTerritories } from './settings.js';

const START_LIVES = 3;

// Touch layout is gated on pointer type, not screen width — a small window on a
// desktop still has a mouse. Evaluated per render rather than cached, so a
// device with both input types behaves correctly after switching.
const isTouch = () => window.matchMedia('(pointer: coarse)').matches;

export class RankLineGame {
  constructor(containerEl, onFinish) {
    this.container = containerEl;
    this.onFinish = onFinish; // callback when returning to menu
    this._loaded = false;

    this.dataset = null;       // active dataset config
    this._poolSize = 0;        // number of countries in the active dataset
    this.deck = [];            // shuffled remaining countries to draw
    this.placed = [];          // countries on the line, sorted desc by value
    this.lives = START_LIVES;
    this.runLength = 0;        // correctly placed (excludes seed)
    this.current = null;       // country currently being placed
    this.gameOver = false;

    // drag state
    this._dragging = false;
    this._ghost = null;
    this._activeGapIndex = -1;
    this._autoScrollRAF = null;
    this._onPointerMove = null;
    this._onPointerUp = null;

    // Pending insertion index — the gap the next placement will target.
    // Written by the keyboard on desktop, and by scroll position on touch.
    this._cursorGap = -1;
    this._picking = false;
    window.addEventListener('keydown', (e) => this._handleKey(e));
    // Spacer height depends on list height, so rotation must re-measure.
    // Registered once here — _renderLine runs every turn and would leak.
    window.addEventListener('resize', () => this._sizeSpacers());
  }

  // Dataset picker — shown before a run when no dataset is preselected.
  showPicker() {
    this._picking = true;
    this.gameOver = false;
    this.current = null;
    this.dataset = null;

    const c = this.container;
    c.innerHTML = '';
    const panel = document.createElement('div');
    panel.className = 'rank-picker';

    const head = document.createElement('div');
    head.className = 'rank-picker-head';
    const backBtn = document.createElement('button');
    backBtn.className = 'btn btn-tool';
    backBtn.textContent = '← Back';
    backBtn.addEventListener('click', () => this.onFinish(null));
    head.appendChild(backBtn);
    panel.appendChild(head);

    const h = document.createElement('h2');
    h.textContent = 'Rank the World';
    const sub = document.createElement('p');
    sub.className = 'rank-picker-sub';
    sub.textContent = 'Pick a dataset, then place each country on the line by its value. 3 lives.';
    panel.append(h, sub);

    // Territories toggle (shared setting) — include small dependent territories.
    const terrOn = getIncludeTerritories();
    const terrBtn = document.createElement('button');
    terrBtn.className = 'btn btn-tool' + (terrOn ? ' active' : '');
    terrBtn.textContent = terrOn ? '🏝️ Territories: On' : '🏝️ Territories: Off';
    terrBtn.title = 'Include small dependent/autonomous territories in the pool';
    terrBtn.addEventListener('click', () => { setIncludeTerritories(!getIncludeTerritories()); this.showPicker(); });
    panel.appendChild(terrBtn);

    const listWrap = document.createElement('div');
    listWrap.className = 'rank-picker-list';
    // Datasets where most countries share one value (e.g. 0% nuclear) make a
    // degenerate round — build-datasets.mjs marks those rankable:false. They stay
    // fully browsable in the Data Explorer.
    for (const d of getDatasetList().filter((d) => d.rankable !== false)) {
      const hs = getHighScore(`rank-line-${d.id}`);
      const btn = document.createElement('button');
      btn.className = 'btn rank-picker-item';
      btn.innerHTML =
        `<span class="rank-picker-name">${d.name}</span>` +
        `<span class="rank-picker-blurb">${d.blurb}</span>` +
        (hs ? `<span class="hs-badge">Best: ${hs.score}</span>` : '');
      btn.addEventListener('click', () => this.start(d.id));
      listWrap.appendChild(btn);
    }
    panel.appendChild(listWrap);

    c.appendChild(panel);
  }

  async loadData() {
    if (this._loaded) return;
    await loadDatasets();
    await loadEntities(); // needed to gate optional territories
    this._loaded = true;
  }

  _shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  start(datasetId = 'gdp-nominal') {
    this._picking = false;
    this.dataset = getDataset(datasetId);
    // Fresh entry objects each run (we mutate `.revealed` on them).
    // Aggregates out always, dependent territories out unless the toggle is on.
    const entries = getEntries(datasetId).filter((e) => inCountryPool(e.code));
    this.deck = this._shuffle(entries);
    this._poolSize = this.deck.length;
    this.placed = [];
    this.lives = START_LIVES;
    this.runLength = 0;
    this.gameOver = false;

    // Seed the line with one revealed country (does not count toward score)
    const seed = this.deck.pop();
    seed.revealed = true;
    this.placed.push(seed);

    this._drawNext();
  }

  get _mode() {
    return `rank-line-${this.dataset.id}`;
  }

  // Correct gap index for a value within the current (sorted desc) line.
  // Gap i sits above placed[i]; gap === placed.length is below the last entry.
  _correctGap(value) {
    let i = 0;
    while (i < this.placed.length && this.placed[i].value > value) i++;
    return i;
  }

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

  // ---------- Rendering ----------
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

  _renderHeader() {
    const header = document.createElement('div');
    header.className = 'rank-header';

    const title = document.createElement('h2');
    title.textContent = this.dataset.name;

    const blurb = document.createElement('span');
    blurb.className = 'rank-blurb';
    blurb.textContent = this.dataset.blurb;

    const run = document.createElement('span');
    run.className = 'rank-run';
    run.textContent = `Placed: ${this.runLength}`;

    const lives = document.createElement('span');
    lives.className = 'rank-lives';
    lives.innerHTML = Array.from({ length: START_LIVES }, (_, i) =>
      `<span class="heart ${i < this.lives ? '' : 'lost'}">❤</span>`
    ).join('');

    const backBtn = document.createElement('button');
    backBtn.className = 'btn btn-tool';
    backBtn.textContent = '← Back';
    backBtn.addEventListener('click', () => { this._cleanupDrag(); this.onFinish(null); });

    header.append(backBtn, title, blurb, run, lives);
    return header;
  }

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

  // Bottom control row: coarse navigation is the flick gesture, these buttons
  // are the fine adjustment and the commit.
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
    up.className = 'btn btn-tool rank-nudge';
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
    down.className = 'btn btn-tool rank-nudge';
    down.textContent = '▼';
    down.setAttribute('aria-label', 'Move insertion point down');
    down.addEventListener('click', () => nudge(1));

    row.append(up, place, down);
    return row;
  }

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

  _centerGap(index) {
    if (!this._listEl) return;
    const gap = this._listEl.querySelector(`.rank-gap[data-gap-index='${index}']`);
    if (gap) gap.scrollIntoView({ block: 'center', behavior: 'auto' });
  }

  _gap(index) {
    const gap = document.createElement('div');
    gap.className = 'rank-gap';
    gap.dataset.gapIndex = index;
    // Tap-to-place fallback (works even if drag misbehaves)
    gap.addEventListener('click', () => {
      if (this._dragging || this.gameOver) return;
      this._resolve(index);
    });
    return gap;
  }

  _row(entry, highlight, index) {
    const row = document.createElement('div');
    row.className = 'rank-row' + (highlight ? ' just-placed' : '');
    row.dataset.rowIndex = index;
    row.appendChild(this._flagImg(entry.code));
    const name = document.createElement('span');
    name.className = 'rank-row-name';
    name.textContent = entry.name;
    const val = document.createElement('span');
    val.className = 'rank-row-value';
    val.textContent = formatValue(this.dataset.format, entry.value);
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

  _flagImg(code) {
    const img = document.createElement('img');
    img.className = 'rank-flag';
    img.src = flagUrl(code, 'w40');
    img.alt = '';
    img.loading = 'eager';
    img.addEventListener('error', () => { img.style.visibility = 'hidden'; });
    return img;
  }

  // ---------- Drag & drop ----------
  _startDrag(e, card) {
    if (this.gameOver) return;
    e.preventDefault();
    this._dragging = true;
    card.classList.add('dragging');

    const rect = card.getBoundingClientRect();
    const ghost = card.cloneNode(true);
    ghost.classList.add('rank-drag-ghost');
    ghost.classList.remove('dragging');
    ghost.style.width = rect.width + 'px';
    document.body.appendChild(ghost);
    this._ghost = ghost;
    this._ghostOffX = e.clientX - rect.left;
    this._ghostOffY = e.clientY - rect.top;
    this._moveGhost(e.clientX, e.clientY);

    this._onPointerMove = (ev) => this._dragMove(ev);
    this._onPointerUp = (ev) => this._dragEnd(ev);
    window.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerup', this._onPointerUp);
    this._startAutoScroll();
  }

  _moveGhost(x, y) {
    if (!this._ghost) return;
    this._ghost.style.left = (x - this._ghostOffX) + 'px';
    this._ghost.style.top = (y - this._ghostOffY) + 'px';
  }

  _dragMove(e) {
    this._lastPointer = { x: e.clientX, y: e.clientY };
    this._moveGhost(e.clientX, e.clientY);
    this._updateActiveGap(e.clientX, e.clientY);
  }

  _updateActiveGap(x, y) {
    if (!this._ghost) return;
    this._ghost.style.pointerEvents = 'none';
    const el = document.elementFromPoint(x, y);
    const gap = el && el.closest ? el.closest('.rank-gap') : null;
    const idx = gap ? parseInt(gap.dataset.gapIndex, 10) : -1;
    if (idx !== this._activeGapIndex) {
      this._listEl.querySelectorAll('.rank-gap.active').forEach(g => g.classList.remove('active'));
      if (gap) gap.classList.add('active');
      this._activeGapIndex = idx;
    }
  }

  _startAutoScroll() {
    const tick = () => {
      if (!this._dragging) return;
      const p = this._lastPointer;
      const list = this._listEl;
      if (p && list) {
        const r = list.getBoundingClientRect();
        const EDGE = 60, SPEED = 12;
        if (p.y < r.top + EDGE) list.scrollTop -= SPEED;
        else if (p.y > r.bottom - EDGE) list.scrollTop += SPEED;
      }
      this._autoScrollRAF = requestAnimationFrame(tick);
    };
    this._autoScrollRAF = requestAnimationFrame(tick);
  }

  _dragEnd() {
    const gapIndex = this._activeGapIndex;
    this._cleanupDrag();
    if (gapIndex >= 0) this._resolve(gapIndex);
  }

  _cleanupDrag() {
    this._dragging = false;
    this._activeGapIndex = -1;
    if (this._ghost) { this._ghost.remove(); this._ghost = null; }
    if (this._cardEl) this._cardEl.classList.remove('dragging');
    if (this._autoScrollRAF) { cancelAnimationFrame(this._autoScrollRAF); this._autoScrollRAF = null; }
    if (this._onPointerMove) window.removeEventListener('pointermove', this._onPointerMove);
    if (this._onPointerUp) window.removeEventListener('pointerup', this._onPointerUp);
    this._onPointerMove = this._onPointerUp = null;
  }

  // ---------- Keyboard ----------
  _isScreenActive() {
    const screen = this.container.closest('.screen');
    return !!(screen && screen.classList.contains('active'));
  }

  _handleKey(e) {
    if (!this._isScreenActive() || this._picking) return;

    // Results screen: Space / Enter replays
    if (this.gameOver) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.start(this.dataset.id);
      }
      return;
    }

    if (!this.current || this._dragging) return;

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
  }

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

  // ---------- Resolve a guess ----------
  _resolve(chosenGap) {
    if (this.gameOver || !this.current) return;
    const correctGap = this._correctGap(this.current.value);
    const isCorrect = chosenGap === correctGap;

    // Insert at the correct position regardless, so the line stays truthful
    this.current.revealed = true;
    this.placed.splice(correctGap, 0, this.current);
    this._justPlacedIndex = correctGap;

    if (isCorrect) {
      this.runLength++;
      playPlace();
    } else {
      this.lives--;
      playSkip();
    }

    this.current = null;
    this._render();
    this._scrollToPlaced();
    this._flashPlaced(isCorrect, correctGap, chosenGap);

    if (this.lives <= 0) {
      setTimeout(() => this._showResults(), 1100);
    } else {
      setTimeout(() => this._drawNext(), isCorrect ? 750 : 1200);
    }
  }

  _scrollToPlaced() {
    const row = this._listEl && this._listEl.querySelector('.rank-row.just-placed');
    if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  _flashPlaced(isCorrect, correctGap, chosenGap) {
    const row = this._listEl && this._listEl.querySelector('.rank-row.just-placed');
    if (!row) return;
    row.classList.add(isCorrect ? 'place-correct' : 'place-wrong');
  }

  // ---------- Results ----------
  _showResults(clearedDeck = false) {
    this.gameOver = true;
    this._cleanupDrag();
    playScoreReveal();

    const isNew = saveScore(this._mode, this.runLength, this.runLength, this._poolSize);
    const prev = getHighScore(this._mode);

    let grade = 'Keep practicing!';
    if (this.runLength >= 25) grade = 'Economist!';
    else if (this.runLength >= 15) grade = 'Market maker!';
    else if (this.runLength >= 10) grade = 'Sharp instincts!';
    else if (this.runLength >= 5) grade = 'Getting the feel!';

    const c = this.container;
    c.innerHTML = '';

    const panel = document.createElement('div');
    panel.className = 'rank-results-panel';

    const finalList = this.placed.map((e, i) => `
      <div class="rank-result-row is-clickable" data-code="${e.code}" title="View ${e.name}" style="animation-delay:${Math.min(i, 30) * 0.03}s">
        <span class="rank-result-rank">${i + 1}</span>
        <img class="rank-flag" src="${flagUrl(e.code, 'w40')}" alt="" onerror="this.style.visibility='hidden'">
        <span class="rank-result-name">${e.name}</span>
        <span class="rank-result-value">${formatValue(this.dataset.format, e.value)}</span>
      </div>
    `).join('');

    panel.innerHTML = `
      <h2>Results <span class="results-mode-label">${this.dataset.name}</span></h2>
      <div class="score-summary">
        <div class="big-score">${this.runLength}</div>
        <div class="score-grade">${grade}</div>
        <div class="score-counted">${clearedDeck ? 'You ranked the entire world!' : 'countries correctly ranked'}</div>
        ${isNew
          ? '<div class="high-score-note" style="display:block">New best run!</div>'
          : (prev ? `<div class="high-score-note" style="display:block">Best run: ${prev.score}</div>` : '')}
      </div>
      <div class="rank-results-subhead">Final line — ${this.dataset.blurb}</div>
      <div class="rank-results-list">${finalList}</div>
      <div class="results-actions">
        <button id="rank-play-again" class="btn btn-accent">Play Again</button>
        <button id="rank-menu" class="btn btn-tool">Menu</button>
      </div>
    `;

    c.appendChild(panel);

    panel.querySelector('.rank-results-list').addEventListener('click', (ev) => {
      const row = ev.target.closest('.rank-result-row[data-code]');
      if (row) openCountryPanel(row.dataset.code);
    });

    document.getElementById('rank-play-again').addEventListener('click', () => {
      this.start(this.dataset.id);
    });
    document.getElementById('rank-menu').addEventListener('click', () => {
      this.onFinish(null);
    });
  }
}
