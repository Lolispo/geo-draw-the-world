import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTypeRound } from '../../js/quiz/round.js';
import { PACKS, packScoreKey, packTitle, packLevel, packPool, packRoundCfg } from '../../js/quiz/packs.js';
import { GENERATORS } from '../../js/quiz/generators/index.js';
import { loadRaw } from './fixtures.mjs';

const raw = loadRaw();

test('every pack names a generator and full rounds build for every level', () => {
  for (const pack of Object.values(PACKS)) {
    assert.ok(GENERATORS[pack.type], `${pack.id}: generator ${pack.type}`);
    for (const level of Object.keys(pack.levels || { _: 1 })) for (const pool of Object.keys(pack.pools || { _: 1 })) {
      const cfg = packRoundCfg(pack, level, pool);
      for (let seed = 1; seed <= 20; seed++) {
        const qs = buildTypeRound({ seed, type: pack.type, size: pack.size, mix: cfg.mix, opts: cfg.opts }, raw);
        assert.equal(qs.length, pack.size, `${pack.id}/${level}/${pool} seed ${seed}`);
        assert.ok(qs.every((q) => q.type === pack.type));
        assert.equal(new Set(qs.map((q) => q.reveal)).size, qs.length, `${pack.id}/${level}/${pool}: repeated answer`);
      }
    }
  }
});

test('type rounds are deterministic per seed', () => {
  const cfg = packRoundCfg(PACKS.shape, 'easy');
  const a = buildTypeRound({ seed: 7, type: 'shape', size: 10, mix: cfg.mix }, raw);
  const b = buildTypeRound({ seed: 7, type: 'shape', size: 10, mix: cfg.mix }, raw);
  assert.deepEqual(a, b);
});

test('pack keys and titles', () => {
  assert.equal(packScoreKey(PACKS.shape, 'easy'), 'shape-easy');
  assert.equal(packScoreKey(PACKS.shape, 'easy', 'mixed'), 'shape-easy');
  assert.equal(packScoreKey(PACKS.shape, 'hard', 'any'), 'shape-hard-any');
  assert.equal(packScoreKey(PACKS.shape, 'medium', 'known'), 'shape-medium-known');
  assert.equal(packLevel(PACKS.shape, 'nonsense'), 'easy');
  assert.equal(packPool(PACKS.shape, 'nonsense'), 'mixed');
  assert.equal(packTitle(PACKS.shape, 'easy'), 'Guess the Shape · Outline · Mixed');
  assert.equal(packTitle(PACKS.shape, 'hard', 'any'), 'Guess the Shape · 12 × 12 · Anywhere');
  // Flag Color Quiz kept its scores under this key before it became a pack.
  assert.equal(packScoreKey(PACKS.flags), 'flag-quiz-10');
  assert.equal(packTitle(PACKS.flags), 'Flag Color Quiz');
  const flat = { id: 'x', title: 'X' };
  assert.equal(packScoreKey(flat), 'x');
  assert.equal(packTitle(flat), 'X');
});

test('shape pools: well known asks more familiar countries than anywhere', () => {
  const qd = null;
  const fams = (pool) => {
    const cfg = packRoundCfg(PACKS.shape, 'medium', pool);
    let tot = 0, n = 0;
    for (let seed = 1; seed <= 15; seed++) for (const q of buildTypeRound({ seed, type: 'shape', size: 10, mix: cfg.mix, opts: cfg.opts }, raw)) { tot += q.measure; n++; }
    return tot / n;
  };
  const known = fams('known'), any = fams('any');
  assert.ok(known * 2 < any, `known avg fame ${known} vs anywhere ${any}`);
});
