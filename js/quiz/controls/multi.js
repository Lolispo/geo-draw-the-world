// Top-pick: toggle exactly `q.pick` of the options; a pick past that is ignored until
// one is taken back.
import { el, figureSlot, fillFigure, digit } from './dom.js';

export function create(q, { onPick }) {
  const wrap = el('div', 'quiz-choices quiz-multi');
  const picked = new Set();
  let done = false;
  const opts = q.choices.map((ch, i) => {
    const b = el('button', 'btn quiz-choice quiz-multi-opt');
    b.append(el('kbd', 'quiz-key', String(i + 1)), el('span', 'quiz-multi-tick', ''), el('span', 'quiz-choice-label', ch.label));
    const fig = figureSlot(q.figures);
    b.append(fig);
    b.addEventListener('click', () => toggle(i));
    wrap.append(b);
    return { b, fig };
  });
  function toggle(i) {
    if (done) return;
    if (picked.has(i)) picked.delete(i);
    else if (picked.size < q.pick) picked.add(i);
    else return;
    opts.forEach((o, k) => o.b.classList.toggle('is-picked', picked.has(k)));
    onPick();
  }
  return {
    el: wrap,
    value: () => (picked.size === q.pick ? [...picked].sort((a, b) => a - b) : null),
    key(e) { const i = digit(e, q.choices.length); if (i < 0) return false; toggle(i); return true; },
    reveal(given) {
      done = true;
      opts.forEach((o, i) => {
        o.b.classList.add('disabled');
        const right = q.answer.includes(i), mine = given.includes(i);
        if (right && mine) o.b.classList.add('correct');
        else if (mine) o.b.classList.add('wrong');
        else if (right) o.b.classList.add('missed');
        fillFigure(o.fig, q.figures[i]);
      });
    },
  };
}
