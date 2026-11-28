import { pick, sample, shuffle } from '../rng.js';
import { inFamBand } from './fam.js';
import { maskIoU } from '../../raster.js';
import { pixelGridCached, hamming } from '../../pixel-shape.js';

// Decoys for Guess the Shape come from countries a player could name, so a pixel level is
// hard because of the pixels and not because of the names on the buttons.
const DECOY_FAM = 140;
// The three decoys are drawn from this many of the closest shapes, so the same answer
// does not always come with the same three.
const NEAREST = 6;

function question(rng, qd, ans, others, band) {
  const codes = shuffle(rng, [ans, ...sample(rng, others, 3)]);
  return {
    type: 'shape',
    prompt: 'Which country is this?',
    shape: ans,
    choices: codes.map((c) => ({ label: qd.name(c), code: c })),
    answer: codes.indexOf(ans),
    reveal: `${qd.name(ans)} · ${qd.continent(ans)}`,
    codes,
    band,
    measure: qd.famRank(ans),
  };
}

// opts.res draws the shape as a res×res grid of cells; opts.similar picks decoys that look
// like the answer. Without either, this is the quiz's own shape question, unchanged.
export function generate(rng, band, qd, { maxFam, res, similar } = {}) {
  if (res || similar) return generateSimilar(rng, band, qd, { maxFam, res });
  const drawable = qd.pool.filter((c) => qd.entity(c)?.hasGeometry);
  const cands = inFamBand(qd, drawable, band).filter((c) => !maxFam || qd.familiar(c, maxFam));
  if (!cands.length) return null;
  const ans = pick(rng, cands);
  const sameContinent = band === 'medium' || band === 'hard';
  const others = drawable.filter((c) => c !== ans
    && (!sameContinent || qd.continent(c) === qd.continent(ans))
    && (!maxFam || qd.familiar(c, maxFam)));
  if (others.length < 3) return null;
  return question(rng, qd, ans, others, band);
}

// A country whose grid at `res` is too small to read as a shape is left out of that level.
export function pixelPlayable(qd, code, res) {
  const m = qd.mask(code);
  return !!m && (!res || !pixelGridCached(m, res).degenerate);
}

// The decoys a shape question would draw from, closest shape first.
export function similarShapes(qd, ans, { maxFam, res } = {}) {
  const ansMask = qd.mask(ans);
  const ansCells = res ? pixelGridCached(ansMask, res).cells : null;
  const famCap = maxFam || Math.max(DECOY_FAM, qd.famRank(ans));
  return qd.pool
    .filter((c) => c !== ans && qd.entity(c)?.hasGeometry && qd.mask(c) && qd.familiar(c, famCap))
    // Two countries that come out as the same picture at this resolution cannot be told
    // apart, so neither can be the other's decoy.
    .filter((c) => !ansCells || hamming(ansCells, pixelGridCached(qd.mask(c), res).cells) > 1)
    .map((c) => ({ c, iou: maskIoU(ansMask, qd.mask(c)) }))
    .sort((a, b) => b.iou - a.iou || qd.famRank(a.c) - qd.famRank(b.c) || a.c.localeCompare(b.c))
    .slice(0, NEAREST)
    .map((x) => x.c);
}

function generateSimilar(rng, band, qd, { maxFam, res }) {
  const shaped = qd.pool.filter((c) => qd.entity(c)?.hasGeometry && qd.mask(c));
  const cands = inFamBand(qd, shaped, band)
    .filter((c) => (!maxFam || qd.familiar(c, maxFam)) && pixelPlayable(qd, c, res));
  if (!cands.length) return null;
  const ans = pick(rng, cands);
  const near = similarShapes(qd, ans, { maxFam, res });
  if (near.length < 3) return null;
  const q = question(rng, qd, ans, near, band);
  if (res) Object.assign(q, { res, pixels: pixelGridCached(qd.mask(ans), res).cells });
  return q;
}
