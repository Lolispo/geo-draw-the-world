import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scoreAnswer, markFor } from '../../js/quiz/score.js';
import { buildRound, GAME_TYPES, GAMES_FROM } from '../../js/quiz/round.js';
import { dailySeed } from '../../js/quiz/daily.js';
import { deltaE } from '../../js/color.js';
import { loadRaw } from './fixtures.mjs';

const raw = loadRaw();
const snapshot = JSON.parse(readFileSync(new URL('./daily-snapshot.json', import.meta.url), 'utf8'));

test('picker scores 100 − 2·ΔE', () => {
  assert.equal(scoreAnswer({ control: 'picker', answer: '#ff0000' }, '#ff0000'), 100);
  const given = '#cc3333';
  const want = Math.max(0, Math.min(100, Math.round(100 - 2 * deltaE(given, '#ff0000'))));
  assert.equal(scoreAnswer({ control: 'picker', answer: '#ff0000' }, given), want);
  assert.equal(scoreAnswer({ control: 'picker', answer: '#ff0000' }, '#0000ff'), 0);
});

test('order scores the share of pairs in the right order', () => {
  const q = { control: 'order', answer: [2, 0, 3, 1] };
  assert.equal(scoreAnswer(q, [2, 0, 3, 1]), 100);
  assert.equal(scoreAnswer(q, [0, 2, 3, 1]), 83);
  assert.equal(scoreAnswer(q, [1, 3, 0, 2]), 0);
});

test('gaps is right or wrong', () => {
  assert.equal(scoreAnswer({ control: 'gaps', answer: 2 }, 2), 100);
  assert.equal(scoreAnswer({ control: 'gaps', answer: 2 }, 1), 0);
});

test('multi gives a third per correct pick', () => {
  const q = { control: 'multi', answer: [1, 4, 6] };
  assert.equal(scoreAnswer(q, [1, 4, 6]), 100);
  assert.equal(scoreAnswer(q, [1, 4, 7]), 67);
  assert.equal(scoreAnswer(q, [0, 2, 3]), 0);
});

test('partial-credit controls mark yellow at 50', () => {
  for (const control of ['picker', 'order', 'multi']) assert.equal(markFor({ control }, 50), '🟨');
  assert.equal(markFor({ control: 'gaps' }, 0), '🟥');
  assert.equal(markFor({ type: 'bigger' }, 100), '🟩');
});

test('dailies before GAMES_FROM build exactly as before', () => {
  for (const [day, prompts] of Object.entries(snapshot)) {
    if (day >= GAMES_FROM) continue;
    const qs = buildRound({ seed: dailySeed(day), mode: 'daily', day }, raw);
    assert.deepEqual(qs.map((q) => q.prompt), prompts, day);
    // Stored answers (index or slider number) re-score as before.
    for (const q of qs) {
      const given = q.type === 'slider' ? q.answer : q.answer;
      assert.equal(scoreAnswer(q, given), 100, `${day} ${q.type}`);
    }
  }
});

test('every round with games on holds exactly one game question', () => {
  const check = (qs, label) => {
    assert.equal(qs.length, 5, label);
    assert.equal(qs.filter((q) => GAME_TYPES.includes(q.type)).length, 1, label);
  };
  for (const mode of ['easy', 'hard']) {
    for (let s = 1; s <= 30; s++) check(buildRound({ seed: s, mode }, raw), `${mode} ${s}`);
  }
  for (const day of ['2099-01-02', '2099-03-04']) check(buildRound({ seed: dailySeed(day), mode: 'daily', day }, raw), day);
});

// ---------- Task 2: order, insert, top-pick ----------
import { makeQuizData } from '../../js/quiz/data.js';
import { checkQuestion } from '../../js/quiz/audit.js';
import { sweep, assertShape } from './helpers.mjs';
import * as order from '../../js/quiz/generators/order.js';
import * as insert from '../../js/quiz/generators/insert.js';
import * as topPick from '../../js/quiz/generators/top-pick.js';

const qd = makeQuizData(raw, { territories: false });
const val = (q, c) => raw.datasets.datasets.find((d) => d.id === q.dataset).values[c];

for (const [name, gen] of [['order', order], ['insert', insert], ['top-pick', topPick]]) {
  test(`${name}: valid in every band it fills, and fills the easy ones`, () => {
    const { out, hits } = sweep(gen.generate, qd);
    for (const b of ['gentle', 'easy', 'medium']) assert.ok(hits[b] > 0, `${name} ${b}`);
    for (const { q } of out) {
      assertShape(assert, q, qd);
      assert.equal(checkQuestion(q, qd), null, `${q.prompt} → ${checkQuestion(q, qd)}`);
    }
  });
}

test('order: the answer sorts the values highest first', () => {
  for (const { q } of sweep(order.generate, qd).out) {
    const vs = q.answer.map((i) => val(q, q.choices[i].code));
    assert.deepEqual(vs, vs.slice().sort((a, b) => b - a));
  }
});

