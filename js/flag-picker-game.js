// Flag Color Picker — a flag is shown with one color removed; the player
// reproduces the missing color with an HSV picker, scored by perceptual closeness.

import { playPlace, playScoreReveal, playClick } from './sounds.js';
import { getHighScore, saveScore } from './high-scores.js';
import { deltaE, hexToRgb, rgbToHex } from './color.js';

const FLAG_CDN = 'https://flagcdn.com/w640/';

function hsvToRgb(h, s, v) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r, g, b;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

// ΔE (0 = perfect) -> 0..100 points. ΔE 0->100, 25->50, 50+->0.
function scoreFromDelta(d) {
  return Math.max(0, Math.min(100, Math.round(100 - d * 2)));
}

export class FlagPickerGame {
  constructor(containerEl, onFinish) {
    this.container = containerEl;
    this.onFinish = onFinish;
    this.flags = [];
    this._loaded = false;
    this._imageCache = {};

    this.totalRounds = 10;
    this.round = 0;
    this.score = 0;
    this.results = [];

    // picker state
    this.hue = 200; this.sat = 0.5; this.val = 0.5;
    this._answered = false;
  }

  async loadData() {
    if (this._loaded) return;
    const resp = await fetch('data/flags.json');
    this.flags = (await resp.json()).flags;
    this._loaded = true;
  }

  start(totalRounds = 10) {
    this.totalRounds = totalRounds;
    this.round = 0;
    this.score = 0;
    this.results = [];
    this._deck = this._shuffle([...this.flags]);
    this._idx = 0;
    this._nextRound();
  }

  _shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  _isNearWhite(hex) { const { r, g, b } = hexToRgb(hex); return r > 220 && g > 220 && b > 220; }
  _isNearBlack(hex) { const { r, g, b } = hexToRgb(hex); return r < 35 && g < 35 && b < 35; }

  _pickFlag() {
    if (this._idx >= this._deck.length) { this._deck = this._shuffle([...this.flags]); this._idx = 0; }
    return this._deck[this._idx++];
  }

  get _currentHex() {
    const { r, g, b } = hsvToRgb(this.hue, this.sat, this.val);
    return rgbToHex(r, g, b);
  }

