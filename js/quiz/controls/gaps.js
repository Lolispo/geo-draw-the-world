// Insert: drag the country into a ranked list of three, then lock in. Keys 1–4 drop it
// into that slot. The reveal reorders the list into the true order, so it reads top to bottom.
import { el, figureSlot, fillFigure, digit } from './dom.js';

export function create(q, { raw, onPick }) {
  const name = (c) => raw.entities[c]?.name || c;
  const allFigs = [...q.figures.line, q.figures.subject];
  const wrap = el('div', 'quiz-gaps');
  wrap.append(el('div', 'quiz-order-hint', `Drag ${name(q.subject)} into the list`));
  const holder = el('div', 'quiz-ins-holder');
  const list = el('div', 'quiz-ins-list');
  wrap.append(holder, list);

  const row = (code, cls) => {
    const r = el('div', `quiz-gaps-row ${cls}`);
    const rank = el('span', 'quiz-gaps-rank', '');
    const label = el('span', 'quiz-choice-label', name(code));
    const fig = figureSlot(allFigs);
    r.append(rank, label, fig);
    return { r, rank, label, fig };
  };
  const lineRows = q.line.map((c) => row(c, ''));
  lineRows.forEach(({ r }) => list.append(r));
  // Holds the fourth row's height until the country is placed, so placing it moves nothing below.
  const spacer = row(q.subject, 'quiz-ins-spacer').r;
  list.append(spacer);
  const subj = row(q.subject, 'quiz-gaps-subject');
  const grip = el('span', 'quiz-ins-grip', '⠿');
  subj.r.append(grip);
  holder.append(subj.r);
  const marker = el('div', 'quiz-ins-marker');
  list.append(marker);

  let chosen = null;
  let done = false;
  const emptyHolder = () => {
    if (!holder.style.height) holder.style.height = `${holder.offsetHeight}px`;
    holder.classList.add('is-empty');
  };
  const place = (i) => {
    emptyHolder();
    spacer.remove();
    list.insertBefore(subj.r, lineRows[i]?.r || marker);
    chosen = i;
    onPick();
  };

  const slotAt = (y) => {
    const i = lineRows.findIndex(({ r }) => { const b = r.getBoundingClientRect(); return y < b.top + b.height / 2; });
    return i < 0 ? lineRows.length : i;
  };
  const showMarker = (i) => {
    const lb = list.getBoundingClientRect();
    const y = i < lineRows.length
      ? lineRows[i].r.getBoundingClientRect().top - 5
      : lineRows[lineRows.length - 1].r.getBoundingClientRect().bottom + 3;
    marker.style.top = `${y - lb.top}px`;
    marker.classList.add('is-on');
  };

  let drag = null;
  subj.r.addEventListener('pointerdown', (e) => {
    if (done || e.button > 0) return;
    e.preventDefault();
    subj.r.setPointerCapture(e.pointerId);
    drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY };
    subj.r.classList.add('is-dragging');
  });
  subj.r.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    subj.r.style.transform = `translate(${e.clientX - drag.x0}px, ${e.clientY - drag.y0}px)`;
    showMarker(slotAt(e.clientY));
  });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const moved = Math.abs(e.clientY - drag.y0) + Math.abs(e.clientX - drag.x0) > 6;
    drag = null;
    subj.r.classList.remove('is-dragging');
    subj.r.style.transform = '';
    marker.classList.remove('is-on');
    if (moved && e.type === 'pointerup') place(slotAt(e.clientY));
  };
  subj.r.addEventListener('pointerup', end);
  subj.r.addEventListener('pointercancel', end);

  return {
    el: wrap,
    value: () => chosen,
    key(e) { const i = digit(e, lineRows.length + 1); if (i < 0 || done) return false; place(i); return true; },
    reveal(given) {
      done = true;
      emptyHolder();
      spacer.remove();
      list.insertBefore(subj.r, lineRows[q.answer]?.r || marker);
      list.querySelectorAll('.quiz-gaps-rank').forEach((r, k) => { r.textContent = String(k + 1); });
      lineRows.forEach(({ fig }, i) => fillFigure(fig, q.figures.line[i]));
      fillFigure(subj.fig, q.figures.subject);
      grip.remove();
      holder.classList.add('is-done');
      const right = given === q.answer;
      subj.r.classList.add(right ? 'correct' : 'wrong');
      if (!right && given != null) subj.label.append(el('span', 'quiz-ins-you', ` · you put it #${given + 1}`));
    },
  };
}
