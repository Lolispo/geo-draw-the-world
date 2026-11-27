import { deltaE } from '../color.js';

const clamp = (x) => Math.max(0, Math.min(100, Math.round(x)));
const PARTIAL = new Set(['picker', 'order', 'multi']);

export function scoreAnswer(q, given) {
  switch (q.control) {
    case 'picker':
      return typeof given === 'string' ? clamp(100 - 2 * deltaE(given, q.answer)) : 0;
    case 'order': {
      // Share of the pairs the player put the right way round.
      const pos = new Map((given || []).map((c, i) => [c, i]));
      let right = 0, pairs = 0;
      for (let i = 0; i < q.answer.length; i++) {
        for (let j = i + 1; j < q.answer.length; j++) {
          pairs++;
          if (pos.get(q.answer[i]) < pos.get(q.answer[j])) right++;
        }
      }
      return clamp((100 * right) / pairs);
    }
    case 'multi': {
      const hits = (given || []).filter((i) => q.answer.includes(i)).length;
      return clamp((100 * hits) / q.answer.length);
    }
    case 'gaps':
      return given === q.answer ? 100 : 0;
    default:
      break;
  }
  if (q.type === 'slider') {
    // The slider moves in steps, so the nearest step to the true value is exact.
    const off = Math.max(0, Math.abs(Number(given) - q.answer) - (q.slider.step ?? 0) / 2);
    return Math.max(0, Math.round(100 * (1 - off / q.slider.tolerance)));
  }
  return given === q.answer ? 100 : 0;
}

export function markFor(q, points) {
  if (points >= 100) return '🟩';
  if ((q.type === 'slider' || PARTIAL.has(q.control)) && points >= 50) return '🟨';
  return '🟥';
}
