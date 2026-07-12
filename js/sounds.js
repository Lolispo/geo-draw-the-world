// Sound effects using Web Audio API synth

let audioCtx = null;

function getCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playTone(freq, duration, type = 'sine', volume = 0.15) {
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + duration);
}

export function playShapeClose() {
  playTone(520, 0.15, 'sine', 0.12);
  setTimeout(() => playTone(660, 0.12, 'sine', 0.1), 80);
}

export function playPlace() {
  playTone(440, 0.2, 'triangle', 0.12);
  setTimeout(() => playTone(554, 0.15, 'triangle', 0.1), 100);
  setTimeout(() => playTone(660, 0.25, 'triangle', 0.1), 200);
}

export function playSkip() {
  playTone(400, 0.15, 'sawtooth', 0.06);
  setTimeout(() => playTone(300, 0.2, 'sawtooth', 0.05), 100);
}

export function playScoreReveal() {
  const notes = [523, 587, 659, 784];
  notes.forEach((freq, i) => {
    setTimeout(() => playTone(freq, 0.3, 'sine', 0.1), i * 120);
  });
}

export function playClick() {
  playTone(800, 0.05, 'square', 0.05);
}

export function playUndo() {
  playTone(350, 0.1, 'sine', 0.08);
}

// Soft, mellow blip for up/down navigation — sine wave, gentle on the ears
export function playNav() {
  playTone(330, 0.06, 'sine', 0.05);
}
