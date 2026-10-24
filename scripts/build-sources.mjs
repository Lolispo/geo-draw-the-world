// Build data/sources.json — where every piece of the app's data comes from (TODOS #79).
// Usage: node scripts/build-sources.mjs [outPath]
//
// Nothing in the output is typed by hand. The registry in lib/provenance.mjs supplies
// the label, endpoint and licence — the same values the builds fetch with — and this
// script derives the rest:
//
//   retrieved   the git commit date of each data file the source writes. That is honest
//               for a layer nobody rebuilt today, and it re-dates itself whenever the
//               data is committed, so there is no stamping step to forget.
//   covers      counted off the written files, never asserted.
//   feeds       read out of datasets.json's own `source` field, so a new metric appears
//               here without anyone editing this script.
//
// It refuses to write rather than emit something untrue: an unknown source on a
// dataset, a declared file that does not exist, or a runtime host the JS no longer
// points at all stop the build.
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { SOURCES, assertComplete } from './lib/provenance.mjs';

const OUT = process.argv[2] || 'data/sources.json';

try {
  assertComplete();
} catch (e) {
  // Same refusal as every other guard: a stack trace reads like a crash, and this is
  // the registry telling you it is incomplete.
  console.error(`Refusing to write ${OUT}:\n  ${e.message}`);
  process.exit(1);
}

const problems = [];

// ---- retrieval dates, from git rather than from a stamp --------------------
function lastCommitted(path) {
  try {
    const iso = execFileSync('git', ['log', '-1', '--format=%cI', '--', path], { encoding: 'utf8' }).trim();
    return iso || null;
  } catch {
    return null;
  }
}

// ---- how much each file actually covers ------------------------------------
// A directory of per-country files counts its files; a JSON file counts the keys of
// whichever top-level map it keeps its entities in.
const ENTITY_MAP = ['entities', 'attributes', 'relations', 'electricity', 'emblems', 'heritage', 'flags'];
function coverageOf(path) {
  if (!existsSync(path)) return null;
  if (statSync(path).isDirectory()) return readdirSync(path).filter((f) => f.endsWith('.json')).length;
  let json;
  try { json = JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
  for (const key of ENTITY_MAP) {
    if (json[key] && typeof json[key] === 'object') return Object.keys(json[key]).length;
  }
  // countries-<region>.json is a bare array of shapes.
  if (Array.isArray(json)) return json.length;
  if (Array.isArray(json.countries)) return json.countries.length;
  if (json.countries && typeof json.countries === 'object') return Object.keys(json.countries).length;
  return null;
}

// ---- which datasets each source feeds --------------------------------------
const datasets = JSON.parse(readFileSync('data/datasets.json', 'utf8')).datasets;
const feeds = {};
for (const ds of datasets) {
  if (!ds.source) { problems.push(`dataset "${ds.id}" declares no source`); continue; }
  if (!SOURCES[ds.source]) { problems.push(`dataset "${ds.id}" names unknown source "${ds.source}"`); continue; }
  (feeds[ds.source] = feeds[ds.source] || []).push({ id: ds.id, name: ds.name });
}

// ---- runtime hosts: prove the app still calls what we claim -----------------
// These two are not built from, so there is no file date to check. What can go wrong is
// the registry describing a CDN the code stopped using — so read the host out of the
// code instead of trusting the entry.
function assertRuntimeHost(id, source) {
  const file = source.usedBy;
  if (!existsSync(file)) { problems.push(`runtime source "${id}" names missing file ${file}`); return; }
  const code = readFileSync(file, 'utf8');
  const host = new URL(source.endpoint).origin;
  if (!code.includes(host)) {
    problems.push(`runtime source "${id}" says ${host}, but ${file} does not use it`);
  }
}

// ---- assemble ---------------------------------------------------------------
const out = {};
for (const [id, s] of Object.entries(SOURCES)) {
  const entry = {
    label: s.label,
    url: s.url,
    endpoint: s.endpoint,
    license: s.license,
    licenseUrl: s.licenseUrl || null,
    provides: s.provides,
  };

  if (s.runtime) {
    entry.runtime = true;
    entry.usedBy = s.usedBy;
    assertRuntimeHost(id, s);
  } else {
    const files = [];
    for (const path of s.writes) {
      if (!existsSync(path)) { problems.push(`source "${id}" writes ${path}, which does not exist`); continue; }
      files.push({ path, retrieved: lastCommitted(path), covers: coverageOf(path) });
    }
    entry.files = files;
    // One date for the row: the most recent of the files it writes.
    entry.retrieved = files.map((f) => f.retrieved).filter(Boolean).sort().pop() || null;
    entry.covers = Math.max(0, ...files.map((f) => f.covers || 0)) || null;
  }

  if (feeds[id]) entry.datasets = feeds[id];
  out[id] = entry;
}

if (problems.length) {
  console.error('Refusing to write data/sources.json:\n  ' + problems.join('\n  '));
  process.exit(1);
}

writeFileSync(OUT, JSON.stringify({
  generated: 'scripts/build-sources.mjs — do not edit by hand; re-run after any data build',
  sources: out,
}, null, 2) + '\n');

console.log(`Wrote ${Object.keys(out).length} sources to ${OUT}`);
for (const [id, s] of Object.entries(out)) {
  const age = s.retrieved ? `${Math.floor((Date.now() - Date.parse(s.retrieved)) / 86400000)}d ago` : 'live';
  console.log(`  ${id.padEnd(20)} ${String(s.covers ?? '—').padStart(5)} entities  ${age.padStart(9)}`
    + `  ${s.datasets ? s.datasets.length + ' metrics' : ''}`);
}
