import test from 'node:test';
import assert from 'node:assert/strict';
import { pieSlices, MIN_SLICE } from '../js/pie.js';

const TAU = Math.PI * 2;
const span = (s) => s.end - s.start;

test('slices run largest first, clockwise from 12 o\'clock, and close the circle', () => {
  const s = pieSlices(['#a', '#b', '#c'], [0.2, 0.5, 0.3]);
  assert.deepEqual(s.map((x) => x.color), ['#b', '#c', '#a']);
  assert.equal(s[0].start, -Math.PI / 2);
  for (let i = 1; i < s.length; i++) assert.equal(s[i].start, s[i - 1].end);
  assert.ok(Math.abs(s[2].end - (TAU - Math.PI / 2)) < 1e-9);
  assert.ok(Math.abs(span(s[0]) - TAU * 0.5) < 1e-9);
});

test('a tiny slice gets the minimum angle, and the rest keep their proportions', () => {
  const s = pieSlices(['#red', '#yellow', '#blue'], [0.6, 0.002, 0.398]);
  const tiny = s.find((x) => x.color === '#yellow');
  assert.ok(Math.abs(span(tiny) - MIN_SLICE) < 1e-9);
  const [red, blue] = ['#red', '#blue'].map((c) => span(s.find((x) => x.color === c)));
  assert.ok(Math.abs(red / blue - 0.6 / 0.398) < 1e-9);
  assert.ok(Math.abs(s.reduce((a, x) => a + span(x), 0) - TAU) < 1e-9);
});

test('several small slices all reach the minimum, even when widening pushes another under', () => {
  const shares = [0.9, 0.02, 0.02, 0.02, 0.02, 0.02];
  const s = pieSlices(shares.map((_, i) => `#${i}`), shares, { minAngle: TAU * 0.025 });
  for (const x of s) assert.ok(span(x) >= TAU * 0.025 - 1e-9, x.color);
  assert.ok(Math.abs(s.reduce((a, x) => a + span(x), 0) - TAU) < 1e-9);
});

test('zero shares are not drawn; nothing at all draws nothing', () => {
  assert.equal(pieSlices(['#a', '#b'], [1, 0]).length, 1);
  assert.deepEqual(pieSlices(['#a'], [0]), []);
});
