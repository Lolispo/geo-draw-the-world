export function scoreAnswer(q, given) {
  if (q.type === 'slider') {
    // The slider moves in steps, so the nearest step to the true value is exact.
    const off = Math.max(0, Math.abs(Number(given) - q.answer) - (q.slider.step ?? 0) / 2);
    return Math.max(0, Math.round(100 * (1 - off / q.slider.tolerance)));
  }
  return given === q.answer ? 100 : 0;
}

export function markFor(q, points) {
  if (points >= 100) return '🟩';
  if (q.type === 'slider' && points >= 50) return '🟨';
  return '🟥';
}
