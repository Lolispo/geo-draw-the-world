// Which flags share a colour, for the missing-colour questions. Shared by the Flag Color
// Quiz and the quiz's flag-missing question; pure, with the randomness passed in.

import { deltaE, hexToRgb } from '../color.js';

export const nearWhite = (hex) => { const { r, g, b } = hexToRgb(hex); return r > 220 && g > 220 && b > 220; };
export const nearBlack = (hex) => { const { r, g, b } = hexToRgb(hex); return r < 35 && g < 35 && b < 35; };

// White and black are dull to take out and hard to tell apart once gone.
export function interestingColours(hexes) {
  const out = hexes.filter((c) => !nearWhite(c) && !nearBlack(c));
  return out.length ? out : hexes.slice();
}

// How many of `hexes` the flag has a close match for — what makes two flags look alike.
export const sharedColours = (flag, hexes) => hexes.filter((v) => flag.colors.some((c) => deltaE(c, v) < 12)).length;

const closest = (flag, hex) => Math.min(...flag.colors.map((c) => deltaE(c, hex)));

// A flag with a close match to the colour: one of the five closest under ΔE 10, or
// under 20 when nothing is that close (unless `limits` says otherwise).
export function findWithColour(rng, flags, hex, excludeCodes = [], limits = [10, 20]) {
  const scored = flags.filter((f) => !excludeCodes.includes(f.code))
    .map((f) => ({ f, d: closest(f, hex) }))
    .sort((a, b) => a.d - b.d);
  for (const limit of limits) {
    const near = scored.filter((s) => s.d < limit);
    if (near.length) return near[Math.floor(rng() * Math.min(5, near.length))].f;
  }
  return null;
}

// Flags with nothing near the removed colour, preferring ones that share a visible
// colour so they can't be ruled out at a glance.
export function findDecoys(rng, flags, removedHex, visibleHexes, excludeCodes, count) {
  const cands = flags.filter((f) => !excludeCodes.includes(f.code) && closest(f, removedHex) >= 25);
  const shuffle = (a) => {
    const out = a.slice();
    for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
    return out;
  };
  const scored = cands.map((f) => ({ f, shared: sharedColours(f, visibleHexes) }))
    .sort((a, b) => b.shared - a.shared);
  const withShared = scored.filter((s) => s.shared > 0);
  if (withShared.length >= count) {
    return shuffle(withShared.slice(0, Math.max(count * 4, 12))).slice(0, count).map((s) => s.f);
  }
  return shuffle(cands).slice(0, count);
}
