export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// A figure slot that holds its width from the start, so filling it in moves nothing.
export function figureSlot(figures) {
  const fig = el('span', 'quiz-choice-figure is-pending', ' ');
  fig.style.minWidth = `calc(${Math.max(...figures.map((f) => f.length))}ch + 18px)`;
  return fig;
}
export function fillFigure(fig, text) {
  fig.textContent = text;
  fig.classList.remove('is-pending');
}

// A digit key 1..n as an index, or -1.
export const digit = (e, n) => {
  const i = Number(e.key) - 1;
  return Number.isInteger(i) && i >= 0 && i < n ? i : -1;
};
