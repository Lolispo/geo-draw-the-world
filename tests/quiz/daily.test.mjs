import test from 'node:test';
import assert from 'node:assert/strict';
import { localDateKey, dailyNumber, DAILY_EPOCH, loadDaily, recordAnswer, finishDaily, streak, resultLine } from '../../js/quiz/daily.js';

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

test('local date key is zero-padded local time', () => {
  assert.equal(localDateKey(new Date(2026, 0, 5, 23, 30)), '2026-01-05');
});

test('daily number counts from the epoch', () => {
  assert.equal(dailyNumber(DAILY_EPOCH), 1);
  const [y, m, d] = DAILY_EPOCH.split('-').map(Number);
  assert.equal(dailyNumber(localDateKey(new Date(y, m - 1, d + 9))), 10);
});

test('recordAnswer appends in order and refuses an already-answered index', () => {
  const s = memoryStorage();
  assert.equal(recordAnswer('2026-11-27', 0, 1, 100, '🟩', s), true);
  assert.equal(recordAnswer('2026-11-27', 0, 0, 0, '🟥', s), false);
  assert.equal(recordAnswer('2026-11-27', 2, 0, 100, '🟩', s), false);
  assert.equal(recordAnswer('2026-11-27', 1, 55, 60, '🟨', s), true);
  const e = loadDaily('2026-11-27', s);
  assert.deepEqual(e.answers, [1, 55]);
  assert.deepEqual(e.marks, ['🟩', '🟨']);
  assert.equal(e.score, 160);
  assert.equal(e.done, false);
  finishDaily('2026-11-27', s);
  assert.equal(loadDaily('2026-11-27', s).done, true);
  assert.equal(recordAnswer('2026-11-27', 2, 0, 100, '🟩', s), false);
});

test('streak counts consecutive finished days ending today or yesterday', () => {
  const s = memoryStorage();
  for (const k of ['2026-11-25', '2026-11-26', '2026-11-27']) { recordAnswer(k, 0, 0, 100, '🟩', s); finishDaily(k, s); }
  assert.equal(streak('2026-11-27', s), 3);
  assert.equal(streak('2026-11-28', s), 3);
  assert.equal(streak('2026-11-29', s), 0);
  const g = memoryStorage();
  for (const k of ['2026-11-25', '2026-11-27']) { recordAnswer(k, 0, 0, 100, '🟩', g); finishDaily(k, g); }
  assert.equal(streak('2026-11-27', g), 1);
  recordAnswer('2026-11-28', 0, 0, 100, '🟩', g);
  assert.equal(streak('2026-11-28', g), 1, 'unfinished today does not count');
});

test('result line', () => {
  const entry = { marks: ['🟩', '🟩', '🟥', '🟩', '🟨'], score: 380 };
  assert.equal(resultLine(DAILY_EPOCH, entry), 'Know the World Daily #1 · 🟩🟩🟥🟩🟨 · 380/500 · geo.petterbuilds.com');
});

test('broken storage reads as empty', () => {
  const s = memoryStorage();
  s.setItem('geo-quiz-daily', '{not json');
  assert.equal(loadDaily('2026-11-27', s), null);
});
