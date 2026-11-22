// Flag Ring — a screensaver. Every flag bounces inside a turning ring with one gap; a flag
// that gets out is out, the last one inside wins, and it starts over.
//
// The simulation runs in ring units (ring radius = 1) so it is independent of the screen and
// can be run headless; rendering scales it to whatever canvas it has.

import { flagUrl } from './flags.js';
import { loadEntities, getEntity, inCountryPool } from './datasets.js';

const SPEED = 0.6;            // ring radii per second
const WIN_HOLD_MS = 5500;
const INTRO_S = 3;
const STEP = 1 / 120;
const SPRITE_H = 72;
const GAP_MIN = 0.05;
const GAP_RATE = 0.05;        // radians per second the gap may open — never in jumps
const STORE = 'flagRing.settings';

export const REGIONS = [
  ['all', 'Whole world'],
  ['Africa', 'Africa'],
  ['Asia', 'Asia'],
  ['Europe', 'Europe'],
  ['North America', 'North America'],
  ['Oceania', 'Oceania'],
  ['South America', 'South America'],
];

function shuffle(a, rand = Math.random) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// A round aims at a length that grows with the field, so a continent is not a four-minute
// wait and the whole world is not over in one.
const roundLength = (n) => Math.min(210, 50 + 0.65 * n);

export function createSim(flags, { collide = false, rand = Math.random } = {}) {
  const n = flags.length;
  const fill = collide ? 0.3 : 0.22;
  const h = Math.min(0.17, Math.sqrt((fill * Math.PI) / Math.max(n, 1) / 1.5));
  const golden = Math.PI * (3 - Math.sqrt(5));
  const bodies = shuffle([...flags], rand).map((flag, i) => {
    const d = Math.sqrt((i + 0.5) / n) * (0.92 - h);
    const a = i * golden;
    const dir = rand() * Math.PI * 2;
    return {
      flag, hh: h / 2,
      x: Math.cos(a) * d, y: Math.sin(a) * d,
      vx: Math.cos(dir) * SPEED, vy: Math.sin(dir) * SPEED,
      out: false, gone: false, place: 0,
    };
  });
  return {
    bodies, total: n, inside: n, collide,
    length: roundLength(n),
    angle: rand() * Math.PI * 2, gap: GAP_MIN, spin: 0.4,
    sinceEscape: 0, time: 0,
    events: [], winner: null,
  };
}

const halfW = (b) => b.hh * (b.flag.aspect || 1.5);

// The gap steers the round toward its length: it opens while the field is behind schedule
// or nothing has escaped for a while. It only ever opens, and slowly, so it reads as the
// ring wearing open rather than the game reaching in.
function pace(sim) {
  const t = Math.min(1, sim.time / sim.length);
  const target = Math.max(1, sim.total * Math.pow(1 - t, 1.3));
  const behind = (sim.inside - target) / sim.total;
  const stall = Math.max(0, sim.sinceEscape - 3) * 0.12;
  const gap = Math.min(1.3, Math.max(GAP_MIN, GAP_MIN + 6 * behind + stall));
  const spin = 0.4 + 0.9 * (1 - sim.inside / sim.total);
  return { gap, spin };
}

function collidePairs(live) {
  for (let i = 0; i < live.length; i++) {
    const a = live[i];
    const aw = halfW(a);
    for (let j = i + 1; j < live.length; j++) {
      const b = live[j];
      const ox = aw + halfW(b) - Math.abs(b.x - a.x);
      if (ox <= 0) continue;
      const oy = a.hh + b.hh - Math.abs(b.y - a.y);
      if (oy <= 0) continue;
      if (ox < oy) {
        const s = Math.sign(b.x - a.x) || 1;
        a.x -= s * ox / 2; b.x += s * ox / 2;
        if ((b.vx - a.vx) * s < 0) [a.vx, b.vx] = [b.vx, a.vx];
      } else {
        const s = Math.sign(b.y - a.y) || 1;
        a.y -= s * oy / 2; b.y += s * oy / 2;
        if ((b.vy - a.vy) * s < 0) [a.vy, b.vy] = [b.vy, a.vy];
      }
    }
  }
}

