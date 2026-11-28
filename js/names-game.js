// Name Them All: type every country (or capital) that starts with one letter.

import { loadEntities, loadAttributes, loadAliases, getAliases } from './datasets.js';
import { getIncludeTerritories } from './settings.js';
import { territoriesToggle } from './territories-toggle.js';
import { getHighScore, saveScore } from './high-scores.js';
import { playClick, playPlace, playSkip, playScoreReveal } from './sounds.js';
import {
  LETTERS, MIN_PLAYABLE, buildCountrySet, buildCapitalSet, letterCounts, board,
  slotPattern, matchTyped, formatElapsed, entryContinents,
} from './names-sets.js';

// A set only has to say what it is called and how to build its entries; a new one is a
// data file and a line here.
export const NAME_SETS = [
  {
    id: 'countries', label: 'Countries', noun: 'countries',
    load: async () => { await Promise.all([loadEntities(), loadAliases()]); },
    build: ({ entities, territories }) => {
      const aliases = Object.fromEntries(Object.keys(entities).map((c) => [c, getAliases(c)]));
      return buildCountrySet(entities, aliases, { territories });
    },
  },
  {
    id: 'capitals', label: 'Capitals', noun: 'capitals',
    load: async () => { await Promise.all([loadEntities(), loadAttributes()]); },
    build: ({ entities, attributes, territories }) => buildCapitalSet(entities, attributes, { territories }),
  },
];

const setById = (id) => NAME_SETS.find((s) => s.id === id) || null;
export const scoreKey = (setId, letter) => `names-${setId}-${letter.toLowerCase()}`;

// Long enough to finish "Nigeria" after "Niger", short enough that a player who meant
// Niger is not left wondering whether it counted.
const AMBIGUOUS_WAIT_MS = 900;

export class NamesGame {
  constructor(containerEl, onFinish, onRoute) {
    this.container = containerEl;
    this.onFinish = onFinish;
    this.onRoute = onRoute || (() => {});
    this.setId = 'countries';
    this._entities = null;
    this._attributes = null;
    this._timer = null;
    this._wait = null;
  }

  async loadData() {
    await Promise.all(NAME_SETS.map((s) => s.load()));
    this._entities = await loadEntities();
    this._attributes = await loadAttributes();
  }

  _entries(setId) {
    const set = setById(setId);
    return set.build({
      entities: this._entities, attributes: this._attributes, territories: getIncludeTerritories(),
    });
  }

  _stop() {
    clearInterval(this._timer);
    clearTimeout(this._wait);
    this._timer = null;
    this._wait = null;
  }

  _header(title, backLabel, onBack) {
    const head = document.createElement('div');
    head.className = 'names-head';
    const back = document.createElement('button');
    back.className = 'btn btn-tool';
    back.textContent = backLabel;
    back.addEventListener('click', () => { playClick(); onBack(); });
    const h = document.createElement('h2');
    h.textContent = title;
    head.append(back, h);
    return head;
  }

  showPicker(setId = this.setId) {
    this._stop();
    this.setId = setById(setId) ? setId : 'countries';
    this.onRoute(['names', this.setId]);
    const entries = this._entries(this.setId);
    const counts = letterCounts(entries);
    const playable = LETTERS.filter((l) => counts[l] >= MIN_PLAYABLE);

    const c = this.container;
    c.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'names-picker';
    wrap.appendChild(this._header('Name Them All', '← Back', () => this.onFinish(null)));

    const intro = document.createElement('p');
    intro.className = 'names-intro';
    intro.textContent = 'Pick a letter and type every one that starts with it. No clock to beat — your time breaks ties.';
    wrap.appendChild(intro);

    const tabs = document.createElement('div');
    tabs.className = 'names-tabs';
    tabs.setAttribute('role', 'tablist');
    for (const s of NAME_SETS) {
      const b = document.createElement('button');
      b.className = 'btn names-tab';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(s.id === this.setId));
      b.textContent = s.label;
      b.addEventListener('click', () => { if (s.id !== this.setId) { playClick(); this.showPicker(s.id); } });
      tabs.appendChild(b);
    }
    tabs.appendChild(territoriesToggle({ onChange: () => this.showPicker(this.setId) }));
    wrap.appendChild(tabs);

