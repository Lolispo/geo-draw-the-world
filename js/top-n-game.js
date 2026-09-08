// Top 10 / Bottom 10 (TODOS #36)
//
// A round states a superlative — "Highest 10 · Total GDP · World" — and shows a
// shuffled pool of candidates. Pick the ones you think belong, lock in, score hits.
// Rank the World already covers *ordering*; this asks where the **threshold** sits,
// which is a different and arguably more natural kind of knowledge.
//
// Everything reads the dataset registry, so datasets added later join the mode
// automatically — subject to the two rules below, which are what keep a round fair.

import { playPlace, playScoreReveal, playClick, playNav } from './sounds.js';
import { getHighScore, saveScore } from './high-scores.js';
import {
  loadDatasets, loadEntities, inCountryPool, getDataset, getDatasetList,
  getEntries, getContinents, formatValue
} from './datasets.js';
import { openCountryPanel } from './country-panel.js';
import { flagUrl } from './flags.js';
import { getIncludeTerritories, setIncludeTerritories } from './settings.js';

// Rule 1 — N adapts to how many countries the filter actually has.
//
// Oceania is 14 sovereign countries. "Pick the top 10 of 14" scores ~7 by guessing,
// so a fixed N=10 is broken for the small continents. Measured eligible counts
// (2026-09-08, territories off) run 195-197 for World, 54/47/45/23/12/14 for
// Africa/Asia/Europe/N.Am/S.Am/Oceania, so this table puts Oceania and South
// America on Top 5 and lets thin combos (exports × South America, 10 eligible)
// simply never appear.
const N_RULES = [
  { minEligible: 22, n: 10, poolSize: 24 },
  { minEligible: 12, n: 5, poolSize: 12 },
];

// Rule 2 — boundary fairness. If rank N and rank N+1 are within this of each other
// the cut is a coin flip rather than a question, so the combination is not offered.
// Life expectancy bunches at both ends, and independence years tie outright
// (Armenia and Azerbaijan are both 1991).
//
// 0.5%, where TODOS #36 proposed ~1%. That figure comes from the intuition of a
// 1-versus-1 comparison, where a tight boundary decides the whole question; here
// you pick N of a pool, so a tight boundary costs at most one point out of N.
// Measured over every dataset × scope × direction: 1% offers 101 combos and
// rejects 33, and one of the casualties is the mode's most obvious round — Top 10
// Population, World — because Mexico (129.7M) edges Ethiopia (128.7M) by 0.8%.
// 0.5% offers 110 and rejects 24, keeping all 10 exact ties out.
const MIN_BOUNDARY_GAP = 0.005;

const SCOPE_WORLD = '__world__';

export class TopNGame {
  constructor(containerEl, onFinish) {
    this.container = containerEl;
    this.onFinish = onFinish;
    this._loaded = false;

    // Picker settings, kept across rounds within a session
    this.scope = SCOPE_WORLD;
    this.higherFirst = true;
    this.hard = false;
    this.force10 = false;

    // Active round
    this.round = null;      // { dataset, n, poolSize, answers, options, scope, higherFirst }
    this.selected = new Set();
  }

  async loadData() {
    if (this._loaded) return;
    await loadDatasets();
    await loadEntities(); // the country pool gate needs the registry
    this._loaded = true;
  }

  // ---- round construction -------------------------------------------------

  // Datasets that make a sane ranking round. Reuses Rank the World's own
  // `rankable` verdict rather than a second list, so a dataset that is degenerate
  // there (181 of 213 countries generate 0% nuclear) is degenerate here too.
  _datasets() {
    return getDatasetList().filter((d) => d.rankable !== false);
  }

  _scopes() {
    return [{ id: SCOPE_WORLD, label: 'World' },
            ...getContinents().map((c) => ({ id: c, label: c === 'North America' ? 'N. America' : c === 'South America' ? 'S. America' : c }))];
  }

  _eligible(datasetId, scope, higherFirst) {
    const continent = scope === SCOPE_WORLD ? null : scope;
    return getEntries(datasetId, { continent, higherFirst }).filter((e) => inCountryPool(e.code));
  }

