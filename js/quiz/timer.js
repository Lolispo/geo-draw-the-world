// A clock for quiz-screen games that are too easy without one. A pack opts in with
// `timer: { max, grace }` (seconds): an answer inside the grace period keeps all its
// points, after that the points fall in a straight line to nothing at `max`.

export function timeScore(elapsed, { max, grace }) {
  const late = Math.max(0, elapsed - grace);
  const span = max - grace;
  return Math.round((Math.max(0, span - late) / span) * 100);
}

export function timedPoints(pts, elapsed, timer) {
  if (!timer) return pts;
  return Math.round((pts * timeScore(elapsed, timer)) / 100);
}
