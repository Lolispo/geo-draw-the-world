// Flag Color Picker — a flag is shown with one color removed; the player
// reproduces the missing color with an HSV picker, scored by perceptual closeness.

import { playPlace, playScoreReveal, playClick } from './sounds.js';
import { getHighScore, saveScore } from './high-scores.js';
import { deltaE } from './color.js';
import { createHsvPicker } from './hsv-picker.js';
import { paintBlanked, paintFull, paintFilled } from './flag-blank.js';
import { interestingColours } from './quiz/flag-match.js';
import { shuffle } from './quiz/rng.js';
import { loadEntities, loadFlags, inCountryPool } from './datasets.js';
import { flagUrl } from './flags.js';


// ΔE (0 = perfect) -> 0..100 points. ΔE 0->100, 25->50, 50+->0.
function scoreFromDelta(d) {
  return Math.max(0, Math.min(100, Math.round(100 - d * 2)));
}

export class FlagPickerGame {
  constructor(containerEl, onFinish) {
    this.container = containerEl;
    this.onFinish = onFinish;
    this.flags = [];   // every flag in flags.json
    this.pool = [];    // the subset this run quizzes on
    this._loaded = false;

    this.totalRounds = 10;
    this.round = 0;
    this.score = 0;
    this.results = [];

    this._picker = null;
    this._answered = false;
  }

  async loadData() {
    if (this._loaded) return;
    this.flags = await loadFlags();
    await loadEntities(); // needed to gate territories/aggregates (TODOS #20)
    this._loaded = true;
  }

  start(totalRounds = 10) {
    this.totalRounds = totalRounds;
    this.round = 0;
    this.score = 0;
    this.results = [];
    // Refreshed each run so flipping the territories toggle takes effect (TODOS #20).
    this.pool = this.flags.filter((f) => inCountryPool(f.code));
    this._deck = shuffle(Math.random, this.pool);
    this._idx = 0;
    this._nextRound();
  }

  _pickFlag() {
    if (this._idx >= this._deck.length) { this._deck = shuffle(Math.random, this.pool); this._idx = 0; }
    return this._deck[this._idx++];
  }

  _nextRound() {
    if (this.round >= this.totalRounds) { this._showResults(); return; }
    let flag, removed;
    let attempts = 0;
    while (attempts < 30) {
      attempts++;
      flag = this._pickFlag();
      const pool = interestingColours(flag.colors);
      removed = pool[Math.floor(Math.random() * pool.length)];
      if (removed) break;
    }
    this.round++;
    this._answered = false;
    this._renderRound(flag, removed);
  }

  _renderRound(flag, removed) {
    const c = this.container;
    c.innerHTML = '';

    // Header
    const header = document.createElement('div');
    header.className = 'flag-game-header';
    const backBtn = document.createElement('button');
    backBtn.className = 'btn btn-tool';
    backBtn.textContent = '← Back';
    backBtn.addEventListener('click', () => this.onFinish(null));
    const title = document.createElement('h2');
    title.textContent = 'Flag Color Picker';
    const progress = document.createElement('span');
    progress.className = 'flag-game-progress';
    progress.textContent = `${this.round} / ${this.totalRounds}`;
    const scoreEl = document.createElement('span');
    scoreEl.className = 'flag-game-score';
    scoreEl.textContent = `Score: ${this.score}`;
    header.append(backBtn, title, progress, scoreEl);
    c.appendChild(header);

    const area = document.createElement('div');
    area.className = 'flag-question-area flag-picker-area';

    // Flag with the missing color, shown side by side with a live preview of
    // how the flag looks filled with the color the player is currently picking.
    this._holeCanvas = null;
    const flagWrap = document.createElement('div');
    flagWrap.className = 'flag-main-wrap';
    const label = document.createElement('div');
    label.className = 'flag-question-label';
    label.textContent = 'Pick the missing color as precisely as you can';

    const compare = document.createElement('div');
    compare.className = 'flag-picker-compare';

    // "Shown" — the flag with the color removed
    const shownPanel = document.createElement('div');
    shownPanel.className = 'flag-cmp-panel';
    const shownCap = document.createElement('div');
    shownCap.className = 'flag-cmp-cap';
    shownCap.textContent = 'Shown';
    const flagDisplay = document.createElement('div');
    flagDisplay.className = 'flag-main-display';
    const canvas = document.createElement('canvas');
    canvas.className = 'flag-main-canvas flag-cmp-canvas';
    flagDisplay.appendChild(canvas);
    this._flagCanvas = canvas;
    shownPanel.append(shownCap, flagDisplay);

    // "With your color" — live preview of the flag using the picked color
    const previewPanel = document.createElement('div');
    previewPanel.className = 'flag-cmp-panel';
    const previewCap = document.createElement('div');
    previewCap.className = 'flag-cmp-cap';
    previewCap.textContent = 'With your color';
    const previewDisplay = document.createElement('div');
    previewDisplay.className = 'flag-main-display';
    const preview = document.createElement('canvas');
    preview.className = 'flag-main-canvas flag-cmp-canvas';
    previewDisplay.appendChild(preview);
    this._previewCanvas = preview;
    previewPanel.append(previewCap, previewDisplay);

    compare.append(shownPanel, previewPanel);

    const nameEl = document.createElement('div');
    nameEl.className = 'flag-name flag-main-name';
    nameEl.textContent = flag.name;
    flagWrap.append(label, compare, nameEl);
    area.appendChild(flagWrap);

    // Picker
    area.appendChild(this._buildPicker(flag, removed));
    c.appendChild(area);

    // Render flag with the color removed (also builds the preview's hole canvas)
    this._renderFlag(canvas, flag, removed);
  }

