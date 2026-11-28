// Random Geography Quiz and the Daily Quiz — the screen. Questions come from js/quiz/,
// which is pure; this file renders them, takes answers, and keeps score.

import { loadDatasets, loadEntities, loadAttributes, formatValue } from './datasets.js';
import { loadRelations } from './relations.js';
import { getIncludeTerritories } from './settings.js';
import { getHighScore, saveScore } from './high-scores.js';
import { drawSilhouette, drawPixelGrid } from './silhouette.js';
import { loadShapeMasks } from './shape-match.js';
import { loadWorldOutlines } from './geo-data.js';
import { loadEmblems, emblemUrl } from './emblems.js';
import { flagUrl } from './flags.js';
import { geoSummary } from './quiz/geo.js';
import { playPlace, playSkip, playScoreReveal } from './sounds.js';
import { buildRound, buildTypeRound } from './quiz/round.js';
import { PACKS, packLevel, packPool, packScoreKey, packTitle, packLevelLabel, packRoundCfg } from './quiz/packs.js';
import { CONTROLS } from './quiz/controls/index.js';
import { gapLabel } from './quiz/audit.js';
import { paintBlanked } from './flag-blank.js';
import { paintPie } from './pie.js';
import { scoreAnswer, markFor } from './quiz/score.js';
import {
  localDateKey, dailyNumber, dailySeed, loadDaily, recordAnswer, finishDaily, streak, resultLine,
} from './quiz/daily.js';

const MODE_LABEL = { daily: 'Daily Quiz', easy: 'Random Quiz · Easy', hard: 'Random Quiz · Hard' };

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// The last level and pool picked for a pack, so the chooser opens where you left it.
const PACK_CHOICE_KEY = 'geo-pack-choice';
function recallPackChoice(id) {
  try { return JSON.parse(localStorage.getItem(PACK_CHOICE_KEY) || '{}')[id] || {}; } catch { return {}; }
}
function rememberPackChoice(id, level, pool) {
  try {
    const all = JSON.parse(localStorage.getItem(PACK_CHOICE_KEY) || '{}');
    all[id] = { level, pool };
    localStorage.setItem(PACK_CHOICE_KEY, JSON.stringify(all));
  } catch { /* private mode: the chooser just opens on the defaults */ }
}

export class QuizGame {
  constructor(container, onFinish, onRoute) {
    this.container = container;
    this.onFinish = onFinish;
    this.onRoute = onRoute;
    this.raw = null;
    this._keyHandler = null;
    document.addEventListener('keydown', (e) => this._key(e));
  }

  async loadData() {
    if (this.raw) return;
    const [datasets, entities, attributes, relations, emblems, outlines, flags, masks] = await Promise.all([
      loadDatasets(), loadEntities(), loadAttributes(), loadRelations(), loadEmblems(), loadWorldOutlines(),
      fetch('data/flags.json').then((r) => r.json()).then((d) => d.flags).catch(() => []),
      loadShapeMasks().catch(() => null),
    ]);
    this.outlines = outlines;
    this.raw = {
      datasets, entities, attributes, relations: relations.relations || {}, emblems, flags, masks,
      geo: geoSummary(outlines),
    };
  }

  _key(e) {
    if (e.ctrlKey || e.metaKey || e.altKey || !this.container.getClientRects().length) return;
    if (this._keyHandler) this._keyHandler(e);
  }

  // ---------- home ----------

  showHome() {
    this.onRoute(['quiz']);
    this._keyHandler = null;
    const c = this.container;
    c.innerHTML = '';
    const head = el('div', 'quiz-header');
    head.append(el('h2', null, 'Geography Quiz'));
    const back = el('button', 'btn btn-tool', '← Menu');
    back.addEventListener('click', () => this.onFinish());
    head.append(back);
    c.append(head);

    const key = localDateKey();
    const entry = loadDaily(key);
    const st = streak(key);
    const daily = el('button', 'btn quiz-home-daily');
    daily.innerHTML = `
      <span class="quiz-home-icon">🌍❓</span>
      <span class="quiz-home-text">
        <span class="quiz-home-title">Daily Quiz #${dailyNumber(key)}</span>
        <span class="quiz-home-sub">${entry?.done ? `Done · ${entry.score}/500` : entry ? `In progress · ${entry.answers.length}/5` : '5 questions, the same for everyone today'}</span>
      </span>
      ${st ? `<span class="quiz-streak">🔥${st}</span>` : ''}`;
    daily.addEventListener('click', () => this.start('daily'));
    c.append(daily);

    const row = el('div', 'quiz-home-random');
    for (const mode of ['easy', 'hard']) {
      const best = getHighScore(`quiz-${mode}`);
      const b = el('button', 'btn quiz-home-card');
      b.innerHTML = `
        <span class="quiz-home-title">Random · ${mode === 'easy' ? 'Easy' : 'Hard'}</span>
        <span class="quiz-home-sub">${mode === 'easy' ? '5 questions, well-known countries' : '5 questions, the whole world, tighter calls'}</span>
        ${best ? `<span class="quiz-home-best">Best ${best.score}/500</span>` : ''}`;
      b.addEventListener('click', () => this.start(mode));
      row.append(b);
    }
    c.append(row);
  }

