// Flag Ring — a screensaver. Every flag bounces inside a turning ring with one gap; a flag
// that gets out is out, the last one inside wins, and it starts over.
//
// The simulation runs in ring units (ring radius = 1) so it is independent of the screen and
// can be run headless; rendering scales it to whatever canvas it has.

import { flagUrl } from './flags.js';

const FILL = 0.30;            // share of the ring's area the balls cover
const SPEED = 0.55;           // ring radii per second each ball drifts toward
const WIN_HOLD_MS = 5500;
const STEP = 1 / 120;
const SPRITE = 128;

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const radiusFor = (n) => Math.min(0.22, Math.sqrt(FILL / Math.max(n, 1)));

export function createSim(flags, rand = Math.random) {
  const n = flags.length;
  const r = radiusFor(n);
  const golden = Math.PI * (3 - Math.sqrt(5));
  const balls = flags.map((flag, i) => {
    const d = Math.sqrt((i + 0.5) / n) * (0.97 - r);
    const a = i * golden;
    const dir = rand() * Math.PI * 2;
    return {
      flag, r,
      x: Math.cos(a) * d, y: Math.sin(a) * d,
      vx: Math.cos(dir) * SPEED, vy: Math.sin(dir) * SPEED,
      out: false, gone: false,
    };
  });
  return {
    balls, total: n, inside: n,
    angle: rand() * Math.PI * 2,
    sinceEscape: 0, time: 0,
    lastOut: null, winner: null,
  };
}

// Pacing. The ring spins faster and the gap widens as the field thins, and a long stretch
// with no escape widens it further, so the last handful does not stall the round.
function pace(sim) {
  const thin = 1 - sim.inside / sim.total;
  const spin = 0.35 + 1.1 * thin;
  const stall = Math.max(0, sim.sinceEscape - 6) * 0.03;
  const gap = Math.min(1.1, 0.09 + 0.5 * thin * thin + stall);
  return { spin, gap };
}

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function step(sim, dt) {
  const { spin, gap } = pace(sim);
  sim.angle = wrap(sim.angle + spin * dt);
  sim.time += dt;
  sim.sinceEscape += dt;
  sim.gap = gap;

  const target = radiusFor(sim.inside);
  const live = [];
  for (const b of sim.balls) {
    if (b.gone) continue;
    if (b.out) {
      b.vy += 2.2 * dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.y > 3 || Math.abs(b.x) > 3) b.gone = true;
      continue;
    }
    b.r += (target - b.r) * Math.min(1, dt * 1.5);
    // Hold every ball near the same speed: elastic bounces alone drift, and a screensaver
    // that slowly comes to rest is not one.
    const s = Math.hypot(b.vx, b.vy) || 1e-6;
    const k = 1 + (SPEED / s - 1) * Math.min(1, dt * 2);
    b.vx *= k; b.vy *= k;
    b.x += b.vx * dt; b.y += b.vy * dt;
    live.push(b);
  }

  for (let i = 0; i < live.length; i++) {
    const a = live[i];
    for (let j = i + 1; j < live.length; j++) {
      const b = live[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const min = a.r + b.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d, ny = dy / d;
      const push = (min - d) / 2;
      a.x -= nx * push; a.y -= ny * push;
      b.x += nx * push; b.y += ny * push;
      const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rel < 0) {
        a.vx += rel * nx; a.vy += rel * ny;
        b.vx -= rel * nx; b.vy -= rel * ny;
      }
    }
  }

  for (const b of live) {
    const d = Math.hypot(b.x, b.y);
    if (d > 1) {
      // Centre past the wall: it only gets here through the gap, so it is out.
      b.out = true;
      sim.inside--;
      sim.sinceEscape = 0;
      sim.lastOut = b;
      continue;
    }
    if (d + b.r <= 1) continue;
    const off = Math.abs(wrap(Math.atan2(b.y, b.x) - sim.angle));
    const fits = off < gap - Math.asin(Math.min(1, b.r));
    if (fits) continue;
    const nx = b.x / d, ny = b.y / d;
    const vn = b.vx * nx + b.vy * ny;
    if (vn > 0) { b.vx -= 2 * vn * nx; b.vy -= 2 * vn * ny; }
    const pull = d - (1 - b.r);
    b.x -= nx * pull; b.y -= ny * pull;
  }

  if (sim.inside <= 1 && !sim.winner) {
    sim.winner = sim.balls.find((b) => !b.out) || sim.lastOut;
  }
}

export class FlagRing {
  constructor(container, onExit) {
    this.container = container;
    this.onExit = onExit;
    this.flags = null;
    this.sprites = new Map();
    this.running = false;
    this._raf = 0;
    this._onKey = (e) => this._key(e);
    this._build();
  }

