// Colour mix: the blanked flag next to a live preview, and the HSV picker.
import { createHsvPicker } from '../../hsv-picker.js';
import { paintBlanked, paintFilled } from '../../flag-blank.js';
import { el } from './dom.js';

export function create(q, { raw, onPick }) {
  const wrap = el('div', 'quiz-mix');
  const panel = (cap) => {
    const p = el('div', 'quiz-mix-panel');
    const c = el('canvas', 'quiz-mix-flag');
    const caption = el('div', 'quiz-mix-cap', cap);
    p.append(c, caption);
    return { p, c, caption };
  };
  const shown = panel('Shown'), mine = panel('With your colour');
  const flags = el('div', 'quiz-mix-flags');
  flags.append(shown.p, mine.p);
  let hole = null;
  const picker = createHsvPicker({ onChange: (hex) => { if (hole) paintFilled(mine.c, hole, hex); onPick(); } });
  wrap.append(flags, picker.el);
  paintBlanked(shown.c, q.flag, q.answer, { name: raw.entities[q.flag]?.name, colors: raw.flags.find((f) => f.code === q.flag)?.colors }).then((h) => {
    if (!shown.c.isConnected && !wrap.isConnected) return;
    hole = h;
    if (hole) paintFilled(mine.c, hole, picker.hex());
  });
  return {
    el: wrap,
    // Lock in waits for a first touch, so the start colour is never an answer.
    value: () => (picker.touched() ? picker.hex() : null),
    key: () => false,
    reveal(given) {
      picker.disable();
      wrap.classList.add('is-done');
      // Same two panels, now the real colour beside yours.
      if (hole) { paintFilled(shown.c, hole, q.answer); paintFilled(mine.c, hole, given); }
      shown.caption.textContent = `Real ${q.answer}`;
      mine.caption.textContent = `Yours ${given}`;
    },
  };
}
