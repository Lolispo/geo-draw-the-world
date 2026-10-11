// Choropleth world map for the Data Explorer (TODOS #48). One metric at a time:
// countries shaded by their value, hover for the figure, tap for the country panel.
//
// Geometry is the same Mercator world the draw game plays on (data/countries-*.json,
// 1600x1600 space) — no mapping library, no second projection to keep in step.

import {
  traceRing, hidpiReset, fitBounds, multiPolygonBoundingBox, pointInMultiPolygon,
} from './utils.js';

// Equal-count bands, not equal-width ones: GDP and population are so skewed that a
// linear ramp paints the entire world the lowest colour and calls it a map. Seven
// rather than five, because five put every rich country in one band — at five, Europe
// spanned 3 bands on GDP per capita; at seven it spans 5 (owner review, 2026-10-11).
const BANDS = 7;

// One hue, light to dark — the rule for a sequential scale. The old ramp ran
// blue → teal → green → yellow, which nobody can order without reading the legend
// first (owner, 2026-10-11); a single hue carries "more" in the colour itself. The
// anchor flips on a dark surface: low recedes toward the background, high is bright.
// Steps are a validated blue ramp (100–700), luminance strictly increasing.
// "More colour = higher" is the instinct (owner, 2026-10-11), and on a dark surface
// that can only go so far: brightness has to carry the ordering, because a ramp that
// gets darker as values rise makes the highest countries vanish into the background.
// So this one rises in brightness *and* in chroma until near the top, ending vivid
// rather than washed white — the old ramp lost saturation exactly where the values
// were highest (0.84 at the bottom, 0.18 at the top; this one 0.22 → 0.78 → 0.46).
const RAMP = ['#17324f', '#17497a', '#1563a8', '#0f80d6', '#2f9ceb', '#58b9f7', '#8ad4ff'];
// The neutrals separate from the ramp by *chroma*, not lightness: a grey of 0.06
// chroma cannot be mistaken for a band of 0.22–0.78 however close its brightness.
// "No figure" must never read as "lowest band".
const NO_DATA = '#4a5159';      // in scope, but the metric has no figure for it
const OUT_OF_SCOPE = '#23272f'; // drawn so the world has no holes, never shaded
const OCEAN = '#0b0e13';
// How far in the map may be zoomed, as a multiple of the fitted view (TODOS #60).
const MAX_ZOOM = 12;

// A country thinner than this on screen is drawn as a dot of this size instead, and
// can be hovered within it. Monaco is 0.1px wide at world zoom: without a floor it is
// not merely hard to hit, it is not drawn at all (owner, 2026-10-11).
const MIN_MARK = 4;
const HOVER_MARK = 11;
const BORDER = 'rgba(0,0,0,0.45)';

export class ExplorerMap {
  constructor(canvas, { onPick, formatValue }) {
    this.canvas = canvas;
    this.onPick = onPick;
    this.formatValue = formatValue;
    this.ctx = canvas.getContext('2d');
    // Hit-testing is point-in-polygon against the countries whose bounding box holds
    // the cursor — usually one or two. It replaced colour-index picking, which was
    // fast but *wrong*: canvas antialiasing blends two neighbours' index colours into
    // a third valid index, so every border pixel could name a country that is not
    // there, and a sub-pixel country is all border. Measured on a 40px test: two
    // neighbours drawn as 5 and 200 produced 16 other valid indices along one edge,
    // which is how hovering Andorra reported San Marino (owner, 2026-10-11).
    this.base = document.createElement('canvas');
    this.baseCtx = this.base.getContext('2d');
    this.countries = [];
    this.hovered = null;
    // Zoom/pan sits on top of the fit, so a continent filter still frames its subject
    // and zoom is relative to that (TODOS #60). scale 1 == fitted == fully zoomed out.
    this.view = { scale: 1, ox: 0, oy: 0 };
    this._bind();
  }

  setWorld(countries) {
    this.countries = countries;
    // World-space boxes, computed once: the geometry never moves, only the view does.
    this._boxes = countries.map((c) => multiPolygonBoundingBox(c.polygons));
    return this;
  }

  resetView() {
    this.view = { scale: 1, ox: 0, oy: 0 };
    this.render();
    this.onViewChange?.(1);
  }

  // Panning past the edges would leave the map floating in the background, and at the
  // floor the view is the fitted one by definition.
  _clampView(w, h) {
    if (this.view.scale <= 1) { this.view = { scale: 1, ox: 0, oy: 0 }; return; }
    const s = this.view.scale;
    this.view.ox = Math.min(0, Math.max(w * (1 - s), this.view.ox));
    this.view.oy = Math.min(0, Math.max(h * (1 - s), this.view.oy));
  }

