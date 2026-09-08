// World map canvas: zoom, size, place shapes, show results
// Supports region-focused view for country modes
//
// Since TODOS #35 this is also where the drawn shape is *sized*: the standalone
// sizing screen is gone, so corner handles resize the shape while the wheel and
// pinch zoom the view. One meaning per gesture — they never overlap.

import { drawMultiPolygon, multiPolygonBoundingBox, OCEAN_LABELS } from './utils.js';
import { ShapeHandles } from './shape-handles.js';

// Neutral drop size for a freshly drawn shape, as a fraction of the canvas's
// shorter side. It is deliberately a *viewport* fraction and never derived from
// the reference shape: size is 30% of the score, so a start scale that knew the
// answer would hand that 30% away. See setNeutralScale().
const NEUTRAL_SIZE_FRAC = 0.15;

export class WorldCanvas {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    this.viewOffset = [0, 0];
    this.viewScale = 1;

    this.worldWidth = 1600;
    this.worldHeight = 1100; // TODOS #24: conformal Mercator (was 900, squished)

    this.placedShapes = [];
    this.activeShape = null;
    this.isDragging = false;
    this.lastMouse = [0, 0];
    this.dragOffset = [0, 0];

    this.handles = new ShapeHandles((wx, wy) => this._worldToCanvas(wx, wy));
    this._pinch = null;

    this.referenceShapes = [];
    // Faint continent outlines drawn under everything, so placement has real
    // coastlines to aim at instead of a bare grid. Empty = no basemap.
    this.basemap = [];
    this.showGhosts = false;
    this.enableRotation = false;
    this.enableScaling = false;
    this.tweakMode = false;

    this.regionBounds = null;

    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
    this._onWheel = this._onWheel.bind(this);
    this._onTouchStart = this._onTouchStart.bind(this);
    this._onTouchMove = this._onTouchMove.bind(this);
    this._onTouchEnd = this._onTouchEnd.bind(this);

