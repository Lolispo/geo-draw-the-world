// Slice angles for a pie of shares: largest first, clockwise from 12 o'clock. A slice
// below `minAngle` is widened to it, taken from the others in proportion, because a
// crest or a star drawn true to size vanishes and the flag at the reveal then looks
// like it was never in the pie.

const TAU = Math.PI * 2;
export const MIN_SLICE = TAU * 0.025;

export function pieSlices(colors, shares, { minAngle = MIN_SLICE } = {}) {
  const items = colors.map((color, i) => ({ color, share: shares[i] || 0 }))
    .filter((s) => s.share > 0)
    .sort((a, b) => b.share - a.share);
  const total = items.reduce((a, s) => a + s.share, 0);
  if (!total) return [];
  let angles = items.map((s) => (s.share / total) * TAU);
  // Repeated, since shrinking the big slices to make room can push a middling one under.
  const small = new Set();
  for (let pass = 0; pass < items.length; pass++) {
    angles.forEach((a, i) => { if (a < minAngle) small.add(i); });
    const room = TAU - small.size * minAngle;
    const rest = items.reduce((a, s, i) => (small.has(i) ? a : a + s.share), 0);
    if (room <= 0 || !rest) { angles = items.map(() => TAU / items.length); break; }
    const next = items.map((s, i) => (small.has(i) ? minAngle : (s.share / rest) * room));
    const done = next.every((a, i) => small.has(i) || a >= minAngle);
    angles = next;
    if (done) break;
  }
  let at = -Math.PI / 2;
  return items.map((s, i) => {
    const start = at;
    at += angles[i];
    return { color: s.color, share: s.share, start, end: at };
  });
}

// Draws the pie at `size` CSS pixels. The grey edge is there so a white slice shows on
// a light page and a black one on a dark page.
export function paintPie(canvas, colors, shares, { size = 180 } = {}) {
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  canvas.width = canvas.height = Math.round(size * dpr);
  canvas.style.width = canvas.style.height = `${size}px`;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const c = size / 2, r = size / 2 - 2;
  const slices = pieSlices(colors, shares);
  for (const s of slices) {
    ctx.beginPath();
    ctx.moveTo(c, c);
    ctx.arc(c, c, r, s.start, s.end);
    ctx.closePath();
    ctx.fillStyle = s.color;
    ctx.fill();
  }
  ctx.strokeStyle = '#8a8a8a';
  if (slices.length > 1) {
    ctx.lineWidth = 1;
    for (const s of slices) {
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.lineTo(c + r * Math.cos(s.start), c + r * Math.sin(s.start));
      ctx.stroke();
    }
  }
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(c, c, r, 0, Math.PI * 2);
  ctx.stroke();
}
