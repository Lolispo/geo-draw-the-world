import test from 'node:test';
import assert from 'node:assert/strict';
import { GRID, MASK_WORDS } from '../../js/raster.js';
import { pixelGrid, pixelGridCached, maskBounds, hamming } from '../../js/pixel-shape.js';
import { buildTypeRound } from '../../js/quiz/round.js';
import { makeQuizData } from '../../js/quiz/data.js';
import { PACKS, packRoundCfg } from '../../js/quiz/packs.js';
import { pixelAudit } from '../../js/quiz/audit.js';
import { loadRaw } from './fixtures.mjs';

const raw = loadRaw();

function maskOf(fn) {
  const m = new Uint32Array(MASK_WORDS);
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      if (fn(x, y)) { const b = y * GRID + x; m[b >>> 5] |= 1 << (b & 31); }
    }
  }
  return m;
}

test('a filled square fills every cell, cropped to its own bounds', () => {
  const m = maskOf((x, y) => x >= 20 && x < 44 && y >= 30 && y < 54);
  assert.deepEqual(maskBounds(m), { x0: 20, y0: 30, x1: 44, y1: 54 });
  const g = pixelGrid(m, 12);
  assert.equal(g.cells, '1'.repeat(144));
  assert.equal(g.fallback, false);
});

test('a thin diagonal that half-coverage would break up falls back to a looser fill', () => {
  const m = maskOf((x, y) => y >= 5 && y < 75 && Math.abs(x - y) < 1);
  const g = pixelGrid(m, 12);
  assert.equal(g.fallback, true);
  assert.ok(g.filled >= 12, `filled ${g.filled}`);
});

test('an empty mask is degenerate rather than throwing', () => {
  const g = pixelGrid(new Uint32Array(MASK_WORDS), 12);
  assert.equal(g.filled, 0);
  assert.equal(g.degenerate, true);
});

test('real countries: Italy is plain, Chile needs the fallback, most of the world is playable at 12', () => {
  const qd = makeQuizData(raw);
  assert.equal(pixelGridCached(qd.mask('it'), 12).fallback, false);
  assert.equal(pixelGridCached(qd.mask('cl'), 12).fallback, true);
  const rows = pixelAudit(raw);
  const out = rows.filter((r) => r.grids[12].degenerate);
  assert.ok(out.length < rows.length / 20, `${out.length} out of ${rows.length}`);
  for (const r of rows.filter((x) => x.fame <= 80)) assert.equal(r.grids[12].degenerate, false, r.code);
});

test('pixel levels: every question carries its country\'s grid, decoys are nameable and look different', () => {
  const qd = makeQuizData(raw);
  for (const level of ['medium', 'hard']) for (const pool of Object.keys(PACKS.shape.pools)) {
    const cfg = packRoundCfg(PACKS.shape, level, pool);
    for (let seed = 1; seed <= 15; seed++) {
      for (const q of buildTypeRound({ seed, type: 'shape', size: 10, mix: cfg.mix, opts: cfg.opts }, raw)) {
        assert.equal(q.res, cfg.opts.res);
        const g = pixelGridCached(qd.mask(q.shape), q.res);
        assert.equal(q.pixels, g.cells);
        assert.equal(g.degenerate, false);
        for (const c of q.codes.filter((x) => x !== q.shape)) {
          assert.ok(qd.familiar(c, Math.max(140, qd.famRank(q.shape))), `${level}/${pool}: decoy ${c} for ${q.shape}`);
          assert.ok(hamming(pixelGridCached(qd.mask(c), q.res).cells, q.pixels) > 1, `${c} looks like ${q.shape}`);
        }
      }
    }
  }
});

test('the quiz\'s own shape question is unchanged: no pixels, no similarity option', () => {
  const qs = buildTypeRound({ seed: 4, type: 'shape', size: 10, mix: { gentle: 1 } }, raw);
  assert.ok(qs.every((q) => q.res === undefined && q.pixels === undefined));
});
