// TODOS #41. Every preset you have actually played, with your best on it — the thing
// Seterra gets right and this game had nowhere to show. Read-only over the existing
// high-score store: no new write path, so nothing here can cost you a score.

import { getAllHighScores, clearScores } from './high-scores.js';
import { loadDatasets } from './datasets.js';
import { playClick } from './sounds.js';
import { GROUP_ORDER, describeScore, formatScore } from './score-labels.js';

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

    const rows = all.map(([key, rec]) => ({ key, rec, ...describeScore(key) }));
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
        best.textContent = formatScore(r.key, r.rec);
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
