// Data Explorer — browse the collected datasets as ranked country lists,
// filterable by continent and sortable. Read-only learning view.

import { loadDatasets, loadEntities, loadAliases, getDatasetList, getDataset, getContinents, getEntries, getEntitiesList, inCountryPool, getMetricMeta, formatValue, getAliases, getRank } from './datasets.js';
import { openCountryPanel } from './country-panel.js';
import { drawSilhouette } from './silhouette.js';
import { flagUrl } from './flags.js';
import { getIncludeTerritories, setIncludeTerritories } from './settings.js';


// Big enough to tell Chile from Italy, small enough that 250 of them scroll.
const THUMB_SIZE = 48;

export class DataExplorer {
  constructor(containerEl, onFinish, onPlayDataset) {
    this.container = containerEl;
    this.onFinish = onFinish;             // back to menu
    this.onPlayDataset = onPlayDataset;   // start the line game for a dataset id
    this._loaded = false;

    this.datasetId = 'gdp-nominal';
    this.continent = null;   // null = All
    this.higherFirst = true;
    this.view = 'rank';      // 'rank' | 'coverage' | 'shapes'
    this.shapeSort = 'name'; // 'name' | 'area' | 'continent'
    // Off by default: the extra line is for auditing the alias table (TODOS #40),
    // not for reading a ranking.
    this.showAliases = false;
  }

  async loadData() {
    if (this._loaded) return;
    await loadDatasets();
    await loadEntities();
    await loadAliases();
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
    // Thumbnails draw as they scroll into view; a re-render replaces every canvas the
    // old observer was watching, so it has to go with them.
    this._shapeObserver?.disconnect();
    this._shapeObserver = null;
    c.innerHTML = '';
    c.appendChild(this._renderHeader());
    c.appendChild(this._renderControls());
    this._listEl = document.createElement('div');
    this._listEl.className = 'explore-list' + (this.view === 'coverage' ? ' is-coverage' : '');
    c.appendChild(this._listEl);
    this._renderBody();
  }

  _renderBody() {
    if (this.view === 'coverage') this._renderCoverage();
    else if (this.view === 'shapes') this._renderShapes();
    else this._renderList();
  }