  _zoomAbout(factor, anchor) {
    const [w, h] = this._size || [0, 0];
    const next = Math.max(1, Math.min(MAX_ZOOM, this.view.scale * factor));
    if (next === this.view.scale) return false;
    const ratio = next / this.view.scale;
    this.view.ox = anchor[0] - (anchor[0] - this.view.ox) * ratio;
    this.view.oy = anchor[1] - (anchor[1] - this.view.oy) * ratio;
    this.view.scale = next;
    this._clampView(w, h);
    return true;
  }

  // `values` is code -> number; `scope` decides what may be shaded at all; `scale` is
  // how the bands are cut — by rank (equal count) or by value on a log axis.
  setMetric({ values, format, scope, scale = 'rank' }) {
    this.values = values || {};
    this.format = format;
    this.scope = scope;   // Set of codes, or null for every country
    this.scale = scale;
    this._bands = this._computeBands();
    return this;
  }

  // Band edges from the values actually on screen. Fewer distinct values than bands
  // (a thin continent filter) collapses to as many bands as there are.
  // Rank bands answer "where does this country place"; log bands answer "how big is
  // it". On a long tail the two disagree sharply and the question decides which is
  // right: by rank, every economy from Sweden ($579B) to the United States ($27.8T)
  // shares the top band, because they are the top 31 either way (owner, 2026-10-11).
  _computeBands() {
    if (this.scale === 'log') {
      const vals = this._scopedValues();
      if (vals.length) {
        const min = vals[0], max = vals[vals.length - 1];
        if (min > 0 && max > min) {
          const lo = Math.log10(min), hi = Math.log10(max);
          const edges = [];
          for (let i = 1; i < BANDS; i++) edges.push(10 ** (lo + ((hi - lo) * i) / BANDS));
          return { edges, min, max, n: BANDS, scale: 'log' };
        }
      }
    }
    return { ...this._quantiles(), scale: 'rank' };
  }

  _scopedValues() {
    return this.countries
      .filter((c) => this._inScope(c.code) && this.values[c.code] != null)
      .map((c) => this.values[c.code])
      .sort((a, b) => a - b);
  }

  _quantiles() {
    const vals = this._scopedValues();
    if (!vals.length) return {};
    const min = vals[0], max = vals[vals.length - 1];
    const cut = (arr, n) => {
      const out = [];
      for (let i = 1; i < n; i++) out.push(arr[Math.floor((i / n) * arr.length)]);
      return out;
    };
    // Edges equal to the minimum carry no information, and repeated ones are worse
    // than useless: 181 of 213 countries generate no nuclear electricity at all, so
    // every edge came out 0 and `value >= edge` put all of them in the *top* band —
    // the map painted "no nuclear" the same colour as France at 68.8% (found while
    // reviewing the bands, 2026-10-11).
    const clean = (es) => [...new Set(es)].filter((e) => e > min).sort((a, b) => a - b);

    let edges = clean(cut(vals, BANDS));
    const above = vals.filter((v) => v > min);
    // A pile at the minimum swallows the edges; give the pile the bottom band and
    // spread the remaining bands over what is actually above it.
    if (edges.length < BANDS - 1 && above.length) {
      edges = clean([above[0], ...cut(above, BANDS - 1)]);
    }
    return { edges, min, max, n: edges.length + 1 };
  }

  _inScope(code) {
    return !this.scope || this.scope.has(code);
  }

  _bandOf(value) {
    const { edges } = this._bands;
    let i = 0;
    while (i < edges.length && value >= edges[i]) i++;
    return i;
  }

  // Fit the shaded set, so a continent filter zooms to that continent rather than
  // leaving it a smudge in the corner of an otherwise empty world.
  _fit(w, h) {
    const subject = this.countries.filter((c) => this._inScope(c.code));
    const rings = (subject.length ? subject : this.countries).flatMap((c) => c.polygons);
    return fitBounds(multiPolygonBoundingBox(rings), w, h, 8);
  }

  _fillColor(code) {
    if (!this._inScope(code)) return OUT_OF_SCOPE;
    const v = this.values[code];
    if (v == null || !this._bands.n) return NO_DATA;
    return RAMP[Math.round((this._bandOf(v) / Math.max(1, this._bands.n - 1)) * (RAMP.length - 1))];
  }

  _path(ctx, country, t) {
    ctx.beginPath();
    for (const ring of country.polygons) {
      traceRing(ctx, ring.map(([x, y]) => [x * t.scale + t.ox, y * t.scale + t.oy]), false);
    }
  }

