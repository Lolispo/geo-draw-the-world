import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRound, GAME_TYPE_FROM, gameTypesOn } from '../../js/quiz/round.js';
import { dailySeed } from '../../js/quiz/daily.js';
import { makeQuizData } from '../../js/quiz/data.js';
import { checkQuestion } from '../../js/quiz/audit.js';
import { measureShares, MIN_SHARE_SEEN } from '../../js/flag-colors.js';
import * as flagPie from '../../js/quiz/generators/flag-pie.js';
import { sweep, assertShape } from './helpers.mjs';
import { loadRaw } from './fixtures.mjs';

const raw = loadRaw();
const qd = makeQuizData(raw, { territories: false });
const byCode = Object.fromEntries(raw.flags.map((f) => [f.code, f]));

test('every flag has shares lined up with its colours, summing to 1', () => {
  for (const f of raw.flags) {
    assert.equal(f.shares?.length, f.colors.length, f.code);
    assert.ok(f.shares.every((s) => s >= 0 && s <= 1), f.code);
    assert.ok(Math.abs(f.shares.reduce((a, b) => a + b, 0) - 1) < 1e-6, f.code);
  }
});

test('measureShares: nearest curated colour within tolerance, the rest left out', () => {
  const px = (r, g, b, a = 255) => [r, g, b, a];
  // Three blue-ish (one drifted), one white, one far-off green, one transparent.
  const rgba = Uint8ClampedArray.from([
    ...px(0, 35, 149), ...px(0, 38, 84), ...px(0, 35, 149), ...px(255, 255, 255), ...px(0, 200, 0), ...px(255, 0, 0, 0),
  ]);
  const { shares, unmatched } = measureShares(rgba, ['#002395', '#FFFFFF']);
  assert.deepEqual(shares, [0.75, 0.25]);
  assert.ok(Math.abs(unmatched - 0.2) < 1e-9);
  assert.ok(MIN_SHARE_SEEN > 0);
});

test('flag-pie: valid, four flags, and the pie is the answer\'s own', () => {
  const { out, hits } = sweep(flagPie.generate, qd, { seeds: 40 });
  for (const b of ['easy', 'medium', 'hard']) assert.ok(hits[b] > 0, b);
  for (const { q } of out) {
    assertShape(assert, q, qd);
    assert.equal(checkQuestion(q, qd), null, `${q.reveal} → ${checkQuestion(q, qd)}`);
    assert.equal(q.choices.length, 4);
    assert.equal(q.choices[q.answer].code, q.flag);
    assert.deepEqual(q.pie.shares, byCode[q.flag].shares);
    assert.equal(q.pictures, 'flag');
    assert.ok(!q.flagsShown);
  }
});

test('flag-pie: look-alike pies are never offered together', () => {
  assert.ok(flagPie.pieDistance(byCode.id, byCode.mc) < flagPie.NEAR_IDENTICAL);
  assert.ok(flagPie.pieDistance(byCode.td, byCode.ro) < flagPie.NEAR_IDENTICAL);
  const pairs = [['id', 'mc'], ['td', 'ro'], ['id', 'pl']];
  for (const { q } of sweep(flagPie.generate, qd, { seeds: 80 }).out) {
    const cs = q.choices.map((c) => c.code);
    for (const [a, b] of pairs) assert.ok(!(cs.includes(a) && cs.includes(b)), `${a}+${b} in ${cs}`);
  }
});

test('flag-pie: look-alikes share the most colours available, and replays vary', () => {
  const pool = raw.flags.filter((f) => flagPie.pieTrusted(f) && qd.inPool(f.code));
  const ds = flagPie.pieDecoys(byCode.fr, pool);
  assert.equal(ds.length, 6);
  for (const d of ds) assert.equal(d.shared, 3, d.f.code);
  const offered = new Map();
  for (const { q } of sweep(flagPie.generate, qd, { seeds: 80 }).out) {
    const set = q.choices.map((c) => c.code).sort().join();
    if (!offered.has(q.flag)) offered.set(q.flag, new Set());
    offered.get(q.flag).add(set);
  }
  assert.ok([...offered.values()].some((s) => s.size > 1), 'some flag gets different decoys on different seeds');
});

// Recorded before flag-pie existed. Adding a game type must not change a daily that
// was already scheduled when it shipped.
const BEFORE_FLAG_PIE = {
  "2026-11-28": [
    "Which became independent first? | Greece 1830 · United Arab Emirates 1971 · Kazakhstan 1991",
    "How big are Kenya's exports, as a share of its GDP? | Kenya 16.7%",
    "Pick the top 3 by GDP per capita | Ireland $107k · Switzerland $104k · United States $82.6k",
    "Do Senegal and Kyrgyzstan together have a bigger economy (GDP) than Papua New Guinea? | Senegal $30.7B + Kyrgyzstan $15.2B = $45.9B · Papua New Guinea $30.8B",
    "Whose coat of arms is this? | Saint Vincent · North America"
  ]
};

test('dailies before flag-pie\'s start date build exactly as before it existed', () => {
  for (const [day, want] of Object.entries(BEFORE_FLAG_PIE)) {
    assert.ok(day < GAME_TYPE_FROM['flag-pie']);
    const qs = buildRound({ seed: dailySeed(day), mode: 'daily', day }, raw);
    assert.deepEqual(qs.map((q) => `${q.prompt} | ${q.reveal}`), want, day);
  }
});

test('flag-pie joins the daily on its start date and random rounds straight away', () => {
  const from = GAME_TYPE_FROM['flag-pie'];
  assert.ok(!gameTypesOn('2026-11-28').includes('flag-pie'));
  assert.ok(gameTypesOn(from).includes('flag-pie'));
  for (let d = 1; d <= 58; d++) {
    const day = `2026-${d <= 30 ? '10' : '11'}-${String(((d - 1) % 30) + 1).padStart(2, '0')}`;
    const qs = buildRound({ seed: dailySeed(day), mode: 'daily', day }, raw);
    assert.ok(!qs.some((q) => q.type === 'flag-pie'), day);
  }
  let seen = 0;
  for (let s = 1; s <= 200; s++) seen += buildRound({ seed: s, mode: 'hard' }, raw).filter((q) => q.type === 'flag-pie').length;
  assert.ok(seen > 0);
});
