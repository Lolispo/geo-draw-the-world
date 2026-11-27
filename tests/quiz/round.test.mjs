import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRound, DAILY_CURVE } from '../../js/quiz/round.js';
import { scoreAnswer, markFor } from '../../js/quiz/score.js';
import { dailySeed } from '../../js/quiz/daily.js';
import { loadRaw } from './fixtures.mjs';

const raw = loadRaw();
const counts = (qs) => qs.reduce((m, q) => ((m[q.type] = (m[q.type] || 0) + 1), m), {});

test('random rounds never repeat a question', () => {
  for (const mode of ['easy', 'hard']) {
    for (let seed = 1; seed <= 100; seed++) {
      const qs = buildRound({ seed, mode }, raw, { territories: false });
      assert.equal(new Set(qs.map((q) => q.prompt + q.reveal)).size, qs.length);
    }
  }
});

test('daily is 5 questions on the curve, one per type', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const qs = buildRound({ seed, mode: 'daily' }, raw);
    assert.equal(qs.length, 5);
    assert.deepEqual(qs.map((q) => q.band), DAILY_CURVE);
    for (const n of Object.values(counts(qs))) assert.equal(n, 1);
  }
});

test('same seed, same round', () => {
  const a = buildRound({ seed: 42, mode: 'easy' }, raw, { territories: false });
  const b = buildRound({ seed: 42, mode: 'easy' }, raw, { territories: false });
  assert.deepEqual(a, b);
});

test('daily is identical for territories on/off', () => {
  const seed = dailySeed('2026-11-27');
  assert.deepEqual(
    buildRound({ seed, mode: 'daily' }, raw, { territories: true }),
    buildRound({ seed, mode: 'daily' }, raw, { territories: false }),
  );
});

test('easy rounds keep gentle and easy slots to familiar countries', async () => {
  const { makeQuizData } = await import('../../js/quiz/data.js');
  const qd = makeQuizData(raw, { territories: false });
  for (let seed = 1; seed <= 30; seed++) {
    for (const q of buildRound({ seed, mode: 'easy' }, raw, { territories: false })) {
      if (q.band !== 'gentle' && q.band !== 'easy') continue;
      for (const c of q.codes) assert.ok(qd.famRank(c) <= 80 || q.type === 'best-in-group' || q.type === 'trade', `${q.type} ${c}`);
    }
  }
});

test('scoring', () => {
  const choice = { type: 'bigger', answer: 1, choices: [{}, {}] };
  assert.equal(scoreAnswer(choice, 1), 100);
  assert.equal(scoreAnswer(choice, 0), 0);
  const pct = { type: 'slider', answer: 60, slider: { min: 0, max: 100, tolerance: 25 } };
  assert.equal(scoreAnswer(pct, 60), 100);
  assert.equal(scoreAnswer(pct, 72.5), 50);
  assert.equal(scoreAnswer(pct, 35), 0);
  assert.equal(scoreAnswer(pct, 0), 0);
  const life = { type: 'slider', answer: 75, slider: { min: 40, max: 90, tolerance: 10 } };
  assert.equal(scoreAnswer(life, 70), 50);
  assert.equal(markFor(choice, 100), '🟩');
  assert.equal(markFor(choice, 0), '🟥');
  assert.equal(markFor(pct, 100), '🟩');
  assert.equal(markFor(pct, 50), '🟨');
  assert.equal(markFor(pct, 49), '🟥');
});
