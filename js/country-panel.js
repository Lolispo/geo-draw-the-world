// Country Showcase panel (TODOS #18). Press a country anywhere it's listed to see
// its flag, shape silhouette, and every metric + attribute we have.
// Reusable modal: openCountryPanel(code) from any screen.

import {
  loadDatasets, loadEntities, loadAttributes,
  getEntity, getAttributes, getDatasetList, formatValue, getRank,
} from './datasets.js';
import { getCountryByCode } from './geo-data.js';
import { traceRing } from './utils.js';

const FLAG_CDN = 'https://flagcdn.com/w320/';
const RELIGION_MIN_PCT = 5; // religions below this % are grouped into "Other"

let overlay = null;
let cardEl = null;
let dataPromise = null;
let escHandler = null;

function ensureData() {
  if (!dataPromise) {
    dataPromise = Promise.all([loadDatasets(), loadEntities(), loadAttributes()]);
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
  flag.src = `${FLAG_CDN}${code}.png`;
  flag.alt = `Flag of ${name}`;
  flag.addEventListener('error', () => { flag.style.display = 'none'; });
  const titleWrap = el('div', 'cp-title-wrap');
  titleWrap.appendChild(el('h2', 'cp-name', name));
  const sub = [];
  if (entity?.continent) sub.push(entity.continent);
  if (entity?.sovereign) sub.push(`Territory of ${entity.sovereign}`);
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
    facts.appendChild(buildReligion(attr.religion));
  }

  if (!attr.capital && !anyMetric && !attr.religion) {
    facts.appendChild(el('div', 'cp-empty', 'No extra data for this entity yet.'));
  }

  body.appendChild(facts);
  cardEl.appendChild(body);

  // Attribution — country outlines are from geoBoundaries (CC BY 4.0).
  cardEl.appendChild(el('div', 'cp-credit', 'Outlines © geoBoundaries (CC BY 4.0)'));
}

function buildReligion(religion) {
  const wrap = el('div', 'cp-religion');
  wrap.appendChild(el('div', 'cp-section-label', 'Religion'));

  // Sort most→least, keep the significant ones, fold the small tail into "Other".
  const sorted = [...religion].sort((a, b) => b.pct - a.pct);
  let major = sorted.filter((r) => r.pct >= RELIGION_MIN_PCT);
  if (major.length < 2) major = sorted.slice(0, Math.min(3, sorted.length));
  const majorSet = new Set(major);
  const otherPct = sorted.filter((r) => !majorSet.has(r)).reduce((s, r) => s + r.pct, 0);
  const rows = [...major];
  if (otherPct >= 0.5) rows.push({ name: 'Other', pct: Math.round(otherPct * 10) / 10 });

  const max = Math.max(...rows.map((r) => r.pct), 1);
  for (const r of rows) {
    const row = el('div', 'cp-rel-row');
    row.appendChild(el('span', 'cp-rel-name', r.name));
    const barWrap = el('div', 'cp-rel-bar');
    const bar = el('div', 'cp-rel-fill');
    bar.style.width = `${(r.pct / max) * 100}%`;
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
