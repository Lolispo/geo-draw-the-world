// Choropleth world map for the Data Explorer (TODOS #48). One metric at a time:
// countries shaded by their value, hover for the figure, tap for the country panel.
//
// Geometry is the same Mercator world the draw game plays on (data/countries-*.json,
// 1600x1600 space) — no mapping library, no second projection to keep in step.

import { traceRing, hidpiReset, fitBounds, multiPolygonBoundingBox } from './utils.js';

// Five equal-count bands, not five equal-width ones: GDP and population are so skewed
// that a linear ramp paints the entire world the lowest colour and calls it a map.
const BANDS = 5;

// Viridis' bright half. The dark end of the full ramp disappears into this app's
// background, and a band you cannot see is not a band.
const RAMP = ['#3b528b', '#21918c', '#35b779', '#90d743', '#fde725'];
const NO_DATA = '#39414f';   // in scope, but the metric has no figure for it
const OUT_OF_SCOPE = '#262c36'; // drawn so the world has no holes, never shaded
const OCEAN = '#121720';
// How far in the map may be zoomed, as a multiple of the fitted view (TODOS #60).
const MAX_ZOOM = 12;
const BORDER = 'rgba(0,0,0,0.45)';

export class ExplorerMap {
  constructor(canvas, { onPick, formatValue }) {
    this.canvas = canvas;
    this.onPick = onPick;
    this.formatValue = formatValue;
    this.ctx = canvas.getContext('2d');
    // Colour-index picking: every country is also drawn to an offscreen buffer in a
    // colour that *is* its index, so hit-testing is one getImageData of one pixel
    // rather than point-in-polygon against a quarter of a million vertices.
    this.pick = document.createElement('canvas');
    this.pickCtx = this.pick.getContext('2d', { willReadFrequently: true });
    // The shaded world is also kept as a bitmap. Moving the mouse changes one outline,
    // and redrawing 251 countries to restyle one of them costs 15ms a move.
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

  // `values` is code -> number; `scope` decides what may be shaded at all.
  setMetric({ values, format, scope }) {
    this.values = values || {};
    this.format = format;
    this.scope = scope;   // Set of codes, or null for every country
    this._bands = this._quantiles();
    return this;
  }

  // Band edges from the values actually on screen. Fewer distinct values than bands
  // (a thin continent filter) collapses to as many bands as there are.
  _quantiles() {
    const vals = this.countries
      .filter((c) => this._inScope(c.code) && this.values[c.code] != null)
      .map((c) => this.values[c.code])
      .sort((a, b) => a - b);
    if (!vals.length) return [];
    const distinct = new Set(vals).size;
    const n = Math.min(BANDS, distinct);
    const edges = [];
    for (let i = 1; i < n; i++) edges.push(vals[Math.floor((i / n) * vals.length)]);
    return { edges, min: vals[0], max: vals[vals.length - 1], n };
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

    // Pick buffer at CSS pixels: one device pixel of slop at a border is not worth
    // the memory of a HiDPI copy.
    this.pick.width = w;
    this.pick.height = h;
    this.pickCtx.setTransform(1, 0, 0, 1, 0, 0);
    this.pickCtx.clearRect(0, 0, w, h);
    this._index = new Map();

    this.countries.forEach((c, i) => {
      this._path(ctx, c, t);
      ctx.fillStyle = this._fillColor(c.code);
      ctx.fill('nonzero');
      ctx.lineWidth = 0.5;
      ctx.strokeStyle = BORDER;
      ctx.stroke();

      const key = i + 1;
      const rgb = `rgb(${(key >> 16) & 255},${(key >> 8) & 255},${key & 255})`;
      this._index.set(rgb, c);
      this._path(this.pickCtx, c, t);
      this.pickCtx.fillStyle = rgb;
      this.pickCtx.fill('nonzero');
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
    this._path(ctx, this.hovered, this._t);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  }

  _at(ev) {
    if (!this._index) return null;
    const r = this.canvas.getBoundingClientRect();
    const x = Math.round(ev.clientX - r.left), y = Math.round(ev.clientY - r.top);
    if (x < 0 || y < 0 || x >= this.pick.width || y >= this.pick.height) return null;
    const [cr, cg, cb, ca] = this.pickCtx.getImageData(x, y, 1, 1).data;
    if (!ca) return null;
    // An antialiased border pixel blends two indices into a colour that is neither, so
    // it simply misses — a one-pixel dead line along coastlines, which nobody aims at.
    return this._index.get(`rgb(${cr},${cg},${cb})`) || null;
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
