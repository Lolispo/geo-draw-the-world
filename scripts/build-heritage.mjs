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
// The per-site list carries a Commons photo and a fame score, neither of which UNESCO
// can give us: its own images sit on the same Cloudflare-blocked host (whc.unesco.org
// /document/NNNN answers 403 to everything). Wikidata supplies both, keyed on the
// UNESCO site ID (P757) — P18 for the image, sitelink count for fame. 91% of sites get
// a photo. Fame orders each country's list so pressing the United Kingdom shows
// Stonehenge first rather than whatever was inscribed most recently; it is a proxy and
// an imperfect one (it puts Ibiza above the Alhambra), but it gets the top of each
// country's list right, which is the whole job.
//
// Usage: node scripts/build-heritage.mjs [outPath]
import { readFileSync, writeFileSync } from 'node:fs';
import { SOURCES } from './lib/provenance.mjs';

const OUT = process.argv[2] || 'data/heritage.json';
const COLS = 'id_no,name_en,iso_codes,states_names,category,transboundary,date_inscribed,danger';
const URL = `${SOURCES['unesco-whc'].endpoint}?select=${COLS}`;

// The list has been over 1000 sites since 2012. Anything near empty means the portal
// changed shape or failed, and shipping that silently is the failure mode TODOS #46
// warned about, so refuse rather than write a dataset of zeros.
const MIN_SITES = 900;

const entities = JSON.parse(readFileSync('data/entities.json', 'utf8')).entities;

const UA = 'geo-draw-the-world/1.0 (hobby project)';

// Wikidata, keyed on the UNESCO site id. A component of a serial site carries the
// parent's id with a -NNN suffix, so the prefix is the site; the first value wins and
// the max sitelink count across components stands for the whole.
async function wikidata(select, where) {
  const q = `SELECT ${select} WHERE { ?s wdt:P757 ?id . ${where} }`;
  const r = await fetch(SOURCES.wikidata.endpoint, {
    method: 'POST',
    headers: { 'User-Agent': UA, Accept: 'text/csv', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ query: q }),
  });
  if (!r.ok) throw new Error(`Wikidata: HTTP ${r.status}`);
  return (await r.text()).trim().split('\n').slice(1).map((l) => {
    const i = l.indexOf(',');
    return [l.slice(0, i).split('-')[0].trim(), l.slice(i + 1).trim()];
  });
}

const resp = await fetch(URL, { headers: { 'User-Agent': UA } });
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

const photos = new Map();
for (const [id, url] of await wikidata('?id ?img', '?s wdt:P18 ?img .')) {
  const file = decodeURIComponent(url.split('/Special:FilePath/')[1] || '');
  if (file && !photos.has(id)) photos.set(id, file);
}
const fame = new Map();
for (const [id, n] of await wikidata('?id ?links', '?s wikibase:sitelinks ?links .')) {
  fame.set(id, Math.max(fame.get(id) || 0, Number(n) || 0));
}
console.log(`  wikidata: ${photos.size} site photos, ${fame.size} fame scores`);

const CATEGORY = { Cultural: 'cultural', Natural: 'natural', Mixed: 'mixed' };
const per = new Map();
const unknown = new Set();
let transboundary = 0;

for (const r of rows) {
  if (r.transboundary === 'True') transboundary++;
  const codes = r.iso_codes.split(',').map((c) => c.trim().toLowerCase()).filter(Boolean);
  for (const code of codes) {
    if (!entities[code]) { unknown.add(`${code} (${r.states_names})`); continue; }
    if (!per.has(code)) per.set(code, { total: 0, cultural: 0, natural: 0, mixed: 0, danger: 0, sites: [] });
    const e = per.get(code);
    e.total++;
    const cat = CATEGORY[r.category];
    if (cat) e[cat]++;
    if (r.danger === 'True') e.danger++;
    e.sites.push({
      id: r.id_no,
      name: r.name_en,
      cat: cat || 'cultural',
      year: Number(r.date_inscribed) || null,
      ...(photos.has(r.id_no) ? { img: photos.get(r.id_no) } : {}),
      ...(fame.has(r.id_no) ? { fame: fame.get(r.id_no) } : {}),
      ...(r.danger === 'True' ? { danger: true } : {}),
    });
  }
}

// A country with no sites has zero sites — that is a fact about the country, not a hole
// in the data, and the coverage board must not read it as a gap. Every entity that can
// hold one gets a number; the Channel Islands aggregate is not a state party and is
// left out rather than given a misleading 0.
const heritage = {};
for (const code of Object.keys(entities).sort()) {
  if (entities[code].type === 'aggregate') continue;
  const e = per.get(code) || { total: 0, cultural: 0, natural: 0, mixed: 0, danger: 0, sites: [] };
  // Famous first, so the panel opens on Stonehenge and not on whatever was inscribed
  // last year. Ties and the unscored fall back to newest, then to a stable name order.
  e.sites.sort((a, b) => (b.fame || 0) - (a.fame || 0) || (b.year || 0) - (a.year || 0) || a.name.localeCompare(b.name));
  heritage[code] = e;
}

// One global position per site, so "#3" means the same thing in the wall and in a
// country's panel rather than being a different number in each. UNESCO does not rank
// its sites — this is our most-written-about ordering, and the UI has to say so.
{
  const order = [];
  const seen = new Set();
  for (const h of Object.values(heritage)) {
    for (const site of h.sites) {
      if (seen.has(site.id)) continue;
      seen.add(site.id);
      order.push(site);
    }
  }
  order.sort((a, b) => (b.fame || 0) - (a.fame || 0) || a.name.localeCompare(b.name));
  const rankById = new Map(order.map((site, i) => [site.id, i + 1]));
  for (const h of Object.values(heritage)) {
    for (const site of h.sites) site.rank = rankById.get(site.id);
  }
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
const withPhoto = Object.values(heritage).flatMap((h) => h.sites).filter((s2) => s2.img).length;
const allSites = Object.values(heritage).reduce((n, h) => n + h.sites.length, 0);
console.log(`  ${withPhoto} of ${allSites} country-site entries carry a photo`);
for (const c of ['gb', 'it', 'se']) {
  console.log(`  ${entities[c].name} leads with: ${heritage[c].sites.slice(0, 3).map((x) => x.name.split(',')[0]).join(' / ')}`);
}
if (unknown.size) console.log(`  ignored ${unknown.size} state(s) not in the registry: ${[...unknown].join(', ')}`);
