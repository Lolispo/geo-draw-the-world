// Country Showcase panel (TODOS #18). Press a country anywhere it's listed to see
// its flag, shape silhouette, and every metric + attribute we have.
// Reusable modal: openCountryPanel(code) from any screen.

import {
  loadDatasets, loadEntities, loadAttributes, loadElectricity,
  getEntity, getAttributes, getElectricity, getDatasetList, formatValue, getRank,
} from './datasets.js';
import { flagUrl } from './flags.js';
import { loadEmblems, emblemUrl } from './emblems.js';
import { loadHeritage, sitesFor, siteCard } from './heritage.js';
import { loadRelations, hasTrade, partnerSection, reciprocalSection } from './relations.js';
import { loadSources, sourceLineFor } from './sources.js';
import { drawSilhouette } from './silhouette.js';
import { spread, percentile, trackPos, tone, band } from './metric-context.js';
import { getPanelWidth, setPanelWidth, PANEL_WIDTH_MIN, PANEL_WIDTH_MAX, PANEL_WIDTH_DEFAULT } from './settings.js';

const RELIGION_MIN_PCT = 5; // religions below this % are grouped into "Other"
const ELECTRICITY_MIN_PCT = 3; // smaller generation sources fold into "Other"

// Fixed colours per generation source (TODOS #29). Unlike religions, this is a closed
// set, so a country's mix stays recognisable at a glance and reads the same everywhere:
// fossils warm/dark, nuclear violet, water/wind/sun their obvious hues.
const ELECTRICITY_COLORS = {
  Coal: '#4b5563',
  Gas: '#f97316',
  Oil: '#78350f',
  Nuclear: '#a855f7',
  Hydro: '#3b82f6',
  Wind: '#22d3ee',
  Solar: '#facc15',
  Bioenergy: '#84cc16',
  'Other renewables': '#10b981',
  Other: '#6b7280',
};

// Flag, outline and arms are sized from the panel rather than fixed, so widening it
// does not leave three stamps floating in a header built for 558px (owner, 2026-11-06).
// Floors are the sizes they had at the old width; ceilings stop them dwarfing the name.
const clamp = (lo, v, hi) => Math.round(Math.min(hi, Math.max(lo, v)));
const headerSizes = (w) => ({
  flag: clamp(128, w * 0.23, 200),
  shape: clamp(108, w * 0.185, 162),
  arms: clamp(72, w * 0.112, 98),
});

let overlay = null;
let cardEl = null;
let dataPromise = null;
let escHandler = null;

// Where this panel has been (TODOS #30). Trade partners make the panel navigable for the
// first time — Sweden → Germany → China — and the way back has to exist without turning
// one reused overlay into a stack of them. So the trail is codes, not DOM, and Escape
// still closes the whole thing rather than unwinding it one country at a time.
let trail = [];

function ensureData() {
  if (!dataPromise) {
    dataPromise = Promise.all([loadDatasets(), loadEntities(), loadAttributes(), loadElectricity(), loadEmblems(), loadHeritage(), loadRelations(), loadSources()]);
  }
  return dataPromise;
}

function buildShell() {
  if (overlay) return;
  overlay = document.createElement('div');
  overlay.className = 'country-panel-overlay';
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeCountryPanel(); });

  cardEl = document.createElement('div');
  cardEl.className = 'country-panel';
  cardEl.setAttribute('role', 'dialog');
  cardEl.setAttribute('aria-modal', 'true');
  cardEl.style.width = `${getPanelWidth()}px`;
  overlay.appendChild(cardEl);
  document.body.appendChild(overlay);
}

// Drag the panel's edge to set how wide it opens, once, for good (TODOS #82). Phones
// never see it — CSS hides it below the width where the choice would mean anything —
// and the panel is centred, so the width moves at twice the pointer to keep the edge
// under the finger that is dragging it.
function buildResizeHandle() {
  const handle = document.createElement('div');
  handle.className = 'cp-resize';
  handle.title = 'Drag to set how wide this panel opens · double-click to reset';
  handle.setAttribute('aria-hidden', 'true');
  handle.addEventListener('dblclick', () => applyWidth(PANEL_WIDTH_DEFAULT, true));
  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const startX = e.clientX, startW = cardEl.getBoundingClientRect().width;
    handle.setPointerCapture(e.pointerId);
    cardEl.classList.add('is-resizing');
    const move = (ev) => applyWidth(startW + (ev.clientX - startX) * 2, false);
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      cardEl.classList.remove('is-resizing');
      setPanelWidth(cardEl.getBoundingClientRect().width);
      // Header sizes and the heritage strip's column count are both read off the width
      // at render time, so the new width has to be rendered at, not just applied to.
      const top = cardEl.scrollTop;
      render(trail[trail.length - 1]);
      cardEl.scrollTop = top;
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  });
  return handle;
}

