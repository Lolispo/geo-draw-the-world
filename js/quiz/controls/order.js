// Order: tap the rows in order, highest first. Tapping a numbered row takes back it and
// every number after it.
import { el, figureSlot, fillFigure, digit } from './dom.js';

export function create(q, { onPick }) {
  const wrap = el('div', 'quiz-order');
  const picked = [];
  const rows = q.choices.map((ch, i) => {
    const b = el('button', 'btn quiz-choice quiz-order-row');
    b.append(el('kbd', 'quiz-key', String(i + 1)));
    const badge = el('span', 'quiz-order-badge', '');
    b.append(badge, el('span', 'quiz-choice-label', ch.label));
    const fig = figureSlot(q.figures.map((f, k) => `#${k + 1} · ${f}`));
    b.append(fig);
    b.addEventListener('click', () => tap(i));
    wrap.append(b);
    return { b, badge, fig };
  });
  let done = false;
  const paint = () => rows.forEach((r, i) => {
    const at = picked.indexOf(i);
    r.badge.textContent = at >= 0 ? String(at + 1) : '';
    r.b.classList.toggle('is-picked', at >= 0);
  });
  function tap(i) {
    if (done) return;
    const at = picked.indexOf(i);
    if (at >= 0) picked.splice(at); else picked.push(i);
    paint();
    onPick();
  }
  wrap.prepend(el('div', 'quiz-order-hint', 'Tap highest first'));
  return {
    el: wrap,
    value: () => (picked.length === q.choices.length ? picked.slice() : null),
    key(e) { const i = digit(e, q.choices.length); if (i < 0) return false; tap(i); return true; },
    reveal(given) {
      done = true;
      rows.forEach((r, i) => {
        r.b.classList.add('disabled');
        const rank = q.answer.indexOf(i);
        r.b.classList.add(given.indexOf(i) === rank ? 'correct' : 'wrong');
        fillFigure(r.fig, `#${rank + 1} · ${q.figures[i]}`);
      });
    },
  };
}
