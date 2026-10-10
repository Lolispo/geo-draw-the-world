// TODOS #41. Every preset you have actually played, with your best on it — the thing
// Seterra gets right and this game had nowhere to show. Read-only over the existing
// high-score store: no new write path, so nothing here can cost you a score.

import { getAllHighScores, clearScores } from './high-scores.js';
import { loadDatasets, getDataset, getDatasetList } from './datasets.js';
import { playClick } from './sounds.js';

const DRAW = 'Draw the World';
const RANK = 'Rank the World';
const TOPN = 'Top 10 / Bottom 10';
const FLAGS = 'Flags';
const OLDER = 'Older rounds';
const GROUP_ORDER = [DRAW, RANK, TOPN, FLAGS, OLDER];

const DRAW_LABELS = {
  daily: 'Daily Challenge',
  quick3: 'Quick 3',
  quick: 'Quick 10',
  famous5: 'Famous 5',
  speed: 'Speed Round',
  streak: 'Streak',
  continents: 'Continents',
  world: 'World',
};

const STYLE_LABELS = { cards: 'cards', flags: 'flags only', type: 'typing' };

function titleFromSlug(slug) {
  return slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function datasetName(id) {
  return getDataset(id)?.name || id;
}

// topn2-<datasetId>-<scope>-<hi|lo>-<n>-<style>[-easy|-hard]. Both the dataset id and
// the scope can hold dashes, so it is read from the right, and the dataset is then
// matched against the live registry rather than guessed at.
function resolveTopN(key) {
  const parts = key.slice('topn2-'.length).split('-');
  const diff = (parts[parts.length - 1] === 'easy' || parts[parts.length - 1] === 'hard')
    ? parts.pop() : null;
  const style = parts.pop();
  const n = parts.pop();
  const dir = parts.pop();
  const rest = parts.join('-');
  const ds = getDatasetList().find((d) => rest === d.id || rest.startsWith(`${d.id}-`));
  const scope = ds ? rest.slice(ds.id.length + 1) : '';
  const detail = [
    scope === 'world' || !scope ? 'World' : titleFromSlug(scope),
    STYLE_LABELS[style] || style,
    diff,
  ].filter(Boolean).join(' · ');
  return {
    group: TOPN,
    label: `${dir === 'lo' ? 'Bottom' : 'Top'} ${n} · ${ds ? ds.name : rest}`,
    detail,
  };
}

// A stored key back into something a person can read, or null for a key no current
// mode mints — a renamed or retired round. Those are kept, not hidden: the score was
// earned.
function resolveKey(key) {
  if (DRAW_LABELS[key]) return { group: DRAW, label: DRAW_LABELS[key] };
  if (key.startsWith('countries-')) {
    return { group: DRAW, label: titleFromSlug(key.slice('countries-'.length)), detail: 'region' };
  }
  if (key.startsWith('rank-line-')) {
    return { group: RANK, label: datasetName(key.slice('rank-line-'.length)) };
  }
  if (key.startsWith('flag-quiz-')) {
    return { group: FLAGS, label: 'Flag Color Quiz', detail: `${key.slice('flag-quiz-'.length)} rounds` };
  }
  if (key.startsWith('flag-picker-')) {
    return { group: FLAGS, label: 'Flag Color Picker', detail: `${key.slice('flag-picker-'.length)} rounds` };
  }
  if (key.startsWith('topn2-')) return resolveTopN(key);
  return { group: OLDER, label: key, detail: 'from an earlier version' };
}

// What the number in a record means depends on the mode that wrote it: an average out
// of 100 for a drawing round, a streak length, a count of hits. Say the right thing or
// say nothing — never dress one up as the other.
function formatBest(group, key, rec) {
  if (key === 'streak') return `${rec.score} in a row`;
  if (group === DRAW) return `${rec.score}/100`;
  if (group === RANK) return `run of ${rec.score}`;
  if (group === TOPN) return `${rec.score}/${rec.total}`;
  if (group === FLAGS) return `${rec.score} pts`;
  return String(rec.score);
}

function formatWhen(ts) {
  if (!ts) return '';
  const days = Math.floor((Date.now() - ts) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return new Date(ts).toISOString().slice(0, 10);
}

export class ScoresScreen {
  constructor(containerEl, onFinish) {
    this.container = containerEl;
    this.onFinish = onFinish;
    this._loaded = false;
  }

  async loadData() {
    if (this._loaded) return;
    await loadDatasets();   // metric names for the rank and Top-N keys
    this._loaded = true;
  }

  start() {
    this._render();
  }

  _render() {
    const c = this.container;
    c.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'explore-header';
    const back = document.createElement('button');
    back.className = 'btn btn-tool';
    back.textContent = '← Back';
    back.addEventListener('click', () => this.onFinish(null));
    const title = document.createElement('h2');
    title.textContent = 'Your Scores';
    header.append(back, title);
    c.appendChild(header);

    const all = Object.entries(getAllHighScores());
    if (!all.length) {
      const empty = document.createElement('div');
      empty.className = 'scores-empty';
      empty.innerHTML = '<p>Nothing here yet.</p>' +
        '<p>Finish a round in any mode and its best score is kept here — one line per preset you have played.</p>';
      c.appendChild(empty);
      return;
    }

    const rows = all.map(([key, rec]) => ({ key, rec, ...resolveKey(key) }));
    const list = document.createElement('div');
    list.className = 'scores-list';

    for (const group of GROUP_ORDER) {
      const inGroup = rows.filter((r) => r.group === group)
        .sort((a, b) => (b.rec.date || 0) - (a.rec.date || 0));
      if (!inGroup.length) continue;

      const head = document.createElement('div');
      head.className = 'scores-group';
      head.textContent = `${group} · ${inGroup.length}`;
      list.appendChild(head);

      for (const r of inGroup) {
        const row = document.createElement('div');
        row.className = 'scores-row';
        const name = document.createElement('span');
        name.className = 'scores-name';
        name.textContent = r.label;
        const detail = document.createElement('span');
        detail.className = 'scores-detail';
        detail.textContent = r.detail || '';
        const best = document.createElement('span');
        best.className = 'scores-best';
        best.textContent = formatBest(group, r.key, r.rec);
        const when = document.createElement('span');
        when.className = 'scores-when';
        when.textContent = formatWhen(r.rec.date);
        row.append(name, detail, best, when);
        list.appendChild(row);
      }
    }
    c.appendChild(list);

    const footer = document.createElement('div');
    footer.className = 'scores-footer';
    const count = document.createElement('span');
    count.textContent = `${all.length} ${all.length === 1 ? 'preset' : 'presets'} played`;
    const clear = document.createElement('button');
    clear.className = 'btn btn-tool';
    clear.textContent = '🗑 Clear all scores';
    clear.addEventListener('click', () => {
      playClick();
      // This is the only place the whole store is visible, so it is also the only
      // place it can be emptied — and not by accident.
      if (confirm(`Delete every high score? ${all.length} presets, and it cannot be undone.`)) {
        clearScores();
        this._render();
      }
    });
    footer.append(count, clear);
    c.appendChild(footer);
  }
}
