import test from 'node:test';
import assert from 'node:assert/strict';
import { timeScore, timedPoints } from '../../js/quiz/timer.js';
import { PACKS } from '../../js/quiz/packs.js';

const T = { max: 10, grace: 2 };

test('full points through the grace period, then a straight fall to zero at max', () => {
  assert.equal(timeScore(0, T), 100);
  assert.equal(timeScore(2, T), 100);
  assert.equal(timeScore(6, T), 50);
  assert.equal(timeScore(10, T), 0);
  assert.equal(timeScore(30, T), 0);
});

test('a timed answer keeps its share of what it earned: wrong stays zero, partial scales', () => {
  assert.equal(timedPoints(100, 1, T), 100);
  assert.equal(timedPoints(100, 6, T), 50);
  assert.equal(timedPoints(0, 1, T), 0);
  assert.equal(timedPoints(60, 6, T), 30);
  assert.equal(timedPoints(100, 6, null), 100, 'no timer, no change');
});

test('Flag Color Quiz is timed: 10 s, full points for the first 2', () => {
  assert.deepEqual(PACKS.flags.timer, { max: 10, grace: 2 });
  assert.equal(PACKS['flag-pie'].timer, undefined);
});