export function step(sim, dt) {
  const { gap, spin } = pace(sim);
  if (gap > sim.gap) sim.gap = Math.min(gap, sim.gap + GAP_RATE * dt);
  // Spin eases toward its pace instead of stepping on each escape.
  sim.spin += (spin - sim.spin) * Math.min(1, dt * 0.5);
  sim.angle = wrap(sim.angle + sim.spin * dt);
  sim.time += dt;
  sim.sinceEscape += dt;

  const live = [];
  for (const b of sim.bodies) {
    if (b.gone) continue;
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.out) {
      if (Math.hypot(b.x, b.y) > 3.5) b.gone = true;
      continue;
    }
    live.push(b);
  }

  if (sim.collide) {
    collidePairs(live);
    // Swapping velocities keeps energy, but a pile can still lock up against the wall;
    // a gentle pull toward the cruising speed keeps it a screensaver.
    for (const b of live) {
      const s = Math.hypot(b.vx, b.vy) || 1e-6;
      const k = 1 + (SPEED / s - 1) * Math.min(1, dt * 2);
      b.vx *= k; b.vy *= k;
    }
  }

  for (const b of live) {
    const d = Math.hypot(b.x, b.y);
    if (d > 1) {
      // The centre only gets past the wall through the gap. It keeps going the way it was.
      b.out = true;
      b.place = sim.inside;
      sim.inside--;
      sim.sinceEscape = 0;
      sim.events.push(b);
      continue;
    }
    const hw = halfW(b);
    if (d + Math.hypot(hw, b.hh) <= 1) continue;
    // The ends of the wall are corners: a flag that catches one is knocked off it at an angle
    // instead of bouncing as if the wall carried on across the gap.
    for (const side of [1, -1]) {
      const a = sim.angle + side * sim.gap;
      const px = Math.cos(a) - b.x, py = Math.sin(a) - b.y;
      if (Math.abs(px) >= hw || Math.abs(py) >= b.hh) continue;
      const len = Math.hypot(px, py) || 1e-6;
      const cx = -px / len, cy = -py / len;
      const vn = b.vx * cx + b.vy * cy;
      if (vn < 0) { b.vx -= 2 * vn * cx; b.vy -= 2 * vn * cy; }
      const f = Math.min(hw / (Math.abs(px) || 1e-9), b.hh / (Math.abs(py) || 1e-9));
      const push = len * (f - 1);
      b.x += cx * push; b.y += cy * push;
    }
    // Only a corner can reach past the circle first, and it hits the wall only where there is
    // wall at its own angle — a corner poking through the gap touches nothing.
    let deepest = 0, wx = 0, wy = 0;
    for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const kx = b.x + sx * hw, ky = b.y + sy * b.hh;
      const r = Math.hypot(kx, ky);
      if (r <= 1 + deepest) continue;
      if (Math.abs(wrap(Math.atan2(ky, kx) - sim.angle)) < sim.gap) continue;
      deepest = r - 1; wx = kx / r; wy = ky / r;
    }
    if (!deepest) continue;
    const vn = b.vx * wx + b.vy * wy;
    if (vn > 0) { b.vx -= 2 * vn * wx; b.vy -= 2 * vn * wy; }
    b.x -= wx * deepest; b.y -= wy * deepest;
  }

  if (sim.inside <= 1 && !sim.winner) {
    sim.winner = sim.bodies.find((b) => !b.out) || sim.events[sim.events.length - 1];
    sim.winner.place = 1;
  }
}

function readStore() {
  try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; }
}
function writeStore(s) {
  try { localStorage.setItem(STORE, JSON.stringify(s)); } catch { /* private mode */ }
}

export class FlagRing {
  constructor(container, onExit, onRoute = () => {}) {
    this.container = container;
    this.onExit = onExit;
    this.onRoute = onRoute;
    this.flags = null;
    this.sprites = new Map();
    this.running = false;
    this.settings = { region: 'all', territories: false, collide: false, watch: [] };
    this._raf = 0;
    this._onKey = (e) => this._key(e);
    this._build();
  }

