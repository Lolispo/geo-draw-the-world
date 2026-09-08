// Top 10 / Bottom 10 (TODOS #36)
//
// A round states a superlative — "Highest 10 · Total GDP · World" — and you name
// the countries that belong in it, one at a time. Every pick reveals its true rank
// and value immediately; a wrong one costs a life, and you have three. Rank the
// World already covers *ordering*; this asks where the **threshold** sits.
//
// The first version had you tick N countries blind and lock them all in at the end.
// The owner's verdict (2026-09-08): more interesting one at a time, with the data
// shown as you go. Feedback per pick is what makes it a game rather than a survey.
//
// Everything reads the dataset registry, so datasets added later join the mode
// automatically — subject to the two rules below, which are what keep a round fair.

import { playPlace, playSkip, playScoreReveal, playClick, playNav } from './sounds.js';
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
// you name N countries, so a tight boundary costs at most one of them. Measured
// over every dataset × scope × direction: 1% offers 101 combos and rejects 33, and
// one of the casualties is the mode's most obvious round — Top 10 Population,
// World, because Mexico (129.7M) edges Ethiopia (128.7M) by 0.8%. 0.5% offers 110
// and rejects 24, keeping all 10 exact ties out.
const MIN_BOUNDARY_GAP = 0.005;

const SCOPE_WORLD = '__world__';
const START_LIVES = 3;

const INPUT_STYLES = [
  { id: 'cards', label: 'Cards — flag + name' },
  { id: 'flags', label: 'Flags only' },
  { id: 'type', label: 'Type the name' },
];

// What Easy and Hard actually change. Nobody can guess "the wrong options are
// drawn from just below the cut" from the word Hard, so it is said out loud.
const DIFFICULTY_HINT = {
  easy: 'Easy — wrong options are drawn from across the whole ranking.',
  hard: 'Hard — wrong options are the countries just below the cut.',
  type: 'Typing has no options to draw from, so difficulty does not apply.',
};

// Suggestions shown while typing. Enough to be a real aid, few enough that the
// list is not simply the answer sheet.
const MAX_SUGGESTIONS = 8;