  // ---------- round ----------

  // A menu game from packs.js: ten questions of one type, played on this screen.
  startPack(id, level, pool, { seed } = {}) {
    const pack = PACKS[id];
    if (pack.levels && !pack.levels[level]) { this.showPackLevels(pack); return; }
    this.mode = 'pack';
    this.pack = pack;
    this.level = packLevel(pack, level);
    this.pool = packPool(pack, pool);
    if (pack.pools) rememberPackChoice(pack.id, this.level, this.pool);
    this.dayKey = null;
    this.seed = seed ?? Math.floor(Math.random() * 2 ** 31);
    const route = [id, this.level];
    if (this.pool && this.pool !== pack.defaultPool) route.push(this.pool);
    this.onRoute(route, seed == null ? {} : { seed });
    const cfg = packRoundCfg(pack, this.level, this.pool);
    this.questions = buildTypeRound({ seed: this.seed, type: pack.type, size: pack.size, mix: cfg.mix, opts: cfg.opts },
      this.raw, { territories: getIncludeTerritories() });
    this.answers = [];
    this.points = [];
    this.index = 0;
    this.score = 0;
    this._renderQuestion();
  }

  // #/<pack> with no level: one button per level, each with its best score. A pack
  // with pools asks for both choices, then plays on one button.
  showPackLevels(pack) {
    this.onRoute([pack.id]);
    this._keyHandler = null;
    this.mode = 'pack';
    this.pack = pack;
    const c = this.container;
    c.innerHTML = '';
    const head = el('div', 'quiz-header');
    head.append(el('h2', null, pack.title));
    const back = el('button', 'btn btn-tool', '← Menu');
    back.addEventListener('click', () => this.onFinish());
    head.append(back);
    c.append(head);
    if (pack.pools) { this._packChooser(pack); return; }
    const row = el('div', 'quiz-home-random quiz-pack-levels');
    for (const [key, lv] of Object.entries(pack.levels)) {
      const best = getHighScore(packScoreKey(pack, key));
      const b = el('button', 'btn quiz-home-card');
      b.dataset.level = key;
      b.innerHTML = `
        <span class="quiz-home-title">${esc(lv.label)}</span>
        <span class="quiz-home-sub">${esc(lv.sub || '')}</span>
        ${best ? `<span class="quiz-home-best">Best ${best.score}/${pack.size * 100}</span>` : ''}`;
      b.addEventListener('click', () => this.startPack(pack.id, key));
      row.append(b);
    }
    c.append(row);
  }

  _packChooser(pack) {
    const last = recallPackChoice(pack.id);
    const pick = { level: packLevel(pack, last.level), pool: packPool(pack, last.pool) };
    const wrap = el('div', 'quiz-pack-chooser');
    const play = el('button', 'btn btn-accent quiz-pack-play');
    const paint = () => {
      for (const b of wrap.querySelectorAll('.quiz-pack-opt')) {
        b.setAttribute('aria-pressed', String(pick[b.dataset.axis] === b.dataset.key));
      }
      const best = getHighScore(packScoreKey(pack, pick.level, pick.pool));
      play.innerHTML = `Play <span class="quiz-pack-play-sub">${esc(packLevelLabel(pack, pick.level, pick.pool))}${
        best ? ` · best ${best.score}/${pack.size * 100}` : ''}</span>`;
    };
    for (const [axis, label, items] of [['level', pack.levelsLabel || 'Level', pack.levels], ['pool', pack.poolsLabel || 'Pool', pack.pools]]) {
      const group = el('div', 'quiz-pack-axis');
      group.append(el('div', 'quiz-pack-axis-label', label));
      const opts = el('div', 'quiz-pack-opts');
      opts.setAttribute('role', 'group');
      opts.setAttribute('aria-label', label);
      for (const [key, it] of Object.entries(items)) {
        const b = el('button', 'btn quiz-pack-opt');
        b.dataset.axis = axis;
        b.dataset.key = key;
        b.innerHTML = `<span class="quiz-pack-opt-title">${esc(it.label)}</span><span class="quiz-pack-opt-sub">${esc(it.sub || '')}</span>`;
        b.addEventListener('click', () => { pick[axis] = key; paint(); });
        opts.append(b);
      }
      group.append(opts);
      wrap.append(group);
    }
    play.addEventListener('click', () => this.startPack(pack.id, pick.level, pick.pool));
    wrap.append(play);
    this.container.append(wrap);
    paint();
  }

