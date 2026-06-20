// Flag Color Quiz game module
// Shows a flag with one color removed, player picks which of 3 flags has the missing color

import { playPlace, playSkip, playScoreReveal } from './sounds.js';
import { getHighScore, saveScore } from './high-scores.js';
import { deltaE } from './color.js';

const FLAG_CDN = 'https://flagcdn.com/w640/';

export class FlagGame {
  constructor(containerEl, onFinish) {
    this.container = containerEl;
    this.onFinish = onFinish; // callback when game ends
    this.flags = [];
    this.round = 0;
    this.totalRounds = 10;
    this.score = 0;
    this.results = []; // per-round results
    this.hideNames = false;
    this._loaded = false;
    this._imageCache = {};
    this._roundStart = 0;       // timestamp when round options become clickable
    this._timerInterval = null;
    this._timerEl = null;
    this.maxTime = 10;          // seconds per round
  }

  async loadData() {
    if (this._loaded) return;
    const resp = await fetch('data/flags.json');
    const data = await resp.json();
    this.flags = data.flags;
    this._loaded = true;
  }

  start(totalRounds = 10) {
    this.totalRounds = totalRounds;
    this.round = 0;
    this.score = 0;
    this.results = [];
    this._shuffledFlags = this._shuffle([...this.flags]);
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
    this._shuffledFlags = this._shuffle([...this.flags]);
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
      const interestingColors = mainFlag.colors.filter(c =>
        !this._isNearWhite(c) && !this._isNearBlack(c)
      );
      const removableColors = interestingColors.length > 0 ? interestingColors : mainFlag.colors;
      removedColor = removableColors[Math.floor(Math.random() * removableColors.length)];

      const remainingColors = mainFlag.colors.filter(c => c !== removedColor);

      // Find correct answer: flag with a tight color match to the removed color
      correct = this._findFlagWithColor(removedColor, mainFlag.code);
      if (!correct) continue;

      // Find wrong answers: must NOT have the removed color,
      // but SHOULD share colors with the remaining visible colors (to be plausible decoys)
      wrongs = this._findDecoyFlags(removedColor, remainingColors, [mainFlag.code, correct.code], 2);
      if (wrongs.length === 2) break;
    }

    if (!correct || !wrongs || wrongs.length < 2) {
      // Absolute fallback — just pick any 2 other flags
      const others = this.flags.filter(f => f.code !== mainFlag.code && f.code !== correct?.code);
      wrongs = this._shuffle(others).slice(0, 2);
    }

    const options = this._shuffle([correct, ...wrongs]);
    const correctIndex = options.indexOf(correct);

