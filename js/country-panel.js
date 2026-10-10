// Country Showcase panel (TODOS #18). Press a country anywhere it's listed to see
// its flag, shape silhouette, and every metric + attribute we have.
// Reusable modal: openCountryPanel(code) from any screen.

import {
  loadDatasets, loadEntities, loadAttributes, loadElectricity,
  getEntity, getAttributes, getElectricity, getDatasetList, formatValue, getRank,
} from './datasets.js';
import { flagUrl } from './flags.js';
import { drawSilhouette } from './silhouette.js';

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

let overlay = null;
let cardEl = null;
let dataPromise = null;
let escHandler = null;

function ensureData() {
  if (!dataPromise) {
    dataPromise = Promise.all([loadDatasets(), loadEntities(), loadAttributes(), loadElectricity()]);
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
  overlay.appendChild(cardEl);
  document.body.appendChild(overlay);
}

export async function openCountryPanel(code) {
  buildShell();
  cardEl.innerHTML = '<div class="cp-loading">Loading…</div>';
  overlay.classList.add('open');
  escHandler = (e) => { if (e.key === 'Escape') closeCountryPanel(); };
  document.addEventListener('keydown', escHandler);

  await ensureData();
  render(code);
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

  // Close button
  const close = el('button', 'cp-close', '✕');
  close.setAttribute('aria-label', 'Close');
  close.addEventListener('click', closeCountryPanel);
  cardEl.appendChild(close);

  // Header: flag + name + type/continent
  const header = el('div', 'cp-header');
  const flag = document.createElement('img');
  flag.className = 'cp-flag';
  flag.src = flagUrl(code, 'w320');
  flag.alt = `Flag of ${name}`;
  flag.addEventListener('error', () => { flag.style.display = 'none'; });
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
  header.append(flag, titleWrap);
  cardEl.appendChild(header);

  // Body: silhouette + facts
  const body = el('div', 'cp-body');

  // Silhouette
  const shapeWrap = el('div', 'cp-shape');
  const canvas = document.createElement('canvas');
  canvas.className = 'cp-shape-canvas';
  shapeWrap.appendChild(canvas);
  body.appendChild(shapeWrap);
  drawSilhouette(canvas, code, entity, { size: 150 });

  // Facts column
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
    cell.appendChild(el('span', 'cp-metric-value', formatValue(ds.format, value)));
    const rank = getRank(ds.id, code);
    if (rank) cell.appendChild(el('span', 'cp-metric-rank', `#${rank.rank} of ${rank.total}`));
    // Hover says what the metric measures on a desktop; tapping the tile says it on a
    // phone, which has no hover at all (TODOS #42).
    const desc = el('div', 'cp-metric-desc', ds.blurb);
    desc.hidden = true;
    cell.appendChild(desc);
    cell.title = ds.blurb;
    cell.tabIndex = 0;
    cell.setAttribute('role', 'button');
    cell.setAttribute('aria-label', `${ds.name} — what this measures`);
    const toggle = () => { desc.hidden = !desc.hidden; };
    cell.addEventListener('click', toggle);
    cell.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggle(); }
    });
    metrics.appendChild(cell);
  }
  if (anyMetric) facts.appendChild(metrics);

  // Religion
  if (Array.isArray(attr.religion) && attr.religion.length) {
    facts.appendChild(buildBreakdown('Religion', attr.religion, { minPct: RELIGION_MIN_PCT }));
  }

  // Electricity mix (TODOS #29). The year matters here in a way it doesn't for
  // religion — mixes move fast — so it's shown rather than buried in provenance.
  const elec = getElectricity(code);
  if (elec && elec.sources?.length) {
    facts.appendChild(buildBreakdown('Electricity', elec.sources, {
      minPct: ELECTRICITY_MIN_PCT,
      colors: ELECTRICITY_COLORS,
      note: `Share of electricity generated, ${elec.year}`,
    }));
  }

  if (!attr.capital && !anyMetric && !attr.religion && !elec) {
    facts.appendChild(el('div', 'cp-empty', 'No extra data for this entity yet.'));
  }

  body.appendChild(facts);
  cardEl.appendChild(body);

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
