import test from 'node:test';
import assert from 'node:assert/strict';
import { makeQuizData } from '../../js/quiz/data.js';
import { buildRound } from '../../js/quiz/round.js';
import { GENERATORS } from '../../js/quiz/generators/index.js';
import { measureLabel } from '../../js/quiz/audit.js';
import * as outline from '../../js/quiz/generators/outline.js';
import { loadRaw } from './fixtures.mjs';
import { sweep, assertShape } from './helpers.mjs';

const raw = loadRaw();
const qd = makeQuizData(raw, { territories: false });

test('random rounds are 5 questions, one per type', () => {
  for (const mode of ['easy', 'hard']) {
    for (let seed = 1; seed <= 100; seed++) {
      const qs = buildRound({ seed, mode }, raw, { territories: false });
      assert.equal(qs.length, 5);
      assert.equal(new Set(qs.map((q) => q.type)).size, 5);
    }
  }
});

test('shape and outline never share a round', () => {
  for (const mode of ['easy', 'hard', 'daily']) {
    for (let seed = 1; seed <= 150; seed++) {
      const types = buildRound({ seed, mode }, raw, { territories: false }).map((q) => q.type);
      assert.ok(!(types.includes('shape') && types.includes('outline')), `${mode} ${seed}`);
    }
  }
});

test('choice questions carry one figure per option, except shape/combo', () => {
  for (const [type, gen] of Object.entries(GENERATORS)) {
    if (['slider', 'combo', 'shape', 'emblem', 'continent'].includes(type)) continue;
    const { out } = sweep(gen, qd, { seeds: 10 });
    for (const { q } of out) {
      assert.equal(q.figures?.length, q.choices.length, `${type}: ${q.prompt}`);
      assert.ok(q.figures.every((f) => typeof f === 'string' && f.length), type);
    }
  }
});

test('comparison figures match the data', () => {
  const { out } = sweep(GENERATORS.bigger, qd, { seeds: 10 });
  for (const { q } of out) {
    q.choices.forEach((c, i) => assert.ok(q.reveal.includes(`${c.label} ${q.figures[i]}`), q.reveal));
  }
});

test('outline: asks for one country, four drawable outlines', () => {
  const { out } = sweep(outline.generate, qd);
  assert.ok(out.length > 80);
  for (const { q } of out) {
    assertShape(assert, q, qd);
    assert.equal(q.outlines, true);
    assert.ok(q.prompt.includes(qd.name(q.choices[q.answer].code)));
    for (const c of q.choices) assert.equal(raw.entities[c.code].hasGeometry, true);
  }
});

test('measure labels say what the number is', () => {
  assert.equal(measureLabel('bigger', 2.345), '2.35× apart');
  assert.equal(measureLabel('first', 57), '57 yrs apart');
  assert.equal(measureLabel('trade', 12), 'leads by 12 pts');
  assert.equal(measureLabel('shape', 34), 'fame #34');
});
