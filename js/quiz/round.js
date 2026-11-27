import { makeRng, pick } from './rng.js';
import { makeQuizData } from './data.js';
import { BANDS } from './bands.js';
import { GENERATORS } from './generators/index.js';

export const DAILY_CURVE = ['gentle', 'easy', 'easy', 'medium', 'hard'];
export const ROUND_SIZE = 5;
// Types that would feel like the same question twice in one round.
const FAMILY = { outline: 'shape' };
const family = (t) => FAMILY[t] || t;
const MIX = {
  easy: { gentle: 25, easy: 35, medium: 25, hard: 15 },
  hard: { gentle: 5, easy: 20, medium: 40, hard: 35 },
};
const FAMILIAR = 80;
const ATTEMPTS = 30;

function drawBand(rng, weights) {
  let r = rng() * 100;
  for (const b of BANDS) { r -= weights[b]; if (r < 0) return b; }
  return 'hard';
}

// Bands nearest first, for a slot whose own band can't be filled.
const fallbackBands = (band) => {
  const i = BANDS.indexOf(band);
  return BANDS.slice().sort((a, b) => Math.abs(BANDS.indexOf(a) - i) - Math.abs(BANDS.indexOf(b) - i));
};

export function buildRound({ seed, mode }, raw, { territories = false } = {}) {
  const daily = mode === 'daily';
  // Everyone gets the same daily, whatever their territories setting.
  const qd = makeQuizData(raw, { territories: daily ? false : territories });
  const rng = makeRng(seed);
  const used = {};
  const seen = new Set();
  const slots = daily ? DAILY_CURVE.slice() : Array.from({ length: ROUND_SIZE }, () => drawBand(rng, MIX[mode]));
  if (!daily) slots.sort((a, b) => BANDS.indexOf(a) - BANDS.indexOf(b));

  const tryBand = (band) => {
    // Easy is well-known countries throughout; the daily only in its gentle/easy slots.
    const maxFam = mode === 'easy' || (daily && (band === 'gentle' || band === 'easy')) ? FAMILIAR : undefined;
    for (let i = 0; i < ATTEMPTS; i++) {
      const open = Object.keys(GENERATORS).filter((t) => !used[family(t)]);
      const type = pick(rng, open);
      const q = GENERATORS[type](rng, band, qd, { maxFam });
      if (!q || seen.has(q.prompt + q.reveal)) continue;
      return q;
    }
    return null;
  };

  const out = [];
  for (const band of slots) {
    let q = null;
    for (const b of fallbackBands(band)) {
      q = tryBand(b);
      if (q) break;
    }
    if (!q) continue;
    used[family(q.type)] = true;
    seen.add(q.prompt + q.reveal);
    out.push(q);
  }
  return out;
}
