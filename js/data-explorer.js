// Data Explorer — browse the collected datasets as ranked country lists,
// filterable by continent and sortable. Read-only learning view.

import { loadDatasets, loadEntities, getDatasetList, getDataset, getContinents, getEntries, getEntitiesList, getMetricMeta, formatValue } from './datasets.js';
import { openCountryPanel } from './country-panel.js';
import { getIncludeTerritories, setIncludeTerritories } from './settings.js';

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
    this.view = 'rank';      // 'rank' | 'coverage'
  }

  async loadData() {
    if (this._loaded) return;
    await loadDatasets();
    await loadEntities();
    this._loaded = true;
  }

  start(datasetId = 'gdp-nominal') {
    this.datasetId = getDataset(datasetId) ? datasetId : getDatasetList()[0].id;
    this.continent = null;
    this.higherFirst = getDataset(this.datasetId).higherFirst;
    this.view = 'rank';
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
    if (this.view === 'coverage') this._renderCoverage();
    else this._renderList();
  }

  _renderHeader() {
    const header = document.createElement('div');
    header.className = 'explore-header';

    const backBtn = document.createElement('button');
    backBtn.className = 'btn btn-tool';
    backBtn.textContent = '← Back';
    backBtn.addEventListener('click', () => this.onFinish(null));

    const title = document.createElement('h2');
    title.textContent = 'Data Explorer';

    header.append(backBtn, title);
    return header;
  }

  _renderControls() {
    const bar = document.createElement('div');
    bar.className = 'explore-controls';
    const rankView = this.view === 'rank';

    // Dataset (rank view only)
    if (rankView) {
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
        this._render();
      });
      bar.appendChild(dsSelect);
    }

    // Continent (both views)
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
      if (this.view === 'coverage') this._renderCoverage();
      else this._renderList();
    });
    bar.appendChild(contSelect);

    // Sort toggle (rank view only)
    if (rankView) {
      const sortBtn = document.createElement('button');
      sortBtn.className = 'btn btn-tool';
      this._sortBtn = sortBtn;
      this._updateSortLabel();
      sortBtn.addEventListener('click', () => {
        this.higherFirst = !this.higherFirst;
        this._updateSortLabel();
        this._renderList();
      });
      bar.appendChild(sortBtn);
    }

    // Territories toggle (both views) — shared with the draw menu (TODOS #20)
    const terrBtn = document.createElement('button');
    const terrOn = getIncludeTerritories();
    terrBtn.className = 'btn btn-tool' + (terrOn ? ' active' : '');
    terrBtn.textContent = terrOn ? '🏝️ Territories: On' : '🏝️ Territories: Off';
    terrBtn.title = 'Include small dependent/autonomous territories';
    terrBtn.addEventListener('click', () => {
      setIncludeTerritories(!getIncludeTerritories());
      this._render();
    });
    bar.appendChild(terrBtn);

    // View toggle (both)
    const viewBtn = document.createElement('button');
    viewBtn.className = 'btn btn-tool explore-view-toggle';
    viewBtn.textContent = rankView ? '📋 Coverage' : '↩ Rankings';
    viewBtn.title = rankView ? 'Show data coverage across all entities' : 'Back to rankings';
    viewBtn.addEventListener('click', () => {
      this.view = rankView ? 'coverage' : 'rank';
      this._render();
    });
    bar.appendChild(viewBtn);

    // Rank this → (rank view only)
    if (rankView) {
      const playBtn = document.createElement('button');
      playBtn.className = 'btn btn-accent explore-play';
      playBtn.textContent = 'Rank this →';
      playBtn.title = 'Play the line game with this dataset';
      playBtn.addEventListener('click', () => this.onPlayDataset(this.datasetId));
      bar.appendChild(playBtn);
    }

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
    let entries = getEntries(this.datasetId, { continent: this.continent, higherFirst: this.higherFirst });
    if (!getIncludeTerritories()) {
      const optional = new Set(getEntitiesList().filter((e) => e.optional).map((e) => e.code));
      entries = entries.filter((e) => !optional.has(e.code));
    }

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
      row.classList.add('is-clickable');
      row.title = `View ${e.name}`;
      row.addEventListener('click', () => openCountryPanel(e.code));
      list.appendChild(row);
    }
  }

  _renderCoverage() {
    const list = this._listEl;
    if (!list) return;
    list.innerHTML = '';

    const metrics = getMetricMeta();
    const shortLabel = {
      'gdp-nominal': 'GDP', 'population': 'Pop', 'gdp-per-capita': 'GDP/cap',
      'land-area': 'Area', 'life-expectancy': 'Life', 'exports': 'Exp', 'urbanization': 'Urb',
    };
    let ents = getEntitiesList();
    if (!getIncludeTerritories()) ents = ents.filter((e) => !e.optional);
    if (this.continent) ents = ents.filter((e) => e.continent === this.continent);

    // "Complete" = the hard, playable data (shape + flag image + every metric).
    // Colors / Capital / Religion are shown as extra columns but don't gate completeness.
    const isComplete = (e) => e.hasGeometry && e.hasFlagImage && metrics.every((m) => e.metrics[m.id]);
    const complete = ents.filter(isComplete).length;
    const aggregates = ents.filter((e) => e.type === 'aggregate').length;

    const blurb = document.createElement('div');
    blurb.className = 'explore-blurb';
    blurb.textContent = `Coverage${this.continent ? ` · ${this.continent}` : ''} · ${ents.length} entities · ${complete} complete · ${ents.length - complete} incomplete · ${aggregates} aggregate`;
    list.appendChild(blurb);

    const legend = document.createElement('div');
    legend.className = 'explore-blurb cov-legend';
    legend.textContent = 'Flag = image (flagcdn) · Colors = flag colors for the color quizzes · Cap = capital · Rel = religion';
    list.appendChild(legend);

    const table = document.createElement('table');
    table.className = 'coverage-table';

    const headCols = ['', 'Entity', 'Type', 'Geo', 'Flag', 'Colors', 'Cap', 'Rel', ...metrics.map((m) => shortLabel[m.id] || m.name)];
    const thead = document.createElement('thead');
    const htr = document.createElement('tr');
    for (const h of headCols) { const th = document.createElement('th'); th.textContent = h; htr.appendChild(th); }
    thead.appendChild(htr);
    table.appendChild(thead);

    const cell = (ok) => {
      const td = document.createElement('td');
      td.className = 'cov-cell ' + (ok ? 'ok' : 'no');
      td.textContent = ok ? '✓' : '✗';
      return td;
    };

    const tbody = document.createElement('tbody');
    for (const e of ents) {
      const tr = document.createElement('tr');
      if (!isComplete(e)) tr.classList.add('incomplete');
      if (e.type === 'aggregate') tr.classList.add('is-aggregate');
      tr.classList.add('is-clickable');
      tr.title = `View ${e.name}`;
      tr.addEventListener('click', () => openCountryPanel(e.code));

      const flagTd = document.createElement('td');
      const img = document.createElement('img');
      img.className = 'rank-flag';
      img.src = `${FLAG_CDN}${e.code}.png`;
      img.alt = '';
      img.loading = 'lazy';
      img.addEventListener('error', () => { img.style.visibility = 'hidden'; });
      flagTd.appendChild(img);

      const nameTd = document.createElement('td');
      nameTd.className = 'cov-name';
      nameTd.textContent = e.name;

      const typeTd = document.createElement('td');
      typeTd.className = 'cov-type';
      typeTd.textContent = e.type;

      tr.append(flagTd, nameTd, typeTd, cell(e.hasGeometry), cell(e.hasFlagImage), cell(e.hasFlag), cell(e.hasCapital), cell(e.hasReligion), ...metrics.map((m) => cell(e.metrics[m.id])));
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    list.appendChild(table);
  }
}
