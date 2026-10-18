// Build data/heritage.json — UNESCO World Heritage sites per country (TODOS #46).
//
// Source: UNESCO's own open-data portal, which serves the official List as CSV:
//   https://data.unesco.org/api/explore/v2.1/catalog/datasets/whc001/exports/csv
// `?select=` trims it from 17 MB (descriptions in six languages) to about 100 KB.
//
// Two routes were tried first and are recorded here so nobody repeats them:
//   - whc.unesco.org/en/list/xml/ sits behind a Cloudflare challenge. It answers 403
//     with "Just a moment..." to curl AND to a real headless browser.
//   - Wikidata over-counts badly, because components of serial sites each carry the
//     site's properties. Counting P1435=World Heritage Site gives 3429 items against
//     ~1223 real sites; deduplicating the P757 site ID by its prefix (a component is
//     "1234-001") gets much closer but still lands at 1432, with only 3 of 16 spot-
//     checked countries within 2 of their published figure. This portal gives 1273
//     sites and matches published per-country figures exactly.
//
// Transboundary rule: a site shared between states counts for EACH state party. That
// is UNESCO's own convention — it is why the per-country figures sum to more than the
// number of sites (1378 vs 1273) — and it means "Hungary has 9" agrees with UNESCO.
//
// Usage: node scripts/build-heritage.mjs [outPath]
import { readFileSync, writeFileSync } from 'node:fs';

const OUT = process.argv[2] || 'data/heritage.json';
const COLS = 'id_no,name_en,iso_codes,states_names,category,transboundary,date_inscribed,danger';
const URL = `https://data.unesco.org/api/explore/v2.1/catalog/datasets/whc001/exports/csv?select=${COLS}`;

// The list has been over 1000 sites since 2012. Anything near empty means the portal
// changed shape or failed, and shipping that silently is the failure mode TODOS #46
// warned about, so refuse rather than write a dataset of zeros.
const MIN_SITES = 900;

const entities = JSON.parse(readFileSync('data/entities.json', 'utf8')).entities;

const resp = await fetch(URL, { headers: { 'User-Agent': 'geo-draw-the-world/1.0 (hobby project)' } });
if (!resp.ok) throw new Error(`UNESCO data portal: HTTP ${resp.status}`);
const text = await resp.text();

// Semicolon-separated, and names contain commas but no semicolons or quotes.
const lines = text.replace(/^﻿/, '').trim().split('\n');
const head = lines[0].split(';');
const rows = lines.slice(1).map((line) => {
  const cells = line.split(';');
  return Object.fromEntries(head.map((h, i) => [h, (cells[i] ?? '').trim()]));
});

if (rows.length < MIN_SITES) throw new Error(`only ${rows.length} sites parsed — refusing to ship that`);

const CATEGORY = { Cultural: 'cultural', Natural: 'natural', Mixed: 'mixed' };
const per = new Map();
const unknown = new Set();
let transboundary = 0;

for (const r of rows) {
  if (r.transboundary === 'True') transboundary++;
  const codes = r.iso_codes.split(',').map((c) => c.trim().toLowerCase()).filter(Boolean);
  for (const code of codes) {
    if (!entities[code]) { unknown.add(`${code} (${r.states_names})`); continue; }
    if (!per.has(code)) per.set(code, { total: 0, cultural: 0, natural: 0, mixed: 0, danger: 0 });
    const e = per.get(code);
    e.total++;
    const cat = CATEGORY[r.category];
    if (cat) e[cat]++;
    if (r.danger === 'True') e.danger++;
  }
}

// A country with no sites has zero sites — that is a fact about the country, not a hole
// in the data, and the coverage board must not read it as a gap. Every entity that can
// hold one gets a number; the Channel Islands aggregate is not a state party and is
// left out rather than given a misleading 0.
const heritage = {};
for (const code of Object.keys(entities).sort()) {
  if (entities[code].type === 'aggregate') continue;
  heritage[code] = per.get(code) || { total: 0, cultural: 0, natural: 0, mixed: 0, danger: 0 };
}

writeFileSync(OUT, `${JSON.stringify({
  source: 'UNESCO World Heritage Centre, via data.unesco.org (whc001)',
  retrieved: new Date().toISOString().slice(0, 10),
  sites: rows.length,
  transboundary,
  heritage,
}, null, 1)}\n`);

const withSites = Object.values(heritage).filter((h) => h.total > 0).length;
const top = Object.entries(heritage).sort((a, b) => b[1].total - a[1].total).slice(0, 8);
console.log(`${OUT} — ${rows.length} sites (${transboundary} transboundary, counted for each state party)`);
console.log(`  ${withSites} countries hold at least one; ${Object.keys(heritage).length - withSites} have a true zero`);
console.log(`  top: ${top.map(([c, h]) => `${entities[c].name} ${h.total}`).join(', ')}`);
if (unknown.size) console.log(`  ignored ${unknown.size} state(s) not in the registry: ${[...unknown].join(', ')}`);