  _title() {
    if (this.mode === 'pack') return packTitle(this.pack, this.level, this.pool);
    return this.mode === 'daily' ? `Daily Quiz #${dailyNumber(this.dayKey)}` : MODE_LABEL[this.mode];
  }

  _leave() {
    if (this.mode === 'pack') this.onFinish();
    else this.showHome();
  }

  start(mode, { seed } = {}) {
    this.mode = mode;
    this.pack = null;
    this.dayKey = mode === 'daily' ? localDateKey() : null;
    this.seed = mode === 'daily' ? dailySeed(this.dayKey) : (seed ?? Math.floor(Math.random() * 2 ** 31));
    this.onRoute(['quiz', mode], mode === 'daily' || seed == null ? {} : { seed });
    this.questions = buildRound({ seed: this.seed, mode, day: this.dayKey }, this.raw, { territories: getIncludeTerritories() });
    this.answers = [];
    this.points = [];
    this.index = 0;
    this.score = 0;
    if (mode === 'daily') {
      const entry = loadDaily(this.dayKey);
      if (entry) {
        this.answers = entry.answers.slice();
        this.points = this.answers.map((a, i) => scoreAnswer(this.questions[i], a));
        this.index = this.answers.length;
        this.score = entry.score;
        if (entry.done || this.index >= this.questions.length) { this._finish(); return; }
      }
    }
    this._renderQuestion();
  }

  get total() { return this.questions.length * 100; }

  _renderQuestion() {
    const q = this.questions[this.index];
    const c = this.container;
    c.innerHTML = '';
    this._answered = false;

    const head = el('div', 'quiz-header');
    const h2 = el('h2', null, this.mode === 'pack' && this.pack.levels ? this.pack.title : this._title());
    // The level goes on as a quieter tag that never wraps the header onto a second line.
    if (this.mode === 'pack' && this.pack.levels) h2.append(' ', el('span', 'quiz-header-level', packLevelLabel(this.pack, this.level, this.pool)));
    head.append(h2);
    head.append(el('span', 'quiz-progress', `${this.index + 1} / ${this.questions.length}`));
    this._scoreEl = el('span', 'quiz-score', `${this.score}`);
    head.append(this._scoreEl);
    const back = el('button', 'btn btn-tool', '✕');
    back.title = 'Leave';
    back.addEventListener('click', () => this._leave());
    head.append(back);
    c.append(head);

    if (this.mode === 'daily') c.append(this._marksStrip());

    const card = el('div', 'quiz-card');
    card.append(el('div', 'quiz-prompt', q.prompt));

    if (q.shape && q.res) card.append(this._pixelShape(q));
    else if (q.shape) {
      const canvas = el('canvas', 'quiz-shape');
      card.append(canvas);
      drawSilhouette(canvas, q.shape, this.raw.entities[q.shape], { size: 180, color: '#7EA6E0' });
    }
    if (q.emblem) {
      const box = el('div', 'quiz-emblem');
      const img = el('img');
      img.alt = 'Coat of arms';
      img.src = emblemUrl(q.emblem, 240);
      box.append(img);
      card.append(box);
    }
    if (q.map) {
      this._mapCanvas = el('canvas', 'quiz-map');
      card.append(this._mapCanvas);
      requestAnimationFrame(() => this._drawMap(q));
    }
    if (q.combo) card.append(this._comboRow(q));
    if (q.pie) {
      const canvas = el('canvas', 'quiz-pie');
      card.append(canvas);
      paintPie(canvas, q.pie.colors, q.pie.shares, { size: window.innerWidth < 480 ? 150 : 180 });
    }
    if (q.blank) {
      const canvas = el('canvas', 'quiz-blank-flag');
      card.append(canvas);
      paintBlanked(canvas, q.flag, q.blank, { name: this.raw.entities[q.flag]?.name, colors: this.raw.flags.find((f) => f.code === q.flag)?.colors });
    }

    this._control = null;
    if (q.control) card.append(this._gameControl(q));
    else if (q.type === 'slider') card.append(this._sliderControl(q));
    else card.append(this._choiceControl(q));

    // The verdict line and the button keep their space before the answer too, so
    // answering never pushes the options around.
    this._revealEl = el('div', 'quiz-reveal');
    card.append(this._revealEl);
    const last = this.index + 1 >= this.questions.length;
    this._nextLabel = last ? 'See results' : 'Next →';
    this._nextBtn = el('button', 'btn btn-accent quiz-next');
    const locks = q.type === 'slider' || (this._control && !this._control.instant);
    if (locks) this._nextBtn.textContent = 'Lock in';
    else this._nextBtn.textContent = this._nextLabel;
    // A control that needs a complete answer keeps Lock in hidden until it has one.
    if (!locks || (this._control && this._control.value() == null)) this._nextBtn.classList.add('is-waiting');
    this._nextBtn.addEventListener('click', () => {
      if (this._answered) this._next();
      else if (q.type === 'slider') this._answer(Number(this._slider.input.value));
      else if (this._control) this._lockIn();
    });
    card.append(this._nextBtn);
    c.append(card);
  }

