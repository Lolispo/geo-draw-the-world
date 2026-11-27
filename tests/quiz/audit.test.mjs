import test from 'node:test';
import assert from 'node:assert/strict';
import { auditRows, checkQuestion } from '../../js/quiz/audit.js';
import { makeQuizData } from '../../js/quiz/data.js';
import { BANDS } from '../../js/quiz/bands.js';
import { GENERATORS } from '../../js/quiz/generators/index.js';
import { loadRaw } from './fixtures.mjs';

const raw = loadRaw();

test('no generated question breaks a rule', () => {
  const rows = auditRows(raw, { seeds: 40 });
  const bad = rows.filter((r) => r.violation);
  assert.deepEqual(bad.slice(0, 5).map((r) => `${r.type}/${r.band}: ${r.violation} — ${r.prompt}`), []);
});

test('every type shows up in every band', () => {
  const rows = auditRows(raw, { seeds: 40 });
  for (const t of Object.keys(GENERATORS)) {
    for (const b of BANDS) assert.ok(rows.some((r) => r.type === t && r.band === b), `${t}/${b}`);
  }
});

test('the checker catches a planted wrong answer', () => {
  const qd = makeQuizData(raw, { territories: false });
  const q = {
    type: 'bigger', dataset: 'population', band: 'gentle', measure: 10,
    prompt: 'Which has more people: India or Iceland?',
    choices: [{ label: 'India', code: 'in' }, { label: 'Iceland', code: 'is' }],
    answer: 1, codes: ['in', 'is'], reveal: 'x',
  };
  assert.match(checkQuestion(q, qd), /answer/);
  assert.equal(checkQuestion({ ...q, answer: 0, measure: undefined }, qd), null);
  assert.match(checkQuestion({ ...q, answer: 0, band: 'hard' }, qd), /band/);
});