  // Is the cut between rank n and n+1 a real question? Years are integers on a
  // timeline, where a 1% relative gap would be ~20 years and reject nearly
  // everything, so they only have to differ at all.
  _boundaryFair(sorted, n, format) {
    const a = sorted[n - 1]?.value;
    const b = sorted[n]?.value;
    if (a == null || b == null) return false;
    if (format === 'year') return Math.abs(a - b) >= 1;
    const scale = Math.max(Math.abs(a), Math.abs(b));
    if (scale === 0) return false;
    return Math.abs(a - b) / scale >= MIN_BOUNDARY_GAP;
  }

  // { n, poolSize, sorted } for a playable combination, or { reason } for why not.
  _plan(datasetId, scope, higherFirst) {
    const ds = getDataset(datasetId);
    if (!ds) return { reason: 'no data' };
    const sorted = this._eligible(datasetId, scope, higherFirst);

    let rule = N_RULES.find((r) => sorted.length >= r.minEligible);
    if (!rule && this.force10) {
      // The override plays N=10 against whatever exists, degenerate odds accepted.
      // It still needs at least one wrong answer to be a question at all.
      if (sorted.length < 11) return { reason: `only ${sorted.length} countries` };
      rule = { n: 10, poolSize: Math.min(24, sorted.length) };
    }
    if (!rule) return { reason: `only ${sorted.length} countries` };

    const n = this.force10 ? 10 : rule.n;
    if (sorted.length <= n) return { reason: `only ${sorted.length} countries` };
    if (!this._boundaryFair(sorted, n, ds.format)) return { reason: 'too close at the cut' };

    // Under the override the pool is everything eligible (capped at 24), so the
    // header reads an honest "10 of 14" instead of hiding how near-total the pick is.
    const poolSize = this.force10
      ? Math.min(24, sorted.length)
      : Math.min(rule.poolSize, sorted.length);
    return { n, poolSize, sorted };
  }

  // Distractors are the difficulty knob. Hard draws them from directly below the
  // cut, so every wrong option is a near-miss; Easy spreads them over the whole
  // tail. Exposed as a toggle rather than buried as a constant.
  _pickDistractors(tail, need) {
    if (this.hard) return tail.slice(0, need);
    const out = [];
    const step = tail.length / need;   // need <= tail.length, so step >= 1
    for (let i = 0; i < need; i++) {
      const lo = Math.floor(i * step);
      const hi = Math.max(lo + 1, Math.floor((i + 1) * step));
      out.push(tail[lo + Math.floor(Math.random() * (hi - lo))]);
    }
    return out;
  }

  _shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Every combination that is currently playable, for the random roll and for
  // greying out the picker.
  _validCombos() {
    const out = [];
    for (const d of this._datasets()) {
      for (const s of this._scopes()) {
        for (const higherFirst of [true, false]) {
          const plan = this._plan(d.id, s.id, higherFirst);
          if (plan.n) out.push({ datasetId: d.id, scope: s.id, higherFirst });
        }
      }
    }
    return out;
  }

  start(datasetId, scope = this.scope, higherFirst = this.higherFirst) {
    const plan = this._plan(datasetId, scope, higherFirst);
    if (!plan.n) { this.showPicker(); return; }

    const ds = getDataset(datasetId);
    const answers = plan.sorted.slice(0, plan.n);
    const tail = plan.sorted.slice(plan.n);
    const distractors = this._pickDistractors(tail, Math.min(plan.poolSize - plan.n, tail.length));

    this.scope = scope;
    this.higherFirst = higherFirst;
    this.round = {
      dataset: ds,
      n: plan.n,
      scope,
      higherFirst,
      eligible: plan.sorted.length,
      sorted: plan.sorted,
      answers,
      answerCodes: new Set(answers.map((e) => e.code)),
      options: this._shuffle([...answers, ...distractors]),
    };
    this.selected = new Set();
    this._renderRound();
  }

  startRandom() {
    const combos = this._validCombos();
    if (!combos.length) { this.showPicker(); return; }
    const pick = combos[Math.floor(Math.random() * combos.length)];
    playNav();
    this.start(pick.datasetId, pick.scope, pick.higherFirst);
  }

  // ---- labels -------------------------------------------------------------

  // "Top"/"Bottom" reads wrong for a year — the top independence year is the most
  // recent one, which nobody would call the top. Name the direction after what it
  // actually selects.
  _directionWord(format, higherFirst) {
    if (format === 'year') return higherFirst ? 'Most recent' : 'Earliest';
    return higherFirst ? 'Highest' : 'Lowest';
  }

