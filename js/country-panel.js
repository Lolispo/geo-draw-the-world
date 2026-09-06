// Country Showcase panel (TODOS #18). Press a country anywhere it's listed to see
// its flag, shape silhouette, and every metric + attribute we have.
// Reusable modal: openCountryPanel(code) from any screen.

import {
  loadDatasets, loadEntities, loadAttributes, loadElectricity,
  getEntity, getAttributes, getElectricity, getDatasetList, formatValue, getRank,
} from './datasets.js';
import { getCountryByCode } from './geo-data.js';
import { flagUrl } from './flags.js';
import { traceRing } from './utils.js';

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
  drawSilhouette(canvas, code, entity);

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
    cell.appendChild(el('span', 'cp-metric-name', ds.name));
    cell.appendChild(el('span', 'cp-metric-value', formatValue(ds.format, value)));
    const rank = getRank(ds.id, code);
    if (rank) cell.appendChild(el('span', 'cp-metric-rank', `#${rank.rank} of ${rank.total}`));
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

// Draw the country's multipolygon, normalized to fit the canvas.
async function drawSilhouette(canvas, code, entity) {
  const ctx = canvas.getContext('2d');
  const cssSize = 150;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = cssSize * dpr;
  canvas.height = cssSize * dpr;
  canvas.style.width = canvas.style.height = `${cssSize}px`;
  ctx.scale(dpr, dpr);

  if (entity && entity.hasGeometry === false) { shapeFallback(ctx, cssSize); return; }

  const country = await getCountryByCode(code);
  if (!country || !country.polygons || !country.polygons.length) { shapeFallback(ctx, cssSize); return; }

  // bbox over all rings
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const ring of country.polygons) {
    for (const [x, y] of ring) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  const pad = 14;
  const w = maxX - minX || 1, h = maxY - minY || 1;
  const scale = Math.min((cssSize - pad * 2) / w, (cssSize - pad * 2) / h);
  const ox = (cssSize - w * scale) / 2 - minX * scale;
  const oy = (cssSize - h * scale) / 2 - minY * scale;

  ctx.beginPath();
  for (const ring of country.polygons) {
    traceRing(ctx, ring.map(([x, y]) => [x * scale + ox, y * scale + oy]), true);
  }
  ctx.fillStyle = country.color || '#7EA6E0';
  ctx.fill('nonzero');
  ctx.lineJoin = 'round';
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.stroke();
}

function shapeFallback(ctx, size) {
  ctx.fillStyle = 'rgba(127,127,127,0.15)';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = 'rgba(127,127,127,0.6)';
  ctx.font = '13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('no shape', size / 2, size / 2);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
