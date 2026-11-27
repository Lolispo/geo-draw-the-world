// Flag colour lists (data/flags.json) sorted into named colours. `has` is a colour
// nobody would argue with; `maybe` also catches the borderline shades (maroon, orange,
// teal), so "this flag has no red" is only claimed when not even a maybe is present.

export const ASKED_COLOURS = ['red', 'blue', 'green', 'yellow'];

function hsl(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60; if (h < 0) h += 360;
  return { h, s, l };
}

const inHue = (h, [a, b]) => (a <= b ? h >= a && h <= b : h >= a || h <= b);

const RULES = {
  red: { has: { hue: [345, 12], s: 0.45, l: [0.25, 0.65] }, maybe: { hue: [325, 28], s: 0.2, l: [0.12, 0.8] } },
  blue: { has: { hue: [200, 250], s: 0.4, l: [0.15, 0.7] }, maybe: { hue: [175, 270], s: 0.15, l: [0.08, 0.85] } },
  green: { has: { hue: [95, 165], s: 0.35, l: [0.15, 0.6] }, maybe: { hue: [70, 185], s: 0.15, l: [0.08, 0.8] } },
  yellow: { has: { hue: [44, 62], s: 0.6, l: [0.45, 0.8] }, maybe: { hue: [32, 72], s: 0.3, l: [0.3, 0.9] } },
};

const fits = (c, r) => inHue(c.h, r.hue) && c.s >= r.s && c.l >= r.l[0] && c.l <= r.l[1];

export function colourFamilies(hexes) {
  const cs = (hexes || []).map(hsl);
  const has = new Set(), maybe = new Set();
  for (const [name, rule] of Object.entries(RULES)) {
    if (cs.some((c) => fits(c, rule.has))) has.add(name);
    if (cs.some((c) => fits(c, rule.maybe))) maybe.add(name);
  }
  return { has, maybe };
}