  _scopeLabel(scope) {
    return this._scopes().find((s) => s.id === scope)?.label || scope;
  }

  _roundTitle(r) {
    return `${this._directionWord(r.dataset.format, r.higherFirst)} ${r.n} · ${r.dataset.name}`;
  }

  _scoreKey(r) {
    const dir = r.higherFirst ? 'hi' : 'lo';
    const scope = r.scope === SCOPE_WORLD ? 'world' : r.scope.toLowerCase().replace(/\s+/g, '-');
    // Scope and direction are in the key on purpose: "9 of 10" for Highest GDP
    // World and for Lowest life expectancy in Oceania are not the same feat, and
    // one ladder for both would make the best score meaningless.
    return `top-n-${r.dataset.id}-${scope}-${dir}-${r.n}`;
  }

  // ---- picker -------------------------------------------------------------

  showPicker() {
    this.round = null;
    const c = this.container;
    c.innerHTML = '';

    const panel = document.createElement('div');
    panel.className = 'topn-picker';

    const head = document.createElement('div');
    head.className = 'topn-picker-head';
    const back = document.createElement('button');
    back.className = 'btn btn-tool';
    back.textContent = '← Back';
    back.addEventListener('click', () => this.onFinish(null));
    head.appendChild(back);
    panel.appendChild(head);

    const h = document.createElement('h2');
    h.textContent = 'Top 10 / Bottom 10';
    const sub = document.createElement('p');
    sub.className = 'topn-picker-sub';
    sub.textContent = 'Pick the countries that belong in the top (or bottom) of a ranking. Score is hits.';
    panel.append(h, sub);

    const roll = document.createElement('button');
    roll.className = 'btn btn-accent topn-roll';
    roll.textContent = '🎲 Random round';
    roll.addEventListener('click', () => this.startRandom());
    panel.appendChild(roll);

    panel.appendChild(this._segmented('Direction', [
      { id: true, label: 'Top' }, { id: false, label: 'Bottom' },
    ], this.higherFirst, (v) => { this.higherFirst = v; this.showPicker(); }));

    panel.appendChild(this._segmented('Difficulty', [
      { id: false, label: 'Easy' }, { id: true, label: 'Hard' },
    ], this.hard, (v) => { this.hard = v; this.showPicker(); },
    this.hard ? 'Wrong options are the countries just below the cut'
              : 'Wrong options are spread across the whole ranking'));

    panel.appendChild(this._segmented('Filter', this._scopes(), this.scope,
      (v) => { this.scope = v; this.showPicker(); }));

    const opts = document.createElement('div');
    opts.className = 'topn-options';

    const terrOn = getIncludeTerritories();
    const terr = document.createElement('button');
    terr.className = 'btn btn-tool' + (terrOn ? ' active' : '');
    terr.textContent = terrOn ? '🏝️ Territories: On' : '🏝️ Territories: Off';
    terr.title = 'Include small dependent/autonomous territories in the pool';
    terr.addEventListener('click', () => { setIncludeTerritories(!getIncludeTerritories()); this.showPicker(); });

    const force = document.createElement('button');
    force.className = 'btn btn-tool' + (this.force10 ? ' active' : '');
    force.textContent = this.force10 ? '🔟 Force 10: On' : '🔟 Force 10: Off';
    force.title = 'Always pick 10, even where the filter is too small for it to be a fair question';
    force.addEventListener('click', () => { this.force10 = !this.force10; this.showPicker(); });

    opts.append(terr, force);
    panel.appendChild(opts);

    const list = document.createElement('div');
    list.className = 'topn-picker-list';
    for (const d of this._datasets()) {
      const plan = this._plan(d.id, this.scope, this.higherFirst);
      const btn = document.createElement('button');
      btn.className = 'btn topn-picker-item';

      if (!plan.n) {
        btn.classList.add('is-unavailable');
        btn.disabled = true;
        btn.innerHTML =
          `<span class="topn-picker-name">${d.name}</span>` +
          `<span class="topn-picker-why">Not offered here — ${plan.reason}</span>`;
      } else {
        const hs = getHighScore(this._scoreKey({ dataset: d, scope: this.scope, higherFirst: this.higherFirst, n: plan.n }));
        const word = this._directionWord(d.format, this.higherFirst);
        btn.innerHTML =
          `<span class="topn-picker-name">${d.name}</span>` +
          `<span class="topn-picker-blurb">${word} ${plan.n} of ${plan.poolSize} shown · ${plan.sorted.length} eligible</span>` +
          (hs ? `<span class="hs-badge">Best: ${hs.score}/${plan.n}</span>` : '');
        btn.addEventListener('click', () => this.start(d.id));
      }
      list.appendChild(btn);
    }
    panel.appendChild(list);

    c.appendChild(panel);
  }