    const grid = document.createElement('div');
    grid.className = 'names-grid';
    for (const l of LETTERS) {
      const b = document.createElement('button');
      b.className = 'btn names-letter';
      b.dataset.letter = l;
      const ok = counts[l] >= MIN_PLAYABLE;
      b.disabled = !ok;
      b.setAttribute('aria-label', `${l}: ${counts[l]} ${setById(this.setId).noun}${ok ? '' : ', too few to play'}`);
      const big = document.createElement('span');
      big.className = 'names-letter-l';
      big.textContent = l;
      const n = document.createElement('span');
      n.className = 'names-letter-n';
      n.textContent = String(counts[l]);
      b.append(big, n);
      const hs = getHighScore(scoreKey(this.setId, l));
      if (ok && hs) {
        b.classList.toggle('is-complete', hs.score >= counts[l]);
        b.title = `Best: ${hs.score}/${hs.total}${hs.ms != null ? ` in ${formatElapsed(hs.ms)}` : ''}`;
      }
      if (ok) b.addEventListener('click', () => { playClick(); this.start(this.setId, l); });
      grid.appendChild(b);
    }
    wrap.appendChild(grid);

    const roll = document.createElement('button');
    roll.className = 'btn btn-accent names-roll';
    roll.textContent = '🎲 Random letter';
    roll.disabled = !playable.length;
    roll.addEventListener('click', () => {
      playClick();
      this.start(this.setId, playable[Math.floor(Math.random() * playable.length)]);
    });
    wrap.appendChild(roll);

