import test from 'node:test';
import assert from 'node:assert/strict';
import { makeQuizData } from '../../js/quiz/data.js';
import { checkQuestion } from '../../js/quiz/audit.js';
import { bandForRatio } from '../../js/quiz/bands.js';
import { scoreAnswer, markFor } from '../../js/quiz/score.js';
import { buildRound } from '../../js/quiz/round.js';
import { recordAnswer, loadDaily, finishDaily, resultLine } from '../../js/quiz/daily.js';
import { familyShares } from '../../js/quiz/religion-families.js';
import * as first from '../../js/quiz/generators/first.js';
import * as religion from '../../js/quiz/generators/religion.js';
import { loadRaw } from './fixtures.mjs';
import { sweep } from './helpers.mjs';

const raw = loadRaw();
const qd = makeQuizData(raw, { territories: false });
const REFOUNDED = ['ru', 'cn', 'jp', 'ir', 'tr', 'th', 'sa', 'de', 'it', 'fr', 'np'];

test('first never asks about re-founded or legendary states', () => {
  const { out } = sweep(first.generate, qd, { seeds: 200 });
  for (const { q } of out) for (const c of q.codes) assert.ok(!REFOUNDED.includes(c), `${c} in ${q.reveal}`);
});

test('audit flags a first question with a re-founded state', () => {
  const q = {
    type: 'first', dataset: 'independence-year', band: 'gentle', prompt: 'Which became independent first?',
    choices: [{ label: 'Peru', code: 'pe' }, { label: 'Russia', code: 'ru' }, { label: 'Angola', code: 'ao' }],
    answer: 0, codes: ['pe', 'ru', 'ao'], reveal: 'x',
  };
  assert.match(checkQuestion(q, qd), /independence/);
});

test('slider scores 100 when the answer is the nearest step', () => {
  const q = { type: 'slider', answer: 81.4, slider: { min: 0, max: 100, tolerance: 25, step: 1 } };
  assert.equal(scoreAnswer(q, 81), 100);
  assert.equal(markFor(q, scoreAnswer(q, 81)), '🟩');
  const life = { type: 'slider', answer: 67.8, slider: { min: 40, max: 90, tolerance: 10, step: 0.5 } };
  assert.equal(scoreAnswer(life, 68), 100);
  assert.equal(scoreAnswer(life, 62.55), 50);
});

test('religion keeps a clear margin: answer >= 60, distractors <= 40', () => {
  const { out } = sweep(religion.generate, qd, { seeds: 120 });
  for (const { q } of out) {
    q.choices.forEach((c, i) => {
      const s = familyShares(raw.attributes[c.code])[q.family] || 0;
      if (i === q.answer) assert.ok(s >= 60, `${c.code} ${s}`); else assert.ok(s <= 40, `${c.code} ${s}`);
    });
  }
});

test('hard band has a floor so near-ties are not questions', () => {
  assert.equal(bandForRatio(1.01), null);
  assert.equal(bandForRatio(1.03), 'hard');
});

test('easy rounds stay on familiar countries in every slot', () => {
  for (let seed = 1; seed <= 40; seed++) {
    for (const q of buildRound({ seed, mode: 'easy' }, raw, { territories: false })) {
      if (q.type === 'best-in-group' || q.type === 'trade') continue;
      for (const c of q.codes) assert.ok(qd.famRank(c) <= 80, `${seed} ${q.type} ${q.band} ${c}`);
    }
  }
});

function throwingStorage() {
  return { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('SecurityError'); } };
}

test('daily keeps working in memory when storage throws', () => {
  const s = throwingStorage();
  assert.equal(recordAnswer('2030-01-01', 0, 1, 100, '🟩', s), true);
  assert.equal(recordAnswer('2030-01-01', 1, 0, 0, '🟥', s), true);
  assert.equal(recordAnswer('2030-01-01', 1, 0, 100, '🟩', s), false);
  assert.equal(loadDaily('2030-01-01', s).score, 100);
  finishDaily('2030-01-01', s);
  assert.match(resultLine('2030-01-01', loadDaily('2030-01-01', s)), /🟩🟥 · 100\/500/);
});

test('resultLine survives a missing entry', () => {
  assert.match(resultLine('2030-02-02', null), /Know the World Daily #\d+/);
});
