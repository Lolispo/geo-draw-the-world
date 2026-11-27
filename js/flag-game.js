// Flag Color Quiz game module
// Shows a flag with one color removed, player picks which of 3 flags has the missing color

import { playPlace, playSkip, playScoreReveal } from './sounds.js';
import { getHighScore, saveScore } from './high-scores.js';
import { loadEntities, inCountryPool } from './datasets.js';
import { flagUrl } from './flags.js';
import { paintBlanked } from './flag-blank.js';
import { interestingColours, findWithColour, findDecoys } from './quiz/flag-match.js';


export class FlagGame {
  constructor(containerEl, onFinish) {
    this.container = containerEl;
    this.onFinish = onFinish; // callback when game ends
    this.flags = [];   // every flag in flags.json
    this.pool = [];    // the subset this run quizzes on
    this.round = 0;
    this.totalRounds = 10;
    this.score = 0;
    this.results = []; // per-round results
    this.hideNames = false;
    this._loaded = false;
    this._roundStart = 0;       // timestamp when round options become clickable
    this._timerInterval = null;
    this._timerEl = null;
    this.maxTime = 10;          // seconds per round
    this.graceTime = 1;         // an answer this fast still scores full points
    this._optionEls = [];
    document.addEventListener('keydown', (e) => this._key(e));
  }

  _key(e) {
    if (e.ctrlKey || e.metaKey || e.altKey || !this.container.getClientRects().length) return;
    if (e.target.closest && e.target.closest('input, textarea, select')) return;
    const card = this._optionEls[Number(e.key) - 1];
    if (!card || !this.container.contains(card) || card.classList.contains('disabled')) return;
    e.preventDefault();
    card.click();
  }

  async loadData() {
    if (this._loaded) return;
    const resp = await fetch('data/flags.json');
    const data = await resp.json();
    this.flags = data.flags;
    await loadEntities(); // needed to gate territories/aggregates (TODOS #20)
    this._loaded = true;
  }

  start(totalRounds = 10) {
    this.totalRounds = totalRounds;
    this.round = 0;
    this.score = 0;
    this.results = [];

    // Quiz pool, refreshed each run so flipping the territories toggle takes effect
    // without a reload. Decoys are drawn from it too — with territories off you
    // should not see Greenland offered as a wrong answer either (TODOS #20).
    this.pool = this.flags.filter((f) => inCountryPool(f.code));
    this._shuffledFlags = this._shuffle([...this.pool]);
    this._usedIndices = new Set();
    this._nextRound();
  }

  _shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  _pickUnused() {
    // Pick a flag not yet used as the main flag
    for (let i = 0; i < this._shuffledFlags.length; i++) {
      if (!this._usedIndices.has(i)) {
        this._usedIndices.add(i);
        return this._shuffledFlags[i];
      }
    }
    // Fallback: reshuffle
    this._shuffledFlags = this._shuffle([...this.pool]);
    this._usedIndices.clear();
    this._usedIndices.add(0);
    return this._shuffledFlags[0];
  }

  _nextRound() {
    if (this.round >= this.totalRounds) {
      this._showResults();
      return;
    }

    // Try multiple main flags until we find one that produces a good question
    let mainFlag, removedColor, correct, wrongs;
    let attempts = 0;
    while (attempts < 30) {
      attempts++;
      mainFlag = this._pickUnused();

      // Pick a color to remove (skip white/black — boring and hard to distinguish)
      const removableColors = interestingColours(mainFlag.colors);
      removedColor = removableColors[Math.floor(Math.random() * removableColors.length)];
      const remainingColors = mainFlag.colors.filter(c => c !== removedColor);

      correct = findWithColour(Math.random, this.pool, removedColor, [mainFlag.code]);
      if (!correct) continue;
      wrongs = findDecoys(Math.random, this.pool, removedColor, remainingColors, [mainFlag.code, correct.code], 2);
      if (wrongs.length === 2) break;
    }

    if (!correct || !wrongs || wrongs.length < 2) {
      // Absolute fallback — just pick any 2 other flags
      const others = this.pool.filter(f => f.code !== mainFlag.code && f.code !== correct?.code);
      wrongs = this._shuffle(others).slice(0, 2);
    }

    const options = this._shuffle([correct, ...wrongs]);
    const correctIndex = options.indexOf(correct);

    this.round++;
    this._renderRound(mainFlag, removedColor, options, correctIndex);
  }

  _getFlagUrl(code) {
    return flagUrl(code, 'w640');
  }

