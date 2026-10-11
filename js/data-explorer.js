// Data Explorer — browse the collected datasets as ranked country lists,
// filterable by continent and sortable. Read-only learning view.

import { loadDatasets, loadEntities, loadAliases, loadFlagColors, getFlagColors, getDatasetList, getDataset, getContinents, getEntries, getEntitiesList, inCountryPool, getMetricMeta, formatValue, getAliases, getRank, getEntity } from './datasets.js';
import { readFlagColors, missingFromImage } from './flag-colors.js';
import { openCountryPanel } from './country-panel.js';
import { drawSilhouette } from './silhouette.js';
import { ExplorerMap } from './explorer-map.js';
import { loadWorldOutlines } from './geo-data.js';
import { flagUrl } from './flags.js';
import { getExploreTerritories, setExploreTerritories } from './settings.js';


// Big enough to tell Chile from Italy, small enough that 250 of them scroll. The grid
// gets more, because there the outline is the only thing on screen (TODOS #61).
const THUMB_SIZE = 48;
const GRID_THUMB_SIZE = 96;

// Stable shuffle: order by a hash of the code and a per-shuffle seed, so a re-render
// (a toggle, a resize) cannot reorder the grid under a scroll.
function seededRank(code, seed) {
  let h = 2166136261;
  const str = `${code}:${seed}`;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

// Picking a view is picking one of several, so it is a dropdown like every other
// choice in the bar (owner, 2026-10-11). The grid is a view in its own right rather
// than a toggle inside Shapes: both decide presentation, so both belong in one place.
const VIEWS = [
  { id: 'rank', label: '📊 Rankings' },
  { id: 'map', label: '🗺️ Map' },
  { id: 'shapes', label: '🧩 Shapes' },
  { id: 'coverage', label: '📋 Coverage' },
];

// One order list for every view that has rows. The table view used to own "by
// continent" and "random" for no reason anyone could name (owner, 2026-10-11), and
// High/Low simply follow whichever metric is selected.
const ORDERS = [
  { id: 'hi', label: 'High → Low' },
  { id: 'lo', label: 'Low → High' },
  { id: 'name', label: 'A → Z' },
  { id: 'continent', label: 'By continent' },
  { id: 'random', label: 'Random' },
];

export class DataExplorer {
  constructor(containerEl, onFinish, onPlayDataset, onState = null) {
    this.container = containerEl;
    this.onFinish = onFinish;             // back to menu
    this.onPlayDataset = onPlayDataset;   // start the line game for a dataset id
    this.onState = onState;               // keep the URL on what is being looked at
    this._loaded = false;
    // Checking a flag's colours means decoding its image, so rows are checked as they
    // come into view rather than all 251 up front.
    this._colorChecks = new IntersectionObserver((entries, obs) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        obs.unobserve(en.target);
        en.target._checkColors?.();
      }
    }, { rootMargin: '150px' });

    this.datasetId = 'gdp-nominal';
    this.continent = null;   // null = All
    this.higherFirst = true;
    this.view = 'rank';      // one of VIEWS
    this.order = 'hi';       // one of ORDERS, shared by the rows views
    this.showOutlines = false;  // the outline column, which is what the old Shapes table was
    this.bandScale = 'auto';    // 'auto' | 'rank' | 'log' — how the map cuts its bands
    this._shuffleSeed = 1;
    // Off by default: the extra line is for auditing the alias table (TODOS #40),
    // not for reading a ranking.
    this.showAliases = false;
    // Coverage only. `gapsOnly` hides both the entities with nothing missing and the
    // columns with nothing missing — at 251 rows x 17 columns the thing you are looking
    // for is a tenth of the table, and the other nine tenths are in the way (TODOS #67).
    this.gapsOnly = false;
    this.covSort = null;     // { key, dir } — null means by name
  }

  async loadData() {
    if (this._loaded) return;
    await loadDatasets();
    await loadEntities();
    await loadAliases();
    await loadFlagColors();
    this._loaded = true;
  }

  start(datasetId = 'gdp-nominal', { view = 'rank', continent = null, gaps = false, sort = null } = {}) {
    this.gapsOnly = !!gaps;
    this.covSort = sort ? { key: sort.replace(/^-/, ''), dir: sort.startsWith('-') ? -1 : 1 } : null;
    this.datasetId = getDataset(datasetId) ? datasetId : getDatasetList()[0].id;
    // A URL can name a continent that is not one (TODOS #56); fall back to all.
    this.continent = getContinents().includes(continent) ? continent : null;
    this.higherFirst = getDataset(this.datasetId).higherFirst;
    this.view = VIEWS.some((v) => v.id === view) ? view : 'rank';
    this.order = this.view === 'shapes' ? 'name' : (this.higherFirst ? 'hi' : 'lo');
    this._render();
  }

  _render() {
    const c = this.container;
    // Thumbnails draw as they scroll into view; a re-render replaces every canvas the
    // old observer was watching, so it has to go with them.
    this._shapeObserver?.disconnect();
    this._shapeObserver = null;
    this._mapResize?.disconnect();
    this._mapResize = null;
    c.innerHTML = '';
    c.appendChild(this._renderHeader());
    c.appendChild(this._renderControls());
    this._listEl = document.createElement('div');
    this._listEl.className = 'explore-list'
      + (this.view === 'coverage' ? ' is-coverage' : '')
      + (this.view === 'map' ? ' is-map' : '');
    c.appendChild(this._listEl);
    this.onState?.({
      view: this.view, metric: this.datasetId, continent: this.continent,
      gaps: this.view === 'coverage' && this.gapsOnly ? '1' : null,
      sort: this.view === 'coverage' && this.covSort
        ? (this.covSort.dir < 0 ? '-' : '') + this.covSort.key : null,
    });
    this._renderBody();
  }

  _renderBody() {
    if (this.view === 'coverage') this._renderCoverage();
    else if (this.view === 'shapes') this._renderShapes();
    else if (this.view === 'map') this._renderMap();
    else this._renderList();
  }

  // The one ordering every rows view uses. High/Low read the selected metric; the
  // rest are metric-independent, which is why they belong everywhere rather than in
  // whichever view happened to grow them first.
  _ordered(rows, valueOf) {
    const by = this.order;
    if (by === 'hi' || by === 'lo') {
      const dir = by === 'hi' ? -1 : 1;
      return [...rows].sort((a, b) => {
        const [x, y] = [valueOf(a), valueOf(b)];
        if (x == null && y == null) return a.name.localeCompare(b.name);
        if (x == null) return 1;      // no figure sorts last either way
        if (y == null) return -1;
        return (x - y) * dir;
      });
    }
    if (by === 'continent') {
      return [...rows].sort((a, b) => (a.continent || '').localeCompare(b.continent || '')
        || a.name.localeCompare(b.name));
    }
    if (by === 'random') {
      return [...rows].sort((a, b) => seededRank(a.code, this._shuffleSeed) - seededRank(b.code, this._shuffleSeed));
    }
    return [...rows].sort((a, b) => a.name.localeCompare(b.name));
  }

  // A column toggle is one glyph: these turn a column on, they are not scope, and a
  // row of "X: Off" pills ate the bar (owner, 2026-10-11).
  _glyph(glyph, on, title, onToggle) {
    const b = document.createElement('button');
    b.className = 'btn btn-tool explore-glyph' + (on ? ' active' : '');
    b.textContent = glyph;
    b.title = title;
    b.setAttribute('aria-pressed', String(on));
    b.setAttribute('aria-label', title);
    b.addEventListener('click', onToggle);
    return b;
  }

  // Auto picks by the shape of the data: three orders of magnitude or more is a long
  // tail, where equal-count bands put every rich country in one colour — Sweden and
  // Germany came out identical on Total GDP (owner, 2026-10-11).
  _mapScale(ds) {
    if (this.bandScale !== 'auto') return this.bandScale;
    const vals = Object.values(ds.values).filter((v) => v != null && v > 0);
    if (vals.length < 10) return 'rank';
    return Math.max(...vals) / Math.min(...vals) >= 1000 ? 'log' : 'rank';
  }

  // Everything in this view answers to the Explorer's own territories setting.
  _pool() {
    return { territories: getExploreTerritories() };
  }

  // On or off, so it is a pill — visibly not one of the dropdowns beside it.
  _pill(label, on, title, onToggle) {
    const b = document.createElement('button');
    b.className = 'btn btn-tool explore-pill' + (on ? ' active' : '');
    b.textContent = `${label}: ${on ? 'On' : 'Off'}`;
    b.title = title;
    b.setAttribute('aria-pressed', String(on));
    b.addEventListener('click', onToggle);
    return b;
  }

  // The same metric as the rankings, shaded onto the world (TODOS #48). Geometry is
  // loaded once and kept: it is ~1MB across the six region files.
  async _renderMap() {
    const list = this._listEl;
    if (!list) return;
    list.innerHTML = '';
    list.classList.add('is-map');

    const ds = getDataset(this.datasetId);
    const wrap = document.createElement('div');
    wrap.className = 'explore-map';
    const canvas = document.createElement('canvas');
    canvas.className = 'explore-map-canvas';
    const tip = document.createElement('div');
    tip.className = 'explore-map-tip';
    tip.hidden = true;
    const legend = document.createElement('div');
    legend.className = 'explore-map-legend';
    // Zooming out all the way resets the view, but a button says so out loud — there is
    // no round to end here, so a map left zoomed in stays that way (TODOS #60).
    const reset = document.createElement('button');
    reset.className = 'btn btn-tool explore-map-reset';
    reset.textContent = '⤢ Reset view';
    reset.hidden = true;
    wrap.append(canvas, tip, reset);
    list.append(wrap, legend);

    if (!this._world) this._world = await loadWorldOutlines();
    // A re-render replaces the canvas, so the map is rebuilt around the new one.
    const map = new ExplorerMap(canvas, {
      onPick: (code) => openCountryPanel(code),
      formatValue,
    });
    this._map = map;
    reset.addEventListener('click', () => map.resetView());
    map.onViewChange = (scale) => { reset.hidden = scale <= 1; };
    map.onHover = (label, ev) => {
      tip.hidden = !label;
      if (!label) return;
      tip.textContent = label;
      const r = wrap.getBoundingClientRect();
      tip.style.left = `${Math.min(ev.clientX - r.left + 12, r.width - tip.offsetWidth - 8)}px`;
      tip.style.top = `${ev.clientY - r.top + 12}px`;
    };

    // Shaded = what the rankings would list: pool rules, plus the continent filter.
    const scope = new Set(getEntries(this.datasetId, { continent: this.continent })
      .filter((e) => inCountryPool(e.code, this._pool())).map((e) => e.code));
    map.setWorld(this._world).setMetric({
      values: ds.values, format: ds.format, scope, scale: this._mapScale(ds),
    });
    map.render();

    legend.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'explore-map-legend-head';
    head.textContent = `${ds.name} · ${map.bandCount()} bands ${map.bandBasis()} · darker = lower, brighter = higher`;
    legend.appendChild(head);
    for (const row of map.legendRows()) {
      const item = document.createElement('span');
      item.className = 'explore-legend-item';
      const sw = document.createElement('span');
      sw.className = 'explore-legend-swatch';
      sw.style.background = row.color;
      const lab = document.createElement('span');
      lab.textContent = row.label;
      item.append(sw, lab);
      legend.appendChild(item);
    }

    // Refit when the window changes shape, and only while this view is on screen.
    this._mapResize?.disconnect();
    this._mapResize = new ResizeObserver(() => map.render());
    this._mapResize.observe(wrap);
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

  // One grammar, so the kind of control is visible before you read the label: a
  // dropdown picks one of several, a pill is on or off, and the single accent button
  // is the only thing that leaves the screen. The bar had grown into four kinds of
  // control with nothing to tell them apart (owner, 2026-10-11).
  _renderControls() {
    const bar = document.createElement('div');
    bar.className = 'explore-controls';
    const rankView = this.view === 'rank';
    const shapeView = this.view === 'shapes';
    const hasRows = rankView || shapeView;

    bar.appendChild(this._select(VIEWS, this.view, (v) => {
      this.view = v;
      // A view with no metric has nothing to call High or Low.
      if (v === 'shapes' && (this.order === 'hi' || this.order === 'lo')) this.order = this.order;
      this._render();
    }));

    if (hasRows || this.view === 'map') {
      bar.appendChild(this._select(
        getDatasetList().map((d) => ({ id: d.id, label: d.name })),
        this.datasetId,
        (v) => {
          this.datasetId = v;
          this.higherFirst = getDataset(v).higherFirst;   // reset to natural order
          if (this.order === 'hi' || this.order === 'lo') this.order = this.higherFirst ? 'hi' : 'lo';
          this._render();
        },
      ));
    }

    if (this.view === 'map') {
      bar.appendChild(this._select([
        { id: 'auto', label: 'Bands: auto' },
        { id: 'rank', label: 'Bands: by rank' },
        { id: 'log', label: 'Bands: by value' },
      ], this.bandScale, (v) => { this.bandScale = v; this._renderBody(); }));
    }

    bar.appendChild(this._select(
      [{ id: '', label: 'All continents' }, ...getContinents().map((c) => ({ id: c, label: c }))],
      this.continent || '',
      (v) => { this.continent = v || null; this._renderBody(); },
    ));

    if (hasRows) {
      bar.appendChild(this._select(ORDERS, this.order, (v) => {
        // Picking Random again means "shuffle again", which is what anyone expects.
        if (v === 'random') this._shuffleSeed = Math.floor(Math.random() * 1e9);
        this.order = v;
        if (v === 'hi' || v === 'lo') this.higherFirst = v === 'hi';
        this._renderBody();
      }));

    }

    // Columns of the table, so they live with the table. The grid has no columns —
    // it is outlines, and names are the thing it deliberately hides (owner, 2026-10-11).
    if (rankView) {
      const glyphs = document.createElement('div');
      glyphs.className = 'explore-glyphs';   // grouped, so a wrap cannot split them
      glyphs.append(
        this._glyph('✏️', this.showOutlines,
          'Show each country\'s outline beside its name',
          () => { this.showOutlines = !this.showOutlines; this._render(); }),
        this._glyph('🔤', this.showAliases,
          'Show the other names each country is accepted under when typing',
          () => { this.showAliases = !this.showAliases; this._render(); }),
      );
      bar.appendChild(glyphs);
    }

    // Coverage only: the whole point of this view is finding what is missing, and at
    // 251 rows x 17 columns that is about a tenth of the table (TODOS #67).
    if (this.view === 'coverage') {
      bar.appendChild(this._pill('🕳️ Gaps only', this.gapsOnly,
        'Hide the entities with nothing missing, and the columns with no gaps at all',
        () => { this.gapsOnly = !this.gapsOnly; this._render(); }));
    }

    bar.appendChild(this._pill('🏝️ Territories', getExploreTerritories(),
      'Include small dependent/autonomous territories here. The games keep their own setting.',
      () => { setExploreTerritories(!getExploreTerritories()); this._render(); }));

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

  // Rankings. With the outline column on and the order set to a land-area metric this
  // *is* the old Shapes table, which is why that view no longer exists (owner,
  // 2026-10-11).
  _renderList() {
    const list = this._listEl;
    if (!list) return;
    this._shapeObserver?.disconnect();
    list.innerHTML = '';

    const ds = getDataset(this.datasetId);
    const rows = this._ordered(
      getEntries(this.datasetId, { continent: this.continent })
        .filter((e) => inCountryPool(e.code, this._pool())),
      (e) => e.value,
    );

    const blurb = document.createElement('div');
    blurb.className = 'explore-blurb';
    blurb.textContent = `${ds.name} — ${ds.blurb}${this.continent ? ` · ${this.continent}` : ''} · ${rows.length} countries`;
    list.appendChild(blurb);

    if (this.showOutlines) this._shapeObserver = this._outlineObserver(list, THUMB_SIZE);

    rows.forEach((e, i) => {
      const row = document.createElement('div');
      row.className = 'explore-row is-clickable' + (this.showOutlines ? ' has-outline' : '');

      const rank = document.createElement('span');
      rank.className = 'explore-rank';
      rank.textContent = i + 1;
      row.appendChild(rank);

      if (this.showOutlines) row.appendChild(this._outlineCanvas(e.code, THUMB_SIZE));

      const img = document.createElement('img');
      img.className = 'rank-flag';
      img.src = flagUrl(e.code, 'w40');
      img.alt = '';
      img.loading = 'lazy';
      img.addEventListener('error', () => { img.style.visibility = 'hidden'; });

      const name = document.createElement('span');
      name.className = 'explore-name';
      name.textContent = e.name;
      // Beside the name, dim, on the same line: an extra row per country turned a
      // ranking into a wall, and a country with none simply says nothing.
      if (this.showAliases) {
        const aliases = getAliases(e.code);
        if (aliases.length) {
          const also = document.createElement('span');
          also.className = 'explore-aliases';
          also.textContent = aliases.join(', ');
          name.appendChild(also);
        }
      }

      const val = document.createElement('span');
      val.className = 'explore-value';
      val.textContent = e.value == null ? '—' : formatValue(ds.format, e.value);

      row.append(img, name, val);
      row.title = `View ${e.name}`;
      row.addEventListener('click', () => openCountryPanel(e.code));
      list.appendChild(row);
    });
  }

  // 250 canvases are too many to draw up front, so each waits until it is nearly on
  // screen. Torn down by _render().
  _outlineObserver(root, size) {
    return new IntersectionObserver((entries, obs) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        obs.unobserve(entry.target);
        drawSilhouette(entry.target, entry.target.dataset.code, entry.target._entity,
          { size, pad: size > 60 ? 6 : 3 });
      }
    }, { root, rootMargin: '300px' });
  }

  _outlineCanvas(code, size) {
    const canvas = document.createElement('canvas');
    canvas.className = 'shape-thumb';
    canvas.dataset.code = code;
    canvas._entity = getEntity(code);
    this._shapeObserver?.observe(canvas);
    return canvas;
  }

  // Outlines and nothing else: no name, no flag, no figure. Hover names one, press
  // opens it (TODOS #61). Ordering is the same list every other view offers.
  _renderShapes() {
    const list = this._listEl;
    if (!list) return;
    this._shapeObserver?.disconnect();
    list.innerHTML = '';

    const ds = getDataset(this.datasetId);
    const rows = this._ordered(
      getEntitiesList().filter((e) => inCountryPool(e, this._pool())
        && (!this.continent || e.continent === this.continent)),
      (e) => ds?.values[e.code] ?? null,
    );

    const missing = rows.filter((e) => e.hasGeometry === false).length;
    const orderLabel = ORDERS.find((o) => o.id === this.order).label;
    const blurb = document.createElement('div');
    blurb.className = 'explore-blurb';
    blurb.textContent = `${rows.length} outlines${this.continent ? ` · ${this.continent}` : ''}`
      + (missing ? ` · ${missing} with no geometry` : '')
      + ` · ${this.order === 'hi' || this.order === 'lo' ? `${ds.name}, ${orderLabel}` : orderLabel}`
      + ' · hover to name one, press to open it';
    list.appendChild(blurb);

    this._shapeObserver = this._outlineObserver(list, GRID_THUMB_SIZE);

    const wrap = document.createElement('div');
    wrap.className = 'shape-grid';
    for (const e of rows) {
      const tile = document.createElement('div');
      tile.className = 'shape-tile';
      tile.tabIndex = 0;
      tile.setAttribute('role', 'button');
      tile.setAttribute('aria-label', e.name);
      const name = document.createElement('span');
      name.className = 'shape-tile-name';
      name.textContent = e.name;
      tile.append(this._outlineCanvas(e.code, GRID_THUMB_SIZE), name);
      const open = () => openCountryPanel(e.code);
      tile.addEventListener('click', open);
      tile.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); }
      });
      wrap.appendChild(tile);
    }
    list.appendChild(wrap);
  }

  // The Colors column used to be a tick, which stopped meaning anything once every
  // entity had colours (TODOS #55). It shows the curated colours themselves now, and
  // checks them against the entity's own flag image — the question worth asking is no
  // longer "are there any" but "are they right", and a wrong one is scored against in
  // both colour quizzes.
  //
  // The check reads the image, so it runs only when the row is actually on screen and
  // never blocks the table. A row that has not been checked yet simply shows its
  // swatches: absence of a warning is not a claim.
  _colorsCell(e) {
    const td = document.createElement('td');
    td.className = 'cov-cell cov-colors';
    const colors = getFlagColors(e.code);
    if (!colors || !colors.length) {
      td.classList.add('no');
      td.textContent = '✗';
      return td;
    }
    for (const c of colors) {
      const sw = document.createElement('span');
      sw.className = 'cov-swatch';
      sw.style.background = c;
      sw.title = c;
      td.appendChild(sw);
    }
    this._colorChecks.observe(td);
    td._checkColors = async () => {
      let found;
      try { found = await readFlagColors(flagUrl(e.code, 'w320')); }
      catch { return; }   // no image to check against: say nothing rather than warn
      const missing = missingFromImage(colors, found);
      if (!missing.length) return;
      for (const sw of td.querySelectorAll('.cov-swatch')) {
        if (missing.includes(sw.title)) sw.classList.add('cov-swatch--missing');
      }
      const warn = document.createElement('span');
      warn.className = 'cov-colors-warn';
      // Say which colour and why, rather than leaving a glyph to be decoded by hover.
      warn.textContent = `⚠ ${missing.length === 1 ? 'not in flag' : missing.length + ' not in flag'}`;
      warn.title = `${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not in this flag's image. `
        + 'The ringed swatch is the one in question. Either the curated value is wrong, or it is a '
        + 'detail too small for the reader to see — judge against the flag, which is what players see.';
      td.appendChild(warn);
    };
    return td;
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
    // One description per column, so the header, the completeness maths and the cell all
    // read the same definition instead of three parallel lists drifting apart.
    const COLS = [
      { key: 'hasGeometry', label: 'Geo', has: (e) => e.hasGeometry },
      { key: 'hasFlagImage', label: 'Flag', has: (e) => e.hasFlagImage },
      { key: 'hasFlag', label: 'Colors', has: (e) => e.hasFlag, cell: (e) => this._colorsCell(e) },
      { key: 'hasCapital', label: 'Cap', has: (e) => e.hasCapital },
      { key: 'hasReligion', label: 'Rel', has: (e) => e.hasReligion },
      ...metrics.map((m) => ({
        key: m.id, label: shortLabel[m.id] || m.name, has: (e) => !!e.metrics[m.id],
      })),
    ];

    let ents = getEntitiesList();
    if (!getExploreTerritories()) ents = ents.filter((e) => !e.optional);
    if (this.continent) ents = ents.filter((e) => e.continent === this.continent);

    const missingCount = (e) => COLS.reduce((n, c) => n + (c.has(e) ? 0 : 1), 0);
    const aggregates = ents.filter((e) => e.type === 'aggregate').length;
    const totalRows = ents.length;
    const complete = ents.filter((e) => missingCount(e) === 0).length;

    // Gap mode drops what has nothing to say: entities with no gaps, and columns with no
    // gap anywhere in the current selection. Both are measured over the rows actually in
    // view, so narrowing by continent narrows the columns with it.
    let cols = COLS;
    if (this.gapsOnly) {
      // Aggregates go first. `jg` Channel Islands is Jersey + Guernsey summed, already
      // excluded from every pool in the app, and it has no geometry, flag or colours
      // because it is not a place — counting that as a gap kept three complete columns
      // on screen for one row nobody can act on.
      ents = ents.filter((e) => e.type !== 'aggregate' && missingCount(e) > 0);
      cols = COLS.filter((c) => ents.some((e) => !c.has(e)));
    }

    const sorted = this.covSort && cols.find((c) => c.key === this.covSort.key);
    if (sorted) {
      ents = [...ents].sort((a, b) => ((sorted.has(a) ? 1 : 0) - (sorted.has(b) ? 1 : 0)) * this.covSort.dir
        || a.name.localeCompare(b.name));
    }

    const blurb = document.createElement('div');
    blurb.className = 'explore-blurb';
    blurb.textContent = this.gapsOnly
      ? `Gaps only${this.continent ? ` · ${this.continent}` : ''} · `
        + `${ents.length} of ${totalRows} entities · ${cols.length} of ${COLS.length} columns · `
        + `${complete} complete and ${aggregates} aggregate hidden`
      : `Coverage${this.continent ? ` · ${this.continent}` : ''} · ${totalRows} entities · `
        + `${complete} complete · ${totalRows - complete} incomplete · ${aggregates} aggregate`;
    list.appendChild(blurb);

    const legend = document.createElement('div');
    legend.className = 'explore-blurb cov-legend';
    legend.textContent = 'Click a column heading to sort its gaps to the top · '
      + 'Colors = the curated colors the color quizzes score against, checked against each '
      + 'flag image as you scroll — ⚠ means a color was not found in it';
    list.appendChild(legend);

    if (!ents.length) {
      const none = document.createElement('div');
      none.className = 'explore-blurb';
      none.textContent = 'Nothing missing here — every entity in this selection is complete.';
      list.appendChild(none);
      return;
    }

    const table = document.createElement('table');
    table.className = 'coverage-table';

    const thead = document.createElement('thead');
    const htr = document.createElement('tr');
    for (const h of ['', 'Entity', 'Type']) {
      const th = document.createElement('th');
      th.textContent = h;
      htr.appendChild(th);
    }
    for (const col of cols) {
      const th = document.createElement('th');
      const active = this.covSort?.key === col.key;
      th.textContent = active ? `${col.label} ${this.covSort.dir === 1 ? '▲' : '▼'}` : col.label;
      th.className = 'is-sortable' + (active ? ' is-sorted' : '');
      th.title = `Sort by ${col.label} — gaps first`;
      th.addEventListener('click', () => {
        // First click brings the gaps up, which is what the click is nearly always for.
        this.covSort = { key: col.key, dir: active && this.covSort.dir === 1 ? -1 : 1 };
        this._render();
      });
      htr.appendChild(th);
    }
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
      if (missingCount(e) > 0) tr.classList.add('incomplete');
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

      tr.append(flagTd, nameTd, typeTd, ...cols.map((c) => (c.cell ? c.cell(e) : cell(c.has(e)))));
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    list.appendChild(table);
  }
}