function applyWidth(px, persist) {
  const roomy = Math.min(PANEL_WIDTH_MAX, window.innerWidth - 40);
  const w = Math.min(roomy, Math.max(PANEL_WIDTH_MIN, px));
  cardEl.style.width = `${Math.round(w)}px`;
  if (persist) setPanelWidth(w);
}

export async function openCountryPanel(code) {
  buildShell();
  cardEl.innerHTML = '<div class="cp-loading">Loading…</div>';
  overlay.classList.add('open');
  escHandler = (e) => { if (e.key === 'Escape') closeCountryPanel(); };
  document.addEventListener('keydown', escHandler);
  trail = [code];

  await ensureData();
  render(code);
}

// Following a trade partner: a new country, and a way back to the one that named it.
function navigateTo(code) {
  trail.push(code);
  render(code);
  cardEl.scrollTop = 0;
  syncHash(code);
}

function navigateBack() {
  if (trail.length < 2) return;
  trail.pop();
  const code = trail[trail.length - 1];
  render(code);
  cardEl.scrollTop = 0;
  syncHash(code);
}

// Keep the address bar honest while you walk the trail, but only on the route that is
// already about a country. A panel opened from the Explorer or the Coverage table is a
// detour from that screen, and rewriting the hash there would throw away the view the
// reader came from. replaceState is the app's existing idiom for this: it adds no
// history entry and fires neither hashchange nor popstate, so there is no re-entry loop
// and the browser's Back still leaves the panel rather than unwinding it one country at
// a time (TODOS #30, #77).
function syncHash(code) {
  if (!/^#\/country\//.test(window.location.hash)) return;
  history.replaceState(null, '', `#/country/${encodeURIComponent(code)}`);
}

export function closeCountryPanel() {
  if (!overlay) return;
  overlay.classList.remove('open');
  if (escHandler) { document.removeEventListener('keydown', escHandler); escHandler = null; }
}

function render(code) {
  const entity = getEntity(code);
  const attr = getAttributes(code) || {};
  const name = entity ? entity.name : code;

  cardEl.innerHTML = '';
  cardEl.appendChild(buildResizeHandle());

  // Close button
  const close = el('button', 'cp-close', '✕');
  close.setAttribute('aria-label', 'Close');
  close.addEventListener('click', closeCountryPanel);
  cardEl.appendChild(close);

  // Named with where it goes, not just "back" — after three hops the arrow alone does
  // not say whether you land on Germany or on Sweden.
  if (trail.length > 1) {
    const prev = trail[trail.length - 2];
    const prevName = getEntity(prev)?.name || prev;
    const back = el('button', 'cp-back', `← ${prevName}`);
    back.setAttribute('aria-label', `Back to ${prevName}`);
    back.addEventListener('click', navigateBack);
    cardEl.appendChild(back);
  }

  // Straight to this country on the map, zoomed in — the panel is where you are when
  // you want that (owner, 2026-10-11). Routing by hash keeps the panel free of any
  // dependency on the app shell.
  if (entity && entity.hasGeometry !== false) {
    const toMap = el('button', 'btn btn-tool cp-show-map', '🗺️ Show on map');
    toMap.title = 'Open the Data Explorer map, zoomed to this country';
    toMap.addEventListener('click', () => {
      closeCountryPanel();
      window.location.hash = `#/explore/map?focus=${encodeURIComponent(code)}`;
    });
    cardEl.appendChild(toMap);
  }

  // Header: flag + name + type/continent
  // A phone has its own sizes in CSS, and an inline width would outrank them.
  const sized = window.innerWidth >= 600 ? headerSizes(cardEl.clientWidth) : null;

  const header = el('div', 'cp-header');
  const flag = document.createElement('img');
  flag.className = 'cp-flag';
  if (sized) {
    flag.style.width = `${sized.flag}px`;
    // Most flags are 2:3 or 5:8, but a square one — the Vatican's, Switzerland's —
    // would otherwise be as tall as it is wide and set the height of the whole header.
    flag.style.maxHeight = `${Math.round(sized.flag * 0.68)}px`;
  }
  flag.src = flagUrl(code, 'w320');
  flag.alt = `Flag of ${name}`;
  flag.addEventListener('error', () => { flag.style.display = 'none'; });

  // The emblem sits beside the flag where there is one (TODOS #31). Countries without
  // one are common enough — Turkey has no official arms at all — that its absence has
  // to cost no layout, so it is only appended once it loads.
  const arms = emblemUrl(code, 160);
  let emblem = null;
  if (arms) {
    emblem = document.createElement('img');
    emblem.className = 'cp-emblem';
    if (sized) { emblem.style.height = `${sized.arms}px`; emblem.style.maxWidth = `${Math.round(sized.arms * 1.33)}px`; }
    emblem.src = arms;
    emblem.alt = `Coat of arms of ${name}`;
    emblem.loading = 'lazy';
    emblem.addEventListener('error', () => { emblem.remove(); });
  }

  const titleWrap = el('div', 'cp-title-wrap');
  titleWrap.appendChild(el('h2', 'cp-name', name));
  const sub = [];
  if (entity?.continent) sub.push(entity.continent);
  if (entity?.sovereign) sub.push(`Territory of ${entity.sovereign}`);
  // De-facto states carry Natural Earth's neutral claim note; show that rather than
  // the bare type, which would read as taking a side either way (TODOS #20).
  else if (entity?.disputed) sub.push(entity.disputed);
  else if (entity?.type && entity.type !== 'sovereign') sub.push(entity.type[0].toUpperCase() + entity.type.slice(1));
  if (sub.length) titleWrap.appendChild(el('div', 'cp-sub', sub.join(' · ')));

  // The outline joins the flag and the arms in the header rather than holding a column
  // of its own. As a column it took 150px of the width for the whole length of the
  // panel and left a gutter of nothing under itself — on a wide screen, most of the
  // panel (TODOS #82). It stays left of the title because the top right corner belongs
  // to Show on map and the close button.
  const shapeWrap = el('div', 'cp-shape');
  const canvas = document.createElement('canvas');
  canvas.className = 'cp-shape-canvas';
  shapeWrap.appendChild(canvas);
  drawSilhouette(canvas, code, entity, { size: sized ? sized.shape : 108 });

  // Outline first (owner, 2026-11-06): this is a game about drawing countries, so the
  // shape is the thing worth leading with, then the flag, then the arms.
  if (emblem) header.append(shapeWrap, flag, emblem, titleWrap);
  else header.append(shapeWrap, flag, titleWrap);
  cardEl.appendChild(header);

  const body = el('div', 'cp-body');
  const facts = el('div', 'cp-facts');

  if (attr.capital) {
    const cap = el('div', 'cp-capital');
    cap.appendChild(el('span', 'cp-capital-label', 'Capital'));
    const capVal = el('span', 'cp-capital-value', attr.capital);
    if (attr.capitalNote) capVal.title = attr.capitalNote;
    cap.appendChild(capVal);
    facts.appendChild(cap);
  }

  // Metrics grid
  const metrics = el('div', 'cp-metrics');
  let anyMetric = false;
  for (const ds of getDatasetList()) {
    const value = ds.values[code];
    if (value == null) continue;
    anyMetric = true;
    const cell = el('div', 'cp-metric');
    const name = el('span', 'cp-metric-name', ds.name);
    name.appendChild(el('span', 'cp-metric-info', 'ⓘ'));
    cell.appendChild(name);
    const t = tone(ds.id, value);
    cell.appendChild(el('span', 'cp-metric-value', formatValue(ds.format, value)));

    // Where this figure falls in the world, as a track with the median marked
    // (TODOS #82). Only the median is labelled: spelling out the lowest and highest
    // country too wrapped to two lines in a three-column panel, and was three figures
    // to skim past instead of one to read against.
    const s = spread(ds.id);
    let word = null;
    if (s) {
      const track = el('div', 'cp-spread');
      track.appendChild(el('div', 'cp-spread-rail'));
      const med = el('div', 'cp-spread-med');
      med.style.left = `${trackPos(ds.id, s.median) * 100}%`;
      const dot = el('div', `cp-spread-dot${t ? ' cp-tone-' + t : ''}`);
      dot.style.left = `${trackPos(ds.id, value) * 100}%`;
      track.append(med, dot);
      cell.appendChild(track);
      cell.appendChild(el('div', 'cp-spread-foot',
        `median ${formatValue(ds.format, s.median)}${s.log ? ' · log scale' : ''}`));
      word = band(ds.id, percentile(ds.id, value));
      cell.appendChild(el('div', `cp-metric-band${t ? ' cp-tone-' + t : ''}`, word));
    }

    // Hover says what the metric measures on a desktop; tapping the tile says it on a
    // phone, which has no hover at all (TODOS #42).
    const desc = el('div', 'cp-metric-desc', ds.blurb);
    const rank = getRank(ds.id, code);
    if (rank) desc.appendChild(el('div', 'cp-metric-rank', `Ranks #${rank.rank} of ${rank.total}`));
    // Where this country's figure came from (TODOS #79) — the per-entity note where
    // there is one, so Taiwan's GDP says IMF/DGBAS rather than World Bank.
    const src = sourceLineFor(ds, code);
    if (src) {
      const line = el('div', 'cp-metric-source');
      line.appendChild(el('span', 'cp-metric-source-label', 'Source'));
      const link = document.createElement('a');
      link.href = src.source.url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = src.text;
      link.title = src.isOverride
        ? `${src.text} — this entity's figures do not come from ${src.source.label}`
        : src.source.provides;
      line.appendChild(link);
      if (src.isOverride) line.appendChild(el('span', 'cp-metric-source-flag', 'not ' + src.source.label));
      desc.appendChild(line);
    }
    desc.hidden = true;
    cell.appendChild(desc);
    cell.title = ds.blurb;
    cell.tabIndex = 0;
    cell.setAttribute('role', 'button');
    cell.setAttribute('aria-label', word
      ? `${ds.name}: ${formatValue(ds.format, value)}, ${word.toLowerCase()}, against a world median of ${formatValue(ds.format, s.median)}. Press for what this measures.`
      : `${ds.name} — what this measures`);
    const toggle = () => { desc.hidden = !desc.hidden; };
    cell.addEventListener('click', toggle);
    cell.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggle(); }
    });
    metrics.appendChild(cell);
  }
  if (anyMetric) facts.appendChild(metrics);

  // Religion and the electricity mix are both short lists of labelled bars, so they
  // sit beside each other wherever the panel is wide enough for two readable columns.
  const breaks = el('div', 'cp-breaks');
  if (Array.isArray(attr.religion) && attr.religion.length) {
    breaks.appendChild(buildBreakdown('Religion', attr.religion, { minPct: RELIGION_MIN_PCT }));
  }

  // Electricity mix (TODOS #29). The year matters here in a way it doesn't for
  // religion — mixes move fast — so it's shown rather than buried in provenance.
  const elec = getElectricity(code);
  if (elec && elec.sources?.length) {
    breaks.appendChild(buildBreakdown('Electricity', elec.sources, {
      minPct: ELECTRICITY_MIN_PCT,
      colors: ELECTRICITY_COLORS,
      note: `Share of electricity generated, ${elec.year}`,
    }));
  }
  if (breaks.children.length) facts.appendChild(breaks);

  if (!attr.capital && !anyMetric && !attr.religion && !elec && !hasTrade(code)) {
    facts.appendChild(el('div', 'cp-empty', 'No extra data for this entity yet.'));
  }

  body.appendChild(facts);
  cardEl.appendChild(body);

  // Trade (TODOS #30). Both directions, then who names this country back. Clicking a
  // partner walks the trail rather than opening a second overlay.
  const exports = partnerSection(code, 'exports', navigateTo);
  const imports = partnerSection(code, 'imports', navigateTo);
  const reciprocal = reciprocalSection(code, navigateTo);
  if (exports || imports || reciprocal) {
    const trade = el('div', 'cp-trade');
    trade.appendChild(el('h3', 'cp-trade-head', 'Trade'));
    for (const sec of [exports, imports, reciprocal]) if (sec) trade.appendChild(sec);
    cardEl.appendChild(trade);
  }

  // World Heritage sites (TODOS #46). Five, famous first, the rest behind one press —
  // Italy has 62 and a panel that opened on all of them would bury everything below it.
  const sites = sitesFor(code);
  if (sites.length) {
    // One row of tiles where there is room for one, the old stacked rows on a phone.
    // The count is derived from the panel's own width so the strip never wraps onto a
    // second row and pushes everything below it off the screen (TODOS #82).
    const inner = cardEl.clientWidth - 44;
    const tiles = inner >= 560;
    const SHOWN = tiles ? Math.max(3, Math.floor(inner / 150)) : 5;
    const sec = el('div', 'cp-heritage');
    sec.appendChild(el('h3', 'cp-heritage-head', `World Heritage sites (${sites.length})`));
    const list = document.createElement('ul');
    list.className = tiles ? 'whs-wall' : 'whs-list';
    if (tiles) list.style.gridTemplateColumns = `repeat(${SHOWN}, minmax(0, 1fr))`;
    const draw = (n) => {
      list.innerHTML = '';
      // Opened out, the tiles go back to filling the row rather than holding the
      // single-row count, so 62 sites wrap instead of becoming 62 slivers.
      if (tiles) list.style.gridTemplateColumns = n > SHOWN ? '' : `repeat(${SHOWN}, minmax(0, 1fr))`;
      for (const site of sites.slice(0, n)) list.appendChild(siteCard(site, { tile: tiles }));
    };
    draw(SHOWN);
    sec.appendChild(list);
    if (sites.length > SHOWN) {
      const more = document.createElement('button');
      more.className = 'btn btn-tool cp-heritage-more';
      more.textContent = `Show all ${sites.length}`;
      more.addEventListener('click', () => {
        const open = list.children.length > SHOWN;
        draw(open ? SHOWN : sites.length);
        more.textContent = open ? `Show all ${sites.length}` : 'Show fewer';
      });
      sec.appendChild(more);
    }
    cardEl.appendChild(sec);
  }

  // Attribution — most outlines are geoBoundaries (CC BY 4.0); the entities it lacks
  // (dependencies, de-facto states) fall back to Natural Earth, which is public domain.
  cardEl.appendChild(el('div', 'cp-credit', 'Outlines © geoBoundaries (CC BY 4.0) · Natural Earth'));
}

