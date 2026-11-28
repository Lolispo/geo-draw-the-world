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
import { pieDistance, pieBand, pieTrusted, NEAR_IDENTICAL } from './generators/flag-pie.js';
import { colourFamilies } from './flag-colours.js';
import { nearWhite, nearBlack } from './flag-match.js';
import { deltaE } from '../color.js';
import { pixelGridCached } from '../pixel-shape.js';
import { PACKS } from './packs.js';

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
    const ix = Array.isArray(q.answer) ? q.answer : [q.answer];
    if (!ix.every((i) => i >= 0 && i < q.choices.length)) return 'answer index out of range';
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
      if (q.res) {
        const g = qd.mask(q.shape) && pixelGridCached(qd.mask(q.shape), q.res);
        if (!g || g.cells !== q.pixels) return 'pixels are not the country\'s grid';
        if (g.degenerate) return `too few cells at ${q.res}×${q.res}`;
      }
      return null;
    }
    case 'order': {
      const vs = q.answer.map((i) => val(qd, q.dataset, q.choices[i].code));
      if (vs.some((v) => !(v > 0))) return 'zero or missing value';
      if (new Set(q.answer).size !== q.choices.length) return 'answer is not a full order';
      for (let i = 1; i < vs.length; i++) if (!(vs[i - 1] > vs[i])) return 'answer is not highest first';
      const r = Math.min(...vs.slice(1).map((v, i) => vs[i] / v));
      if (bandForRatio(r) !== q.band) return `band ${q.band} but closest pair ${r.toFixed(2)}`;
      return null;
    }
    case 'insert': {
      const line = q.line.slice();
      if (!(q.answer >= 0 && q.answer <= line.length)) return 'gap out of range';
      line.splice(q.answer, 0, q.subject);
      const vs = line.map((c) => val(qd, q.dataset, c));
      if (vs.some((v) => !(v > 0))) return 'zero or missing value';
      for (let i = 1; i < vs.length; i++) if (!(vs[i - 1] > vs[i])) return 'subject does not fit its gap';
      const s = vs[q.answer];
      const near = [vs[q.answer - 1], vs[q.answer + 1]].filter((v) => v != null).map((v) => Math.max(v, s) / Math.min(v, s));
      const r = Math.min(...near);
      if (bandForRatio(r) !== q.band) return `band ${q.band} but nearest ${r.toFixed(2)}`;
      return null;
    }
    case 'top-pick': {
      const vs = q.choices.map((c) => val(qd, q.dataset, c.code));
      if (vs.some((v) => !(v > 0))) return 'zero or missing value';
      const idx = vs.map((_, i) => i).sort((a, b) => (q.least ? vs[a] - vs[b] : vs[b] - vs[a]));
      const top = idx.slice(0, 3).sort((a, b) => a - b);
      if (top.join() !== q.answer.join()) return `answer is not the ${q.least ? 'bottom' : 'top'} 3`;
      const [v3, v4] = [vs[idx[2]], vs[idx[3]]];
      const r = q.least ? v4 / v3 : v3 / v4;
      if (bandForRatio(r) !== q.band) return `band ${q.band} but 3rd/4th ${r.toFixed(2)}`;
      return null;
    }
    case 'mix': {
      const f = (qd.raw.flags || []).find((x) => x.code === q.flag);
      if (!f) return 'no flag colours';
      if (!f.colors.includes(q.answer)) return 'answer is not a colour of this flag';
      if (nearWhite(q.answer) || nearBlack(q.answer)) return 'asks for white or black';
      if (bandForFam(qd.famRank(q.flag)) !== q.band) return 'familiarity band mismatch';
      return null;
    }
    case 'flag-missing': {
      const colours = (c) => (qd.raw.flags || []).find((x) => x.code === c)?.colors || [];
      if (!colours(q.flag).includes(q.blank)) return 'blanked colour is not in the flag';
      if (codes.slice(1).includes(q.flag) && q.choices.some((c) => c.code === q.flag)) return 'main flag offered as an option';
      if (!colours(ans).some((c) => deltaE(c, q.blank) < 10)) return `${qd.name(ans)} has no close match`;
      const has = others.find((c) => colours(c).some((x) => deltaE(x, q.blank) < 25));
      if (has) return `decoy ${qd.name(has)} has a near match`;
      if (bandForFam(qd.famRank(q.flag)) !== q.band) return 'familiarity band mismatch';
      return null;
    }
    case 'flag-pie': {
      const flag = (c) => (qd.raw.flags || []).find((x) => x.code === c);
      const main = flag(q.flag);
      if (!main) return 'no flag colours';
      if (ans !== q.flag) return 'answer is not the pie\'s flag';
      if (q.pie.colors.join() !== main.colors.join() || q.pie.shares.join() !== main.shares?.join()) return 'pie differs from data';
      const bad = codes.find((c) => !pieTrusted(flag(c)));
      if (bad) return `${qd.name(bad)}'s pie does not match its flag`;
      const ds = others.map((c) => pieDistance(main, flag(c)));
      const nearI = ds.findIndex((d) => d < NEAR_IDENTICAL);
      if (nearI >= 0) return `decoy ${qd.name(others[nearI])} has the same pie`;
      if (pieBand(qd.famRank(q.flag), Math.min(...ds)) !== q.band) return 'band mismatch';
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
  if (type.startsWith('shape ·')) return `fame #${m}`;
  if (['slider', 'shape', 'outline', 'religion', 'flag', 'where', 'emblem', 'continent', 'mix', 'flag-missing', 'flag-pie'].includes(type)) return `fame #${m}`;
  return `${m.toFixed(2)}× apart`;
}