  _buildPicker(flag, removed) {
    const picker = createHsvPicker({ onChange: () => this._updatePreview() });
    this._picker = picker;
    const submit = document.createElement('button');
    submit.className = 'btn btn-accent picker-submit';
    submit.textContent = 'Submit';
    picker.swatchRow.append(submit);
    const reveal = document.createElement('div');
    reveal.className = 'picker-reveal';
    picker.el.append(reveal);
    submit.addEventListener('click', () => {
      if (this._answered) return;
      this._answered = true;
      picker.disable();
      this._handleAnswer(flag, removed, reveal, submit);
    });
    return picker.el;
  }

  // Live preview: the flag with the picked colour showing through its hole.
  _updatePreview() {
    if (this._previewCanvas && this._holeCanvas) paintFilled(this._previewCanvas, this._holeCanvas, this._picker.hex());
  }

  _renderFlag(canvas, flag, removed) {
    paintBlanked(canvas, flag.code, removed, { name: flag.name, colors: flag.colors }).then((hole) => {
      // A slow image from an earlier round must not land on this one.
      if (canvas !== this._flagCanvas) return;
      this._holeCanvas = hole;
      this._updatePreview();
    });
  }

  _handleAnswer(flag, removed, revealEl, submitBtn) {
    const picked = this._picker.hex();
    const d = deltaE(picked, removed);
    const points = scoreFromDelta(d);
    this.score += points;
    if (points >= 60) playPlace(); else playClick();

    const scoreEl = this.container.querySelector('.flag-game-score');
    if (scoreEl) scoreEl.textContent = `Score: ${this.score}`;

    submitBtn.disabled = true;
    this._showFullFlag(flag); // reveal the complete flag
    revealEl.innerHTML = `
      <div class="picker-reveal-row">
        <span class="picker-cmp"><span class="picker-cmp-sw" style="background:${picked}"></span>Your pick</span>
        <span class="picker-cmp"><span class="picker-cmp-sw" style="background:${removed}"></span>Actual</span>
        <span class="picker-points">+${points}</span>
      </div>`;

    this.results.push({ flag: flag.name, removed, picked, points, deltaE: d });
    setTimeout(() => this._nextRound(), 2200);
  }

  _showFullFlag(flag) {
    if (this._flagCanvas) paintFull(this._flagCanvas, flag.code);
  }

  _showResults() {
    playScoreReveal();
    const c = this.container;
    c.innerHTML = '';
    const maxScore = this.totalRounds * 100;
    const mode = `flag-picker-${this.totalRounds}`;
    const isNew = saveScore(mode, this.score, this.results.length, this.totalRounds);

    let grade = 'Keep practicing!';
    if (this.score >= maxScore * 0.8) grade = 'Color Master!';
    else if (this.score >= maxScore * 0.6) grade = 'Sharp eye!';
    else if (this.score >= maxScore * 0.4) grade = 'Not bad!';
    else if (this.score >= maxScore * 0.2) grade = 'Getting there...';

    const panel = document.createElement('div');
    panel.className = 'flag-results-panel';
    panel.innerHTML = `
      <h2>Results <span class="results-mode-label">Flag Color Picker</span></h2>
      <div class="score-summary">
        <div class="big-score">${this.score} / ${maxScore}</div>
        <div class="score-grade">${grade}</div>
        ${isNew ? '<div class="high-score-note" style="display:block">New High Score!</div>' : ''}
      </div>
      <div class="flag-results-list">
        ${this.results.map((r, i) => `
          <div class="flag-result-row ${r.points >= 60 ? 'correct' : 'wrong'}" style="animation-delay:${i * 0.06}s">
            <span class="flag-result-name">${r.flag}</span>
            <span class="picker-cmp-sw" style="background:${r.picked}"></span>
            <span class="picker-cmp-sw" style="background:${r.removed}"></span>
            <span class="flag-result-points">+${r.points}</span>
          </div>`).join('')}
      </div>
      <div class="results-actions">
        <button id="picker-again" class="btn btn-accent">Play Again</button>
        <button id="picker-menu" class="btn btn-tool">← Back</button>
      </div>`;
    c.appendChild(panel);
    document.getElementById('picker-again').addEventListener('click', () => this.start(this.totalRounds));
    document.getElementById('picker-menu').addEventListener('click', () => this.onFinish(null));
  }
}