// Names are compared with diacritics stripped and case folded, so "Cote d'Ivoire"
// matches "Côte d'Ivoire" and nobody loses a life to a keyboard layout.
function normalizeName(s) {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export class TopNGame {
  constructor(containerEl, onFinish) {
    this.container = containerEl;
    this.onFinish = onFinish;
    this._loaded = false;

    // Picker settings, kept across rounds within a session
    this.datasetId = 'gdp-nominal';
    this.scope = SCOPE_WORLD;
    this.higherFirst = true;
    this.hard = false;
    this.force10 = false;
    this.inputStyle = 'cards';

    this.round = null;
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
    return [
      { id: SCOPE_WORLD, label: 'World' },
      ...getContinents().map((c) => ({
        id: c,
        label: c === 'North America' ? 'N. America' : c === 'South America' ? 'S. America' : c,
      })),
    ];
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
  // tail. The typing style has no pool, so difficulty does not apply there.
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

  // Every combination that is currently playable, for the random roll.
  _validCombos() {
    const out = [];
    for (const d of this._datasets()) {
      for (const s of this._scopes()) {
        for (const higherFirst of [true, false]) {
          if (this._plan(d.id, s.id, higherFirst).n) {
            out.push({ datasetId: d.id, scope: s.id, higherFirst });
          }
        }
      }
    }
    return out;
  }

  start(datasetId = this.datasetId, scope = this.scope, higherFirst = this.higherFirst) {
    const plan = this._plan(datasetId, scope, higherFirst);
    if (!plan.n) { this.showPicker(); return; }

    const ds = getDataset(datasetId);
    const answers = plan.sorted.slice(0, plan.n);

    // Typing recalls from the whole eligible set, so it needs no pool and no
    // distractors — that is exactly what makes it the hard style.
    let options = null;
    if (this.inputStyle !== 'type') {
      const tail = plan.sorted.slice(plan.n);
      const distractors = this._pickDistractors(tail, Math.min(plan.poolSize - plan.n, tail.length));
      options = this._shuffle([...answers, ...distractors]);
    }

    this.datasetId = datasetId;
    this.scope = scope;
    this.higherFirst = higherFirst;

    this.round = {
      dataset: ds,
      n: plan.n,
      scope,
      higherFirst,
      style: this.inputStyle,
      hard: this.hard,
      eligible: plan.sorted.length,
      sorted: plan.sorted,
      rankOf: new Map(plan.sorted.map((e, i) => [e.code, i + 1])),
      answers,
      answerCodes: new Set(answers.map((e) => e.code)),
      options,
      lives: START_LIVES,
      found: new Set(),
      revealed: new Map(),   // code -> { rank, value, correct }
      lastPick: null,        // { name, rank, value, correct } | { note } | null
      over: false,
    };
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

  // `topn2-` because the loop changed: finding 8 of 10 with feedback and three
  // lives is not the feat the old blind pick-N scored, so the two must not share a
  // ladder. Style is in the key for the same reason — naming countries from memory
  // and ticking a 24-card pool are different games. Difficulty only appears where
  // there is a pool for it to shape.
  _scoreKey(r) {
    const dir = r.higherFirst ? 'hi' : 'lo';
    const scope = r.scope === SCOPE_WORLD ? 'world' : r.scope.toLowerCase().replace(/\s+/g, '-');
    const diff = r.style === 'type' ? '' : `-${r.hard ? 'hard' : 'easy'}`;
    return `topn2-${r.dataset.id}-${scope}-${dir}-${r.n}-${r.style}${diff}`;
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
    const h = document.createElement('h2');
    h.textContent = 'Top 10 / Bottom 10';
    head.append(back, h);
    panel.appendChild(head);

    // A metric can stop being playable when the filter changes under it, so the
    // selection is repaired before anything is drawn rather than left dangling.
    if (!this._plan(this.datasetId, this.scope, this.higherFirst).n) {
      const fallback = this._datasets().find((d) => this._plan(d.id, this.scope, this.higherFirst).n);
      if (fallback) this.datasetId = fallback.id;
    }

    const form = document.createElement('div');
    form.className = 'topn-form';

    form.appendChild(this._selectRow('Metric', this._datasets().map((d) => {
      const plan = this._plan(d.id, this.scope, this.higherFirst);
      return { id: d.id, label: plan.n ? d.name : `${d.name} — ${plan.reason}`, disabled: !plan.n };
    }), this.datasetId, (v) => { this.datasetId = v; this.showPicker(); }));

    form.appendChild(this._selectRow('Filter', this._scopes(), this.scope,
      (v) => { this.scope = v; this.showPicker(); }));

    const pairRow = document.createElement('div');
    pairRow.className = 'topn-form-row topn-form-pair';
    const endLabel = document.createElement('label');
    endLabel.className = 'topn-form-label';
    endLabel.textContent = 'End';
    pairRow.appendChild(endLabel);
    pairRow.appendChild(this._select([
      { id: 'hi', label: 'Top' }, { id: 'lo', label: 'Bottom' },
    ], this.higherFirst ? 'hi' : 'lo', (v) => { this.higherFirst = v === 'hi'; this.showPicker(); }));
    // Difficulty is the distractor rule, and the typing style has no distractors.
    const diffSelect = this._select([
      { id: 'easy', label: 'Easy' }, { id: 'hard', label: 'Hard' },
    ], this.hard ? 'hard' : 'easy', (v) => { this.hard = v === 'hard'; this.showPicker(); },
    this.inputStyle === 'type');
    diffSelect.title = DIFFICULTY_HINT[this.inputStyle === 'type' ? 'type' : (this.hard ? 'hard' : 'easy')];
    pairRow.appendChild(diffSelect);
    form.appendChild(pairRow);

    // The tooltip only exists for a mouse, and what difficulty means here is not
    // guessable — spell it out in a line under the form.
    const hint = document.createElement('div');
    hint.className = 'topn-hint';
    hint.textContent = diffSelect.title;
    form.appendChild(hint);

    form.appendChild(this._selectRow('Input', INPUT_STYLES, this.inputStyle,
      (v) => { this.inputStyle = v; this.showPicker(); }));

    panel.appendChild(form);

    const plan = this._plan(this.datasetId, this.scope, this.higherFirst);
    const ds = getDataset(this.datasetId);
    const summary = document.createElement('div');
    summary.className = 'topn-summary';
    if (plan.n) {
      const hs = getHighScore(this._scoreKey({
        dataset: ds, scope: this.scope, higherFirst: this.higherFirst,
        n: plan.n, style: this.inputStyle, hard: this.hard,
      }));
      const word = this._directionWord(ds.format, this.higherFirst);
      const shape = this.inputStyle === 'type'
        ? 'name them from memory'
        : `${plan.poolSize} to choose from`;
      summary.innerHTML =
        `<div class="topn-summary-main">${word} ${plan.n} · ${shape}</div>` +
        `<div class="topn-summary-sub">${plan.sorted.length} eligible · ${START_LIVES} lives` +
        (hs ? ` · best ${hs.score}/${plan.n}` : '') + '</div>';
    } else {
      summary.innerHTML =
        '<div class="topn-summary-main">Nothing playable here</div>' +
        `<div class="topn-summary-sub">${plan.reason}</div>`;
    }
    panel.appendChild(summary);

    const actions = document.createElement('div');
    actions.className = 'topn-actions';
    const startBtn = document.createElement('button');
    startBtn.className = 'btn btn-accent topn-start';
    startBtn.textContent = '▶ Start round';
    startBtn.disabled = !plan.n;
    startBtn.addEventListener('click', () => this.start());
    const rollBtn = document.createElement('button');
    rollBtn.className = 'btn btn-tool topn-roll';
    rollBtn.textContent = '🎲 Random roll';
    rollBtn.addEventListener('click', () => this.startRandom());
    actions.append(startBtn, rollBtn);
    panel.appendChild(actions);

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
    force.title = 'Always play 10, even where the filter is too small for it to be a fair question';
    force.addEventListener('click', () => { this.force10 = !this.force10; this.showPicker(); });
    opts.append(terr, force);
    panel.appendChild(opts);

    c.appendChild(panel);
  }

  _select(options, value, onPick, disabled = false) {
    const sel = document.createElement('select');
    sel.className = 'topn-select';
    sel.disabled = disabled;
    for (const opt of options) {
      const o = document.createElement('option');
      o.value = String(opt.id);
      o.textContent = opt.label;
      if (opt.disabled) o.disabled = true;
      if (String(opt.id) === String(value)) o.selected = true;
      sel.appendChild(o);
    }
    sel.addEventListener('change', () => { playClick(); onPick(sel.value); });
    return sel;
  }

  _selectRow(label, options, value, onPick) {
    const row = document.createElement('div');
    row.className = 'topn-form-row';
    const lab = document.createElement('label');
    lab.className = 'topn-form-label';
    lab.textContent = label;
    row.append(lab, this._select(options, value, onPick));
    return row;
  }

  // ---- round --------------------------------------------------------------

  _renderRound() {
    const r = this.round;
    const c = this.container;
    c.innerHTML = '';

    const panel = document.createElement('div');
    panel.className = 'topn-round';

    panel.appendChild(this._renderRoundHead());
    panel.appendChild(this._renderFeedback());

    // The ladder sits above whatever you pick with, in every style — it is the
    // running record of the round, and the pool below it is only the input.
    if (r.style === 'type') {
      panel.appendChild(this._renderTypeInput());
      panel.appendChild(this._renderLadder());
    } else {
      panel.appendChild(this._renderLadder());
      panel.appendChild(this._renderGrid());
    }

    c.appendChild(panel);
    if (r.style === 'type') this._typeInput?.focus();
  }

  _renderRoundHead() {
    const r = this.round;
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

    const found = document.createElement('span');
    found.className = 'topn-found';
    found.textContent = `${r.found.size}/${r.n}`;

    const lives = document.createElement('span');
    lives.className = 'topn-lives';
    lives.innerHTML = Array.from({ length: START_LIVES }, (_, i) =>
      `<span class="heart ${i < r.lives ? '' : 'lost'}">❤</span>`).join('');

    head.append(back, title, scope, found, lives);
    return head;
  }

  // The running commentary: what the last pick was and where it actually ranked.
  // This is the whole reason the loop is one at a time — being wrong about Nigeria
  // by two places should feel different from being wrong about the Netherlands by
  // sixty.
  _renderFeedback() {
    const r = this.round;
    const strip = document.createElement('div');
    strip.className = 'topn-feedback';
    const p = r.lastPick;

    if (!p) {
      strip.classList.add('is-idle');
      strip.textContent = r.style === 'type'
        ? `Name a country you think belongs. ${r.eligible} are in range.`
        : 'Tap one you think belongs. Each miss costs a life.';
      return strip;
    }
    if (p.note) {
      strip.classList.add('is-note');
      strip.textContent = p.note;
      return strip;
    }
    strip.classList.add(p.correct ? 'is-hit' : 'is-miss');
    strip.innerHTML =
      `<span class="topn-feedback-mark">${p.correct ? '✓' : '✗'}</span>` +
      `<span class="topn-feedback-name">${p.name}</span>` +
      `<span class="topn-feedback-rank">#${p.rank}</span>` +
      `<span class="topn-feedback-value">${formatValue(r.dataset.format, p.value)}</span>`;
    return strip;
  }

  _renderGrid() {
    const r = this.round;
    const grid = document.createElement('div');
    grid.className = 'topn-grid' + (r.style === 'flags' ? ' is-flags' : '');

    for (const e of r.options) {
      const seen = r.revealed.get(e.code);
      const card = document.createElement('button');
      card.className = 'topn-card' + (seen ? (seen.correct ? ' is-hit' : ' is-miss') : '');
      card.dataset.code = e.code;
      card.disabled = !!seen;

      const flag = `<img class="topn-flag" src="${flagUrl(e.code, 'w40')}" alt="" onerror="this.style.visibility='hidden'">`;
      if (r.style === 'flags' && !seen) {
        // Flags-only hides the name until you commit to the flag; revealing it on
        // the pick is what makes a wrong guess teach you something.
        card.innerHTML = flag;
        card.title = 'Tap to name it';
      } else {
        card.innerHTML = flag +
          `<span class="topn-card-name">${e.name}</span>` +
          (seen ? `<span class="topn-card-rank">#${seen.rank}</span>` : '');
      }
      card.addEventListener('click', () => this._pick(e.code));
      grid.appendChild(card);
    }
    return grid;
  }

  _renderTypeInput() {
    const r = this.round;
    const wrap = document.createElement('div');
    wrap.className = 'topn-type';

    const input = document.createElement('input');
    input.className = 'topn-type-input';
    input.type = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.placeholder = 'Type a country…';

    const list = document.createElement('div');
    list.className = 'topn-suggest';

    const submit = (name) => {
      input.value = '';
      list.innerHTML = '';
      this._submitName(name);
    };

    const refresh = () => {
      const q = normalizeName(input.value);
      list.innerHTML = '';
      if (!q) return;
      const matches = r.sorted
        .filter((e) => !r.revealed.has(e.code) && normalizeName(e.name).includes(q))
        .slice(0, MAX_SUGGESTIONS);
      for (const m of matches) {
        const b = document.createElement('button');
        b.className = 'btn topn-suggest-item';
        b.innerHTML =
          `<img class="topn-flag" src="${flagUrl(m.code, 'w40')}" alt="" onerror="this.style.visibility='hidden'">` +
          `<span>${m.name}</span>`;
        b.addEventListener('click', () => submit(m.name));
        list.appendChild(b);
      }
    };

    input.addEventListener('input', refresh);
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      // Enter takes the top suggestion, so a partial name resolving to one country
      // does not have to be typed out in full.
      const first = list.querySelector('.topn-suggest-item span');
      submit(first ? first.textContent : input.value);
    });

    this._typeInput = input;
    wrap.append(input, list);
    return wrap;
  }

  // ---- the ladder ---------------------------------------------------------
  //
  // Slots 1..N, always all of them. A filled slot names the country and its value;
  // an empty one is just its number, so which ranks are still missing is readable
  // at a glance rather than counted. The same builder renders the in-round board
  // and the results screen — the results screen is simply the ladder with every
  // slot revealed, so the end of a round looks like the finished version of the
  // thing you were filling in.
  _slotsHtml({ reveal, clickable }) {
    const r = this.round;
    return r.answers.map((e, i) => {
      const rank = i + 1;
      const found = r.found.has(e.code);
      if (!found && !reveal) {
        return `<div class="topn-row is-empty"><span class="topn-result-rank">${rank}</span>` +
               '<span class="topn-blank"></span></div>';
      }
      return this._rowHtml({
        cls: found ? 'is-hit' : 'is-miss',
        mark: found ? '✓' : '✗',
        rank, entry: e, clickable, delay: reveal ? Math.min(i, 20) * 0.03 : 0,
      });
    }).join('');
  }

  // Wrong picks, under the ladder, at the rank they actually hold. Being sixty
  // places out should look different from being one place out.
  _missesHtml({ clickable }) {
    const r = this.round;
    const wrong = [...r.revealed.entries()]
      .filter(([, v]) => !v.correct)
      .map(([code, v]) => ({ code, ...v, entry: r.sorted[v.rank - 1] }))
      .sort((a, b) => a.rank - b.rank);
    if (!wrong.length) return '';
    return '<div class="topn-ladder-sub">Missed</div>' + wrong.map((w) => this._rowHtml({
      cls: 'is-wrong', mark: '✗', rank: w.rank, entry: w.entry, clickable,
    })).join('');
  }

  _rowHtml({ cls, mark, rank, entry, clickable, delay = 0 }) {
    const r = this.round;
    // Only the results screen links out. Mid-round the country panel would show
    // every metric for that country, including the one being played.
    const link = clickable ? ` is-clickable" data-code="${entry.code}" title="View ${entry.name}` : '';
    return `<div class="topn-row topn-result-row ${cls}${link}" style="animation-delay:${delay}s">` +
      `<span class="topn-result-mark">${mark}</span>` +
      `<span class="topn-result-rank">${rank}</span>` +
      `<img class="topn-flag" src="${flagUrl(entry.code, 'w40')}" alt="" onerror="this.style.visibility='hidden'">` +
      `<span class="topn-result-name">${entry.name}</span>` +
      `<span class="topn-result-value">${formatValue(r.dataset.format, entry.value)}</span>` +
      '</div>';
  }

  _renderLadder() {
    const el = document.createElement('div');
    el.className = 'topn-ladder';
    el.innerHTML = this._slotsHtml({ reveal: false, clickable: false }) +
                   this._missesHtml({ clickable: false });
    return el;
  }

  // A typed name that is not a country in this round is a typo or an out-of-scope
  // guess, not a wrong answer — it costs nothing. Only a real, in-range country
  // that misses the cut takes a life.
  _submitName(raw) {
    const r = this.round;
    if (!r || r.over) return;
    const q = normalizeName(raw);
    if (!q) return;

    const match = r.sorted.find((e) => normalizeName(e.name) === q)
      || r.sorted.find((e) => normalizeName(e.name).startsWith(q));

    if (!match) {
      r.lastPick = { note: `"${raw.trim()}" is not one of the ${r.eligible} countries in range — no life lost.` };
      playSkip();
      this._renderRound();
      return;
    }
    if (r.revealed.has(match.code)) {
      r.lastPick = { note: `${match.name} is already on the board — no life lost.` };
      playSkip();
      this._renderRound();
      return;
    }
    this._pick(match.code);
  }

  _pick(code) {
    const r = this.round;
    if (!r || r.over || r.revealed.has(code)) return;

    const rank = r.rankOf.get(code);
    const entry = r.sorted[rank - 1];
    const correct = r.answerCodes.has(code);

    r.revealed.set(code, { rank, value: entry.value, correct });
    r.lastPick = { name: entry.name, rank, value: entry.value, correct };

    if (correct) {
      r.found.add(code);
      playPlace();
    } else {
      r.lives--;
      playSkip();
    }

    if (r.found.size >= r.n || r.lives <= 0) {
      r.over = true;
      this._showResults();
      return;
    }
    this._renderRound();
  }

  // ---- results ------------------------------------------------------------

  _showResults() {
    const r = this.round;
    playScoreReveal();

    const hits = r.found.size;
    const cleared = hits >= r.n;
    const key = this._scoreKey(r);
    const isNew = saveScore(key, hits, hits, r.n);
    const prev = getHighScore(key);

    const pct = hits / r.n;
    let grade = 'Rough one';
    if (cleared) grade = r.lives === START_LIVES ? 'Flawless!' : 'Cleared it!';
    else if (pct >= 0.7) grade = 'So close';
    else if (pct >= 0.4) grade = 'Halfway there';

    // The same ladder the round was played on, with the slots you never filled
    // now revealed — so the results screen is the finished board, not a new one.
    const answerRows = this._slotsHtml({ reveal: true, clickable: true });
    const wrongRows = this._missesHtml({ clickable: true });

    const styleLabel = INPUT_STYLES.find((s) => s.id === r.style).label.split('—')[0].trim();
    const endNote = cleared
      ? `Found them all with ${r.lives} ${r.lives === 1 ? 'life' : 'lives'} left`
      : 'Out of lives';

    const c = this.container;
    c.innerHTML = '';
    const panel = document.createElement('div');
    panel.className = 'topn-results';
    panel.innerHTML = `
      <h2>Results <span class="results-mode-label">${this._roundTitle(r)} · ${this._scopeLabel(r.scope)}</span></h2>
      <div class="score-summary">
        <div class="big-score">${hits}<span class="topn-outof">/${r.n}</span></div>
        <div class="score-grade">${grade}</div>
        <div class="score-counted">${endNote} · ${styleLabel}${r.style === 'type' ? '' : ` · ${r.hard ? 'Hard' : 'Easy'}`}</div>
        ${isNew
          ? '<div class="high-score-note" style="display:block">New best for this round!</div>'
          : (prev ? `<div class="high-score-note" style="display:block">Best: ${prev.score}/${r.n}</div>` : '')}
      </div>
      <div class="topn-results-subhead">The real ${this._directionWord(r.dataset.format, r.higherFirst).toLowerCase()} ${r.n}</div>
      <div class="topn-ladder is-final">${answerRows}${wrongRows}</div>
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
