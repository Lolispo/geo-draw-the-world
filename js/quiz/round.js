import { makeRng, pick } from './rng.js';
import { makeQuizData } from './data.js';
import { BANDS } from './bands.js';
import { GENERATORS } from './generators/index.js';

export const DAILY_CURVE = ['gentle', 'easy', 'easy', 'medium', 'hard'];
export const ROUND_SIZE = 5;
// Types that would feel like the same question twice in one round.
const FAMILY = { outline: 'shape', insert: 'order' };
// One question per round comes from these: a single round of one of the app's games.
export const GAME_TYPES = ['mix', 'flag-missing', 'order', 'insert', 'top-pick'];
// The first daily with a game question. Earlier dailies must build exactly as they did
// when they were played, so a deploy never rewrites a day someone is half-way through.
export const GAMES_FROM = '2026-11-28';
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

export function buildRound({ seed, mode, day }, raw, { territories = false } = {}) {
  const daily = mode === 'daily';
  // Everyone gets the same daily, whatever their territories setting.
  const qd = makeQuizData(raw, { territories: daily ? false : territories });
  const rng = makeRng(seed);
  const used = {};
  const seen = new Set();
  const slots = daily ? DAILY_CURVE.slice() : Array.from({ length: ROUND_SIZE }, () => drawBand(rng, MIX[mode]));
  if (!daily) slots.sort((a, b) => BANDS.indexOf(a) - BANDS.indexOf(b));
  const gamesOn = !daily || (day != null && day >= GAMES_FROM);
  const gameSlot = gamesOn ? Math.floor(rng() * slots.length) : -1;
  const allTypes = Object.keys(GENERATORS);
  const plainTypes = allTypes.filter((t) => !GAME_TYPES.includes(t));

  const tryBand = (band, types) => {
    // Easy is well-known countries throughout; the daily only in its gentle/easy slots.
    const maxFam = mode === 'easy' || (daily && (band === 'gentle' || band === 'easy')) ? FAMILIAR : undefined;
    for (let i = 0; i < ATTEMPTS; i++) {
      const open = types.filter((t) => !used[family(t)]);
      if (!open.length) return null;
      const type = pick(rng, open);
      const q = GENERATORS[type](rng, band, qd, { maxFam });
      if (!q || seen.has(q.prompt + q.reveal)) continue;
      return q;
    }
    return null;
  };

  const out = [];
  for (const [i, band] of slots.entries()) {
    let q = null;
    // The game slot falls back to an ordinary question rather than leave a gap.
    const lists = i === gameSlot ? [GAME_TYPES, plainTypes] : [plainTypes];
    for (const types of lists) {
      for (const b of fallbackBands(band)) {
        q = tryBand(b, types);
        if (q) break;
      }
      if (q) break;
    }
    if (!q) continue;
    used[family(q.type)] = true;
    seen.add(q.prompt + q.reveal);
    out.push(q);
  }
  return out;
}