const describe = (q, qd) => {
  if (q.type === 'slider') return `${q.answer}${q.slider.unit}`;
  if (q.control === 'picker') return q.answer;
  if (q.control === 'order') return q.answer.map((i) => q.choices[i].label).join(' > ');
  if (q.control === 'multi') return q.answer.map((i) => q.choices[i].label).join(', ');
  if (q.control === 'gaps') return gapLabel(q, q.answer, qd.name);
  return q.choices[q.answer]?.label;
};

// Where a gap answer puts the subject, in words.
export function gapLabel(q, gap, name) {
  const n = q.line.length;
  if (gap === 0) return `above ${name(q.line[0])}`;
  if (gap === n) return `below ${name(q.line[n - 1])}`;
  return `between ${name(q.line[gap - 1])} and ${name(q.line[gap])}`;
}

export function auditRows(raw, { seeds = 40 } = {}) {
  const qd = makeQuizData(raw, { territories: false });
  const rows = [];
  for (const [type, gen] of Object.entries(GENERATORS)) {
    for (const band of BANDS) {
      const maxFam = band === 'gentle' || band === 'easy' ? 80 : undefined;
      for (let s = 1; s <= seeds; s++) {
        const q = gen(makeRng(s * 104729 + BANDS.indexOf(band)), band, qd, { maxFam });
        if (!q) continue;
        rows.push({ type, band, prompt: q.prompt, answer: describe(q, qd), reveal: q.reveal, measure: q.measure, violation: checkQuestion(q, qd) });
      }
    }
  }
  // The menu games' own levels, where they hand the generator options the quiz does not.
  if (raw.masks) {
    for (const pack of Object.values(PACKS)) {
      for (const [level, cfg] of Object.entries(pack.levels || {})) {
        if (!Object.keys(cfg.opts || {}).length) continue;
        for (const band of BANDS) {
          for (let s = 1; s <= seeds; s++) {
            const q = GENERATORS[pack.type](makeRng(s * 7919 + BANDS.indexOf(band)), band, qd, { ...cfg.opts });
            if (!q) continue;
            rows.push({ type: `${pack.type} · ${level}`, band, prompt: q.prompt, answer: describe(q, qd), reveal: q.reveal, measure: q.measure, violation: checkQuestion(q, qd) });
          }
        }
      }
    }
  }
  return rows.sort((a, b) => (b.violation ? 1 : 0) - (a.violation ? 1 : 0));
}

// Every country's Guess the Shape grids, for the audit view: which needed a looser fill
// threshold, and which are too small to play at a level. Worst first, then by fame.
export function pixelAudit(raw, sizes = [24, 12]) {
  const qd = makeQuizData(raw, { territories: false });
  return qd.pool
    .filter((c) => qd.entity(c)?.hasGeometry && qd.mask(c))
    .map((code) => {
      const grids = Object.fromEntries(sizes.map((n) => [n, pixelGridCached(qd.mask(code), n)]));
      const worst = Math.max(...sizes.map((n) => (grids[n].degenerate ? 2 : grids[n].fallback ? 1 : 0)));
      return { code, name: qd.name(code), fame: qd.famRank(code), grids, worst };
    })
    .sort((a, b) => b.worst - a.worst || a.fame - b.fame);
}