  _segmented(label, options, value, onPick, note = null) {
    const wrap = document.createElement('div');
    wrap.className = 'topn-seg-row';

    const lab = document.createElement('span');
    lab.className = 'topn-seg-label';
    lab.textContent = label;
    wrap.appendChild(lab);

    const group = document.createElement('div');
    group.className = 'topn-seg';
    for (const opt of options) {
      const b = document.createElement('button');
      b.className = 'btn topn-seg-btn' + (opt.id === value ? ' active' : '');
      b.textContent = opt.label;
      b.addEventListener('click', () => { playClick(); onPick(opt.id); });
      group.appendChild(b);
    }
    wrap.appendChild(group);

    if (note) {
      const n = document.createElement('span');
      n.className = 'topn-seg-note';
      n.textContent = note;
      wrap.appendChild(n);
    }
    return wrap;
  }

  // ---- round --------------------------------------------------------------

  _renderRound() {
    const r = this.round;
    const c = this.container;
    c.innerHTML = '';

    const panel = document.createElement('div');
    panel.className = 'topn-round';

    const head = document.createElement('div');
    head.className = 'topn-round-head';
    const back = document.createElement('button');
    back.className = 'btn btn-tool';
    back.textContent = '← Back';
    back.addEventListener('click', () => this.showPicker());
    const title = document.createElement('h2');
    title.textContent = this._roundTitle(r);
    const scope = document.createElement('span');
    scope.className = 'topn-scope-chip';
    scope.textContent = this._scopeLabel(r.scope);
    head.append(back, title, scope);
    panel.appendChild(head);

    const sub = document.createElement('p');
    sub.className = 'topn-round-sub';
    sub.textContent = `${r.dataset.blurb} — pick ${r.n} of the ${r.options.length} below.`;
    panel.appendChild(sub);

    const grid = document.createElement('div');
    grid.className = 'topn-grid';
    for (const e of r.options) {
      const card = document.createElement('button');
      card.className = 'btn topn-card';
      card.dataset.code = e.code;
      card.innerHTML =
        `<img class="topn-flag" src="${flagUrl(e.code, 'w40')}" alt="" onerror="this.style.visibility='hidden'">` +
        `<span class="topn-card-name">${e.name}</span>` +
        `<span class="topn-check">✓</span>`;
      card.addEventListener('click', () => this._toggle(e.code, card));
      grid.appendChild(card);
    }
    panel.appendChild(grid);

    const bar = document.createElement('div');
    bar.className = 'topn-bar';
    this._countEl = document.createElement('span');
    this._countEl.className = 'topn-count';
    this._lockBtn = document.createElement('button');
    this._lockBtn.className = 'btn btn-accent';
    this._lockBtn.textContent = 'Lock in';
    this._lockBtn.addEventListener('click', () => this._lockIn());
    bar.append(this._countEl, this._lockBtn);
    panel.appendChild(bar);

    c.appendChild(panel);
    this._syncBar();
  }

  _toggle(code, card) {
    if (this.selected.has(code)) {
      this.selected.delete(code);
      card.classList.remove('is-picked');
    } else {
      // Hard-capped at N so the score is always hits out of N, never "picked
      // everything and got them all".
      if (this.selected.size >= this.round.n) return;
      this.selected.add(code);
      card.classList.add('is-picked');
    }
    playClick();
    this._syncBar();
  }

  _syncBar() {
    const r = this.round;
    const left = r.n - this.selected.size;
    this._countEl.textContent = left === 0
      ? `${r.n} of ${r.n} picked`
      : `${this.selected.size} of ${r.n} picked — ${left} to go`;
    this._lockBtn.disabled = left !== 0;
  }

  _lockIn() {
    const r = this.round;
    if (this.selected.size !== r.n) return;
    playPlace();

    const hits = [...this.selected].filter((c) => r.answerCodes.has(c)).length;
    this._showResults(hits);
  }

