// Data Explorer — browse the collected datasets as ranked country lists,
// filterable by continent and sortable. Read-only learning view.

import { playClick } from './sounds.js';
import { loadDatasets, getDatasetList, getDataset, getContinents, getEntries, formatValue } from './datasets.js';

const FLAG_CDN = 'https://flagcdn.com/w40/';

export class DataExplorer {
  constructor(containerEl, onFinish, onPlayDataset) {
    this.container = containerEl;
    this.onFinish = onFinish;             // back to menu
    this.onPlayDataset = onPlayDataset;   // start the line game for a dataset id
    this._loaded = false;

    this.datasetId = 'gdp-nominal';
    this.continent = null;   // null = All
    this.higherFirst = true;
  }

  async loadData() {
    if (this._loaded) return;
    await loadDatasets();
    this._loaded = true;
  }

  start(datasetId = 'gdp-nominal') {
    this.datasetId = getDataset(datasetId) ? datasetId : getDatasetList()[0].id;
    this.continent = null;
    this.higherFirst = getDataset(this.datasetId).higherFirst;
    this._render();
  }

  _render() {
    const c = this.container;
    c.innerHTML = '';
    c.appendChild(this._renderHeader());
    c.appendChild(this._renderControls());
    this._listEl = document.createElement('div');
    this._listEl.className = 'explore-list';
    c.appendChild(this._listEl);
    this._renderList();
  }

  _renderHeader() {
    const header = document.createElement('div');
    header.className = 'explore-header';

    const title = document.createElement('h2');
    title.textContent = 'Data Explorer';

    const menuBtn = document.createElement('button');
    menuBtn.className = 'btn btn-tool';
    menuBtn.textContent = 'Menu';
    menuBtn.addEventListener('click', () => this.onFinish(null));

    header.append(title, menuBtn);
    return header;
  }

  _renderControls() {
    const bar = document.createElement('div');
    bar.className = 'explore-controls';

    // Dataset
    const dsSelect = document.createElement('select');
    dsSelect.className = 'explore-select';
    for (const d of getDatasetList()) {
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = d.name;
      if (d.id === this.datasetId) opt.selected = true;
      dsSelect.appendChild(opt);
    }
    dsSelect.addEventListener('change', () => {
      this.datasetId = dsSelect.value;
      this.higherFirst = getDataset(this.datasetId).higherFirst; // reset to natural order
      playClick();
      this._render();
    });

    // Continent
    const contSelect = document.createElement('select');
    contSelect.className = 'explore-select';
    const allOpt = document.createElement('option');
    allOpt.value = '';
    allOpt.textContent = 'All continents';
    contSelect.appendChild(allOpt);
    for (const cont of getContinents()) {
      const opt = document.createElement('option');
      opt.value = cont;
      opt.textContent = cont;
      if (cont === this.continent) opt.selected = true;
      contSelect.appendChild(opt);
    }
    contSelect.addEventListener('change', () => {
      this.continent = contSelect.value || null;
      playClick();
      this._renderList();
    });

    // Sort toggle
    const sortBtn = document.createElement('button');
    sortBtn.className = 'btn btn-tool';
    this._sortBtn = sortBtn;
    this._updateSortLabel();
    sortBtn.addEventListener('click', () => {
      this.higherFirst = !this.higherFirst;
      this._updateSortLabel();
      playClick();
      this._renderList();
    });

    // Rank this → (jump into the line game for the current dataset)
    const playBtn = document.createElement('button');
    playBtn.className = 'btn btn-accent explore-play';
    playBtn.textContent = 'Rank this →';
    playBtn.title = 'Play the line game with this dataset';
    playBtn.addEventListener('click', () => {
      playClick();
      this.onPlayDataset(this.datasetId);
    });

    bar.append(dsSelect, contSelect, sortBtn, playBtn);
    return bar;
  }

  _updateSortLabel() {
    if (this._sortBtn) this._sortBtn.textContent = this.higherFirst ? '↓ High–Low' : '↑ Low–High';
  }

  _renderList() {
    const list = this._listEl;
    if (!list) return;
    list.innerHTML = '';

    const ds = getDataset(this.datasetId);
    const entries = getEntries(this.datasetId, { continent: this.continent, higherFirst: this.higherFirst });

    const blurb = document.createElement('div');
    blurb.className = 'explore-blurb';
    blurb.textContent = `${ds.name} — ${ds.blurb}${this.continent ? ` · ${this.continent}` : ''} · ${entries.length} countries`;
    list.appendChild(blurb);

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const row = document.createElement('div');
      row.className = 'explore-row';

      const rank = document.createElement('span');
      rank.className = 'explore-rank';
      rank.textContent = i + 1;

      const img = document.createElement('img');
      img.className = 'rank-flag';
      img.src = `${FLAG_CDN}${e.code}.png`;
      img.alt = '';
      img.loading = 'lazy';
      img.addEventListener('error', () => { img.style.visibility = 'hidden'; });

      const name = document.createElement('span');
      name.className = 'explore-name';
      name.textContent = e.name;

      const val = document.createElement('span');
      val.className = 'explore-value';
      val.textContent = formatValue(ds.format, e.value);

      row.append(rank, img, name, val);
      list.appendChild(row);
    }
  }
}
