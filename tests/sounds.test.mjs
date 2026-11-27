import test from 'node:test';
import assert from 'node:assert/strict';
import { isMuted, setMuted, playClick, playScoreReveal } from '../js/sounds.js';

test('muted sound effects never touch the audio context', async () => {
  setMuted(true);
  assert.equal(isMuted(), true);
  // No window here, so making an AudioContext would throw.
  assert.doesNotThrow(() => { playClick(); playScoreReveal(); });
  await new Promise((r) => setTimeout(r, 600)); // the reveal's later notes are scheduled
  setMuted(false);
  assert.throws(() => playClick());
});
