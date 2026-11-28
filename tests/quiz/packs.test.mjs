import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTypeRound } from '../../js/quiz/round.js';
import { PACKS, packScoreKey, packTitle, packLevel } from '../../js/quiz/packs.js';
import { GENERATORS } from '../../js/quiz/generators/index.js';
import { loadRaw } from './fixtures.mjs';

const raw = loadRaw();

test('every pack names a generator and full rounds build for every level', () => {
  for (const pack of Object.values(PACKS)) {
    assert.ok(GENERATORS[pack.type], `${pack.id}: generator ${pack.type}`);
    for (const [level, cfg] of Object.entries(pack.levels || { _: pack })) {
      for (let seed = 1; seed <= 20; seed++) {
        const qs = buildTypeRound({ seed, type: pack.type, size: pack.size, mix: cfg.mix, opts: cfg.opts }, raw);
        assert.equal(qs.length, pack.size, `${pack.id}/${level} seed ${seed}`);
        assert.ok(qs.every((q) => q.type === pack.type));
        assert.equal(new Set(qs.map((q) => q.reveal)).size, qs.length, `${pack.id}/${level}: repeated answer`);
      }
    }
  }
});

test('type rounds are deterministic per seed', () => {
  const cfg = PACKS.shape.levels.easy;
  const a = buildTypeRound({ seed: 7, type: 'shape', size: 10, mix: cfg.mix }, raw);
  const b = buildTypeRound({ seed: 7, type: 'shape', size: 10, mix: cfg.mix }, raw);
  assert.deepEqual(a, b);
});

test('pack keys and titles', () => {
  assert.equal(packScoreKey(PACKS.shape, 'easy'), 'shape-easy');
  assert.equal(packLevel(PACKS.shape, 'nonsense'), 'easy');
  assert.equal(packTitle(PACKS.shape, 'easy'), 'Guess the Shape · Easy');
  const flat = { id: 'x', title: 'X' };
  assert.equal(packScoreKey(flat), 'x');
  assert.equal(packTitle(flat), 'X');
});