    const note = document.createElement('p');
    note.className = 'names-note';
    note.textContent = `Letters with fewer than ${MIN_PLAYABLE} are greyed out. The number is how many there are.`;
    wrap.appendChild(note);
    c.appendChild(wrap);
  }

  // Returns false when the letter cannot be played, so the caller can fall back to the
  // picker rather than an empty board.
  start(setId, letter) {
    const set = setById(setId);
    const L = String(letter || '').toUpperCase();
    if (!set || !LETTERS.includes(L)) { this.showPicker(set ? setId : 'countries'); return false; }
    const entries = board(this._entries(setId), L);
    if (entries.length < MIN_PLAYABLE) { this.showPicker(setId); return false; }

    this._stop();
    this.setId = setId;
    this.onRoute(['names', setId, L.toLowerCase()]);
    this.round = {
      set, letter: L, entries, found: new Set(), startedAt: Date.now(), endedAt: null, gaveUp: false, hinted: false,
    };
    this._renderRound();
    this._timer = setInterval(() => this._tick(), 500);
    return true;
  }

  _renderRound() {
    const r = this.round;
    const c = this.container;
    c.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'names-round';

    wrap.appendChild(this._header(`${r.set.label} · ${r.letter}`, '← Letters', () => this.showPicker(r.set.id)));

    const bar = document.createElement('div');
    bar.className = 'names-bar';
    const stats = document.createElement('div');
    stats.className = 'names-stats';
    this._countEl = document.createElement('span');
    this._countEl.className = 'names-count';
    this._clockEl = document.createElement('span');
    this._clockEl.className = 'names-clock';
    // Off by default; turning it on costs the round its high score, so it asks first.
    const hint = document.createElement('button');
    hint.className = 'btn btn-tool names-hint';
    hint.setAttribute('aria-pressed', 'false');
    hint.textContent = '🌍 Continents';
    hint.addEventListener('click', () => this._toggleContinents());
    this._hintBtn = hint;
    stats.append(this._countEl, hint, this._clockEl);

    const input = document.createElement('input');
    input.className = 'names-input';
    input.type = 'text';
    input.autocomplete = 'off';
    input.autocapitalize = 'words';
    input.spellcheck = false;
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('aria-label', `Type ${r.set.noun} starting with ${r.letter}`);
    input.placeholder = `Type ${r.set.noun} starting with ${r.letter}…`;
    input.addEventListener('input', () => this._onType(false));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this._onType(true); }
    });
    this._input = input;

    const giveUp = document.createElement('button');
    giveUp.className = 'btn btn-tool names-giveup';
    giveUp.textContent = 'Give up';
    giveUp.addEventListener('click', () => this._finish(true));
    this._giveUpBtn = giveUp;

    const row = document.createElement('div');
    row.className = 'names-input-row';
    row.append(input, giveUp);

    this._msgEl = document.createElement('p');
    this._msgEl.className = 'names-msg';
    this._msgEl.setAttribute('aria-live', 'polite');
    this._msgEl.textContent = 'Each one fills in as soon as it is spelled right. No Enter needed.';

    // The actions take the input row's place in the same grid cell, so nothing below
    // moves when the round ends.
    const actions = document.createElement('div');
    actions.className = 'names-actions';
    const again = document.createElement('button');
    again.className = 'btn btn-accent';
    again.textContent = 'Play again';
    again.addEventListener('click', () => { playClick(); this.start(r.set.id, r.letter); });
    const other = document.createElement('button');
    other.className = 'btn btn-tool';
    other.textContent = 'Another letter';
    other.addEventListener('click', () => { playClick(); this.showPicker(r.set.id); });
    actions.append(again, other);

    const controls = document.createElement('div');
    controls.className = 'names-controls';
    controls.append(row, actions);
    this._controls = controls;

    bar.append(stats, this._msgEl, controls);
    wrap.appendChild(bar);

    const list = document.createElement('ol');
    list.className = 'names-board';
    list.style.setProperty('--names-len', String(Math.max(...r.entries.map((e) => e.name.length))));
    this._slots = new Map();
    for (const e of r.entries) {
      const li = document.createElement('li');
      li.className = 'names-entry';
      li.setAttribute('aria-label', `${e.name.length} characters, starts with ${r.letter}`);
      let word = document.createElement('span');
      word.className = 'names-word';
      li.appendChild(word);
      for (const cell of slotPattern(e.name)) {
        if (cell.kind === 'gap') {
          word = document.createElement('span');
          word.className = 'names-word';
          li.appendChild(word);
          continue;
        }
        const s = document.createElement('span');
        s.className = `names-cell is-${cell.kind}`;
        s.dataset.ch = cell.ch;
        if (cell.kind !== 'blank') s.textContent = cell.ch;
        word.appendChild(s);
      }
      const cont = document.createElement('span');
      cont.className = 'names-cont';
      cont.textContent = entryContinents(e, this._entities);
      li.appendChild(cont);
      list.appendChild(li);
      this._slots.set(e.name, li);
    }
    this._board = list;
    wrap.appendChild(list);
    c.appendChild(wrap);
    this._paintStats();
    input.focus();
  }

  _toggleContinents() {
    const r = this.round;
    const on = !this._board.classList.contains('show-continents');
    if (on && !r.hinted && !r.endedAt) {
      if (!window.confirm('Show each one\'s continent? This round won\'t count towards your best score.')) return;
      r.hinted = true;
    }
    playClick();
    this._board.classList.toggle('show-continents', on);
    this._hintBtn.setAttribute('aria-pressed', String(on));
    if (!r.endedAt) this._input.focus();
  }

  _paintStats() {
    const r = this.round;
    this._countEl.textContent = `${r.found.size} / ${r.entries.length}`;
    this._clockEl.textContent = formatElapsed((r.endedAt || Date.now()) - r.startedAt);
  }

  _tick() {
    if (!this.round || this.round.endedAt || !this.container.isConnected) { this._stop(); return; }
    this._paintStats();
  }

  _onType(force) {
    const r = this.round;
    if (!r || r.endedAt) return;
    clearTimeout(this._wait);
    const { match, ambiguous } = matchTyped(r.entries, r.found, this._input.value);
    if (!match) return;
    if (ambiguous && !force) {
      this._wait = setTimeout(() => this._onType(true), AMBIGUOUS_WAIT_MS);
      return;
    }
    this._fill(match, 'found');
    r.found.add(match.name);
    this._input.value = '';
    playPlace();
    this._paintStats();
    if (r.found.size === r.entries.length) this._finish(false);
  }

  _fill(entry, cls) {
    const li = this._slots.get(entry.name);
    if (!li) return;
    li.classList.add(`is-${cls}`);
    for (const s of li.querySelectorAll('.names-cell.is-blank')) s.textContent = s.dataset.ch;
    if (cls === 'found') {
      li.classList.add('just-found');
      setTimeout(() => li.classList.remove('just-found'), 60);
    }
  }

  _finish(gaveUp) {
    const r = this.round;
    if (!r || r.endedAt) return;
    r.endedAt = Date.now();
    r.gaveUp = gaveUp;
    this._stop();
    this._paintStats();
    for (const e of r.entries) if (!r.found.has(e.name)) this._fill(e, 'missed');

    const ms = r.endedAt - r.startedAt;
    const total = r.entries.length;
    const key = scoreKey(r.set.id, r.letter);
    const prev = getHighScore(key);
    const best = r.hinted ? false : saveScore(key, r.found.size, r.found.size, total, { ms });
    if (gaveUp) playSkip(); else playScoreReveal();

    this._input.disabled = true;
    this._input.value = '';
    this._input.blur();
    const bestText = r.hinted
      ? 'With continents shown, so not counted.'
      : best
        ? (prev ? 'New best!' : 'First score on this letter.')
        : `Best ${prev.score}/${prev.total}${prev.ms != null ? ` in ${formatElapsed(prev.ms)}` : ''}.`;
    this._msgEl.textContent = r.found.size === total
      ? `All ${total}! ${bestText}`
      : `${total - r.found.size} missed, shown in orange. ${bestText}`;
    this._msgEl.classList.add('is-result');
    this._controls.classList.add('is-done');
  }
}