  // ---- results ------------------------------------------------------------

  _showResults(hits) {
    const r = this.round;
    playScoreReveal();

    const key = this._scoreKey(r);
    const isNew = saveScore(key, hits, hits, r.n);
    const prev = getHighScore(key);

    const pct = hits / r.n;
    let grade = 'Rough one';
    if (pct === 1) grade = 'Perfect!';
    else if (pct >= 0.8) grade = 'Sharp instincts!';
    else if (pct >= 0.6) grade = 'Solid';
    else if (pct >= 0.4) grade = 'Halfway there';

    // Rank lookup for the wrong picks: a country at rank 11 deserves to be seen,
    // and "you missed by one place" is the whole lesson of the mode.
    const rankOf = new Map(r.sorted.map((e, i) => [e.code, i + 1]));
    const wrong = [...this.selected].filter((c) => !r.answerCodes.has(c))
      .map((c) => r.sorted[rankOf.get(c) - 1])
      .sort((a, b) => rankOf.get(a.code) - rankOf.get(b.code));

    const answerRows = r.answers.map((e, i) => {
      const got = this.selected.has(e.code);
      return `
        <div class="topn-result-row ${got ? 'is-hit' : 'is-miss'} is-clickable" data-code="${e.code}"
             title="View ${e.name}" style="animation-delay:${Math.min(i, 20) * 0.03}s">
          <span class="topn-result-mark">${got ? '✓' : '✗'}</span>
          <span class="topn-result-rank">${i + 1}</span>
          <img class="topn-flag" src="${flagUrl(e.code, 'w40')}" alt="" onerror="this.style.visibility='hidden'">
          <span class="topn-result-name">${e.name}</span>
          <span class="topn-result-value">${formatValue(r.dataset.format, e.value)}</span>
        </div>`;
    }).join('');

    const wrongRows = wrong.map((e) => `
      <div class="topn-result-row is-wrong is-clickable" data-code="${e.code}" title="View ${e.name}">
        <span class="topn-result-mark">·</span>
        <span class="topn-result-rank">${rankOf.get(e.code)}</span>
        <img class="topn-flag" src="${flagUrl(e.code, 'w40')}" alt="" onerror="this.style.visibility='hidden'">
        <span class="topn-result-name">${e.name}</span>
        <span class="topn-result-value">${formatValue(r.dataset.format, e.value)}</span>
      </div>`).join('');

    const c = this.container;
    c.innerHTML = '';
    const panel = document.createElement('div');
    panel.className = 'topn-results';
    panel.innerHTML = `
      <h2>Results <span class="results-mode-label">${this._roundTitle(r)} · ${this._scopeLabel(r.scope)}</span></h2>
      <div class="score-summary">
        <div class="big-score">${hits}<span class="topn-outof">/${r.n}</span></div>
        <div class="score-grade">${grade}</div>
        <div class="score-counted">${this.hard ? 'Hard' : 'Easy'} · ${r.eligible} countries eligible</div>
        ${isNew
          ? '<div class="high-score-note" style="display:block">New best for this round!</div>'
          : (prev ? `<div class="high-score-note" style="display:block">Best: ${prev.score}/${r.n}</div>` : '')}
      </div>
      <div class="topn-results-subhead">The real ${this._directionWord(r.dataset.format, r.higherFirst).toLowerCase()} ${r.n}</div>
      <div class="topn-results-list">${answerRows}</div>
      ${wrong.length ? `
        <div class="topn-results-subhead">You also picked</div>
        <div class="topn-results-list">${wrongRows}</div>` : ''}
      <div class="results-actions">
        <button id="topn-again" class="btn btn-accent">Play Again</button>
        <button id="topn-change" class="btn btn-tool">Change round</button>
        <button id="topn-menu" class="btn btn-tool">Menu</button>
      </div>
    `;
    c.appendChild(panel);

    panel.addEventListener('click', (ev) => {
      const row = ev.target.closest('.topn-result-row[data-code]');
      if (row) openCountryPanel(row.dataset.code);
    });
    panel.querySelector('#topn-again').addEventListener('click', () => this.start(r.dataset.id, r.scope, r.higherFirst));
    panel.querySelector('#topn-change').addEventListener('click', () => this.showPicker());
    panel.querySelector('#topn-menu').addEventListener('click', () => this.onFinish(null));
  }
}
