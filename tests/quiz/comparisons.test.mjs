import test from 'node:test';
import assert from 'node:assert/strict';
import { makeQuizData } from '../../js/quiz/data.js';
import { bandForRatio, BANDS } from '../../js/quiz/bands.js';
import { GROUPS } from '../../js/quiz/groups.js';
import * as bigger from '../../js/quiz/generators/bigger.js';
import * as combo from '../../js/quiz/generators/combo.js';
import * as oddOne from '../../js/quiz/generators/odd-one.js';
import * as bestInGroup from '../../js/quiz/generators/best-in-group.js';
import { loadRaw } from './fixtures.mjs';
import { sweep, assertShape } from './helpers.mjs';

const raw = loadRaw();
const qd = makeQuizData(raw, { territories: false });
const valueOf = (id, c) => qd.dataset(id).values[c];

test('bandForRatio edges', () => {
  assert.equal(bandForRatio(1), null);
  assert.equal(bandForRatio(1.1), 'hard');
  assert.equal(bandForRatio(1.15), 'medium');
  assert.equal(bandForRatio(1.8), 'easy');
  assert.equal(bandForRatio(4), 'gentle');
});

test('groups list is the curated one', () => {
  const ids = GROUPS.map((g) => g.id);
  assert.deepEqual(ids, ['nordics', 'baltics', 'benelux', 'british-isles', 'iberia', 'g7', 'eu27']);
  assert.equal(GROUPS.find((g) => g.id === 'eu27').codes.length, 27);
});

for (const [name, gen] of Object.entries({ bigger, combo, 'odd-one': oddOne, 'best-in-group': bestInGroup })) {
  test(`${name}: every question sits in its band with no zeros`, () => {
    const { out } = sweep(gen.generate, qd);
    assert.ok(out.length > 0, 'some questions');
    for (const { band, q } of out) {
      assertShape(assert, q, qd);
      assert.equal(q.type, name);
      assert.equal(q.band, band);
      assert.ok(q.measure > 1);
      assert.equal(bandForRatio(q.measure), band, `${q.prompt} ratio ${q.measure}`);
      for (const c of q.codes) assert.notEqual(valueOf(q.dataset, c), 0, `${c} zero`);
    }
  });
}

test('bigger succeeds often in every band', () => {
  const { hits } = sweep(bigger.generate, qd);
  for (const b of BANDS) assert.ok(hits[b] >= 10, `${b}: ${hits[b]}/40`);
});

test('combo never adds a claimed pair and only uses summable data', () => {
  const { out } = sweep(combo.generate, qd, { seeds: 80 });
  for (const { q } of out) {
    const [a, b] = q.codes;
    assert.notEqual(raw.entities[a].claimedBy, b);
    assert.notEqual(raw.entities[b].claimedBy, a);
    assert.equal(qd.dataset(q.dataset).summable, true);
    assert.deepEqual(q.choices.map((c) => c.label), ['Yes', 'No']);
  }
});

test('maxFam keeps every country familiar', () => {
  const { out } = sweep(bigger.generate, qd, { opts: { maxFam: 80 } });
  for (const { q } of out) for (const c of q.codes) assert.ok(qd.famRank(c) <= 80, c);
});

test('combo answers Yes as well as No in every band', () => {
  const { out } = sweep(combo.generate, qd, { seeds: 80 });
  for (const b of BANDS) {
    const answers = new Set(out.filter((o) => o.band === b).map((o) => o.q.answer));
    assert.equal(answers.size, 2, `${b} has both answers`);
  }
});
