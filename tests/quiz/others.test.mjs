import test from 'node:test';
import assert from 'node:assert/strict';
import { makeQuizData } from '../../js/quiz/data.js';
import { bandForFam, bandForLead, bandForYears } from '../../js/quiz/bands.js';
import { familyOf, familyShares } from '../../js/quiz/religion-families.js';
import * as slider from '../../js/quiz/generators/slider.js';
import * as shape from '../../js/quiz/generators/shape.js';
import * as trade from '../../js/quiz/generators/trade.js';
import * as religion from '../../js/quiz/generators/religion.js';
import * as first from '../../js/quiz/generators/first.js';
import { loadRaw } from './fixtures.mjs';
import { sweep, assertShape } from './helpers.mjs';

const raw = loadRaw();
const qd = makeQuizData(raw, { territories: false });

test('religion labels fold into families', () => {
  assert.equal(familyOf('Roman Catholic'), 'Christian');
  assert.equal(familyOf('Sunni Muslim'), 'Muslim');
  assert.equal(familyOf('Church of Sweden'), 'Christian');
  assert.equal(familyOf('Evangelical Lutheran'), 'Christian');
  assert.equal(familyOf('unaffiliated'), null);
  assert.equal(familyOf('non-Christian'), null);
  assert.equal(familyOf('Buddhist or Taoist'), null);
  assert.equal(familyOf('Muslim/Jewish'), null);
  assert.ok(familyShares(raw.attributes.se).Christian >= 50);
});

test('religion: answer is a majority, distractors are not', () => {
  const { out, hits } = sweep(religion.generate, qd);
  assert.ok(hits.gentle > 0 && hits.easy > 0);
  for (const { band, q } of out) {
    assertShape(assert, q, qd);
    assert.equal(bandForFam(qd.famRank(q.choices[q.answer].code)), band);
    q.choices.forEach((c, i) => {
      const share = familyShares(raw.attributes[c.code])[q.family] || 0;
      if (i === q.answer) assert.ok(share >= 50, `${c.code} ${q.family} ${share}`);
      else assert.ok(share < 50, `${c.code} ${q.family} ${share}`);
    });
  }
});

test('trade: top partner leads by at least 3 points', () => {
  const { out } = sweep(trade.generate, qd);
  assert.ok(out.length > 40);
  for (const { band, q } of out) {
    assertShape(assert, q, qd);
    assert.ok(q.measure >= 3);
    assert.equal(bandForLead(q.measure), band);
    const top = raw.relations[q.codes[0]].exportPartners.slice().sort((a, b) => b.pct - a.pct)[0];
    assert.equal(q.choices[q.answer].code, top.code);
    assert.ok(!q.choices.some((c) => c.code === q.codes[0]), 'country is not its own partner');
  }
});

test('first: earliest leads by at least 5 years and never says founded', () => {
  const { out, hits } = sweep(first.generate, qd);
  for (const b of Object.keys(hits)) assert.ok(hits[b] > 0, b);
  for (const { band, q } of out) {
    assertShape(assert, q, qd);
    assert.equal(q.choices.length, 3);
    assert.ok(q.measure >= 5);
    assert.equal(bandForYears(q.measure), band);
    assert.ok(!/founded/i.test(q.prompt + q.reveal));
    for (const c of q.choices) assert.equal(raw.entities[c.code].type, 'sovereign');
  }
});

test('slider: answer within its range', () => {
  const { out } = sweep(slider.generate, qd);
  assert.ok(out.length > 80);
  for (const { band, q } of out) {
    assertShape(assert, q, qd);
    assert.ok(q.answer >= q.slider.min && q.answer <= q.slider.max);
    assert.ok(q.slider.tolerance === 25 || q.slider.tolerance === 10);
    assert.equal(bandForFam(qd.famRank(q.codes[0])), band);
  }
});

test('shape: answer has geometry, hard keeps to one continent', () => {
  const { out } = sweep(shape.generate, qd);
  assert.ok(out.length > 80);
  for (const { band, q } of out) {
    assertShape(assert, q, qd);
    assert.equal(q.shape, q.choices[q.answer].code);
    assert.equal(raw.entities[q.shape].hasGeometry, true);
    assert.equal(bandForFam(qd.famRank(q.shape)), band);
    if (band === 'hard' || band === 'medium') {
      assert.equal(new Set(q.choices.map((c) => raw.entities[c.code].continent)).size, 1);
    }
  }
});
