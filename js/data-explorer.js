// Data Explorer — browse the collected datasets as ranked country lists,
// filterable by continent and sortable. Read-only learning view.

import { loadDatasets, loadEntities, loadAliases, loadFlagColors, getFlagColors, getDatasetList, getDataset, getContinents, getEntries, getEntitiesList, inCountryPool, getMetricMeta, formatValue, getAliases, getRank, getEntity, getKnownGap, getRawData, liveCounts, loadAttributes, loadElectricity, loadFlagColors as _lfc } from './datasets.js';
import { readFlagColors, missingFromImage } from './flag-colors.js';
import { runDataChecks, runScoringChecks } from './data-health.js';
import { scoreCeilings, ceilingByCode } from './score-health.js';
import { openCountryPanel } from './country-panel.js';
import { drawSilhouette } from './silhouette.js';
import { ExplorerMap } from './explorer-map.js';
import { loadWorldOutlines } from './geo-data.js';
import { flagUrl } from './flags.js';
import { loadEmblems, emblemUrl, emblemFile } from './emblems.js';
import { loadHeritage, allSites, siteCard } from './heritage.js';
import { loadRelations, hasTrade } from './relations.js';
import { loadSources, allSources, formatAge, isStale, STALE_DAYS, sourcesRaw } from './sources.js';
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
  { id: 'heritage', label: '🏛️ Heritage' },
  { id: 'coverage', label: '📋 Coverage' },
  { id: 'sources', label: '🔗 Sources' },
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
    // Natural by default: it groups where the data has gaps, which is what a reader
    // is looking for. The others are there to compare against (owner, 2026-10-11).
    this.bandScale = 'natural';   // 'natural' | 'rank' | 'log'
    this._shuffleSeed = 1;
    // Off by default: the extra line is for auditing the alias table (TODOS #40),
    // not for reading a ranking.
    this.showAliases = false;
    // Coverage only. `gapsOnly` hides both the entities with nothing missing and the
    // columns with nothing missing — at 251 rows x 17 columns the thing you are looking
    // for is a tenth of the table, and the other nine tenths are in the way (TODOS #70).
    this.gapsOnly = false;
    this.covSort = null;     // { key, dir } — null means by name
    this.healthOpen = false;
  }

  async loadData() {
    if (this._loaded) return;
    await loadDatasets();
    await loadEntities();
    await loadAliases();
    await loadFlagColors();
    // The Coverage health strip asks cross-file questions, so it needs the files the
    // rank views never touch.
    await Promise.all([loadAttributes(), loadElectricity(), loadEmblems(), loadHeritage(), loadRelations(), loadSources()]);
    this._loaded = true;
  }

  start(datasetId = 'gdp-nominal', { view = 'rank', continent = null, gaps = false, sort = null, focus = null } = {}) {
    this._focus = focus;     // one-shot: frame this country when the map first draws
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
    // A wall of photographs wants the screen, and so does a five-column table of
    // sources with URLs in it.
    c.classList.toggle('is-wide', this.view === 'heritage' || this.view === 'sources');
    c.appendChild(this._renderHeader());
    c.appendChild(this._renderControls());
    this._listEl = document.createElement('div');
    this._listEl.className = 'explore-list'
      + (this.view === 'coverage' ? ' is-coverage' : '')
      + (this.view === 'sources' ? ' is-sources' : '')
      + (this.view === 'map' ? ' is-map' : '');
    c.appendChild(this._listEl);
    this.onState?.({
      // focus rides along, or the URL rewrite below would drop it before the map has
      // framed the country the reader asked for (TODOS #69).
      focus: this._focus,
      view: this.view, metric: this.datasetId, continent: this.continent,
      gaps: this.view === 'coverage' && this.gapsOnly ? '1' : null,
      sort: this.view === 'coverage' && this.covSort
        ? (this.covSort.dir < 0 ? '-' : '') + this.covSort.key : null,
    });
    this._renderBody();
  }

  _renderBody() {
    if (this.view !== 'map') this._mapView = null;   // leaving the map forgets its zoom
    if (this.view === 'sources') this._renderSources();
    else if (this.view === 'coverage') this._renderCoverage();
    else if (this.view === 'heritage') this._renderHeritage();
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
  _glyph(glyph, label, on, title, onToggle) {
    const b = document.createElement('button');
    b.className = 'btn btn-tool explore-glyph' + (on ? ' active' : '');
    b.textContent = glyph;
    b.dataset.label = label;
    b.title = title;
    b.setAttribute('aria-pressed', String(on));
    b.setAttribute('aria-label', title);
    b.addEventListener('click', onToggle);
    return b;
  }

  // entities.json names a territory's sovereign rather than coding it, so this maps
  // the name back to the entity once and keeps it.
  _sovereignOf(code) {
    if (!this._byName) {
      this._byName = new Map(getEntitiesList().map((e) => [e.name, e]));
    }
    const name = getEntity(code)?.sovereign;
    return name ? this._byName.get(name) || null : null;
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
      sovereignOf: (code) => this._sovereignOf(code),
    });
    this._map = map;
    reset.addEventListener('click', () => map.resetView());
    map.onViewChange = (scale) => {
      reset.hidden = scale <= 1;
      this._focus = null;        // the reader has taken over; stop re-framing
      this._mapView = map.getView();
    };
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
    // Territories on means "show dependencies as themselves", and that cannot depend on
    // whether this particular metric has a row for them: World Bank reports most series
    // nationally only, so without this the toggle changed nothing on most metrics and
    // Aruba went on reading as the Netherlands (owner, 2026-10-25).
    if (getExploreTerritories()) {
      for (const e of getEntitiesList()) {
        if (e.sovereign && inCountryPool(e, this._pool())
          && (!this.continent || e.continent === this.continent)) scope.add(e.code);
      }
    }
    // Framed by the continent filter alone, never by the territories toggle.
    const frame = this.continent
      ? new Set(getEntitiesList().filter((e) => e.continent === this.continent).map((e) => e.code))
      : null;
    map.setWorld(this._world).setMetric({
      values: ds.values, format: ds.format, scope, frame, scale: this.bandScale,
    });
    // Every control rebuilds the map, and throwing the reader's zoom away each time
    // made the territories toggle unusable while zoomed in (owner, 2026-10-11).
    map.setView(this._mapView);
    map.render();
    reset.hidden = map.getView().scale <= 1;
    // Arriving at #/explore/map?focus=se frames Sweden. Every render builds a fresh
    // map, so the focus is re-applied until the reader moves the map themselves —
    // clearing it on the first render lost it whenever anything re-rendered.
    const applyFocus = () => {
      if (this._focus && map.focusOn(this._focus)) {
        reset.hidden = false;
        this._mapView = map.getView();
      }
    };

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

    // The legend has only just taken its share of the height, so the frame is only
    // now the size the reader will see — focusing before this clipped Sweden and
    // Algeria against the top edge (owner, 2026-10-11).
    applyFocus();

    // Refit when the window changes shape, and only while this view is on screen.
    this._mapResize?.disconnect();
    this._mapResize = new ResizeObserver(() => { map.render(); applyFocus(); });
    this._mapResize.observe(wrap);
  }

  _select(options, value, onPick) {
    const sel = document.createElement('select');
    sel.className = 'explore-select';
    for (const opt of options) {
      const o = document.createElement('option');
      o.value = opt.id;
      o.textContent = opt.label;
      if (opt.hint) o.title = opt.hint;          // shown in the open dropdown
      if (opt.id === value) { o.selected = true; sel.title = opt.hint || ''; }
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
        { id: 'natural', label: 'Bands: natural groups',
          hint: 'Cut where the data itself has gaps, so a country that really stands apart gets a colour of its own. Where values are bunched, fewer colours.' },
        { id: 'rank', label: 'Bands: equal count',
          hint: 'The same number of countries in every colour. Answers "where does this place", but a spread-out top end can end up sharing one colour.' },
        { id: 'log', label: 'Bands: log scale',
          hint: 'Equal steps in orders of magnitude: each band is about the same multiple of the one below. Answers "how many times bigger".' },
      ], this.bandScale, (v) => { this.bandScale = v; this._renderBody(); }));
    }

    // A list of third parties has no continent and no territories.
    if (this.view !== 'sources') {
      bar.appendChild(this._select(
        [{ id: '', label: 'All continents' }, ...getContinents().map((c) => ({ id: c, label: c }))],
        this.continent || '',
        (v) => { this.continent = v || null; this._renderBody(); },
      ));
    }

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
        this._glyph('✏️', 'Shapes', this.showOutlines,
          'Show each country\'s outline beside its name',
          () => { this.showOutlines = !this.showOutlines; this._render(); }),
        this._glyph('🔤', 'Aliases', this.showAliases,
          'Show the other names each country is accepted under when typing',
          () => { this.showAliases = !this.showAliases; this._render(); }),
      );
      bar.appendChild(glyphs);
    }

    // Coverage only: the whole point of this view is finding what is missing, and at
    // 251 rows x 17 columns that is about a tenth of the table (TODOS #70).
    if (this.view === 'coverage') {
      bar.appendChild(this._pill('🕳️ Gaps only', this.gapsOnly,
        'Hide the entities with nothing missing, and the columns with no gaps at all',
        () => { this.gapsOnly = !this.gapsOnly; this._render(); }));
    }

    if (this.view !== 'sources') {
      bar.appendChild(this._pill('🏝️ Territories', getExploreTerritories(),
        'Include small dependent/autonomous territories here. The games keep their own setting.',
        () => { setExploreTerritories(!getExploreTerritories()); this._render(); }));
    }

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
  // The score a perfect drawing of this country gets. 100 is the only right answer; the
  // breakdown on hover says which term fell short (TODOS #73).
  _ceilingCell(e) {
    const td = document.createElement('td');
    td.className = 'cov-cell cov-ceiling';
    if (this._ceilings === undefined) {
      td.classList.add('cov-explained');
      td.textContent = '…';
      td.title = 'Still working out what a perfect drawing scores.';
      return td;
    }
    const c = ceilingByCode(this._ceilings, e.code);
    if (!c) {
      td.classList.add('cov-explained');
      td.textContent = '–';
      td.title = 'No detailed outline, so this country is not scored against one.';
      return td;
    }
    td.textContent = String(c.total);
    td.classList.add(c.total >= 100 ? 'ok' : 'no');
    td.title = `A perfect drawing of ${c.name} scores ${c.total}: `
      + `shape ${c.shape}, size ${c.size}, placement ${c.placement}. `
      + `Its outline covers ${c.ink} of the 6400 comparison cells.`;
    return td;
  }

  // The emblem itself, not a tick — the point of the column is seeing whether the
  // image Wikidata named is actually this country's arms (TODOS #31).
  _emblemCell(e) {
    const td = document.createElement('td');
    td.className = 'cov-cell cov-emblem';
    const url = emblemUrl(e.code, 80);
    if (!url) {
      td.classList.add('no');
      td.textContent = '\u2717';
      td.title = 'Wikidata has no coat of arms (P94) for this entity.';
      return td;
    }
    const img = document.createElement('img');
    img.src = url;
    img.loading = 'lazy';
    img.alt = '';
    img.title = emblemFile(e.code);
    img.addEventListener('error', () => {
      td.classList.add('no');
      td.textContent = '\u26a0';
      td.title = `Commons has no file called ${emblemFile(e.code)}`;
    });
    td.appendChild(img);
    return td;
  }

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

  // Integrity checks, above the table rather than on a page outside the app (owner,
  // 2026-10-11). These are whole-dataset questions — "does every key in flags.json
  // resolve", "do the religion percentages add up" — so they do not fit a per-row column
  // the way the flag colours did, and they belong where someone is already looking at
  // the data rather than somewhere they have to remember to go (TODOS #71).
  //
  // Collapsed to a single line unless something wants attention, because a wall of green
  // ticks above the table is noise that pushes the table off the screen.
  _healthStrip() {
    const wrap = document.createElement('div');
    wrap.className = 'cov-health';
    let checks;
    try {
      checks = runDataChecks({ ...getRawData(), sources: sourcesRaw(), counts: liveCounts() });
    } catch (err) {
      wrap.textContent = `Integrity checks could not run: ${err.message}`;
      return wrap;
    }
    // Skipped while the ceilings are still computing, rather than briefly reporting
    // a failure to run that is really just a fetch in flight.
    if (this._ceilings !== undefined) checks = [...checks, ...runScoringChecks(this._ceilings)];
    const bad = checks.filter((c) => c.state !== 'pass');

    const head = document.createElement('button');
    head.className = 'cov-health-head';
    head.textContent = bad.length
      ? `\u26a0 ${checks.length - bad.length} of ${checks.length} integrity checks pass \u2014 ${bad.length} to look at`
      : `\u2713 all ${checks.length} integrity checks pass`;
    head.setAttribute('aria-expanded', String(this.healthOpen));
    head.addEventListener('click', () => { this.healthOpen = !this.healthOpen; this._render(); });
    wrap.appendChild(head);

    if (!this.healthOpen) return wrap;

    for (const c of checks) {
      const row = document.createElement('div');
      row.className = 'cov-check';
      const chip = document.createElement('span');
      chip.className = 'cov-check-chip';
      chip.dataset.state = c.state;
      chip.textContent = { pass: 'pass', look: 'look', fail: 'fail' }[c.state];
      const body = document.createElement('div');
      const mk = (cls, text) => {
        const d = document.createElement('div');
        d.className = cls; d.textContent = text; return d;
      };
      body.appendChild(mk('cov-check-what', c.what));
      body.appendChild(mk('cov-check-detail', c.detail));
      if (c.codes?.length) {
        const list = c.codes.length > 20 ? `${c.codes.slice(0, 20).join(' \u00b7 ')} … +${c.codes.length - 20} more` : c.codes.join(' \u00b7 ');
        body.appendChild(mk('cov-check-codes', list));
      }
      row.append(chip, body);
      wrap.appendChild(row);
    }
    return wrap;
  }

  // What a perfect drawing scores, per country (TODOS #73). Only Coverage shows it, and
  // it reads every country's detailed outline — so it is fetched on first sight of this
  // board rather than in loadData(), where it made Rankings, Map and Shapes wait for
  // something none of them draw. The board renders immediately and redraws when it
  // lands; a failure leaves the checks saying they could not run.
  _ensureCeilings() {
    if (this._ceilings !== undefined || this._ceilingsPending) return;
    this._ceilingsPending = true;
    scoreCeilings()
      .catch((err) => { console.error('score ceilings failed', err); return null; })
      .then((rows) => {
        this._ceilings = rows;
        this._ceilingsPending = false;
        if (this.view === 'coverage') this._render();
      });
  }

  // Every World Heritage site as a photo tile, famous first (TODOS #46). The continent
  // filter the other views use applies here too; a transboundary site is shown once,
  // under no single owner, so the wall is 1273 sites rather than 1378 country entries.
  _renderHeritage() {
    const list = this._listEl;
    if (!list) return;
    list.innerHTML = '';

    let sites = allSites();
    if (!getExploreTerritories()) sites = sites.filter((s) => !getEntity(s.code)?.optional);
    if (this.continent) sites = sites.filter((s) => getEntity(s.code)?.continent === this.continent);

    const blurb = document.createElement('div');
    blurb.className = 'explore-blurb';
    blurb.textContent = `${sites.length} UNESCO World Heritage sites`
      + `${this.continent ? ` in ${this.continent}` : ''} · ordered by how many Wikipedia `
      + 'languages cover them, and #N is that position — UNESCO does not rank its sites · '
      + 'press one for its country';
    list.appendChild(blurb);

    if (!sites.length) {
      list.appendChild(Object.assign(document.createElement('div'),
        { className: 'explore-blurb', textContent: 'No sites in this selection.' }));
      return;
    }

    const wall = document.createElement('div');
    wall.className = 'whs-wall';
    for (const site of sites) {
      const tile = siteCard(site, { tile: true, flag: getEntity(site.code)?.name });
      tile.addEventListener('click', () => openCountryPanel(site.code));
      wall.appendChild(tile);
    }
    list.appendChild(wall);
  }

  // Every third party the app takes data from (TODOS #79). This is the answer to "where
  // did this number come from" and to "what are we obliged to attribute", in one table.
  // Nothing here is written by hand — data/sources.json is generated from the same
  // registry the build scripts fetch with.
  _renderSources() {
    const list = this._listEl;
    const sources = allSources();
    const built = sources.filter((s) => !s.runtime);
    const live = sources.filter((s) => s.runtime);
    const stale = built.filter(isStale);

    const blurb = document.createElement('div');
    blurb.className = 'explore-blurb';
    blurb.textContent = `${sources.length} sources · ${built.length} built into the repo, `
      + `${live.length} hotlinked as the page renders`
      + (stale.length ? ` · ${stale.length} not refreshed in over a year` : '');
    list.appendChild(blurb);

    const legend = document.createElement('div');
    legend.className = 'explore-blurb cov-legend';
    legend.textContent = 'Retrieved = when the data file was last committed, not when the '
      + 'source last published — the figures themselves carry their own year. '
      + `Anything over ${Math.round(STALE_DAYS / 365)} year old is flagged. `
      + 'Live = hotlinked by the browser as the page renders, so there is nothing to refresh.';
    legend.appendChild(document.createTextNode(' '));
    const note = document.createElement('a');
    note.href = 'https://github.com/Lolispo/geo-draw-the-world/blob/main/DATA-LICENSES.md';
    note.target = '_blank';
    note.rel = 'noopener';
    note.textContent = 'What each licence requires →';
    legend.appendChild(note);
    list.appendChild(legend);

    const table = document.createElement('table');
    table.className = 'coverage-table sources-table';
    const thead = document.createElement('thead');
    const htr = document.createElement('tr');
    for (const h of ['Source', 'What it gives us', 'Licence', 'Covers', 'Retrieved']) {
      const th = document.createElement('th');
      th.textContent = h;
      htr.appendChild(th);
    }
    thead.appendChild(htr);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const s of [...built, ...live]) {
      const tr = document.createElement('tr');
      if (isStale(s)) tr.classList.add('incomplete');

      const nameTd = document.createElement('td');
      nameTd.className = 'src-name';
      const link = document.createElement('a');
      link.href = s.url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = s.label;
      nameTd.appendChild(link);
      // The endpoint is the fact that lets someone check a figure themselves.
      const ep = document.createElement('div');
      ep.className = 'src-endpoint';
      ep.textContent = s.endpoint;
      ep.title = s.endpoint;
      nameTd.appendChild(ep);

      const whatTd = document.createElement('td');
      whatTd.className = 'src-what';
      whatTd.textContent = s.provides;
      if (s.datasets?.length) {
        const chips = document.createElement('div');
        chips.className = 'src-metrics';
        for (const d of s.datasets) {
          const chip = document.createElement('span');
          chip.className = 'src-metric';
          chip.textContent = d.name;
          chips.appendChild(chip);
        }
        whatTd.appendChild(chips);
      }

      const licTd = document.createElement('td');
      licTd.className = 'src-license';
      if (s.licenseUrl) {
        const a = document.createElement('a');
        a.href = s.licenseUrl;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = s.license;
        licTd.appendChild(a);
      } else {
        licTd.textContent = s.license;
      }

      const coversTd = document.createElement('td');
      coversTd.className = 'src-covers';
      coversTd.textContent = s.covers != null ? String(s.covers) : '—';
      if (s.files?.length) coversTd.title = s.files.map((f) => `${f.path} — ${f.covers ?? '?'} entities`).join('\n');

      const whenTd = document.createElement('td');
      whenTd.className = 'src-when' + (isStale(s) ? ' is-stale' : '');
      whenTd.textContent = formatAge(s);
      if (s.retrieved) whenTd.title = s.retrieved.slice(0, 10);
      else if (s.runtime) whenTd.title = `Hotlinked by ${s.usedBy} as the page renders`;

      tr.append(nameTd, whatTd, licTd, coversTd, whenTd);
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    list.appendChild(table);
  }

  _renderCoverage() {
    const list = this._listEl;
    if (!list) return;
    this._ensureCeilings();
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
      {
        key: 'hasEmblem', label: 'Arms', has: (e) => !!emblemFile(e.code),
        cell: (e) => this._emblemCell(e),
      },
      { key: 'hasCapital', label: 'Cap', has: (e) => e.hasCapital },
      { key: 'hasReligion', label: 'Rel', has: (e) => e.hasReligion },
      {
        // TODOS #30. A dependency's trade is counted in its sovereign's figures, so the
        // Factbook publishes none of its own — that is the source being right, not a gap
        // anyone can close.
        key: 'hasTrade', label: 'Trade', has: (e) => hasTrade(e.code),
        explained: (e) => (e.sovereign ? `trade is reported by ${e.sovereign}` : null),
      },
      {
        key: 'drawCeiling', label: 'Draw',
        has: (e) => !this._ceilings || (ceilingByCode(this._ceilings, e.code)?.total ?? 100) >= 100,
        explained: (e) => (this._ceilings && !ceilingByCode(this._ceilings, e.code)
          ? 'no detailed outline, so it is not drawn against one' : null),
        cell: (e) => this._ceilingCell(e),
      },
      ...metrics.map((m) => ({
        key: m.id, label: shortLabel[m.id] || m.name, has: (e) => !!e.metrics[m.id],
        // A gap the source explains is not a gap anyone can act on, so it does not
        // count as one — otherwise the gap view fills with 439 rows of "the World Bank
        // does not publish this" and stops being worth opening (TODOS #70).
        explained: (e) => (e.metrics[m.id] ? null : getKnownGap(m.id, e.code)),
      })),
    ];

    let ents = getEntitiesList();
    if (!getExploreTerritories()) ents = ents.filter((e) => !e.optional);
    if (this.continent) ents = ents.filter((e) => e.continent === this.continent);

    const open = (c, e) => !c.has(e) && !c.explained?.(e);
    const missingCount = (e) => COLS.reduce((n, c) => n + (open(c, e) ? 1 : 0), 0);
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
      cols = COLS.filter((c) => ents.some((e) => open(c, e)));
    }

    const sorted = this.covSort && cols.find((c) => c.key === this.covSort.key);
    if (sorted) {
      const rank = (e) => (open(sorted, e) ? 0 : sorted.has(e) ? 2 : 1);   // open, explained, present
      ents = [...ents].sort((a, b) => (rank(a) - rank(b)) * this.covSort.dir
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

    list.appendChild(this._healthStrip());

    const legend = document.createElement('div');
    legend.className = 'explore-blurb cov-legend';
    legend.textContent = '– = the source publishes no value, reason on hover — not counted as a gap · '
      + 'Click a column heading to sort its gaps to the top · '
      + 'Colors = the curated colors the color quizzes score against, checked against each '
      + 'flag image as you scroll — ⚠ means a color was not found in it · '
      + 'Draw = what a perfect drawing scores, run through the real scoring code — '
      + 'every country should read 100, and hovering one says which term fell short · '
      + 'Arms = the coat of arms Wikidata names for this entity, hotlinked from Commons; '
      + 'hover for the filename, \u26a0 means Commons has no such file';
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

      tr.append(flagTd, nameTd, typeTd, ...cols.map((c) => {
        if (c.cell) return c.cell(e);
        const why = c.has(e) ? null : c.explained?.(e);
        if (!why) return cell(c.has(e));
        // Muted dash, not a cross: the figure is missing and that is understood.
        const td = document.createElement('td');
        td.className = 'cov-cell cov-explained';
        td.textContent = '\u2013';
        td.title = why;
        return td;
      }));
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    list.appendChild(table);
  }
}