  _loadImage(url) {
    if (this._imageCache[url]) return Promise.resolve(this._imageCache[url]);
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => { this._imageCache[url] = img; resolve(img); };
      img.onerror = reject;
      img.src = url;
    });
  }

  _nextRound() {
    if (this.round >= this.totalRounds) { this._showResults(); return; }
    let flag, removed;
    let attempts = 0;
    while (attempts < 30) {
      attempts++;
      flag = this._pickFlag();
      const interesting = flag.colors.filter((c) => !this._isNearWhite(c) && !this._isNearBlack(c));
      const pool = interesting.length ? interesting : flag.colors;
      removed = pool[Math.floor(Math.random() * pool.length)];
      if (removed) break;
    }
    this.round++;
    this._answered = false;
    this.hue = 200; this.sat = 0.5; this.val = 0.5;
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
    area.className = 'flag-question-area';

    // Flag with the missing color
    const flagWrap = document.createElement('div');
    flagWrap.className = 'flag-main-wrap';
    const label = document.createElement('div');
    label.className = 'flag-question-label';
    label.textContent = 'Pick the missing color as precisely as you can';
    const flagDisplay = document.createElement('div');
    flagDisplay.className = 'flag-main-display';
    const canvas = document.createElement('canvas');
    canvas.className = 'flag-main-canvas';
    flagDisplay.appendChild(canvas);
    const nameEl = document.createElement('div');
    nameEl.className = 'flag-name flag-main-name';
    nameEl.textContent = flag.name;
    flagWrap.append(label, flagDisplay, nameEl);
    area.appendChild(flagWrap);

    // Picker
    area.appendChild(this._buildPicker(flag, removed));
    c.appendChild(area);

    // Render flag with the color removed
    this._renderFlag(canvas, flag, removed);
  }

  _buildPicker(flag, removed) {
    const wrap = document.createElement('div');
    wrap.className = 'picker-wrap';

    const sv = document.createElement('canvas');
    sv.className = 'picker-sv';
    sv.width = 220; sv.height = 180;
    const hue = document.createElement('canvas');
    hue.className = 'picker-hue';
    hue.width = 24; hue.height = 180;

    const row = document.createElement('div');
    row.className = 'picker-row';
    row.append(sv, hue);

    const swatchRow = document.createElement('div');
    swatchRow.className = 'picker-swatch-row';
    const swatch = document.createElement('div');
    swatch.className = 'picker-swatch';
    const submit = document.createElement('button');
    submit.className = 'btn btn-accent picker-submit';
    submit.textContent = 'Submit';
    swatchRow.append(swatch, submit);

    const reveal = document.createElement('div');
    reveal.className = 'picker-reveal';

    wrap.append(row, swatchRow, reveal);

    this._svCanvas = sv;
    this._hueCanvas = hue;
    this._swatch = swatch;
    this._drawSV();
    this._drawHue();
    this._updateSwatch();

    const svPick = (e) => {
      const r = sv.getBoundingClientRect();
      this.sat = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      this.val = Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height));
      this._drawSV();
      this._updateSwatch();
    };
    const huePick = (e) => {
      const r = hue.getBoundingClientRect();
      this.hue = Math.max(0, Math.min(359.9, ((e.clientY - r.top) / r.height) * 360));
      this._drawSV();
      this._updateSwatch();
    };
    this._dragSurface(sv, svPick);
    this._dragSurface(hue, huePick);

    submit.addEventListener('click', () => {
      if (this._answered) return;
      this._answered = true;
      this._handleAnswer(flag, removed, reveal, submit);
    });

    return wrap;
  }

  _dragSurface(el, handler) {
    let active = false;
    const down = (e) => { if (this._answered) return; active = true; el.setPointerCapture?.(e.pointerId); handler(e); e.preventDefault(); };
    const move = (e) => { if (active) handler(e); };
    const up = (e) => { active = false; el.releasePointerCapture?.(e.pointerId); };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  _drawSV() {
    const ctx = this._svCanvas.getContext('2d');
    const w = this._svCanvas.width, h = this._svCanvas.height;
    const base = hsvToRgb(this.hue, 1, 1);
    ctx.fillStyle = rgbToHex(base.r, base.g, base.b);
    ctx.fillRect(0, 0, w, h);
    const white = ctx.createLinearGradient(0, 0, w, 0);
    white.addColorStop(0, 'rgba(255,255,255,1)');
    white.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = white; ctx.fillRect(0, 0, w, h);
    const black = ctx.createLinearGradient(0, 0, 0, h);
    black.addColorStop(0, 'rgba(0,0,0,0)');
    black.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = black; ctx.fillRect(0, 0, w, h);
    // marker
    const mx = this.sat * w, my = (1 - this.val) * h;
    ctx.beginPath(); ctx.arc(mx, my, 6, 0, Math.PI * 2);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(mx, my, 7, 0, Math.PI * 2);
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
  }

  _drawHue() {
    const ctx = this._hueCanvas.getContext('2d');
    const w = this._hueCanvas.width, h = this._hueCanvas.height;
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    for (let i = 0; i <= 6; i++) {
      const { r, g, b } = hsvToRgb((i / 6) * 360 % 360, 1, 1);
      grad.addColorStop(i / 6, rgbToHex(r, g, b));
    }
    ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
  }

  _updateSwatch() {
    if (!this._swatch) return;
    this._swatch.style.background = this._currentHex;
    // hue marker line
    const ctx = this._hueCanvas.getContext('2d');
    this._drawHue();
    const y = (this.hue / 360) * this._hueCanvas.height;
    ctx.beginPath(); ctx.rect(0, y - 2, this._hueCanvas.width, 4);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
  }

  _renderFlag(canvas, flag, removed) {
    const url = `${FLAG_CDN}${flag.code}.png`;
    this._loadImage(url).then((img) => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const t = hexToRgb(removed);
      const threshold = 80;
      const d = data.data;
      for (let p = 0; p < d.length; p += 4) {
        const dist = Math.sqrt((d[p] - t.r) ** 2 + (d[p + 1] - t.g) ** 2 + (d[p + 2] - t.b) ** 2);
        if (dist < threshold) { d[p] = 200; d[p + 1] = 200; d[p + 2] = 200; d[p + 3] = 255; }
      }
      ctx.putImageData(data, 0, 0);
      // hatch the removed regions
      ctx.save(); ctx.strokeStyle = '#bbb'; ctx.lineWidth = 2;
      ctx.beginPath();
      const step = 12, w = canvas.width, h = canvas.height;
      for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) {
        const p = (y * w + x) * 4;
        const dist = Math.sqrt((d[p] - 200) ** 2 + (d[p + 1] - 200) ** 2 + (d[p + 2] - 200) ** 2);
        if (dist < 10) { ctx.moveTo(x, y); ctx.lineTo(x + step * 0.7, y + step * 0.7); }
      }
      ctx.stroke(); ctx.restore();
    }).catch(() => {
      canvas.width = 640; canvas.height = 400;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#333'; ctx.fillRect(0, 0, 640, 400);
      ctx.fillStyle = '#888'; ctx.font = '24px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(`${flag.name} flag`, 320, 200);
    });
  }

  _handleAnswer(flag, removed, revealEl, submitBtn) {
    const picked = this._currentHex;
    const d = deltaE(picked, removed);
    const points = scoreFromDelta(d);
    this.score += points;
    if (points >= 60) playPlace(); else playClick();

    const scoreEl = this.container.querySelector('.flag-game-score');
    if (scoreEl) scoreEl.textContent = `Score: ${this.score}`;

    submitBtn.disabled = true;
    revealEl.innerHTML = `
      <div class="picker-reveal-row">
        <span class="picker-cmp"><span class="picker-cmp-sw" style="background:${picked}"></span>Your pick</span>
        <span class="picker-cmp"><span class="picker-cmp-sw" style="background:${removed}"></span>Actual</span>
        <span class="picker-points">+${points}</span>
      </div>`;

    this.results.push({ flag: flag.name, removed, picked, points, deltaE: d });
    setTimeout(() => this._nextRound(), 1800);
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
