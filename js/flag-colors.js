// Reading a flag's colours back off its own image, so `data/flags.json` can be checked
// against the thing it describes (TODOS #55). The colour quizzes score against that file
// and it is hand-curated, so a wrong entry costs a player points with nothing to catch it.

// Tuned against the entries that were already curated by hand, which is the only
// ground truth available:
//  - MERGE folds the shades anti-aliasing invents back into the colour they came from.
//  - MIN_SHARE_SEEN is deliberately low. A flag's white crescent or gold sun can be a
//    fraction of a percent, and not reporting it would read as "the curated colour is
//    missing" when the flag plainly has it (Libya, the Maldives, Samoa, Argentina).
//  - MIN_SHARE_DRAFT is the opposite job: a *proposed* colour list should stay short
//    and dominant, so drafting keeps the higher floor.
//  - MATCH is a presence test with tolerance, not an identity test. Curated values are
//    official specification colours and the rendered PNG drifts from them — France's
//    #002395 renders as #002654, 65 apart; Norway 61; Indonesia 64. It still sits below
//    the distance between two genuinely different colours inside one flag, which across
//    the curated set is almost never under 68.
const MERGE = 56, MIN_SHARE_SEEN = 0.0025, MIN_SHARE_DRAFT = 0.015, MATCH = 75;

const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const _cache = new Map();

// [{ hex, share }], most of the flag first. Needs CORS, so it loads its own Image
// rather than reusing one already on the page: setting crossOrigin on the displayed
// flag would make a CORS failure hide the flag itself, which is a bad trade for a check.
export async function readFlagColors(url) {
  if (_cache.has(url)) return _cache.get(url);
  const p = (async () => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    await new Promise((ok, no) => { img.onload = ok; img.onerror = () => no(new Error('flag image')); });
    const w = 160, h = Math.max(1, Math.round((img.height || 2) * w / (img.width || 3)));
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(img, 0, 0, w, h);
    const d = cx.getImageData(0, 0, w, h).data;

    const buckets = new Map();
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 128) continue;
      const k = [d[i], d[i + 1], d[i + 2]].map((v) => Math.round(v / 16) * 16).join(',');
      const e = buckets.get(k) || { n: 0, r: 0, g: 0, b: 0 };
      e.n++; e.r += d[i]; e.g += d[i + 1]; e.b += d[i + 2];
      buckets.set(k, e);
    }
    const merged = [];
    for (const e of [...buckets.values()]
      .map((e) => ({ n: e.n, c: [e.r / e.n, e.g / e.n, e.b / e.n] }))
      .sort((a, b) => b.n - a.n)) {
      const near = merged.find((m) => dist(m.c, e.c) < MERGE);
      if (near) {
        const t = near.n + e.n;
        near.c = near.c.map((v, i) => (v * near.n + e.c[i] * e.n) / t);
        near.n = t;
      } else merged.push({ ...e });
    }
    const total = merged.reduce((a, m) => a + m.n, 0) || 1;
    return merged.filter((m) => m.n / total >= MIN_SHARE_SEEN)
      .sort((a, b) => b.n - a.n)
      .map((m) => ({ hex: hex(m.c), share: m.n / total }));
  })();
  _cache.set(url, p);
  return p;
}

// Curated colours the image does not appear to contain. Empty is the good answer.
export function missingFromImage(curated, found) {
  return curated.filter((c) => !found.some((g) => dist(rgb(g.hex), rgb(c)) < MATCH));
}

// A short, dominant proposal for an entity that has no curated colours yet.
export function draftColors(found, max = 5) {
  return found.filter((g) => g.share >= MIN_SHARE_DRAFT).slice(0, max).map((g) => g.hex);
}