    this.onShapePlaced = null;
  }

  setRegionBounds(bounds) {
    this.regionBounds = bounds;
  }

  activate() {
    this.canvas.style.display = 'block';
    this.canvas.addEventListener('mousedown', this._onMouseDown);
    this.canvas.addEventListener('mousemove', this._onMouseMove);
    this.canvas.addEventListener('mouseup', this._onMouseUp);
    this.canvas.addEventListener('wheel', this._onWheel, { passive: false });
    this.canvas.addEventListener('touchstart', this._onTouchStart, { passive: false });
    this.canvas.addEventListener('touchmove', this._onTouchMove, { passive: false });
    this.canvas.addEventListener('touchend', this._onTouchEnd, { passive: false });
    this._fitView();
    this.render();
  }

  deactivate() {
    this.canvas.removeEventListener('mousedown', this._onMouseDown);
    this.canvas.removeEventListener('mousemove', this._onMouseMove);
    this.canvas.removeEventListener('mouseup', this._onMouseUp);
    this.canvas.removeEventListener('wheel', this._onWheel);
    this.canvas.removeEventListener('touchstart', this._onTouchStart);
    this.canvas.removeEventListener('touchmove', this._onTouchMove);
    this.canvas.removeEventListener('touchend', this._onTouchEnd);
    this.canvas.style.display = 'none';
  }

  // Logical (CSS px) canvas size — backing store is dpr× larger (TODOS #24).
  get _cssW() { return this.canvas.width / (window.devicePixelRatio || 1); }
  get _cssH() { return this.canvas.height / (window.devicePixelRatio || 1); }

  _fitView() {
    const cw = this._cssW, ch = this._cssH;
    if (this.regionBounds) {
      const b = this.regionBounds;
      const pad = 20;
      const rw = b.maxX - b.minX;
      const rh = b.maxY - b.minY;
      const scaleX = (cw - pad * 2) / rw;
      const scaleY = (ch - pad * 2) / rh;
      this.viewScale = Math.min(scaleX, scaleY);
      this.viewOffset = [
        cw / 2 - (b.minX + rw / 2) * this.viewScale,
        ch / 2 - (b.minY + rh / 2) * this.viewScale
      ];
    } else {
      const scaleX = cw / this.worldWidth;
      const scaleY = ch / this.worldHeight;
      this.viewScale = Math.min(scaleX, scaleY) * 0.92;
      this.viewOffset = [
        (cw - this.worldWidth * this.viewScale) / 2,
        (ch - this.worldHeight * this.viewScale) / 2
      ];
    }
  }

  _syncHandles() {
    this.handles.showCorners = this.enableScaling;
    this.handles.showRotate = this.enableRotation;
  }

  // Drop a freshly drawn shape at a neutral size: longest side = a fixed
  // fraction of the canvas's shorter side, converted to world units through the
  // current view scale. Computed from the viewport alone, so it carries no
  // information about how big the country actually is (TODOS #35).
  // Call after activate(), which is what fits the view.
  setNeutralScale(shape) {
    const bb = multiPolygonBoundingBox(shape.localPolygons);
    const localSize = Math.max(bb.width, bb.height);
    if (!(localSize > 0)) return;
    const targetPx = NEUTRAL_SIZE_FRAC * Math.min(this._cssW, this._cssH);
    shape.scale = (targetPx / this.viewScale) / localSize;
    shape.rotation = 0;
  }

  setActiveShape(shape) {
    this.activeShape = shape;
    if (!this.tweakMode) {
      // Place in center of visible region
      if (this.regionBounds) {
        const b = this.regionBounds;
        shape.position = [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2];
      } else {
        shape.position = [this.worldWidth / 2, this.worldHeight / 2];
      }
    }
    this.render();
  }

  _getCanvasPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }

  _canvasToWorld(cx, cy) {
    return [
      (cx - this.viewOffset[0]) / this.viewScale,
      (cy - this.viewOffset[1]) / this.viewScale
    ];
  }

  _worldToCanvas(wx, wy) {
    return [
      wx * this.viewScale + this.viewOffset[0],
      wy * this.viewScale + this.viewOffset[1]
    ];
  }

  _onMouseDown(e) {
    const pos = this._getCanvasPos(e);
    this.lastMouse = pos;
    this._syncHandles();

    // Handles sit on the bounding box, which overlaps the shape body, so they
    // have to be tested before the drag-to-move path or they're unreachable.
    if (this.activeShape) {
      const handle = this.handles.hitTest(this.activeShape, pos);
      if (handle) {
        this.handles.begin(this.activeShape, handle, pos);
        this.canvas.style.cursor = this.handles.cursorFor(handle);
        return;
      }
    }

    if (this.activeShape) {
      const worldPos = this._canvasToWorld(pos[0], pos[1]);
      if (this.activeShape.containsPoint(worldPos[0], worldPos[1])) {
        this.isDragging = true;
        this.dragOffset = [
          worldPos[0] - this.activeShape.position[0],
          worldPos[1] - this.activeShape.position[1]
        ];
        this.canvas.style.cursor = 'grabbing';
        return;
      }
    }

    // Panning disabled
  }

  _onMouseMove(e) {
    const pos = this._getCanvasPos(e);
    this._syncHandles();

    if (this.handles.active && this.activeShape) {
      if (this.handles.drag(this.activeShape, pos)) this.render();
      return;
    }

    if (this.isDragging && this.activeShape) {
      const worldPos = this._canvasToWorld(pos[0], pos[1]);
      this.activeShape.position = [
        worldPos[0] - this.dragOffset[0],
        worldPos[1] - this.dragOffset[1]
      ];
      this.render();
      return;
    }

    // Cursor hints
    if (this.activeShape) {
      const handle = this.handles.hitTest(this.activeShape, pos);
      if (handle) {
        this.canvas.style.cursor = this.handles.cursorFor(handle);
      } else {
        const worldPos = this._canvasToWorld(pos[0], pos[1]);
        this.canvas.style.cursor = this.activeShape.containsPoint(worldPos[0], worldPos[1])
          ? 'grab' : 'default';
      }
    } else {
      this.canvas.style.cursor = 'default';
    }
  }

  _onMouseUp() {
    this.isDragging = false;
    this.handles.end();
    this.canvas.style.cursor = 'default';
  }

  _touchToCanvasPos(e) {
    const touch = e.touches[0] || e.changedTouches[0];
    const rect = this.canvas.getBoundingClientRect();
    return [touch.clientX - rect.left, touch.clientY - rect.top];
  }

  // Midpoint and spread of a two-finger gesture, in canvas coordinates
  _pinchState(e) {
    const rect = this.canvas.getBoundingClientRect();
    const [a, b] = [e.touches[0], e.touches[1]];
    const ax = a.clientX - rect.left, ay = a.clientY - rect.top;
    const bx = b.clientX - rect.left, by = b.clientY - rect.top;
    return {
      center: [(ax + bx) / 2, (ay + by) / 2],
      dist: Math.max(1, Math.hypot(bx - ax, by - ay))
    };
  }

  _onTouchStart(e) {
    e.preventDefault();
    if (e.touches.length >= 2) {
      // A second finger always means "zoom the view", so abandon whatever the
      // first finger was doing to the shape rather than doing both at once.
      this.isDragging = false;
      this.handles.end();
      this._pinch = this._pinchState(e);
      return;
    }
    if (e.touches.length === 1) {
      const pos = this._touchToCanvasPos(e);
      const rect = this.canvas.getBoundingClientRect();
      this._onMouseDown({ clientX: pos[0] + rect.left, clientY: pos[1] + rect.top });
    }
  }

  _onTouchMove(e) {
    e.preventDefault();
    if (e.touches.length >= 2) {
      if (!this._pinch) this._pinch = this._pinchState(e);
      const now = this._pinchState(e);
      const prev = this._pinch;
      const factor = now.dist / prev.dist;
      // Zoom about the pinch midpoint, then follow the midpoint. The follow is
      // what gives touch a way to pan at all — dragging pans nothing, because a
      // one-finger drag belongs to the shape.
      this.viewScale *= factor;
      this.viewOffset[0] = now.center[0] - (prev.center[0] - this.viewOffset[0]) * factor;
      this.viewOffset[1] = now.center[1] - (prev.center[1] - this.viewOffset[1]) * factor;
      this._pinch = now;
      this.render();
      return;
    }
    if (e.touches.length === 1 && !this._pinch) {
      const pos = this._touchToCanvasPos(e);
      const rect = this.canvas.getBoundingClientRect();
      this._onMouseMove({ clientX: pos[0] + rect.left, clientY: pos[1] + rect.top });
    }
  }

  _onTouchEnd(e) {
    e.preventDefault();
    // Lifting one of two fingers leaves the other mid-gesture with no anchor;
    // end the pinch and make the player start a fresh touch.
    if (e.touches.length < 2) this._pinch = null;
    if (e.touches.length === 0) this._onMouseUp();
  }

  _onWheel(e) {
    e.preventDefault();
    const pos = this._getCanvasPos(e);
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = this.viewScale * zoomFactor;

    this.viewOffset[0] = pos[0] - (pos[0] - this.viewOffset[0]) * (newScale / this.viewScale);
    this.viewOffset[1] = pos[1] - (pos[1] - this.viewOffset[1]) * (newScale / this.viewScale);
    this.viewScale = newScale;

    this.render();
  }

  placeActiveShape() {
    if (!this.activeShape) return;
    this.placedShapes.push(this.activeShape);
    const placed = this.activeShape;
    this.activeShape = null;
    this.render();
    if (this.onShapePlaced) this.onShapePlaced(placed);
  }

  render() {
    const ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1;
    const w = this._cssW;
    const h = this._cssH;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // render in logical CSS px on a dpr-scaled backing store
    ctx.clearRect(0, 0, w, h);

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#0d1a2a');
    grad.addColorStop(1, '#0a1628');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(this.viewOffset[0], this.viewOffset[1]);
    ctx.scale(this.viewScale, this.viewScale);

    // World boundary
    ctx.fillStyle = '#111a28';
    ctx.fillRect(0, 0, this.worldWidth, this.worldHeight);
    ctx.strokeStyle = '#1e3a5f';
    ctx.lineWidth = 2 / this.viewScale;
    ctx.strokeRect(0, 0, this.worldWidth, this.worldHeight);

    // Grid lines
    ctx.strokeStyle = '#1a2d44';
    ctx.lineWidth = 0.5 / this.viewScale;
    for (let x = 0; x <= this.worldWidth; x += 100) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, this.worldHeight); ctx.stroke();
    }
    for (let y = 0; y <= this.worldHeight; y += 100) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.worldWidth, y); ctx.stroke();
    }

    // Equator + prime meridian
    ctx.strokeStyle = '#1e3a5f88';
    ctx.lineWidth = 1.2 / this.viewScale;
    ctx.beginPath();
    ctx.moveTo(0, this.worldHeight / 2); ctx.lineTo(this.worldWidth, this.worldHeight / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(this.worldWidth / 2, 0); ctx.lineTo(this.worldWidth / 2, this.worldHeight);
    ctx.stroke();

    // Ocean labels
    this._drawOceanLabels(ctx);

    // Continent basemap — above the grid/labels, below anything the player owns
    this._drawBasemap(ctx);

    // Ghost overlays
    if (this.showGhosts) {
      for (const ref of this.referenceShapes) {
        ref.draw(ctx, { ghostMode: true });
      }
    }

    // Placed shapes. Line widths are divided by viewScale so an outline stays
    // ~2px however far the view is zoomed — it matters now that pinch and wheel
    // zoom are part of the placement loop (TODOS #35).
    for (const shape of this.placedShapes) {
      shape.draw(ctx, { lineWidth: 2 / this.viewScale });
      const bb = shape.getBoundingBox();
      const cx = (bb.minX + bb.maxX) / 2;
      const cy = (bb.minY + bb.maxY) / 2;
      ctx.fillStyle = '#e6edf3aa';
      ctx.font = `${Math.max(8, 12 / this.viewScale)}px 'Space Grotesk', system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(shape.name, cx, cy + 4 / this.viewScale);
    }

    // Active shape
    if (this.activeShape) {
      this.activeShape.draw(ctx, {
        fillAlpha: 0.55, strokeColor: '#e6edf3', lineWidth: 2.5 / this.viewScale
      });
    }

    ctx.restore();

    // Handles in screen space, so they keep their size at any zoom
    this._syncHandles();
    if (this.activeShape) this.handles.draw(ctx, this.activeShape);

    // HUD
    ctx.fillStyle = '#8b949e';
    ctx.font = "11px 'Space Grotesk', system-ui, sans-serif";
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(this.viewScale * 100)}%`, w - 8, h - 6);

    const hint = this._gestureHint();
    if (hint) {
      ctx.textAlign = 'left';
      ctx.fillText(hint, 8, h - 6);
    }
  }

  // One line naming only the gestures that are actually live. Deliberately
  // short: the old sizing screen ran two footer strings into each other at
  // phone widths (TODOS #26), and the zoom readout sits at the right edge.
  _gestureHint() {
    if (!this.activeShape) return null;
    if (this.enableScaling && this.enableRotation) return 'Drag to move · corners resize · orange rotates';
    if (this.enableRotation) return 'Drag to move, orange handle to rotate';
    if (this.enableScaling) return 'Drag to move, corners to resize';
    return null;
  }

  // Fill, not stroke. continents.json stores each continent as country-level rings
  // (Africa's largest ring is 9% of its area), so stroking would draw every national
  // border and hand the player the answer slot. A single nonzero-winding fill per
  // continent merges those rings into one landmass, leaving just the coastline.
  _drawBasemap(ctx) {
    if (!this.basemap || this.basemap.length === 0) return;
    // Antarctica runs past y=worldHeight, so clip to the map frame — otherwise
    // land spills outside the world boundary the canvas draws.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, this.worldWidth, this.worldHeight);
    ctx.clip();
    for (const polygons of this.basemap) {
      // smooth:false is required, not cosmetic: smoothing warps each ring on its
      // own, so shared national borders stop coinciding and open up hairline seams.
      drawMultiPolygon(ctx, polygons, { fill: '#1b2c42', smooth: false });
    }
    ctx.restore();
  }

  _drawOceanLabels(ctx) {
    ctx.textAlign = 'center';
    for (const ocean of OCEAN_LABELS) {
      const isLarge = ocean.name.includes('OCEAN');
      const fontSize = isLarge ? 16 : 10;
      ctx.fillStyle = isLarge ? '#1e3d5f' : '#1a3050';
      ctx.font = `${isLarge ? 600 : 400} ${fontSize}px 'Space Grotesk', system-ui, sans-serif`;
      const lines = ocean.name.split('\n');
      for (let i = 0; i < lines.length; i++) {
        // Manual letter spacing for ocean labels
        if (isLarge) {
          this._drawSpacedText(ctx, lines[i], ocean.x, ocean.y + i * (fontSize + 4), 3);
        } else {
          ctx.fillText(lines[i], ocean.x, ocean.y + i * (fontSize + 4));
        }
      }
    }
  }

  _drawSpacedText(ctx, text, x, y, spacing) {
    const chars = text.split('');
    const totalWidth = chars.reduce((w, c) => w + ctx.measureText(c).width + spacing, -spacing);
    let cx = x - totalWidth / 2;
    for (const c of chars) {
      const cw = ctx.measureText(c).width;
      ctx.fillText(c, cx + cw / 2, y);
      cx += cw + spacing;
    }
  }

}
