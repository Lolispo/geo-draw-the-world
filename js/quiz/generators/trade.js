import { pick, sample, shuffle } from '../rng.js';
import { bandForLead } from '../bands.js';

const sortedPartners = (qd, c) => (qd.raw.relations[c]?.exportPartners || [])
  .filter((p) => typeof p.pct === 'number' && p.code)
  .slice().sort((a, b) => b.pct - a.pct);

// Partners that top somebody's list — the plausible wrong answers.
function commonPartners(qd) {
  const seen = new Set();
  for (const c of qd.pool) for (const p of sortedPartners(qd, c).slice(0, 3)) seen.add(p.code);
  return [...seen].filter((c) => qd.inPool(c));
}

export function generate(rng, band, qd, { maxFam } = {}) {
  const cands = qd.pool.filter((c) => {
    if (maxFam && !qd.familiar(c, maxFam)) return false;
    const [p1, p2] = sortedPartners(qd, c);
    return p1 && p2 && qd.inPool(p1.code) && bandForLead(p1.pct - p2.pct) === band;
  });
  if (!cands.length) return null;
  const c = pick(rng, cands);
  const partners = sortedPartners(qd, c);
  const top = partners[0];
  const wrong = commonPartners(qd).filter((p) => p !== top.code && p !== c);
  if (wrong.length < 3) return null;
  const codes = shuffle(rng, [top.code, ...sample(rng, wrong, 3)]);
  return {
    type: 'trade',
    prompt: `Who buys most of ${qd.name(c)}'s exports?`,
    choices: codes.map((x) => ({ label: qd.name(x), code: x })),
    answer: codes.indexOf(top.code),
    // Each option's share of this country's exports; a buyer outside the listed top
    // partners has no figure to show.
    figures: codes.map((x) => { const p = partners.find((q) => q.code === x); return p ? `${p.pct}%` : 'not a top buyer'; }),
    reveal: `${qd.name(c)} exports: ${partners.slice(0, 3).map((p) => `${qd.name(p.code)} ${p.pct}%`).join(' · ')}`,
    codes: [c, ...codes],
    band,
    measure: top.pct - partners[1].pct,
  };
}
