// Transform controls: resize and rotate a shape before placing
// Renders in world-coordinate space so scale matches the placement canvas.
// The view frames the shape and the example side by side rather than the whole
// world — at world zoom a country is a few pixels wide and you can't judge it.

import { multiPolygonBoundingBox, hidpiReset } from './utils.js';

const HANDLE_SIZE = 10;
const ROTATE_HANDLE_DIST = 35;

// Padding around the framed content, as a fraction of its larger dimension
const VIEW_PAD_FRAC = 0.18;
// Gap between the player's shape and the example, relative to the larger of the two
const SIDE_GAP_FRAC = 0.35;
// World units. Floor on the framed size, so a microstate example can't zoom in absurdly.
const MIN_VIEW_SIZE = 60;
// Grid steps to choose from, aiming for ~10 lines across the view
const GRID_STEPS = [1, 2, 5, 10, 25, 50, 100, 200, 400];

export class TransformControls {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.shape = null;
    this.activeHandle = null;
    this.initialScale = 1;
    this.initialRotation = 0;
    this.initialMouse = [0, 0];

    // Reference hint shape (random other shape for size comparison)
    this.hintShape = null;
    this.hintLabel = '';
    this.hintOffset = [0, 0];

    // World-space rendering params (passed from main)
    this.worldWidth = 1600;
    this.worldHeight = 1100; // TODOS #24 conformal
    this.regionBounds = null;  // same as world canvas
    this.viewScale = 1;
    this.viewOffset = [0, 0];
    // World-space rect the canvas is framed on. Set in activate(), then only
    // ever grown by _ensureFits().
    this.viewBox = null;

    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
    this._onTouchStart = this._onTouchStart.bind(this);
    this._onTouchMove = this._onTouchMove.bind(this);
    this._onTouchEnd = this._onTouchEnd.bind(this);
  }

  setReferenceShapes(refShapes, currentName) {
    const others = refShapes.filter(s => s.name !== currentName);
    if (others.length === 0) {
      this.hintShape = null;
      this.hintLabel = '';
      this.hintOffset = [0, 0];
      return;
    }
    const pick = others[Math.floor(Math.random() * others.length)];
    this.hintShape = pick;
    this.hintLabel = pick.name;
    this.hintOffset = [0, 0]; // computed in activate()
  }

  setWorldParams(regionBounds, worldWidth, worldHeight) {
    this.regionBounds = regionBounds;
    this.worldWidth = worldWidth || 1600;
    this.worldHeight = worldHeight || 1100;
  }

  // Fit this.viewBox to the canvas. Padding already lives in the box.
  _computeView() {
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.width / dpr;
    const h = this.canvas.height / dpr;

    const b = this.viewBox || {
      minX: 0, minY: 0, maxX: this.worldWidth, maxY: this.worldHeight
    };
    const bw = Math.max(1e-6, b.maxX - b.minX);
    const bh = Math.max(1e-6, b.maxY - b.minY);

    this.viewScale = Math.min(w / bw, h / bh);
    this.viewOffset = [
      w / 2 - (b.minX + bw / 2) * this.viewScale,
      h / 2 - (b.minY + bh / 2) * this.viewScale
    ];
  }

  _unionBoxes(a, b) {
    return {
      minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY),
      maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY)
    };
  }

  _offsetBox(box, [dx, dy]) {
    return {
      minX: box.minX + dx, minY: box.minY + dy,
      maxX: box.maxX + dx, maxY: box.maxY + dy
    };
  }

  // Grow a content box by MIN_VIEW_SIZE and the padding fraction, keeping its centre
  _padded(box) {
    const w = Math.max(box.maxX - box.minX, MIN_VIEW_SIZE);
    const h = Math.max(box.maxY - box.minY, MIN_VIEW_SIZE);
    const pad = Math.max(w, h) * VIEW_PAD_FRAC;
    const cx = (box.minX + box.maxX) / 2;
    const cy = (box.minY + box.maxY) / 2;
    return {
      minX: cx - w / 2 - pad, maxX: cx + w / 2 + pad,
      minY: cy - h / 2 - pad, maxY: cy + h / 2 + pad
    };
  }

  // Size of the example shape, which anchors both the starting scale and the framing
  _hintWorldSize() {
    if (!this.hintShape) return 0;
    const bb = this.hintShape.getBoundingBox();
    return Math.max(bb.maxX - bb.minX, bb.maxY - bb.minY);
  }

  // Used when there is no example to anchor to (Hard mode)
  _fallbackWorldSize() {
    if (this.regionBounds) {
      const b = this.regionBounds;
      return Math.max(b.maxX - b.minX, b.maxY - b.minY) * 0.3;
    }
    return Math.max(this.worldWidth, this.worldHeight) * 0.15;
  }

  _viewCentre() {
    if (this.regionBounds) {
      const b = this.regionBounds;
      return [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2];
    }
    return [this.worldWidth / 2, this.worldHeight / 2];
  }

  // Lay the player shape and the example out side by side around the view centre,
  // then frame the pair. World position here is throwaway — the placement canvas
  // repositions the shape when it takes over.
  _layout(playerSize, hintSize) {
    const centre = this._viewCentre();

    if (!this.hintShape) {
      this.shape.position = centre;
      this.hintOffset = [0, 0];
      this.viewBox = this._padded(this.shape.getBoundingBox());
      return;
    }

    const sep = playerSize / 2 + Math.max(playerSize, hintSize) * SIDE_GAP_FRAC + hintSize / 2;
    this.shape.position = [centre[0] - sep / 2, centre[1]];

    const hintBB = this.hintShape.getBoundingBox();
    this.hintOffset = [
      centre[0] + sep / 2 - (hintBB.minX + hintBB.maxX) / 2,
      centre[1] - (hintBB.minY + hintBB.maxY) / 2
    ];

    this.viewBox = this._padded(this._unionBoxes(
      this.shape.getBoundingBox(),
      this._offsetBox(hintBB, this.hintOffset)
    ));
  }

  // Grow the view (never shrink it) so the shape and its handles stay reachable
  // after scaling up. Monotonic within a sizing session, so dragging a corner
  // doesn't make the view breathe in and out.
  _ensureFits() {
    if (!this.shape || !this.viewBox) return;
    const bb = this.shape.getBoundingBox();
    // Handles are screen-space: corner squares plus the rotate arm above the shape,
    // with enough slack that they don't end up hugging the canvas edge
    const margin = (ROTATE_HANDLE_DIST + HANDLE_SIZE * 4) / this.viewScale;
    const needed = {
      minX: bb.minX - margin, maxX: bb.maxX + margin,
      minY: bb.minY - margin, maxY: bb.maxY + margin
    };
    const b = this.viewBox;
    if (needed.minX >= b.minX && needed.maxX <= b.maxX &&
        needed.minY >= b.minY && needed.maxY <= b.maxY) return;

    this.viewBox = this._unionBoxes(b, needed);
    this._computeView();
  }

  // World rect actually visible on canvas. Wider than viewBox whenever the box
  // and the canvas differ in aspect ratio, which is what the grid should cover.
  _visibleWorldRect() {
    const dpr = window.devicePixelRatio || 1;
    const [minX, minY] = this._screenToWorld(0, 0);
    const [maxX, maxY] = this._screenToWorld(this.canvas.width / dpr, this.canvas.height / dpr);
    return { minX, minY, maxX, maxY };
  }

  _gridStep() {
    const b = this.viewBox;
    if (!b) return 100;
    const target = Math.max(b.maxX - b.minX, b.maxY - b.minY) / 10;
    return GRID_STEPS.find(s => s >= target) || GRID_STEPS[GRID_STEPS.length - 1];
  }

  _worldToScreen(wx, wy) {
    return [wx * this.viewScale + this.viewOffset[0], wy * this.viewScale + this.viewOffset[1]];
  }

  _screenToWorld(sx, sy) {
    return [(sx - this.viewOffset[0]) / this.viewScale, (sy - this.viewOffset[1]) / this.viewScale];
  }

  activate(shape) {
    this.shape = shape;
    shape.position = this._viewCentre();
    shape.scale = 1;
    shape.rotation = 0;

    const bb = multiPolygonBoundingBox(shape.localPolygons);
    const shapeLocalSize = Math.max(bb.width, bb.height);

    // Start the shape at the example's size. That's a neutral anchor — the example
    // is a random other country — and it guarantees both fit the framing at once.
    const hintSize = this._hintWorldSize();
    const playerSize = Math.max(hintSize || this._fallbackWorldSize(), MIN_VIEW_SIZE / 2);
    if (shapeLocalSize > 0) {
      shape.scale = playerSize / shapeLocalSize;
    }

    this._layout(playerSize, hintSize);
    this._computeView();

    this.canvas.style.display = 'block';
    this.canvas.addEventListener('mousedown', this._onMouseDown);
    this.canvas.addEventListener('mousemove', this._onMouseMove);
    this.canvas.addEventListener('mouseup', this._onMouseUp);
    this.canvas.addEventListener('touchstart', this._onTouchStart, { passive: false });
    this.canvas.addEventListener('touchmove', this._onTouchMove, { passive: false });
    this.canvas.addEventListener('touchend', this._onTouchEnd, { passive: false });
    this.render();
  }

  deactivate() {
    this.canvas.removeEventListener('mousedown', this._onMouseDown);
    this.canvas.removeEventListener('mousemove', this._onMouseMove);
    this.canvas.removeEventListener('mouseup', this._onMouseUp);
    this.canvas.removeEventListener('touchstart', this._onTouchStart);
    this.canvas.removeEventListener('touchmove', this._onTouchMove);
    this.canvas.removeEventListener('touchend', this._onTouchEnd);
    this.canvas.style.display = 'none';
    this.shape = null;
  }

  _getCanvasPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }

  // Get handle positions in screen space
  _getHandles() {
    if (!this.shape) return {};
    // Get shape bounding box in world space, then convert to screen
    const polys = this.shape.getTransformedPolygons();
    const bb = multiPolygonBoundingBox(polys);

    const tl = this._worldToScreen(bb.minX, bb.minY);
    const tr = this._worldToScreen(bb.maxX, bb.minY);
    const bl = this._worldToScreen(bb.minX, bb.maxY);
    const br = this._worldToScreen(bb.maxX, bb.maxY);
    const topCenter = this._worldToScreen((bb.minX + bb.maxX) / 2, bb.minY);

    return {
      topLeft: tl,
      topRight: tr,
      bottomLeft: bl,
      bottomRight: br,
      rotate: [topCenter[0], topCenter[1] - ROTATE_HANDLE_DIST]
    };
  }

  _hitHandle(pos) {
    const handles = this._getHandles();
    for (const [name, hpos] of Object.entries(handles)) {
      const dx = pos[0] - hpos[0];
      const dy = pos[1] - hpos[1];
      if (dx * dx + dy * dy < (HANDLE_SIZE + 6) ** 2) {
        return name;
      }
    }
    return null;
  }

  _onMouseDown(e) {
    const pos = this._getCanvasPos(e);
    const handle = this._hitHandle(pos);
    if (handle) {
      this.activeHandle = handle;
      this.initialScale = this.shape.scale;
      this.initialRotation = this.shape.rotation;
      this.initialMouse = pos;
    }
  }

  _onMouseMove(e) {
    const pos = this._getCanvasPos(e);

    if (!this.activeHandle) {
      const handle = this._hitHandle(pos);
      this.canvas.style.cursor = handle
        ? (handle === 'rotate' ? 'crosshair' : 'nwse-resize')
        : 'default';
      return;
    }

    // Use screen-space center of shape for interaction
    const worldCenter = this.shape.position;
    const screenCenter = this._worldToScreen(worldCenter[0], worldCenter[1]);

    if (this.activeHandle === 'rotate') {
      const angle = Math.atan2(pos[1] - screenCenter[1], pos[0] - screenCenter[0]);
      const initAngle = Math.atan2(this.initialMouse[1] - screenCenter[1], this.initialMouse[0] - screenCenter[0]);
      this.shape.rotation = this.initialRotation + (angle - initAngle);
    } else {
      const initDist = Math.sqrt(
        (this.initialMouse[0] - screenCenter[0]) ** 2 +
        (this.initialMouse[1] - screenCenter[1]) ** 2
      );
      const curDist = Math.sqrt(
        (pos[0] - screenCenter[0]) ** 2 +
        (pos[1] - screenCenter[1]) ** 2
      );
      if (initDist > 5) {
        this.shape.scale = this.initialScale * (curDist / initDist);
        this.shape.scale = Math.max(0.01, Math.min(20, this.shape.scale));
      }
    }

    // Rotating changes the bounding box too, so both paths need the check
    this._ensureFits();
    this.render();
  }

  _onMouseUp() {
    this.activeHandle = null;
  }

  _touchToCanvasPos(e) {
    const touch = e.touches[0] || e.changedTouches[0];
    const rect = this.canvas.getBoundingClientRect();
    return [touch.clientX - rect.left, touch.clientY - rect.top];
  }

  _onTouchStart(e) {
    e.preventDefault();
    const pos = this._touchToCanvasPos(e);
    this._onMouseDown({ clientX: pos[0] + this.canvas.getBoundingClientRect().left, clientY: pos[1] + this.canvas.getBoundingClientRect().top });
  }

  _onTouchMove(e) {
    e.preventDefault();
    const pos = this._touchToCanvasPos(e);
    this._onMouseMove({ clientX: pos[0] + this.canvas.getBoundingClientRect().left, clientY: pos[1] + this.canvas.getBoundingClientRect().top });
  }

  _onTouchEnd(e) {
    e.preventDefault();
    this._onMouseUp();
  }

  render() {
    const ctx = this.ctx;
    const [w, h] = hidpiReset(this.canvas, ctx);

    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = '#161b22';
    ctx.fillRect(0, 0, w, h);

    // Apply world-to-screen transform
    ctx.save();
    ctx.translate(this.viewOffset[0], this.viewOffset[1]);
    ctx.scale(this.viewScale, this.viewScale);

    // Grid in world space
    ctx.strokeStyle = '#21262d';
    ctx.lineWidth = 1 / this.viewScale;

    // Step scales with the framing, so the grid stays readable at any zoom
    const gridStep = this._gridStep();
    const vb = this._visibleWorldRect();
    const startX = Math.floor(vb.minX / gridStep) * gridStep;
    const startY = Math.floor(vb.minY / gridStep) * gridStep;

    for (let x = startX; x <= vb.maxX; x += gridStep) {
      ctx.beginPath(); ctx.moveTo(x, vb.minY); ctx.lineTo(x, vb.maxY); ctx.stroke();
    }
    for (let y = startY; y <= vb.maxY; y += gridStep) {
      ctx.beginPath(); ctx.moveTo(vb.minX, y); ctx.lineTo(vb.maxX, y); ctx.stroke();
    }

    // Ocean labels are deliberately absent: they sit at fixed world coordinates
    // and are meaningless once the view is framed on a couple of countries.

    // Draw hint reference shape offset to the right side
    if (this.hintShape) {
      ctx.save();
      ctx.translate(this.hintOffset[0] || 0, this.hintOffset[1] || 0);
      this.hintShape.draw(ctx, { ghostMode: true, lineWidth: 1.2 / this.viewScale });
      // Draw name label on the hint shape
      const hintBB = this.hintShape.getBoundingBox();
      const hcx = (hintBB.minX + hintBB.maxX) / 2;
      const hcy = (hintBB.minY + hintBB.maxY) / 2;
      // Font in world units, derived from screen px, so the label keeps a constant
      // on-screen size however tightly the view is framed
      const fontSize = 12 / this.viewScale;
      ctx.fillStyle = this.hintShape.color + 'aa';
      ctx.font = `${fontSize}px 'Space Grotesk', system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(this.hintLabel, hcx, hcy + fontSize * 0.4);
      ctx.fillStyle = this.hintShape.color + '66';
      ctx.font = `${fontSize * 0.7}px 'Space Grotesk', system-ui, sans-serif`;
      ctx.fillText('(example for scale)', hcx, hcy + fontSize * 1.3);
      ctx.restore();
    }

    // Draw player shape (in world space — localPolygons * scale + position)
    if (this.shape) {
      this.shape.draw(ctx, { fillAlpha: 0.35, lineWidth: 2 / this.viewScale });
    }

    ctx.restore();

    // Draw handles in screen space (on top of the transform)
    if (this.shape) {
      this._drawHandles(ctx);
    }

    // Instructions
    ctx.fillStyle = '#8b949e';
    ctx.font = "13px system-ui, sans-serif";
    ctx.textAlign = 'left';
    ctx.fillText('Drag corners to resize, orange handle to rotate', 12, h - 12);

    // Hint label
    if (this.hintShape) {
      ctx.fillStyle = '#8b949e';
      ctx.font = "11px system-ui, sans-serif";
      ctx.textAlign = 'right';
      ctx.fillText(`"${this.hintLabel}" shown at real size for scale reference`, w - 12, h - 12);
    }
  }

  _drawHandles(ctx) {
    const handles = this._getHandles();
    const polys = this.shape.getTransformedPolygons();
    const bb = multiPolygonBoundingBox(polys);

    // Bounding box in screen space
    const tlS = this._worldToScreen(bb.minX, bb.minY);
    const brS = this._worldToScreen(bb.maxX, bb.maxY);

    ctx.strokeStyle = '#30363d';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(tlS[0], tlS[1], brS[0] - tlS[0], brS[1] - tlS[1]);
    ctx.setLineDash([]);

    for (const [name, [hx, hy]] of Object.entries(handles)) {
      ctx.beginPath();
      if (name === 'rotate') {
        const topCenter = this._worldToScreen((bb.minX + bb.maxX) / 2, bb.minY);
        ctx.strokeStyle = '#30363d';
        ctx.lineWidth = 1;
        ctx.moveTo(topCenter[0], topCenter[1]);
        ctx.lineTo(hx, hy);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(hx, hy, HANDLE_SIZE, 0, Math.PI * 2);
        ctx.fillStyle = '#d29922';
      } else {
        ctx.rect(hx - HANDLE_SIZE / 2, hy - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
        ctx.fillStyle = '#58a6ff';
      }
      ctx.fill();
      ctx.strokeStyle = '#0d1117';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
}
