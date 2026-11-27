// How hard a question is, measured from its own data, and the four bands a round asks for.

export const BANDS = ['gentle', 'easy', 'medium', 'hard'];

function band(x, [gentle, easy, medium, hard]) {
  if (x >= gentle) return 'gentle';
  if (x >= easy) return 'easy';
  if (x >= medium) return 'medium';
  if (x >= hard) return 'hard';
  return null;
}

// Right answer ÷ closest wrong one. Under 1.03 is within data noise and a different
// data year, so it is a coin flip rather than a hard question.
export const bandForRatio = (r) => band(r, [4, 1.8, 1.15, 1.03]);
// Years between the earliest and the next.
export const bandForYears = (y) => band(y, [100, 40, 15, 5]);
// Percentage points the top export partner leads the second by.
export const bandForLead = (p) => band(p, [30, 15, 7, 3]);
// Familiarity rank of the answer country.
export function bandForFam(rank) {
  if (rank <= 30) return 'gentle';
  if (rank <= 80) return 'easy';
  if (rank <= 140) return 'medium';
  return 'hard';
}

export const RATIO_RANGE = { gentle: [4, Infinity], easy: [1.8, 4], medium: [1.15, 1.8], hard: [1.03, 1.15] };
export const inRatioBand = (r, b) => bandForRatio(r) === b;