  _select(options, value, onPick) {
    const sel = document.createElement('select');
    sel.className = 'explore-select';
    for (const opt of options) {
      const o = document.createElement('option');
      o.value = opt.id;
      o.textContent = opt.label;
      if (opt.id === value) o.selected = true;
      sel.appendChild(o);
    }
    sel.addEventListener('change', () => onPick(sel.value));
    return sel;
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
      this._renderBody();
    });
    bar.appendChild(contSelect);

    // Sort (shapes view only) — the rank view has its own High→Low toggle.
    if (this.view === 'shapes') {
      const sort = this._select([
        { id: 'name', label: 'A → Z' },
        { id: 'area', label: 'Largest first' },
        { id: 'continent', label: 'By continent' },
      ], this.shapeSort, (v) => { this.shapeSort = v; this._renderShapes(); });
      bar.appendChild(sort);
    }

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

    // Aliases column (rank view only) — the only place the whole table is visible,
    // which is the point: a country with no alias shows a blank you can spot.
    if (rankView) {
      const aliasBtn = document.createElement('button');
      aliasBtn.className = 'btn btn-tool' + (this.showAliases ? ' active' : '');
      aliasBtn.textContent = this.showAliases ? '🔤 Aliases: On' : '🔤 Aliases: Off';
      aliasBtn.title = 'Show the other names each country is accepted under when typing';
      aliasBtn.addEventListener('click', () => {
        this.showAliases = !this.showAliases;
        this._render();
      });
      bar.appendChild(aliasBtn);
    }

    // View switch. A two-way toggle button stopped working the moment there was a
    // third view, so it is a segmented control.
    const views = document.createElement('div');
    views.className = 'explore-views';
    for (const v of [
      { id: 'rank', label: '📊 Rankings', title: 'Countries ranked by a dataset' },
      { id: 'shapes', label: '✏️ Shapes', title: 'Every country outline, side by side' },
      { id: 'coverage', label: '📋 Coverage', title: 'Show data coverage across all entities' },
    ]) {
      const b = document.createElement('button');
      b.className = 'btn btn-tool' + (this.view === v.id ? ' active' : '');
      b.textContent = v.label;
      b.title = v.title;
      b.setAttribute('aria-pressed', String(this.view === v.id));
      b.addEventListener('click', () => {
        if (this.view === v.id) return;
        this.view = v.id;
        this._render();
      });
      views.appendChild(b);
    }
    bar.appendChild(views);

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
    const entries = getEntries(this.datasetId, { continent: this.continent, higherFirst: this.higherFirst })
      .filter((e) => inCountryPool(e.code));

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
      img.src = flagUrl(e.code, 'w40');
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

      if (this.showAliases) {
        const aliases = getAliases(e.code);
        const also = document.createElement('span');
        also.className = 'explore-aliases' + (aliases.length ? '' : ' is-empty');
        also.textContent = aliases.length ? `also: ${aliases.join(', ')}` : 'no aliases';
        row.appendChild(also);
      }
      row.classList.add('is-clickable');
      row.title = `View ${e.name}`;
      row.addEventListener('click', () => openCountryPanel(e.code));
      list.appendChild(row);
    }
  }

  // Every outline in one table (TODOS #51). Each thumbnail is normalized to its own
  // bounding box, so Russia and Monaco are both legible — which means this teaches
  // shape, not size, and the area column is there to say what the picture cannot.
  _renderShapes() {
    const list = this._listEl;
    if (!list) return;
    this._shapeObserver?.disconnect();
    list.innerHTML = '';

    const area = getDataset('land-area');
    const rows = getEntitiesList()
      .filter((e) => inCountryPool(e) && (!this.continent || e.continent === this.continent));
    if (this.shapeSort === 'area') {
      rows.sort((a, b) => (area?.values[b.code] ?? -1) - (area?.values[a.code] ?? -1));
    } else if (this.shapeSort === 'continent') {
      rows.sort((a, b) => (a.continent || '').localeCompare(b.continent || '')
        || a.name.localeCompare(b.name));
    } // getEntitiesList() is already name-sorted

    const missing = rows.filter((e) => e.hasGeometry === false).length;
    const blurb = document.createElement('div');
    blurb.className = 'explore-blurb';
    blurb.textContent = `${rows.length} outlines${this.continent ? ` · ${this.continent}` : ''}`
      + (missing ? ` · ${missing} with no geometry` : '')
      + ' · each drawn to fit its own box, so this is shape, not size';
    list.appendChild(blurb);

    // 250 canvases is too many to draw up front, so each one waits until it is nearly
    // on screen. The observer is torn down by _render().
    this._shapeObserver = new IntersectionObserver((entries, obs) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        obs.unobserve(entry.target);
        drawSilhouette(entry.target, entry.target.dataset.code, entry.target._entity,
          { size: THUMB_SIZE, pad: 3 });
      }
    }, { root: list, rootMargin: '300px' });

    for (const e of rows) {
      const row = document.createElement('div');
      row.className = 'explore-row shape-row is-clickable';

      const canvas = document.createElement('canvas');
      canvas.className = 'shape-thumb';
      canvas.dataset.code = e.code;
      canvas._entity = e;

      const flag = document.createElement('img');
      flag.className = 'rank-flag';
      flag.src = flagUrl(e.code, 'w40');
      flag.alt = '';
      flag.loading = 'lazy';
      flag.addEventListener('error', () => { flag.style.visibility = 'hidden'; });

      const name = document.createElement('span');
      name.className = 'explore-name';
      name.textContent = e.name;

      const cont = document.createElement('span');
      cont.className = 'shape-continent';
      cont.textContent = e.continent || '';

      const value = document.createElement('span');
      value.className = 'explore-value';
      const km2 = area?.values[e.code];
      const rank = km2 == null ? null : getRank('land-area', e.code);
      value.textContent = km2 == null ? '—'
        : `${formatValue(area.format, km2)}${rank ? ` · #${rank.rank}` : ''}`;

      row.append(canvas, flag, name, cont, value);
      row.title = `View ${e.name}`;
      row.addEventListener('click', () => openCountryPanel(e.code));
      list.appendChild(row);
      this._shapeObserver.observe(canvas);
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
      img.src = flagUrl(e.code, 'w40');
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
