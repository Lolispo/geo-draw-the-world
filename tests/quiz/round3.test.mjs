import test from 'node:test';
import assert from 'node:assert/strict';
import { makeQuizData } from '../../js/quiz/data.js';
import { bandForFam } from '../../js/quiz/bands.js';
import { colourFamilies } from '../../js/quiz/flag-colours.js';
import * as north from '../../js/quiz/generators/north.js';
import * as flag from '../../js/quiz/generators/flag.js';
import * as where from '../../js/quiz/generators/where.js';
import * as emblem from '../../js/quiz/generators/emblem.js';
import * as continent from '../../js/quiz/generators/continent.js';
import * as combo from '../../js/quiz/generators/combo.js';
import { loadRaw } from './fixtures.mjs';
import { sweep, assertShape } from './helpers.mjs';

const raw = loadRaw();
const qd = makeQuizData(raw, { territories: false });

test('geo summary: Sweden lies north of Spain, latitudes sane', () => {
  const se = raw.geo.se, es = raw.geo.es;
  assert.ok(se.lat > 55 && se.lat < 68, `se ${se.lat}`);
  assert.ok(es.lat > 36 && es.lat < 44, `es ${es.lat}`);
  assert.ok(se.south > es.north);
  assert.ok(raw.geo.br.lat < 0);
});

test('north: the answer lies further north at both its top and its bottom', () => {
  const { out, hits } = sweep(north.generate, qd);
  for (const b of Object.keys(hits)) assert.ok(hits[b] > 0, b);
  for (const { q } of out) {
    assertShape(assert, q, qd);
    const a = raw.geo[q.choices[q.answer].code], o = raw.geo[q.choices[1 - q.answer].code];
    assert.ok(a.north > o.north && a.south > o.south, q.reveal);
    assert.equal(q.figures.length, 2);
  }
});

test('flag colours: Japan has red, Sweden has no red, Brazil has green', () => {
  const fam = (c) => colourFamilies(raw.flags.find((f) => f.code === c).colors);
  assert.ok(fam('jp').has.has('red'));
  assert.ok(!fam('se').maybe.has('red'));
  assert.ok(fam('br').has.has('green'));
});

test('flag: answer clearly lacks the colour, the others clearly have it', () => {
  const { out } = sweep(flag.generate, qd);
  assert.ok(out.length > 80);
  for (const { q } of out) {
    assertShape(assert, q, qd);
    assert.equal(q.pictures, 'flag');
    q.choices.forEach((c, i) => {
      const f = colourFamilies(raw.flags.find((x) => x.code === c.code).colors);
      if (i === q.answer) assert.ok(!f.maybe.has(q.colour), `${c.code} ${q.colour}`);
      else assert.ok(f.has.has(q.colour), `${c.code} ${q.colour}`);
    });
  }
});

test('where: four dots far enough apart to tell apart', () => {
  const { out } = sweep(where.generate, qd);
  assert.ok(out.length > 80);
  for (const { q } of out) {
    assertShape(assert, q, qd);
    assert.equal(q.map.dots.length, 4);
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
      const [a, b] = [q.map.dots[i], q.map.dots[j]];
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 25, q.prompt);
    }
    assert.ok(q.prompt.includes(qd.name(q.codes[q.answer])));
    assert.equal(q.figures[q.answer], qd.name(q.codes[q.answer]));
  }
});

test('emblem: answer has an emblem file, band by fame', () => {
  const { out } = sweep(emblem.generate, qd);
  assert.ok(out.length > 80);
  for (const { band, q } of out) {
    assertShape(assert, q, qd);
    assert.ok(raw.emblems[q.emblem]);
    assert.equal(q.choices[q.answer].code, q.emblem);
    assert.equal(bandForFam(qd.famRank(q.emblem)), band);
  }
});

test('continent: never asks about a transcontinental country', () => {
  const { out } = sweep(continent.generate, qd, { seeds: 80 });
  assert.ok(out.length > 100);
  for (const { q } of out) {
    assertShape(assert, q, qd);
    assert.ok(!['ru', 'tr', 'kz', 'az', 'ge', 'am', 'cy', 'eg', 'id', 'tl', 'pg'].includes(q.codes[0]));
    assert.equal(q.choices[q.answer].label, raw.entities[q.codes[0]].continent);
  }
});

test('combo carries its figures in the question, not a line', () => {
  const { out } = sweep(combo.generate, qd, { seeds: 10 });
  for (const { q } of out) {
    assert.equal(q.combo.codes.length, 3);
    assert.equal(q.combo.figures.length, 4);
  }
});
