// Re-checks generated questions against the rules from the raw data, without trusting
// anything the generator measured. The audit view and the tests both read this, so a
// rule broken by a data rebuild shows up as a row, not as a player's wrong answer.

import { makeRng } from './rng.js';
import { makeQuizData } from './data.js';
import { BANDS, bandForRatio, bandForYears, bandForLead, bandForFam } from './bands.js';
import { GENERATORS } from './generators/index.js';
import { familyShares } from './religion-families.js';
import { independentFrom } from './independence.js';
import { MAJORITY, MINORITY } from './generators/religion.js';
import { bandForDegrees } from './generators/north.js';
import { colourFamilies } from './flag-colours.js';

const val = (qd, id, c) => qd.dataset(id)?.values[c];

// Which way an odd-one question asks, read off its prompt rather than the generator.
const asksLeast = (q) => /least|fewest|smallest|poorest|lowest/.test(q.prompt);

function ratioCheck(q, qd, answerCode, otherVals, ansVal, least) {
  if ([ansVal, ...otherVals].some((v) => !(v > 0))) return 'zero or missing value';
  const best = least ? Math.min(...otherVals) : Math.max(...otherVals);
  const ratio = least ? best / ansVal : ansVal / best;
  if (!(ratio > 1)) return `answer ${qd.name(answerCode)} is not the ${least ? 'least' : 'most'}`;
  if (bandForRatio(ratio) !== q.band) return `band ${q.band} but ratio ${ratio.toFixed(2)}`;
  return null;
}