// Shared labelled-bar breakdown, used by religion and the electricity mix (TODOS #29)
// and ready for export products (TODOS #32). `colors` maps a row name to a bar colour;
// without it every bar uses the default accent, which is what religion wants.
function buildBreakdown(label, items, { minPct = 5, colors = null, note = null } = {}) {
  const wrap = el('div', 'cp-religion');
  wrap.appendChild(el('div', 'cp-section-label', label));
  if (note) wrap.appendChild(el('div', 'cp-section-note', note));

  // A row with no `pct` is a name the source gave without a number (TODOS #52) —
  // San Marino is simply "Roman Catholic". There is no bar to draw and no share to
  // fold into "Other", so list the names and say the breakdown is missing rather
  // than inventing a denominator.
  if (items.some((r) => r.pct == null)) {
    wrap.appendChild(el('div', 'cp-section-note', 'no breakdown published'));
    for (const r of items) {
      const row = el('div', 'cp-rel-row cp-rel-row--nameonly');
      row.appendChild(el('span', 'cp-rel-name', r.name));
      wrap.appendChild(row);
    }
    return wrap;
  }

  // Sort most→least, keep the significant ones, fold the small tail into "Other".
  const sorted = [...items].sort((a, b) => b.pct - a.pct);
  let major = sorted.filter((r) => r.pct >= minPct);
  if (major.length < 2) major = sorted.slice(0, Math.min(3, sorted.length));
  const majorSet = new Set(major);
  const otherPct = sorted.filter((r) => !majorSet.has(r)).reduce((s, r) => s + r.pct, 0);
  const rows = [...major];
  if (otherPct >= 0.5) {
    // Some sources already carry their own catch-all row (the Factbook's religion
    // lists have a literal "other"), which used to render alongside ours as
    // "other 5.1%" / "Other 3.7%". Merge into it rather than showing both.
    const existing = rows.find((r) => /^other$/i.test(r.name));
    if (existing) existing.pct = Math.round((existing.pct + otherPct) * 10) / 10;
    else rows.push({ name: 'Other', pct: Math.round(otherPct * 10) / 10 });
  }

  const max = Math.max(...rows.map((r) => r.pct), 1);
  for (const r of rows) {
    const row = el('div', 'cp-rel-row');
    row.appendChild(el('span', 'cp-rel-name', r.name));
    const barWrap = el('div', 'cp-rel-bar');
    const bar = el('div', 'cp-rel-fill');
    bar.style.width = `${(r.pct / max) * 100}%`;
    if (colors && colors[r.name]) bar.style.background = colors[r.name];
    barWrap.appendChild(bar);
    row.appendChild(barWrap);
    row.appendChild(el('span', 'cp-rel-pct', `${r.pct}%`));
    wrap.appendChild(row);
  }
  return wrap;
}


function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