  // The outline is drawn up front, hidden, so revealing it is only a fade.
  _pixelShape(q) {
    const box = el('div', 'quiz-shape quiz-pixel');
    const pixels = el('canvas', 'quiz-pixel-cells');
    const outline = el('canvas', 'quiz-pixel-outline');
    box.append(pixels, outline);
    const pad = drawPixelGrid(pixels, q.pixels, q.res, { size: 180, color: '#7EA6E0' });
    drawSilhouette(outline, q.shape, this.raw.entities[q.shape], {
      size: 180, pad, color: 'rgba(255,255,255,0.16)', stroke: '#ffffff', lineWidth: 1.5,
    });
    return box;
  }

  _comboRow(q) {
    const row = el('div', 'quiz-combo');
    const [a, b, cc] = q.combo.codes;
    const chip = (label, i) => {
      const box = el('div', 'quiz-combo-chip');
      box.append(el('span', 'quiz-combo-name', label));
      const f = el('span', 'quiz-combo-figure is-pending', q.combo.figures[i]);
      box.append(f);
      return box;
    };
    const name = (code) => this.raw.entities[code]?.name || code;
    row.append(chip(name(a), 0), el('span', 'quiz-combo-op', '+'), chip(name(b), 1),
      el('span', 'quiz-combo-op', '='), chip('together', 2), el('span', 'quiz-combo-op', 'vs'), chip(name(cc), 3));
    return row;
  }

