// Where the app's data comes from (TODOS #79), for the Sources view and for the one
// line under each metric's description.
//
// This module only reads. Every URL, licence and endpoint lives in data/sources.json,
// which scripts/build-sources.mjs generates from the same registry the build scripts
// fetch with — so nothing here can describe a source the builds no longer use.

import { getEntityProvenance } from './datasets.js';

let _data = null;

export async function loadSources() {
  if (_data) return _data;
  try {
    const resp = await fetch('data/sources.json');
    _data = await resp.json();
  } catch {
    _data = { sources: {} };
  }
  return _data;
}

// The whole file, for the integrity check that compares it against the live data.
export function sourcesRaw() {
  return _data;
}

export function allSources() {
  return Object.entries(_data?.sources || {}).map(([id, s]) => ({ id, ...s }));
}

export function getSource(id) {
  const s = _data?.sources?.[id];
  return s ? { id, ...s } : null;
}

// Days since this source's data was last committed, or null for a host the browser
// calls live.
export function ageInDays(source) {
  if (!source?.retrieved) return null;
  return Math.floor((Date.now() - Date.parse(source.retrieved)) / 86400000);
}

export function formatAge(source) {
  const days = ageInDays(source);
  if (days == null) return 'live';
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 60) return `${days} days ago`;
  const months = Math.round(days / 30.44);
  if (months < 24) return `${months} months ago`;
  return `${(days / 365.25).toFixed(1)} years ago`;
}

// Data older than this is not wrong, but it is old enough that a reader should know
// before quoting a figure from it.
export const STALE_DAYS = 365;
export const isStale = (source) => (ageInDays(source) ?? 0) > STALE_DAYS;

// The source line for one metric, for one country.
//
// A country whose figures came from somewhere else says so: the per-entity note always
// wins, because it is the more specific truth. Taiwan's GDP is IMF WEO / DGBAS — the
// World Bank does not publish Taiwan at all — and reading "World Bank" there would be
// the one thing this feature exists to prevent.
export function sourceLineFor(dataset, code) {
  const source = getSource(dataset?.source);
  if (!source) return null;
  const note = code
    ? (source.files || []).map((f) => getEntityProvenance(f.path, code)).find(Boolean)
    : null;
  return {
    text: note || source.label,
    isOverride: !!note && note !== source.label,
    source,
  };
}
