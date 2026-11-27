// Insert: three countries in order with a gap above, between and below; tap where the
// fourth goes. One tap answers, like a choice.
import { el, figureSlot, fillFigure, digit } from './dom.js';

export function create(q, { raw, onPick }) {
  const name = (c) => raw.entities[c]?.name || c;
  const wrap = el('div', 'quiz-gaps');
  const subject = el('div', 'quiz-gaps-subject');
  subject.append(el('span', 'quiz-choice-label', name(q.subject)));
  const allFigs = [...q.figures.line, q.figures.subject];
  const subjFig = figureSlot(allFigs);
  subject.append(subjFig);
  wrap.append(subject);
  let chosen = null;
  const gaps = [];
  const rowFigs = [];
  const gapBtn = (i) => {
    const b = el('button', 'btn quiz-gap');
    b.append(el('kbd', 'quiz-key', String(i + 1)), el('span', null, `${name(q.subject)} here`));
    b.addEventListener('click', () => pick(i));
    gaps.push(b);
    return b;
  };
  q.line.forEach((c, i) => {
    wrap.append(gapBtn(i));
    const row = el('div', 'quiz-gaps-row');
    row.append(el('span', 'quiz-gaps-rank', String(i + 1)), el('span', 'quiz-choice-label', name(c)));
    const f = figureSlot(allFigs);
    rowFigs.push(f);
    row.append(f);
    wrap.append(row);
  });
  wrap.append(gapBtn(q.line.length));
  function pick(i) {
    if (chosen != null) return;
    chosen = i;
    onPick({ now: true });
  }
  return {
    el: wrap,
    instant: true,
    value: () => chosen,
    key(e) { const i = digit(e, gaps.length); if (i < 0) return false; pick(i); return true; },
    reveal(given) {
      gaps.forEach((b, i) => {
        b.classList.add('disabled');
        if (i === q.answer) b.classList.add('correct');
        else if (i === given) b.classList.add('wrong');
      });
      rowFigs.forEach((f, i) => fillFigure(f, q.figures.line[i]));
      fillFigure(subjFig, q.figures.subject);
    },
  };
}