  async _renderRound(mainFlag, removedColor, options, correctIndex) {
    const c = this.container;
    c.innerHTML = '';

    // Header
    const header = document.createElement('div');
    header.className = 'flag-game-header';

    const title = document.createElement('h2');
    title.textContent = 'Flag Color Quiz';

    const progress = document.createElement('span');
    progress.className = 'flag-game-progress';
    progress.textContent = `${this.round} / ${this.totalRounds}`;

    const scoreEl = document.createElement('span');
    scoreEl.className = 'flag-game-score';
    scoreEl.textContent = `Score: ${this.score}`;

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'btn btn-tool flag-name-toggle';
    toggleBtn.textContent = this.hideNames ? 'Show Names' : 'Hide Names';
    toggleBtn.addEventListener('click', () => {
      this.hideNames = !this.hideNames;
      toggleBtn.textContent = this.hideNames ? 'Show Names' : 'Hide Names';
      c.querySelectorAll('.flag-name').forEach(el => {
        el.style.visibility = this.hideNames ? 'hidden' : 'visible';
      });
    });

    const backBtn = document.createElement('button');
    backBtn.className = 'btn btn-tool';
    backBtn.textContent = '← Back';
    backBtn.addEventListener('click', () => {
      this.onFinish(null); // signal abort
    });

    header.append(backBtn, title, progress, scoreEl, toggleBtn);
    c.appendChild(header);

    // Question area
    const questionArea = document.createElement('div');
    questionArea.className = 'flag-question-area';

    // Main flag with missing color
    const mainFlagWrap = document.createElement('div');
    mainFlagWrap.className = 'flag-main-wrap';

    const questionLabel = document.createElement('div');
    questionLabel.className = 'flag-question-label';
    questionLabel.textContent = 'Which flag contains the missing color?';

    const mainFlagEl = document.createElement('div');
    mainFlagEl.className = 'flag-main-display';

    // Canvas for the modified flag
    const canvas = document.createElement('canvas');
    canvas.className = 'flag-main-canvas';

    const mainNameEl = document.createElement('div');
    mainNameEl.className = 'flag-name flag-main-name';
    mainNameEl.textContent = mainFlag.name;
    if (this.hideNames) mainNameEl.style.visibility = 'hidden';

    // Timer bar
    const timerWrap = document.createElement('div');
    timerWrap.className = 'flag-timer-wrap';
    const timerTrack = document.createElement('div');
    timerTrack.className = 'flag-timer-track';
    const timerBar = document.createElement('div');
    timerBar.className = 'flag-timer-bar';
    timerTrack.append(timerBar);
    const timerLabel = document.createElement('span');
    timerLabel.className = 'flag-timer-label';
    timerLabel.textContent = this.maxTime.toFixed(1) + 's';
    timerWrap.append(timerTrack, timerLabel);
    this._timerEl = { bar: timerBar, label: timerLabel };

    mainFlagEl.append(canvas);
    mainFlagWrap.append(questionLabel, mainFlagEl, mainNameEl, timerWrap);
    questionArea.appendChild(mainFlagWrap);

    // Options
    const optionsWrap = document.createElement('div');
    optionsWrap.className = 'flag-options';

    const optionEls = [];
    for (let i = 0; i < options.length; i++) {
      const opt = options[i];
      const card = document.createElement('button');
      card.className = 'flag-option-card';
      card.dataset.index = i;

      const img = document.createElement('img');
      img.className = 'flag-option-img';
      img.src = this._getFlagUrl(opt.code);
      img.alt = opt.name;
      img.loading = 'eager';

      const name = document.createElement('div');
      name.className = 'flag-name flag-option-name';
      name.textContent = opt.name;
      if (this.hideNames) name.style.visibility = 'hidden';

      const key = document.createElement('kbd');
      key.className = 'flag-option-key';
      key.textContent = i + 1;

      card.append(key, img, name);
      optionsWrap.appendChild(card);
      optionEls.push(card);

      card.addEventListener('click', () => {
        if (card.classList.contains('disabled')) return;
        // Disable all
        optionEls.forEach(el => el.classList.add('disabled'));
        this._handleAnswer(i, correctIndex, optionEls, mainFlag, removedColor, opt);
      });
    }

    this._optionEls = optionEls;
    questionArea.appendChild(optionsWrap);
    c.appendChild(questionArea);

    // Load and render modified flag; the round timer starts once it is visible.
    await paintBlanked(canvas, mainFlag.code, removedColor, { name: mainFlag.name, colors: mainFlag.colors });
    this._startRoundTimer();
  }



  _startRoundTimer() {
    this._roundStart = performance.now();
    clearInterval(this._timerInterval);
    this._timerInterval = setInterval(() => this._tickTimer(), 50);
  }

