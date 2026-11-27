import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng, hashSeed, sample, shuffle } from '../../js/quiz/rng.js';

test('makeRng is deterministic', () => {
  const a = makeRng(1), b = makeRng(1);
  const xs = [a(), a(), a(), a(), a()];
  assert.deepEqual(xs, [b(), b(), b(), b(), b()]);
  assert.ok(xs.every((x) => x >= 0 && x < 1));
});

test('hashSeed separates dates', () => {
  assert.equal(hashSeed('2026-11-27'), hashSeed('2026-11-27'));
  assert.notEqual(hashSeed('2026-11-27'), hashSeed('2026-11-28'));
});

test('sample returns distinct items and shuffle keeps them', () => {
  const rng = makeRng(7);
  const s = sample(rng, [1, 2, 3, 4, 5, 6], 4);
  assert.equal(new Set(s).size, 4);
  assert.deepEqual(shuffle(rng, [1, 2, 3]).sort(), [1, 2, 3]);
});