  _build() {
    this.container.innerHTML = `
      <div class="flag-ring-bar">
        <button class="btn flag-ring-back" type="button">← Menu</button>
        <select class="flag-ring-region" aria-label="Region">
          ${REGIONS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
        </select>
        <label class="flag-ring-check"><input type="checkbox" class="flag-ring-territories"> Territories</label>
        <label class="flag-ring-check"><input type="checkbox" class="flag-ring-collide"> Flags collide</label>
        <span class="flag-ring-watch">
          <input class="flag-ring-watch-input" list="flag-ring-names" placeholder="Watch a flag…" autocomplete="off">
          <datalist id="flag-ring-names"></datalist>
        </span>
        <span class="flag-ring-chips"></span>
        <button class="btn flag-ring-new" type="button" title="New round">↻</button>
        <button class="btn flag-ring-fs" type="button" title="Fullscreen (f)">⛶</button>
      </div>
      <div class="flag-ring-status">
        <span class="flag-ring-count"></span>
        <span class="flag-ring-last"></span>
        <span class="flag-ring-intro" hidden></span>
      </div>
      <div class="flag-ring-stage">
        <canvas class="flag-ring-canvas"></canvas>
        <div class="flag-ring-banner" hidden></div>
        <div class="flag-ring-winner" hidden>
          <img alt="">
          <div class="flag-ring-winner-name"></div>
          <div class="flag-ring-winner-sub">is the last flag standing</div>
        </div>
      </div>`;
    const $ = (s) => this.container.querySelector(s);
    this.canvas = $('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.countEl = $('.flag-ring-count');
    this.lastEl = $('.flag-ring-last');
    this.chipsEl = $('.flag-ring-chips');
    this.bannerEl = $('.flag-ring-banner');
    this.introEl = $('.flag-ring-intro');
    this.winnerEl = $('.flag-ring-winner');
    this.regionEl = $('.flag-ring-region');
    this.territoriesEl = $('.flag-ring-territories');
    this.collideEl = $('.flag-ring-collide');
    this.watchInput = $('.flag-ring-watch-input');
    this.namesEl = $('#flag-ring-names');

    $('.flag-ring-back').addEventListener('click', () => this.onExit());
    $('.flag-ring-fs').addEventListener('click', () => this._fullscreen());
    $('.flag-ring-new').addEventListener('click', () => this._newRound());
    this.regionEl.addEventListener('change', () => this._set({ region: this.regionEl.value }, true));
    this.territoriesEl.addEventListener('change', () => this._set({ territories: this.territoriesEl.checked }, true));
    this.collideEl.addEventListener('change', () => this._set({ collide: this.collideEl.checked }, true));
    this.watchInput.addEventListener('change', () => this._addWatch(this.watchInput.value));
    this.watchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._addWatch(this.watchInput.value);
    });
    this.chipsEl.addEventListener('click', (e) => {
      const code = e.target.closest('[data-code]')?.dataset.code;
      if (code) this._set({ watch: this.settings.watch.filter((c) => c !== code) }, false);
    });
  }

  async loadData() {
    if (this.flags) return;
    const [resp] = await Promise.all([fetch('data/flags.json'), loadEntities()]);
    this.flags = (await resp.json()).flags;
    this.byCode = new Map(this.flags.map((f) => [f.code, f]));
    this.namesEl.innerHTML = this.flags
      .map((f) => `<option value="${f.name.replace(/"/g, '&quot;')}">`).join('');
    for (const f of this.flags) this._sprite(f);
  }

  // Each flag is drawn once into a sprite at its own aspect, so a frame is one drawImage
  // per flag.
  _sprite(flag) {
    const img = new Image();
    img.onload = () => {
      flag.aspect = img.width / img.height;
      const c = document.createElement('canvas');
      c.height = SPRITE_H;
      c.width = Math.round(SPRITE_H * flag.aspect);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      this.sprites.set(flag.code, c);
    };
    img.src = flagUrl(flag.code, 'w160');
  }

  // `params` comes from the URL; anything it leaves out falls back to what was last used.
  start(params = new URLSearchParams()) {
    this.stop();
    const saved = readStore();
    const s = { ...this.settings, ...saved };
    if (params.has('region')) s.region = params.get('region');
    if (params.has('territories')) s.territories = params.get('territories') === '1';
    if (params.has('collide')) s.collide = params.get('collide') === '1';
    if (params.has('watch')) s.watch = params.get('watch').split(',').filter(Boolean);
    if (!REGIONS.some(([v]) => v === s.region)) s.region = 'all';
    s.watch = s.watch.filter((c) => this.byCode.has(c));
    this.settings = s;
    this._syncControls();
    this._publish();

    this.running = true;
    document.addEventListener('keydown', this._onKey);
    this._newRound();
    let last = performance.now();
    let acc = 0;
    const frame = (now) => {
      if (!this.running) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (this.intro > 0) {
        this.intro -= dt;
        this._showIntro();
      } else if (!this.sim.winner) {
        if (!this.introEl.hidden) this.introEl.hidden = true;
        acc += dt;
        while (acc >= STEP) { step(this.sim, STEP); acc -= STEP; }
        this._drainEvents(now);
      } else {
        acc = 0;
        this._drainEvents(now);
        this._win();
      }
      if (this._bannerUntil && now > this._bannerUntil) {
        this.bannerEl.hidden = true;
        this._bannerUntil = 0;
      }
      this._draw(now);
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
    if (document.fullscreenElement && this.container.closest('.screen')?.contains(document.fullscreenElement)) {
      document.exitFullscreen().catch(() => {});
    }
  }

  _pool() {
    const { region, territories } = this.settings;
    return this.flags.filter((f) => {
      if (!inCountryPool(f.code, { territories })) return false;
      return region === 'all' || getEntity(f.code)?.continent === region;
    });
  }

  _set(patch, restart) {
    this.settings = { ...this.settings, ...patch };
    this._syncControls();
    this._publish();
    if (restart) this._newRound();
    else this._renderChips();
  }

  _publish() {
    const { region, territories, collide, watch } = this.settings;
    writeStore(this.settings);
    this.onRoute({
      region: region === 'all' ? null : region,
      territories: territories ? '1' : null,
      collide: collide ? '1' : null,
      watch: watch.length ? watch.join(',') : null,
    });
  }

  _syncControls() {
    this.regionEl.value = this.settings.region;
    this.territoriesEl.checked = this.settings.territories;
    this.collideEl.checked = this.settings.collide;
  }

  _addWatch(raw) {
    const q = raw.trim().toLowerCase();
    this.watchInput.value = '';
    if (!q) return;
    const f = this.flags.find((x) => x.name.toLowerCase() === q || x.code === q)
      || this.flags.find((x) => x.name.toLowerCase().startsWith(q));
    if (!f || this.settings.watch.includes(f.code)) return;
    this._set({ watch: [...this.settings.watch, f.code] }, false);
  }

  _renderChips() {
    const sim = this.sim;
    this.chipsEl.innerHTML = this.settings.watch.map((code) => {
      const f = this.byCode.get(code);
      const b = sim?.bodies.find((x) => x.flag.code === code);
      let state = '';
      if (!b) state = 'not in this round';
      else if (b.place === 1) state = 'winner';
      else if (b.out) state = `out · ${ordinal(b.place)}`;
      const cls = !b ? 'absent' : b.out ? 'out' : b.place === 1 ? 'won' : 'alive';
      return `<button type="button" class="flag-ring-chip ${cls}" data-code="${code}" title="Stop watching">
        <img src="${flagUrl(code, 'w40')}" alt="">${f.name}${state ? ` <em>${state}</em>` : ''} ×</button>`;
    }).join('');
  }

  _newRound() {
    clearTimeout(this._winTimer);
    this.sim = createSim(this._pool(), { collide: this.settings.collide });
    this.intro = INTRO_S;
    this._winShown = false;
    this.winnerEl.hidden = true;
    this.bannerEl.hidden = true;
    this.lastEl.textContent = '';
    this._renderChips();
  }

  _showIntro() {
    const watched = this.settings.watch
      .filter((c) => this.sim.bodies.some((b) => b.flag.code === c))
      .map((c) => this.byCode.get(c).name);
    const n = Math.ceil(this.intro);
    const text = `Starting in ${Math.max(n, 1)}${watched.length ? ` · watching ${watched.join(', ')}` : ''}`;
    this.introEl.hidden = this.intro <= 0;
    if (this.introEl.textContent !== text) this.introEl.textContent = text;
  }

  _drainEvents(now) {
    const events = this.sim.events.splice(0);
    if (!events.length) return;
    const last = events[events.length - 1];
    this.lastEl.textContent = `out: ${last.flag.name}`;
    const watched = events.filter((b) => this.settings.watch.includes(b.flag.code));
    if (watched.length) {
      const b = watched[watched.length - 1];
      this.bannerEl.innerHTML = `<img src="${flagUrl(b.flag.code, 'w160')}" alt="">
        <span><b>${b.flag.name}</b> is out — ${ordinal(b.place)} of ${this.sim.total}</span>`;
      this.bannerEl.hidden = false;
      this._bannerUntil = now + 3500;
      this._renderChips();
    }
  }

  _win() {
    if (this._winShown) return;
    this._winShown = true;
    this.introEl.hidden = true;
    const f = this.sim.winner.flag;
    this.winnerEl.querySelector('img').src = flagUrl(f.code, 'w640');
    this.winnerEl.querySelector('.flag-ring-winner-name').textContent = f.name;
    this.winnerEl.hidden = false;
    this._renderChips();
    this._winTimer = setTimeout(() => { if (this.running) this._newRound(); }, WIN_HOLD_MS);
  }

  _key(e) {
    if (e.target.closest && e.target.closest('input, textarea, select')) return;
    if (e.key === 'f' || e.key === 'F') this._fullscreen();
  }

  _fullscreen() {
    const el = this.container.closest('.screen') || this.container;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
  }

  _draw(now) {
    const { canvas, ctx, sim } = this;
    // Past 2x the canvas costs more than the eye gains, and phones report 3.
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const R = Math.min(w, h) * 0.44;
    const cx = w / 2, cy = h / 2;

    // The glow is two wider translucent strokes: shadowBlur on a moving arc is the most
    // expensive thing a frame could do.
    const lw = Math.max(3, R * 0.018);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, R + lw / 2, sim.angle + sim.gap, sim.angle - sim.gap + Math.PI * 2);
    for (const [width, color] of [[lw * 5, '#58a6ff14'], [lw * 2.5, '#58a6ff33'], [lw, '#58a6ff']]) {
      ctx.lineWidth = width;
      ctx.strokeStyle = color;
      ctx.stroke();
    }

    const watch = new Set(this.settings.watch);
    const marked = [];
    ctx.beginPath();
    for (const b of sim.bodies) {
      if (b.gone) continue;
      if (watch.has(b.flag.code)) { marked.push(b); continue; }
      this._drawFlag(b, R, cx, cy, b.out ? 0.5 : 1);
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // Watched flags go on top, outlined and named, so they can be followed in a crowd.
    const pulse = this.intro > 0 ? 1 + 0.25 * Math.abs(Math.sin(now / 180)) : 1;
    for (const b of marked) {
      const k = this.intro > 0 ? 1.8 * pulse : 1.35;
      const hw = halfW(b) * R * k, hh = b.hh * R * k;
      const x = cx + b.x * R, y = cy + b.y * R;
      const glow = b.out ? '#f85149' : '#ffd33d';
      ctx.strokeStyle = glow + '66';
      ctx.lineWidth = 4;
      ctx.strokeRect(x - hw - 7, y - hh - 7, hw * 2 + 14, hh * 2 + 14);
      ctx.fillStyle = glow;
      ctx.fillRect(x - hw - 3, y - hh - 3, hw * 2 + 6, hh * 2 + 6);
      ctx.beginPath();
      this._drawFlag(b, R, cx, cy, 1, k);
      ctx.save();
      ctx.font = '600 13px "Space Grotesk", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#0d1117';
      ctx.fillStyle = '#fff';
      ctx.strokeText(b.flag.name, x, y - hh - 8);
      ctx.fillText(b.flag.name, x, y - hh - 8);
      ctx.restore();
    }

    const left = `${sim.inside} of ${sim.total} left`;
    if (this.countEl.textContent !== left) this.countEl.textContent = left;
  }

  _drawFlag(b, R, cx, cy, alpha, scale = 1) {
    const { ctx } = this;
    const hw = halfW(b) * R * scale, hh = b.hh * R * scale;
    const x = cx + b.x * R - hw, y = cy + b.y * R - hh;
    ctx.globalAlpha = alpha;
    const sprite = this.sprites.get(b.flag.code);
    if (sprite) ctx.drawImage(sprite, x, y, hw * 2, hh * 2);
    else {
      ctx.fillStyle = (b.flag.colors && b.flag.colors[0]) || '#888';
      ctx.fillRect(x, y, hw * 2, hh * 2);
    }
    // Outlines join the caller's path and are stroked once per frame.
    ctx.rect(x, y, hw * 2, hh * 2);
    ctx.globalAlpha = 1;
  }
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