  render() {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.round(rect.width), h = Math.round(rect.height);
    if (!w || !h || !this.countries.length) return;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    hidpiReset(this.canvas, this.ctx);
    this._size = [w, h];
    this._clampView(w, h);
    const fit = this._fit(w, h);
    const t = {
      scale: fit.scale * this.view.scale,
      ox: fit.ox * this.view.scale + this.view.ox,
      oy: fit.oy * this.view.scale + this.view.oy,
    };
    this._t = t;

    this.base.width = w * dpr;
    this.base.height = h * dpr;
    const ctx = this.baseCtx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = OCEAN;
    ctx.fillRect(0, 0, w, h);

    this._marks = new Map();   // code -> [x, y] for the ones drawn as a dot
    this.countries.forEach((c, i) => {
      const b = this._boxes[i];
      const w2 = (b.maxX - b.minX) * t.scale, h2 = (b.maxY - b.minY) * t.scale;
      ctx.fillStyle = this._fillColor(c.code);
      if (Math.max(w2, h2) < MIN_MARK) {
        // Below a few pixels an outline is a smudge or nothing at all, so the country
        // becomes a dot of its own colour — visible, and something you can aim at.
        const cx = ((b.minX + b.maxX) / 2) * t.scale + t.ox;
        const cy = ((b.minY + b.maxY) / 2) * t.scale + t.oy;
        this._marks.set(c.code, [cx, cy]);
        ctx.beginPath();
        ctx.arc(cx, cy, MIN_MARK / 2, 0, Math.PI * 2);
        ctx.fill();
        return;   // inside forEach: this country is a dot, not an outline
      }
      this._path(ctx, c, t);
      ctx.fill('nonzero');
      ctx.lineWidth = 0.5;
      ctx.strokeStyle = BORDER;
      ctx.stroke();
    });

    this._paint();
  }

  // Blit the cached world, then outline whatever the cursor is on.
  _paint() {
    if (!this._size) return;
    const [w, h] = this._size;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(this.base, 0, 0, w, h);
    if (!this.hovered) return;
    const dot = this._marks?.get(this.hovered.code);
    if (dot) {
      // A dot you are hovering swells, because the point of hovering a microstate is
      // to see that you found it (owner, 2026-10-11).
      ctx.beginPath();
      ctx.arc(dot[0], dot[1], HOVER_MARK / 2, 0, Math.PI * 2);
      ctx.fillStyle = this._fillColor(this.hovered.code);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      return;
    }
    this._path(ctx, this.hovered, this._t);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  }

  // Canvas point -> the country actually under it. Boxes first, so a hover tests one
  // or two polygons rather than all 251; last match wins, matching the paint order.
  _at(ev) {
    if (!this._t || !this._boxes) return null;
    const [px, py] = this._canvasPos(ev);
    const wx = (px - this._t.ox) / this._t.scale;
    const wy = (py - this._t.oy) / this._t.scale;
    // Dots first, and deliberately: a microstate is 0.1px wide at world zoom, so the
    // pixel you are on is *also* inside the country that surrounds it. Containment
    // would hand you France every time you aimed at Monaco. The small thing wins
    // inside its own mark; everywhere else the geometry decides (owner, 2026-10-11).
    let best = null, bestD = (HOVER_MARK / 2) ** 2;
    for (const [code, [mx, my]] of this._marks || []) {
      const d = (mx - px) ** 2 + (my - py) ** 2;
      if (d <= bestD) { bestD = d; best = code; }
    }
    if (best) return this.countries.find((c) => c.code === best);

    // Smallest match wins, so an enclave is never swallowed by its host.
    let hit = null, hitArea = Infinity;
    for (let i = 0; i < this.countries.length; i++) {
      const b = this._boxes[i];
      if (wx < b.minX || wx > b.maxX || wy < b.minY || wy > b.maxY) continue;
      const area = (b.maxX - b.minX) * (b.maxY - b.minY);
      if (area >= hitArea) continue;
      if (pointInMultiPolygon(wx, wy, this.countries[i].polygons)) {
        hit = this.countries[i];
        hitArea = area;
      }
    }
    return hit;
  }

  _touchPos(touch) {
    const r = this.canvas.getBoundingClientRect();
    return [touch.clientX - r.left, touch.clientY - r.top];
  }

  _pinchState(ev) {
    const [a, b] = [this._touchPos(ev.touches[0]), this._touchPos(ev.touches[1])];
    return {
      dist: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1,
      center: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
    };
  }