export function checkQuestion(q, qd) {
  const codes = q.codes || [];
  if (!codes.length) return 'no codes';
  for (const c of codes) if (!qd.inPool(c)) return `${c} not in pool`;
  if (q.choices) {
    if (!(q.answer >= 0 && q.answer < q.choices.length)) return 'answer index out of range';
    if (new Set(q.choices.map((c) => c.label)).size !== q.choices.length) return 'duplicate choices';
  }
  const ans = q.choices?.[q.answer]?.code;
  const others = (q.choices || []).filter((_, i) => i !== q.answer).map((c) => c.code);

  switch (q.type) {
    case 'bigger':
    case 'best-in-group':
    case 'odd-one': {
      const least = q.type === 'odd-one' && asksLeast(q);
      return ratioCheck(q, qd, ans, others.map((c) => val(qd, q.dataset, c)), val(qd, q.dataset, ans), least);
    }
    case 'combo': {
      const [a, b, c] = codes.map((x) => val(qd, q.dataset, x));
      if (![a, b, c].every((v) => v > 0)) return 'zero or missing value';
      if (!qd.dataset(q.dataset).summable) return 'dataset not summable';
      const [ca, cb] = codes;
      if (qd.entity(ca)?.claimedBy === cb || qd.entity(cb)?.claimedBy === ca) return 'claimed pair added';
      const sum = a + b;
      if ((sum > c ? 0 : 1) !== q.answer) return 'answer wrong';
      const ratio = Math.max(sum, c) / Math.min(sum, c);
      if (bandForRatio(ratio) !== q.band) return `band ${q.band} but ratio ${ratio.toFixed(2)}`;
      return null;
    }
    case 'first': {
      const notFrom = q.choices.find((c) => !independentFrom(c.code, qd.raw.attributes[c.code]));
      if (notFrom) return `${qd.name(notFrom.code)} has no independence from anyone`;
      const years = q.choices.map((c) => val(qd, 'independence-year', c.code));
      if (years.some((y) => typeof y !== 'number')) return 'missing year';
      const ya = years[q.answer];
      const next = Math.min(...years.filter((_, i) => i !== q.answer));
      if (!(next - ya >= 5)) return `earliest leads by ${next - ya} years`;
      if (bandForYears(next - ya) !== q.band) return `band ${q.band} but gap ${next - ya}`;
      return null;
    }
    case 'trade': {
      const ps = (qd.raw.relations[codes[0]]?.exportPartners || []).slice().sort((x, y) => y.pct - x.pct);
      if (ps.length < 2) return 'no partner list';
      if (ps[0].code !== ans) return 'answer is not the top partner';
      const lead = ps[0].pct - ps[1].pct;
      if (lead < 3) return `lead only ${lead} points`;
      if (bandForLead(lead) !== q.band) return `band ${q.band} but lead ${lead}`;
      if (others.includes(codes[0])) return 'country offered as its own partner';
      return null;
    }
    case 'religion': {
      const share = (c) => familyShares(qd.raw.attributes[c])[q.family] || 0;
      if (share(ans) < MAJORITY) return `${qd.name(ans)} only ${share(ans)}% ${q.family}`;
      const maj = others.find((c) => share(c) > MINORITY);
      if (maj) return `distractor ${qd.name(maj)} is ${share(maj)}% ${q.family}`;
      if (bandForFam(qd.famRank(ans)) !== q.band) return 'familiarity band mismatch';
      return null;
    }
    case 'slider': {
      const v = val(qd, q.dataset, codes[0]);
      if (v !== q.answer) return 'answer differs from data';
      if (v < q.slider.min || v > q.slider.max) return 'answer outside slider';
      if (bandForFam(qd.famRank(codes[0])) !== q.band) return 'familiarity band mismatch';
      return null;
    }
    case 'north': {
      const [ga, go] = [qd.raw.geo?.[ans], qd.raw.geo?.[others[0]]];
      if (!ga || !go) return 'no position';
      if (!(ga.north > go.north && ga.south > go.south)) return 'not further north at both edges';
      if (bandForDegrees(Math.abs(ga.north - go.north)) !== q.band) return 'band mismatch';
      return null;
    }
    case 'flag': {
      const fam = (c) => colourFamilies((qd.raw.flags || []).find((f) => f.code === c)?.colors);
      if (fam(ans).maybe.has(q.colour)) return `${qd.name(ans)}'s flag may have ${q.colour}`;
      const lacks = others.find((c) => !fam(c).has.has(q.colour));
      if (lacks) return `${qd.name(lacks)}'s flag has no clear ${q.colour}`;
      return null;
    }
    case 'where': {
      const dots = q.map?.dots || [];
      if (dots.length !== 4) return 'not four dots';
      for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
        if (Math.hypot(dots[i].x - dots[j].x, dots[i].y - dots[j].y) < 25) return 'dots overlap';
      }
      const g = qd.raw.geo?.[codes[q.answer]];
      if (!g || g.x !== dots[q.answer].x) return 'answer dot is not the country';
      if (!q.prompt.includes(qd.name(codes[q.answer]))) return 'answer is not the country asked for';
      return null;
    }
    case 'emblem':
      if (!qd.raw.emblems?.[q.emblem]) return 'no emblem';
      if (ans !== q.emblem) return 'answer is not the emblem';
      return null;
    case 'continent':
      if (q.choices[q.answer].label !== qd.continent(codes[0])) return 'wrong continent';
      return null;
    case 'outline': {
      if (codes.some((c) => !qd.entity(c)?.hasGeometry)) return 'an option has no geometry';
      if (!q.prompt.includes(qd.name(ans))) return 'answer is not the country asked for';
      if (bandForFam(qd.famRank(ans)) !== q.band) return 'familiarity band mismatch';
      return null;
    }
    case 'shape': {
      if (!qd.entity(q.shape)?.hasGeometry) return 'no geometry';
      if (ans !== q.shape) return 'answer is not the shape';
      if (bandForFam(qd.famRank(q.shape)) !== q.band) return 'familiarity band mismatch';
      return null;
    }
    default:
      return `unknown type ${q.type}`;
  }
}

// What the measure number means for each type, as the audit table prints it.
export function measureLabel(type, m) {
  if (typeof m !== 'number') return '';
  if (type === 'first') return `${m} yrs apart`;
  if (type === 'north') return `${m}° apart`;
  if (type === 'trade') return `leads by ${m} pts`;
  if (['slider', 'shape', 'outline', 'religion', 'flag', 'where', 'emblem', 'continent'].includes(type)) return `fame #${m}`;
  return `${m.toFixed(2)}× apart`;
}

const describe = (q) => (q.type === 'slider' ? `${q.answer}${q.slider.unit}` : q.choices[q.answer]?.label);

export function auditRows(raw, { seeds = 40 } = {}) {
  const qd = makeQuizData(raw, { territories: false });
  const rows = [];
  for (const [type, gen] of Object.entries(GENERATORS)) {
    for (const band of BANDS) {
      const maxFam = band === 'gentle' || band === 'easy' ? 80 : undefined;
      for (let s = 1; s <= seeds; s++) {
        const q = gen(makeRng(s * 104729 + BANDS.indexOf(band)), band, qd, { maxFam });
        if (!q) continue;
        rows.push({ type, band, prompt: q.prompt, answer: describe(q), reveal: q.reveal, measure: q.measure, violation: checkQuestion(q, qd) });
      }
    }
  }
  return rows.sort((a, b) => (b.violation ? 1 : 0) - (a.violation ? 1 : 0));
}