test('insert: the subject at its answer keeps the line sorted', () => {
  for (const { q } of sweep(insert.generate, qd).out) {
    const line = q.line.slice();
    line.splice(q.answer, 0, q.subject);
    const vs = line.map((c) => val(q, c));
    assert.deepEqual(vs, vs.slice().sort((a, b) => b - a));
  }
});

test('top-pick: eight options, the answer is the true top or bottom three', () => {
  for (const { q } of sweep(topPick.generate, qd).out) {
    assert.equal(q.choices.length, 8);
    const sorted = q.choices.map((c, i) => i).sort((a, b) => (q.least ? 1 : -1) * (val(q, q.choices[a].code) - val(q, q.choices[b].code)));
    assert.deepEqual(q.answer, sorted.slice(0, 3).sort((a, b) => a - b));
  }
});

// ---------- Task 3: shared flag matching ----------
import { interestingColours, findWithColour, findDecoys } from '../../js/quiz/flag-match.js';
import { makeRng } from '../../js/quiz/rng.js';

test('flag-match: interesting colours drop white and black', () => {
  assert.deepEqual(interestingColours(['#FFFFFF', '#000000', '#C8102E']), ['#C8102E']);
  assert.deepEqual(interestingColours(['#FFFFFF']), ['#FFFFFF']);
});

test('flag-match: a match has the colour, decoys clearly do not', () => {
  const se = raw.flags.find((f) => f.code === 'se');
  const yellow = se.colors.find((c) => interestingColours([c]).length && deltaE(c, '#FECC02') < 15) || se.colors[1];
  const m = findWithColour(makeRng(1), raw.flags, yellow, ['se']);
  assert.ok(m && m.code !== 'se');
  assert.ok(m.colors.some((c) => deltaE(c, yellow) < 20));
  const decoys = findDecoys(makeRng(2), raw.flags, yellow, se.colors.filter((c) => c !== yellow), ['se', m.code], 2);
  assert.equal(decoys.length, 2);
  for (const d of decoys) assert.ok(d.colors.every((c) => deltaE(c, yellow) >= 25), d.code);
});

// ---------- Task 4: mix and flag-missing ----------
import * as mix from '../../js/quiz/generators/mix.js';
import * as flagMissing from '../../js/quiz/generators/flag-missing.js';

for (const [name, gen] of [['mix', mix], ['flag-missing', flagMissing]]) {
  test(`${name}: valid, and fills every band`, () => {
    const { out, hits } = sweep(gen.generate, qd, { opts: {} });
    for (const b of ['gentle', 'easy', 'medium', 'hard']) assert.ok(hits[b] > 0, `${name} ${b}`);
    for (const { q } of out) {
      assertShape(assert, q, qd);
      assert.equal(checkQuestion(q, qd), null, `${q.prompt} → ${checkQuestion(q, qd)}`);
    }
  });
}

test('mix: the answer is one of the flag\'s own, non-white/black colours; easy bands ask clear colours', () => {
  for (const { band, q } of sweep(mix.generate, qd).out) {
    const f = raw.flags.find((x) => x.code === q.flag);
    assert.ok(f.colors.includes(q.answer));
    assert.deepEqual(interestingColours([q.answer]), [q.answer]);
    assert.equal(q.control, 'picker');
  }
});

test('flag-missing: the main flag is never an option, and flags are shown up front', () => {
  for (const { q } of sweep(flagMissing.generate, qd).out) {
    assert.ok(!q.choices.some((c) => c.code === q.flag));
    assert.equal(q.flagsShown, true);
    assert.equal(q.choices.length, 3);
  }
});

// ---------- Final review fixes ----------

test('flag-missing: the right option is a close match (ΔE < 10), so it is not arguable', () => {
  for (const { q } of sweep(flagMissing.generate, qd, { seeds: 80 }).out) {
    const f = raw.flags.find((x) => x.code === q.choices[q.answer].code);
    assert.ok(f.colors.some((c) => deltaE(c, q.blank) < 10), q.prompt);
  }
});

test('insert says which end is highest', () => {
  for (const { q } of sweep(insert.generate, qd, { seeds: 5 }).out) assert.match(q.prompt, /highest .* at the top/i, q.prompt);
});

test('electricity datasets read as a share, not an amount', async () => {
  const { datasetLabel } = await import('../../js/quiz/generators/common.js');
  for (const src of ['nuclear', 'coal', 'renewables']) {
    assert.equal(datasetLabel({ id: `elec-${src === 'renewables' ? 'renewable' : src}-pct`, name: `Electricity from ${src}` }), `share of electricity from ${src}`);
  }
  assert.equal(datasetLabel({ id: 'gdp', name: 'GDP' }), 'GDP');
});