  // name + value for whatever is under the cursor, or null.
  hoverLabel() {
    if (!this.hovered) return null;
    const v = this.values[this.hovered.code];
    const inScope = this._inScope(this.hovered.code);
    const value = !inScope ? 'not in this filter'
      : v == null ? 'no data'
        : this.formatValue(this.format, v);
    return `${this.hovered.name} — ${value}`;
  }

  _canvasPos(ev) {
    const r = this.canvas.getBoundingClientRect();
    return [ev.clientX - r.left, ev.clientY - r.top];
  }

  _bind() {
    const move = (ev) => {
      if (this._panFrom) {
        const pos = this._canvasPos(ev);
        this.view.ox += pos[0] - this._panFrom[0];
        this.view.oy += pos[1] - this._panFrom[1];
        this._panFrom = pos;
        this._moved = true;
        this.render();
        return;
      }
      const hit = this._at(ev);
      if (hit === this.hovered) return;
      this.hovered = hit;
      this._paint();
      this.onHover?.(this.hoverLabel(), ev);
    };
    this.canvas.addEventListener('mousemove', move);

    this.canvas.addEventListener('mousedown', (ev) => {
      this._panFrom = this._canvasPos(ev);
      this._moved = false;
      this.canvas.style.cursor = 'grabbing';
    });
    const endPan = () => {
      this._panFrom = null;
      this.canvas.style.cursor = '';
      this.onViewChange?.(this.view.scale);
    };
    window.addEventListener('mouseup', endPan);
    this._unbind = () => window.removeEventListener('mouseup', endPan);

    this.canvas.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      if (this._zoomAbout(ev.deltaY > 0 ? 0.88 : 1.14, this._canvasPos(ev))) {
        this.render();
        this.onViewChange?.(this.view.scale);
      }
    }, { passive: false });

    this.canvas.addEventListener('dblclick', () => this.resetView());

    // Touch: one finger pans, two pinch — the same split the game canvas uses.
    this.canvas.addEventListener('touchstart', (ev) => {
      if (ev.touches.length === 1) this._panFrom = this._touchPos(ev.touches[0]);
      else if (ev.touches.length >= 2) { this._panFrom = null; this._pinch = this._pinchState(ev); }
    }, { passive: true });
    this.canvas.addEventListener('touchmove', (ev) => {
      if (ev.touches.length >= 2) {
        ev.preventDefault();
        const now = this._pinchState(ev);
        const prev = this._pinch || now;
        this._zoomAbout(now.dist / prev.dist, prev.center);
        this.view.ox += now.center[0] - prev.center[0];
        this.view.oy += now.center[1] - prev.center[1];
        this._pinch = now;
        this.render();
        return;
      }
      if (ev.touches.length === 1 && this._panFrom) {
        ev.preventDefault();
        const pos = this._touchPos(ev.touches[0]);
        this.view.ox += pos[0] - this._panFrom[0];
        this.view.oy += pos[1] - this._panFrom[1];
        this._panFrom = pos;
        this._moved = true;
        this.render();
      }
    }, { passive: false });
    this.canvas.addEventListener('touchend', (ev) => {
      if (ev.touches.length === 0) { this._panFrom = null; this._pinch = null; this.onViewChange?.(this.view.scale); }
    }, { passive: true });
    this.canvas.addEventListener('mouseleave', () => {
      if (!this.hovered) return;
      this.hovered = null;
      this._paint();
      this.onHover?.(null);
    });
    this.canvas.addEventListener('click', (ev) => {
      if (this._moved) { this._moved = false; return; }   // that was a pan, not a pick
      const hit = this._at(ev);
      if (hit) this.onPick(hit.code);
    });
  }

  // Swatches with the real value ranges behind them — a ramp with no numbers is
  // decoration.
  // How many bands the data actually supports — not the constant, since ties can
  // collapse them (TODOS #66).
  bandCount() {
    return this._bands && this._bands.n ? this._bands.n : 0;
  }

  // Said in the legend, because the two answer different questions.
  bandBasis() {
    return this._bands?.scale === 'log' ? 'by value, log scale' : 'by rank';
  }

  legendRows() {
    if (!this._bands || !this._bands.n) return [];
    const { edges, min, max, n } = this._bands;
    const bounds = [min, ...edges, max];
    const rows = [];
    for (let i = 0; i < n; i++) {
      rows.push({
        color: RAMP[Math.round((i / Math.max(1, n - 1)) * (RAMP.length - 1))],
        label: `${this.formatValue(this.format, bounds[i])} – ${this.formatValue(this.format, bounds[i + 1])}`,
      });
    }
    rows.push({ color: NO_DATA, label: 'no data' });
    return rows;
  }
}