    this.round++;
    this._renderRound(mainFlag, removedColor, options, correctIndex);
  }

  _isNearWhite(hex) {
    const { r, g, b } = this._hexToRgb(hex);
    return r > 220 && g > 220 && b > 220;
  }

  _isNearBlack(hex) {
    const { r, g, b } = this._hexToRgb(hex);
    return r < 35 && g < 35 && b < 35;
  }

  _hexToRgb(hex) {
    const h = hex.replace('#', '');
    return {
      r: parseInt(h.substring(0, 2), 16),
      g: parseInt(h.substring(2, 4), 16),
      b: parseInt(h.substring(4, 6), 16)
    };
  }

  _colorDistance(hex1, hex2) {
    // Perceptual ΔE (CIEDE2000): ~0 identical, <10 similar, >30 clearly different
    return deltaE(hex1, hex2);
  }

  _closestColorDist(flag, targetColor) {
    // Smallest distance between any flag color and the target
    return Math.min(...flag.colors.map(c => this._colorDistance(c, targetColor)));
  }

  _flagHasColor(flag, targetColor, threshold = 12) {
    return flag.colors.some(c => this._colorDistance(c, targetColor) < threshold);
  }

  _findFlagWithColor(color, excludeCode) {
    // Find flags with a close match, sorted by best match first
    const scored = this.flags
      .filter(f => f.code !== excludeCode)
      .map(f => ({ flag: f, dist: this._closestColorDist(f, color) }))
      .filter(s => s.dist < 10) // tight ΔE threshold for correct answer
      .sort((a, b) => a.dist - b.dist);

    if (scored.length === 0) {
      // Relax slightly
      const relaxed = this.flags
        .filter(f => f.code !== excludeCode)
        .map(f => ({ flag: f, dist: this._closestColorDist(f, color) }))
        .filter(s => s.dist < 20)
        .sort((a, b) => a.dist - b.dist);
      if (relaxed.length === 0) return null;
      // Pick from top 5 for variety
      return relaxed[Math.floor(Math.random() * Math.min(5, relaxed.length))].flag;
    }

    // Pick from top 5 closest for variety
    return scored[Math.floor(Math.random() * Math.min(5, scored.length))].flag;
  }

  _findDecoyFlags(removedColor, remainingColors, excludeCodes, count) {
    // Decoys must:
    // 1. NOT contain the removed color (wide threshold — clearly no match)
    // 2. Ideally SHARE at least one color with the remaining visible colors
    //    (so they look plausible / you can't eliminate them by color alone)
    const REMOVED_THRESHOLD = 25; // ΔE — decoy must be clearly far from the removed color
    const SHARED_THRESHOLD = 12;  // ΔE — close enough to count as a shared visible color

    const candidates = this.flags.filter(f => {
      if (excludeCodes.includes(f.code)) return false;
      // Must not have the removed color
      if (this._flagHasColor(f, removedColor, REMOVED_THRESHOLD)) return false;
      return true;
    });

    // Score by how many remaining colors they share (more shared = better decoy)
    const scored = candidates.map(f => {
      const sharedCount = remainingColors.filter(rc =>
        f.colors.some(fc => this._colorDistance(fc, rc) < SHARED_THRESHOLD)
      ).length;
      return { flag: f, shared: sharedCount };
    });

    // Prefer flags that share at least one color with the visible part
    scored.sort((a, b) => b.shared - a.shared);

    // Take top pool that share colors, shuffle for variety
    const withShared = scored.filter(s => s.shared > 0);
    if (withShared.length >= count) {
      const pool = withShared.slice(0, Math.max(count * 4, 12));
      return this._shuffle(pool).slice(0, count).map(s => s.flag);
    }

    // Fallback: just use whatever doesn't have the removed color
    return this._shuffle(candidates).slice(0, count);
  }

  _getFlagUrl(code) {
    return `${FLAG_CDN}${code}.png`;
  }

  _loadImage(url) {
    if (this._imageCache[url]) return Promise.resolve(this._imageCache[url]);
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        this._imageCache[url] = img;
        resolve(img);
      };
      img.onerror = reject;
      img.src = url;
    });
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
    const timerBar = document.createElement('div');
    timerBar.className = 'flag-timer-bar';
    const timerLabel = document.createElement('span');
    timerLabel.className = 'flag-timer-label';
    timerLabel.textContent = this.maxTime.toFixed(1) + 's';
    timerWrap.append(timerBar, timerLabel);
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

      card.append(img, name);
      optionsWrap.appendChild(card);
      optionEls.push(card);

      card.addEventListener('click', () => {
        if (card.classList.contains('disabled')) return;
        // Disable all
        optionEls.forEach(el => el.classList.add('disabled'));
        this._handleAnswer(i, correctIndex, optionEls, mainFlag, removedColor, opt);
      });
    }

    questionArea.appendChild(optionsWrap);
    c.appendChild(questionArea);

    // Load and render modified flag
    try {
      const img = await this._loadImage(this._getFlagUrl(mainFlag.code));
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      // Remove the color from the flag
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const target = this._hexToRgb(removedColor);
      const threshold = 80;
      const data = imageData.data;

      for (let p = 0; p < data.length; p += 4) {
        const dist = Math.sqrt(
          (data[p] - target.r) ** 2 +
          (data[p + 1] - target.g) ** 2 +
          (data[p + 2] - target.b) ** 2
        );
        if (dist < threshold) {
          // Replace with a neutral gray pattern
          data[p] = 200;
          data[p + 1] = 200;
          data[p + 2] = 200;
          data[p + 3] = 255;
        }
      }
      ctx.putImageData(imageData, 0, 0);

      // Draw diagonal stripes over removed areas to make it obvious
      this._drawMissingPattern(ctx, imageData, target, threshold, canvas.width, canvas.height);

      // Start the round timer now that the flag is visible
      this._startRoundTimer();
    } catch (e) {
      // If image fails to load, show placeholder
      canvas.width = 640;
      canvas.height = 400;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#333';
      ctx.fillRect(0, 0, 640, 400);
      ctx.fillStyle = '#888';
      ctx.font = '24px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${mainFlag.name} flag`, 320, 200);
      this._startRoundTimer();
    }
  }

  _drawMissingPattern(ctx, imageData, target, threshold, w, h) {
    // Draw subtle diagonal lines over the removed color regions
    ctx.save();
    ctx.strokeStyle = '#bbb';
    ctx.lineWidth = 2;
    const step = 12;
    const data = imageData.data;

    // Create a path through removed-color areas
    ctx.beginPath();
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        const p = (y * w + x) * 4;
        const dist = Math.sqrt(
          (data[p] - target.r) ** 2 +
          (data[p + 1] - target.g) ** 2 +
          (data[p + 2] - target.b) ** 2
        );
        if (dist < threshold) {
          ctx.moveTo(x, y);
          ctx.lineTo(x + step * 0.7, y + step * 0.7);
        }
      }
    }
    ctx.stroke();
    ctx.restore();
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
    const pct = (remaining / this.maxTime) * 100;

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
    // Points based on speed: 100 at instant, 0 at maxTime
    const elapsed = (performance.now() - this._roundStart) / 1000;
    const remaining = Math.max(0, this.maxTime - elapsed);
    return Math.round((remaining / this.maxTime) * 100);
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