  _drawMap(q, chosen = null) {
    const canvas = this._mapCanvas;
    if (!canvas || !canvas.isConnected) return;
    const cssW = canvas.clientWidth || 520, cssH = Math.round(cssW * 0.55);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = cssW * dpr; canvas.height = cssH * dpr;
    canvas.style.height = `${cssH}px`;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    // Frame the four dots with room around them, at the canvas's own aspect.
    const xs = q.map.dots.map((d) => d.x), ys = q.map.dots.map((d) => d.y);
    let [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const pad = Math.max(60, (x1 - x0) * 0.25, (y1 - y0) * 0.25);
    x0 -= pad; x1 += pad; y0 -= pad; y1 += pad;
    const scale = Math.min(cssW / (x1 - x0), cssH / (y1 - y0));
    const ox = (cssW - (x1 - x0) * scale) / 2 - x0 * scale, oy = (cssH - (y1 - y0) * scale) / 2 - y0 * scale;
    ctx.fillStyle = '#0d1a2b';
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.fillStyle = '#26364d';
    ctx.strokeStyle = '#3b5a80';
    ctx.lineWidth = 0.6;
    for (const country of this.outlines || []) {
      for (const ring of country.polygons || []) {
        ctx.beginPath();
        ring.forEach(([x, y], i) => (i ? ctx.lineTo(x * scale + ox, y * scale + oy) : ctx.moveTo(x * scale + ox, y * scale + oy)));
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
    q.map.dots.forEach((d, i) => {
      const x = d.x * scale + ox, y = d.y * scale + oy;
      let fill = '#58a6ff';
      if (chosen != null) fill = i === q.answer ? '#3fb950' : i === chosen ? '#f85149' : '#8b949e';
      ctx.beginPath();
      ctx.arc(x, y, 12, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#0d1117';
      ctx.stroke();
      ctx.fillStyle = '#0d1117';
      ctx.font = '700 13px "Space Grotesk", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), x, y + 0.5);
    });
  }

  _marksStrip() {
    const strip = el('div', 'quiz-marks');
    this.questions.forEach((q, i) => {
      const m = i < this.points.length ? markFor(q, this.points[i]) : '⬜';
      strip.append(el('span', null, m));
    });
    return strip;
  }

  _choiceControl(q) {
    const wrap = el('div', `quiz-choices quiz-choices-${q.choices.length}`);
    if (q.outlines) wrap.classList.add('quiz-choices-outlines');
    if (q.flagsShown) wrap.classList.add('quiz-choices-flags');
    this._choiceEls = q.choices.map((ch, i) => {
      const b = el('button', 'btn quiz-choice');
      b.append(el('kbd', 'quiz-key', String(i + 1)));
      if (q.outlines) {
        // The names are the answer, so an outline option shows only its drawing until
        // the figures go in.
        const canvas = el('canvas', 'quiz-choice-outline');
        b.append(canvas);
        drawSilhouette(canvas, ch.code, this.raw.entities[ch.code], { size: 110, pad: 8, color: '#7EA6E0' });
      } else {
        // A picture slot (flag or coat of arms) is held from the start and filled on
        // answering, so the picture can't give the answer away or move anything.
        if (q.flagsShown) {
          const pic = el('span', 'quiz-choice-pic is-flag-big');
          const img = el('img');
          img.alt = '';
          img.src = flagUrl(ch.code, 'w160');
          pic.append(img);
          b.append(pic);
        } else if (q.pictures) b.append(el('span', `quiz-choice-pic is-${q.pictures} is-pending`));
        b.append(el('span', 'quiz-choice-label', ch.label));
      }
      // The figure's slot is there from the start, as wide as the widest figure, so
      // filling it in changes nothing about the option's size.
      if (q.figures) {
        // A non-breaking space gives the empty slot its line height.
        const fig = el('span', 'quiz-choice-figure is-pending', '\u00a0');
        fig.style.minWidth = `calc(${Math.max(...q.figures.map((f) => f.length))}ch + 18px)`;
        b.append(fig);
      }
      b.addEventListener('click', () => this._answer(i));
      wrap.append(b);
      return b;
    });
    this._keyHandler = (e) => {
      if (e.target.closest && e.target.closest('input, textarea, select')) return;
      if (!this._answered) {
        const i = Number(e.key) - 1;
        if (i >= 0 && i < q.choices.length) { e.preventDefault(); this._answer(i); }
      } else if (e.key === 'Enter') { e.preventDefault(); this._next(); }
    };
    return wrap;
  }

  _gameControl(q) {
    const ctl = CONTROLS[q.control](q, {
      raw: this.raw,
      onPick: ({ now } = {}) => {
        if (this._answered) return;
        if (now) { this._lockIn(); return; }
        this._nextBtn?.classList.toggle('is-waiting', ctl.value() == null);
      },
    });
    this._control = ctl;
    this._keyHandler = (e) => {
      if (e.target.closest && e.target.closest('input, textarea, select')) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        // A held Enter advancing through reveals must not lock in the next question.
        if (e.repeat) return;
        if (this._answered) this._next(); else this._lockIn();
        return;
      }
      if (!this._answered && ctl.key(e)) e.preventDefault();
    };
    return ctl.el;
  }

  _lockIn() {
    const v = this._control?.value();
    if (v == null) return;
    this._answer(v);
  }

  _sliderControl(q) {
    const { min, max, unit } = q.slider;
    const wrap = el('div', 'quiz-slider');
    const value = el('div', 'quiz-slider-value');
    const input = el('input', 'quiz-slider-input');
    input.type = 'range';
    input.min = min;
    input.max = max;
    input.step = q.slider.step ?? 1;
    input.value = Math.round((min + max) / 2);
    const show = () => { value.textContent = `${input.value}${unit}`; };
    input.addEventListener('input', show);
    show();
    const ends = el('div', 'quiz-slider-ends');
    ends.append(el('span', null, `${min}${unit}`), el('span', null, `${max}${unit}`));
    const track = el('div', 'quiz-slider-track');
    track.append(input);
    wrap.append(value, track, ends);
    this._slider = { input, track };
    this._keyHandler = (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (!this._answered) this._answer(Number(input.value));
      else this._next();
    };
    return wrap;
  }

  _answer(given) {
    if (this._answered) return;
    const q = this.questions[this.index];
    if (this.mode === 'daily') {
      const pts = scoreAnswer(q, given);
      // Refused means this question was already answered elsewhere (another tab);
      // the stored answer stands, so start again from storage.
      if (!recordAnswer(this.dayKey, this.index, given, pts, markFor(q, pts))) { this.start('daily'); return; }
      // The day is complete the moment the last answer is in, not when results are
      // opened — closing the tab on the last reveal must still count for the streak.
      if (this.index === this.questions.length - 1) {
        const entry = finishDaily(this.dayKey);
        const correct = entry.marks.filter((m) => m === '🟩').length;
        this._dailyIsNew = saveScore('quiz-daily', entry.score, correct, this.questions.length);
      }
    }
    this._answered = true;
    const pts = scoreAnswer(q, given);
    this.answers.push(given);
    this.points.push(pts);
    this.score += pts;
    this._scoreEl.textContent = `${this.score}`;
    if (pts >= 50) playPlace(); else playSkip();

    if (q.control) {
      this._control.reveal(given, pts);
      const word = q.control === 'gaps' ? (pts ? 'Right' : 'Wrong') : pts >= 100 ? 'Spot on' : `+${pts}`;
      this._revealEl.innerHTML = `<span class="quiz-reveal-verdict ${pts >= 50 ? 'good' : 'bad'}">${word}</span>`;
    } else if (q.type === 'slider') {
      this._slider.input.disabled = true;
      const { min, max } = q.slider;
      const truth = el('div', 'quiz-slider-truth');
      truth.style.setProperty('--at', ((q.answer - min) / (max - min)).toFixed(4));
      truth.append(el('span', null, `${q.answer}${q.slider.unit}`));
      this._slider.track.append(truth);
      const fmtd = (v) => formatValue(this.raw.datasets.datasets.find((d) => d.id === q.dataset).format, v);
      // The real value is marked on the track, so the line stays short enough for one row.
      this._revealEl.innerHTML = `<span class="quiz-reveal-verdict ${pts >= 50 ? 'good' : 'bad'}">+${pts}</span> you said ${esc(fmtd(given))}`;
    } else {
      this._choiceEls.forEach((b, i) => {
        b.classList.add('disabled');
        if (i === q.answer) b.classList.add('correct');
        else if (i === given) b.classList.add('wrong');
        const pic = b.querySelector('.quiz-choice-pic.is-pending');
        if (pic) {
          const img = el('img');
          img.alt = '';
          img.src = q.pictures === 'flag' ? flagUrl(q.choices[i].code, 'w160') : emblemUrl(q.choices[i].code, 120);
          pic.append(img);
          pic.classList.remove('is-pending');
        }
        const fig = b.querySelector('.quiz-choice-figure');
        if (fig) { fig.textContent = q.figures[i]; fig.classList.remove('is-pending'); }
      });
      this.container.querySelectorAll('.quiz-combo-figure').forEach((f) => f.classList.remove('is-pending'));
      this.container.querySelector('.quiz-pixel')?.classList.add('is-revealed');
      if (q.map) this._drawMap(q, given);
      // Every figure lives in its option or in the question; this line is the verdict.
      this._revealEl.innerHTML = `<span class="quiz-reveal-verdict ${pts ? 'good' : 'bad'}">${pts ? 'Right' : 'Wrong'}</span>`;
    }
    if (this.mode === 'daily') {
      const strip = this.container.querySelector('.quiz-marks');
      if (strip) strip.replaceWith(this._marksStrip());
    }
    this._nextBtn.textContent = this._nextLabel;
    this._nextBtn.classList.remove('is-waiting');
    this._nextBtn.focus({ preventScroll: true });
  }

  _next() {
    if (!this._answered) return;
    this.index++;
    if (this.index >= this.questions.length) this._finish();
    else this._renderQuestion();
  }

  // ---------- results ----------

  _youSaid(q, a) {
    const name = (c) => this.raw.entities[c]?.name || c;
    const label = (k) => q.choices[k]?.label ?? '—';
    switch (q.control) {
      case 'picker': return `You mixed ${a}`;
      case 'order': return `You ordered ${(a || []).map(label).join(' > ')}`;
      case 'multi': return `You picked ${(a || []).map(label).join(', ')}`;
      case 'gaps': return `You put it ${gapLabel(q, a, name)}`;
      default: break;
    }
    if (q.type === 'slider') return `You said ${a}${q.slider.unit}`;
    return `You said ${q.figures?.[a] && q.type === 'where' ? q.figures[a] : label(a)}`;
  }

  _finish() {
    this._keyHandler = null;
    const correct = this.points.filter((p) => p >= 100).length;
    let isNew = false;
    if (this.mode === 'daily') {
      isNew = !!this._dailyIsNew;
      this._dailyIsNew = false;
    } else {
      const key = this.mode === 'pack' ? packScoreKey(this.pack, this.level, this.pool) : `quiz-${this.mode}`;
      isNew = saveScore(key, this.score, correct, this.questions.length);
    }
    playScoreReveal();

    const c = this.container;
    c.innerHTML = '';
    const panel = el('div', 'quiz-results');
    panel.innerHTML = `
      <h2>Results <span class="results-mode-label">${esc(this._title())}</span></h2>
      <div class="score-summary">
        <div class="big-score">${this.score} / ${this.total}</div>
        <div class="score-counted">${correct} of ${this.questions.length} spot on</div>
        ${this.mode === 'daily' ? `<div class="quiz-marks quiz-marks-big">${this.points.map((p, i) => markFor(this.questions[i], p)).join('')}</div>` : ''}
        ${this.mode === 'daily' && streak(this.dayKey) ? `<div class="quiz-streak">🔥${streak(this.dayKey)} day streak</div>` : ''}
        ${isNew ? '<div class="high-score-note" style="display:block">New High Score!</div>' : ''}
      </div>`;

    const list = el('div', 'quiz-results-list');
    this.questions.forEach((q, i) => {
      const row = el('div', `quiz-result-row ${this.points[i] >= 50 ? 'good' : 'bad'}`);
      row.style.animationDelay = `${i * 0.05}s`;
      const yours = this._youSaid(q, this.answers[i]);
      row.innerHTML = `
        <div class="quiz-result-top"><span class="quiz-result-q">${esc(q.prompt)}</span><span class="quiz-result-pts">+${this.points[i]}</span></div>
        <div class="quiz-result-detail">${esc(yours)} · ${esc(q.reveal)}</div>`;
      list.append(row);
    });
    panel.append(list);

    const actions = el('div', 'results-actions');
    if (this.mode === 'daily') {
      const copy = el('button', 'btn btn-accent', 'Copy result');
      copy.addEventListener('click', async () => {
        const line = resultLine(this.dayKey, loadDaily(this.dayKey));
        try { await navigator.clipboard.writeText(line); copy.textContent = 'Copied'; } catch { copy.textContent = line; }
      });
      const rnd = el('button', 'btn btn-tool', 'Random quiz');
      rnd.addEventListener('click', () => this.showHome());
      actions.append(copy, rnd);
    } else {
      const again = el('button', 'btn btn-accent', 'Play again');
      again.addEventListener('click', () => (this.mode === 'pack' ? this.startPack(this.pack.id, this.level, this.pool) : this.start(this.mode)));
      actions.append(again);
      if (this.mode === 'pack' && this.pack.levels) {
        const levels = el('button', 'btn btn-tool', this.pack.pools ? 'Change' : 'Levels');
        levels.addEventListener('click', () => this.showPackLevels(this.pack));
        actions.append(levels);
      }
      if (this.mode !== 'pack') {
        const home = el('button', 'btn btn-tool', 'Quiz home');
        home.addEventListener('click', () => this.showHome());
        actions.append(home);
      }
    }
    const menu = el('button', 'btn btn-tool', 'Menu');
    menu.addEventListener('click', () => this.onFinish());
    actions.append(menu);
    panel.append(actions);
    c.append(panel);
  }
}