  _build() {
    this.container.innerHTML = `
      <div class="flag-ring-bar">
        <button class="btn flag-ring-back" type="button">← Menu</button>
        <span class="flag-ring-count"></span>
        <span class="flag-ring-last"></span>
        <button class="btn flag-ring-fs" type="button" title="Fullscreen (f)">⛶</button>
      </div>
      <canvas class="flag-ring-canvas"></canvas>
      <div class="flag-ring-winner" hidden>
        <img alt="">
        <div class="flag-ring-winner-name"></div>
        <div class="flag-ring-winner-sub">is the last flag standing</div>
      </div>`;
    this.canvas = this.container.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.countEl = this.container.querySelector('.flag-ring-count');
    this.lastEl = this.container.querySelector('.flag-ring-last');
    this.winnerEl = this.container.querySelector('.flag-ring-winner');
    this.container.querySelector('.flag-ring-back').addEventListener('click', () => this.onExit());
    this.container.querySelector('.flag-ring-fs').addEventListener('click', () => this._fullscreen());
  }

  async loadData() {
    if (this.flags) return;
    const resp = await fetch('data/flags.json');
    this.flags = (await resp.json()).flags;
    for (const f of this.flags) this._sprite(f);
  }

  // Each flag is cropped into a round sprite once, so a frame is one drawImage per ball
  // rather than a clip per ball.
  _sprite(flag) {
    const c = document.createElement('canvas');
    c.width = c.height = SPRITE;
    const g = c.getContext('2d');
    g.beginPath();
    g.arc(SPRITE / 2, SPRITE / 2, SPRITE / 2, 0, Math.PI * 2);
    g.fillStyle = (flag.colors && flag.colors[0]) || '#888';
    g.fill();
    this.sprites.set(flag.code, c);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(img.width, img.height);
      g.save();
      g.clip();
      g.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, SPRITE, SPRITE);
      g.restore();
    };
    img.src = flagUrl(flag.code, 'w160');
  }

  start() {
    this.stop();
    this.running = true;
    document.addEventListener('keydown', this._onKey);
    this._newRound();
    let last = performance.now();
    let acc = 0;
    const frame = (now) => {
      if (!this.running) return;
      acc += Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!this.sim.winner) {
        while (acc >= STEP) { step(this.sim, STEP); acc -= STEP; }
      } else {
        acc = 0;
        this._win(now);
      }
      this._draw();
      this._raf = requestAnimationFrame(frame);
    };
    this._raf = requestAnimationFrame(frame);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this._raf);
    document.removeEventListener('keydown', this._onKey);
    clearTimeout(this._winTimer);
    if (this.winnerEl) this.winnerEl.hidden = true;
    if (document.fullscreenElement && this.container.contains(document.fullscreenElement)) {
      document.exitFullscreen().catch(() => {});
    }
  }

  _newRound() {
    this.sim = createSim(shuffle([...this.flags]));
    this._winShown = false;
    this.winnerEl.hidden = true;
    this.lastEl.textContent = '';
  }

  _win() {
    if (this._winShown) return;
    this._winShown = true;
    const f = this.sim.winner.flag;
    this.winnerEl.querySelector('img').src = flagUrl(f.code, 'w640');
    this.winnerEl.querySelector('.flag-ring-winner-name').textContent = f.name;
    this.winnerEl.hidden = false;
    this._winTimer = setTimeout(() => { if (this.running) this._newRound(); }, WIN_HOLD_MS);
  }

  _key(e) {
    if (e.target.closest && e.target.closest('input, textarea')) return;
    if (e.key === 'f' || e.key === 'F') this._fullscreen();
  }

  _fullscreen() {
    const el = this.container.closest('.screen') || this.container;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
  }

  _draw() {
    const { canvas, ctx, sim } = this;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const R = Math.min(w, h) * 0.44;
    const cx = w / 2, cy = h / 2;

    const gap = sim.gap ?? 0.09;
    ctx.save();
    ctx.lineWidth = Math.max(3, R * 0.018);
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#58a6ff';
    ctx.shadowColor = '#58a6ffaa';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(cx, cy, R + ctx.lineWidth / 2, sim.angle + gap, sim.angle - gap + Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    for (const b of sim.balls) {
      if (b.gone) continue;
      const sprite = this.sprites.get(b.flag.code);
      const rr = b.r * R;
      ctx.globalAlpha = b.out ? 0.55 : 1;
      ctx.drawImage(sprite, cx + b.x * R - rr, cy + b.y * R - rr, rr * 2, rr * 2);
    }
    ctx.globalAlpha = 1;

    const left = `${sim.inside} of ${sim.total} left`;
    if (this.countEl.textContent !== left) this.countEl.textContent = left;
    const last = sim.lastOut ? `out: ${sim.lastOut.flag.name}` : '';
    if (this.lastEl.textContent !== last) this.lastEl.textContent = last;
  }
}