  _tickTimer() {
    if (!this._timerEl) return;
    const elapsed = (performance.now() - this._roundStart) / 1000;
    const remaining = Math.max(0, this.maxTime - elapsed);
    const pct = this._getTimeScore();

    // The bar is the points on offer, so it holds full through the grace second.
    this._timerEl.bar.style.width = pct + '%';
    this._timerEl.label.textContent = remaining.toFixed(1) + 's';

    // Color shifts as time runs out
    if (pct > 50) {
      this._timerEl.bar.style.background = 'var(--green)';
    } else if (pct > 25) {
      this._timerEl.bar.style.background = 'var(--orange)';
    } else {
      this._timerEl.bar.style.background = 'var(--red)';
    }
  }

  _stopRoundTimer() {
    clearInterval(this._timerInterval);
    this._timerInterval = null;
  }

  _getTimeScore() {
    const elapsed = (performance.now() - this._roundStart) / 1000;
    const late = Math.max(0, elapsed - this.graceTime);
    const span = this.maxTime - this.graceTime;
    return Math.round((Math.max(0, span - late) / span) * 100);
  }

  _handleAnswer(chosen, correct, optionEls, mainFlag, removedColor, chosenFlag) {
    this._stopRoundTimer();
    const isCorrect = chosen === correct;
    let points = 0;

    if (isCorrect) {
      points = this._getTimeScore();
      this.score += points;
      optionEls[chosen].classList.add('correct');

      // Show points earned on the timer
      if (this._timerEl) {
        this._timerEl.label.textContent = `+${points}`;
        this._timerEl.label.style.color = 'var(--green)';
      }
      playPlace();
    } else {
      optionEls[chosen].classList.add('wrong');
      optionEls[correct].classList.add('correct');
      if (this._timerEl) {
        this._timerEl.label.textContent = '+0';
        this._timerEl.label.style.color = 'var(--red)';
      }
      playSkip();
    }

    // Update score display in header
    const scoreEl = this.container.querySelector('.flag-game-score');
    if (scoreEl) scoreEl.textContent = `Score: ${this.score}`;

    this.results.push({
      flag: mainFlag.name,
      removedColor,
      correct: isCorrect,
      points,
      chosen: chosenFlag.name,
    });

    // Next round after delay
    setTimeout(() => this._nextRound(), isCorrect ? 800 : 1500);
  }

  _showResults() {
    playScoreReveal();
    const c = this.container;
    c.innerHTML = '';

    const maxScore = this.totalRounds * 100;
    const correctCount = this.results.filter(r => r.correct).length;
    const gameMode = `flag-quiz-${this.totalRounds}`;

    // Save high score
    const isNew = saveScore(gameMode, this.score, correctCount, this.totalRounds);

    // Grade based on points
    let grade = 'Keep practicing!';
    if (this.score >= maxScore * 0.8) grade = 'Flag Master!';
    else if (this.score >= maxScore * 0.6) grade = 'Great eye for color!';
    else if (this.score >= maxScore * 0.4) grade = 'Not bad!';
    else if (this.score >= maxScore * 0.2) grade = 'Getting there...';

    const panel = document.createElement('div');
    panel.className = 'flag-results-panel';

    panel.innerHTML = `
      <h2>Results <span class="results-mode-label">Flag Color Quiz</span></h2>
      <div class="score-summary">
        <div class="big-score">${this.score} / ${maxScore}</div>
        <div class="score-grade">${grade}</div>
        <div class="score-counted">${correctCount} of ${this.totalRounds} correct</div>
        ${isNew ? '<div class="high-score-note" style="display:block">New High Score!</div>' : ''}
      </div>
      <div class="flag-results-list">
        ${this.results.map((r, i) => `
          <div class="flag-result-row ${r.correct ? 'correct' : 'wrong'}" style="animation-delay: ${i * 0.06}s">
            <span class="flag-result-icon">${r.correct ? '✓' : '✗'}</span>
            <span class="flag-result-name">${r.flag}</span>
            <span class="flag-result-points">${r.correct ? '+' + r.points : '+0'}</span>
            <span class="flag-color-swatch-small" style="background:${r.removedColor}"></span>
          </div>
        `).join('')}
      </div>
      <div class="results-actions">
        <button id="flag-play-again" class="btn btn-accent">Play Again</button>
        <button id="flag-menu" class="btn btn-tool">Menu</button>
      </div>
    `;

    c.appendChild(panel);

    document.getElementById('flag-play-again').addEventListener('click', () => {
      this.start(this.totalRounds);
    });
    document.getElementById('flag-menu').addEventListener('click', () => {
      this.onFinish(null);
    });
  }
}
