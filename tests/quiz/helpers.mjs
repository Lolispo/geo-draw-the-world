import { makeRng } from '../../js/quiz/rng.js';
import { BANDS } from '../../js/quiz/bands.js';

// Runs a generator across seeds × bands; returns [{band, q}] for the non-null ones,
// plus per-band attempt/success counts.
export function sweep(gen, qd, { seeds = 40, opts = {} } = {}) {
  const out = [], hits = {};
  for (const band of BANDS) {
    hits[band] = 0;
    for (let s = 1; s <= seeds; s++) {
      const q = gen(makeRng(s * 7919 + band.length), band, qd, opts);
      if (q) { out.push({ band, q }); hits[band]++; }
    }
  }
  return { out, hits };
}

export function assertShape(assert, q, qd) {
  assert.ok(typeof q.prompt === 'string' && q.prompt.length > 5, 'prompt');
  assert.ok(Array.isArray(q.codes) && q.codes.length > 0, 'codes');
  for (const c of q.codes) assert.ok(qd.inPool(c), `in pool: ${c}`);
  assert.ok(typeof q.reveal === 'string' && q.reveal.length > 0, 'reveal');
  if (q.choices) {
    for (const i of [].concat(q.answer)) assert.ok(i >= 0 && i < q.choices.length, 'answer index');
    assert.equal(new Set(q.choices.map((c) => c.label)).size, q.choices.length, 'distinct choices');
  }
}
