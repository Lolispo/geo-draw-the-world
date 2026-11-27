// The daily's state, per local calendar date. Every answer is written the moment it is
// given and can't be replaced, so leaving and coming back resumes rather than replays.

import { hashSeed } from './rng.js';

export const DAILY_EPOCH = '2026-11-27';
const STORAGE_KEY = 'geo-quiz-daily';
const TOTAL = 500;

const pad = (n) => String(n).padStart(2, '0');
export const localDateKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const dayIndex = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
};
const keyFromIndex = (i) => new Date(i * 86400000).toISOString().slice(0, 10);

export const dailyNumber = (key) => dayIndex(key) - dayIndex(DAILY_EPOCH) + 1;
export const dailySeed = (key) => hashSeed(`daily:${key}`);

const store = (storage) => storage ?? globalThis.localStorage;

// Blocked site data makes storage throw. The day then lives in memory for this page,
// so the round still plays through instead of restarting on every answer.
const memory = new WeakMap();
const memKey = (storage) => store(storage) || memory;

function loadAll(storage) {
  const mem = memory.get(memKey(storage));
  if (mem) return JSON.parse(JSON.stringify(mem));
  try {
    const v = JSON.parse(store(storage).getItem(STORAGE_KEY));
    return v && typeof v === 'object' ? v : {};
  } catch { return {}; }
}
function saveAll(all, storage) {
  try {
    store(storage).setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    memory.set(memKey(storage), JSON.parse(JSON.stringify(all)));
  }
}

export function loadDaily(key, storage) {
  return loadAll(storage)[key] || null;
}

export function recordAnswer(key, index, given, points, mark, storage) {
  const all = loadAll(storage);
  const e = all[key] || { answers: [], marks: [], score: 0, done: false };
  if (e.done || index !== e.answers.length) return false;
  e.answers.push(given);
  e.marks.push(mark);
  e.score += points;
  all[key] = e;
  saveAll(all, storage);
  return true;
}

export function finishDaily(key, storage) {
  const all = loadAll(storage);
  if (!all[key]) return null;
  all[key].done = true;
  saveAll(all, storage);
  return all[key];
}

export function streak(todayKey, storage) {
  const all = loadAll(storage);
  let i = dayIndex(todayKey);
  if (!all[todayKey]?.done) i -= 1;
  let n = 0;
  while (all[keyFromIndex(i)]?.done) { n++; i--; }
  return n;
}

export function resultLine(key, entry) {
  entry = entry || { marks: [], score: 0 };
  return `Know the World Daily #${dailyNumber(key)} · ${entry.marks.join('')} · ${entry.score}/${TOTAL} · geo.petterbuilds.com`;
}
