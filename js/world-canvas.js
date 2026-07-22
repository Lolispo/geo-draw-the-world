// World map canvas: pan, zoom, place shapes, show results
// Supports region-focused view for country modes

import { drawMultiPolygon, multiPolygonBoundingBox } from './utils.js';

// Ocean labels in world-space coordinates (1600x900 Mercator)
const OCEAN_LABELS = [
  { name: 'ATLANTIC\nOCEAN', x: 560, y: 400 },
  { name: 'PACIFIC\nOCEAN', x: 100, y: 380 },
  { name: 'PACIFIC\nOCEAN', x: 1450, y: 380 },
  { name: 'INDIAN\nOCEAN', x: 1130, y: 520 },
  { name: 'ARCTIC OCEAN', x: 800, y: 50 },
  { name: 'SOUTHERN OCEAN', x: 800, y: 830 },
  { name: 'Mediterranean Sea', x: 830, y: 305 },
];

const ROTATE_HANDLE_DIST = 30;
const ROTATE_HANDLE_RADIUS = 8;

export class WorldCanvas {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    this.viewOffset = [0, 0];
    this.viewScale = 1;

    this.worldWidth = 1600;
    this.worldHeight = 900;

    this.placedShapes = [];
    this.activeShape = null;
    this.isDragging = false;
    this.isRotating = false;
    this.lastMouse = [0, 0];
    this.dragOffset = [0, 0];
    this.initialRotation = 0;
    this.initialAngle = 0;

    this.referenceShapes = [];
    this.showGhosts = false;
    this.enableRotation = false;
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
    this.onShapeMove = null;
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

  _getRotateHandle() {
    if (!this.activeShape || !this.enableRotation) return null;
    const bb = this.activeShape.getBoundingBox();
    const topCenter = this._worldToCanvas((bb.minX + bb.maxX) / 2, bb.minY);
    return [topCenter[0], topCenter[1] - ROTATE_HANDLE_DIST];
  }

  _hitRotateHandle(pos) {
    const handle = this._getRotateHandle();
    if (!handle) return false;
    const dx = pos[0] - handle[0];
    const dy = pos[1] - handle[1];
    return dx * dx + dy * dy < (ROTATE_HANDLE_RADIUS + 6) ** 2;
  }

  _onMouseDown(e) {
    const pos = this._getCanvasPos(e);
    this.lastMouse = pos;

    // Check rotate handle first
    if (this.activeShape && this.enableRotation && this._hitRotateHandle(pos)) {
      this.isRotating = true;
      this.initialRotation = this.activeShape.rotation;
      const center = this._worldToCanvas(this.activeShape.position[0], this.activeShape.position[1]);
      this.initialAngle = Math.atan2(pos[1] - center[1], pos[0] - center[0]);
      this.canvas.style.cursor = 'crosshair';
      return;
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

    if (this.isRotating && this.activeShape) {
      const center = this._worldToCanvas(this.activeShape.position[0], this.activeShape.position[1]);
      const angle = Math.atan2(pos[1] - center[1], pos[0] - center[0]);
      this.activeShape.rotation = this.initialRotation + (angle - this.initialAngle);
      this.render();
      if (this.onShapeMove) this.onShapeMove();
      return;
    }

    if (this.isDragging && this.activeShape) {
      const worldPos = this._canvasToWorld(pos[0], pos[1]);
      this.activeShape.position = [
        worldPos[0] - this.dragOffset[0],
        worldPos[1] - this.dragOffset[1]
      ];
      this.render();
      if (this.onShapeMove) this.onShapeMove();
      return;
    }

    // Cursor hints
    if (this.activeShape) {
      if (this.enableRotation && this._hitRotateHandle(pos)) {
        this.canvas.style.cursor = 'crosshair';
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
    this.isRotating = false;
    this.canvas.style.cursor = 'default';
  }

  _touchToCanvasPos(e) {
    const touch = e.touches[0] || e.changedTouches[0];
    const rect = this.canvas.getBoundingClientRect();
    return [touch.clientX - rect.left, touch.clientY - rect.top];
  }

  _onTouchStart(e) {
    e.preventDefault();
    if (e.touches.length === 1) {
      const pos = this._touchToCanvasPos(e);
      const rect = this.canvas.getBoundingClientRect();
      this._onMouseDown({ clientX: pos[0] + rect.left, clientY: pos[1] + rect.top });
    }
  }

  _onTouchMove(e) {
    e.preventDefault();
    if (e.touches.length === 1) {
      const pos = this._touchToCanvasPos(e);
      const rect = this.canvas.getBoundingClientRect();
      this._onMouseMove({ clientX: pos[0] + rect.left, clientY: pos[1] + rect.top });
    }
  }

  _onTouchEnd(e) {
    e.preventDefault();
    this._onMouseUp();
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

    // Ghost overlays
    if (this.showGhosts) {
      for (const ref of this.referenceShapes) {
        ref.draw(ctx, { ghostMode: true });
      }
    }

    // Placed shapes
    for (const shape of this.placedShapes) {
      shape.draw(ctx);
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
      this.activeShape.draw(ctx, { fillAlpha: 0.55, strokeColor: '#e6edf3' });
    }

    ctx.restore();

    // Rotation handle in screen space
    if (this.activeShape && this.enableRotation) {
      this._drawRotateHandle(ctx);
    }

    // HUD
    ctx.fillStyle = '#8b949e';
    ctx.font = "11px 'Space Grotesk', system-ui, sans-serif";
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(this.viewScale * 100)}%`, w - 8, h - 6);

    if (this.enableRotation) {
      ctx.textAlign = 'left';
      ctx.fillText('Drag to move, orange handle to rotate', 8, h - 6);
    }
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

  _drawRotateHandle(ctx) {
    const handle = this._getRotateHandle();
    if (!handle) return;

    const bb = this.activeShape.getBoundingBox();
    const topCenter = this._worldToCanvas((bb.minX + bb.maxX) / 2, bb.minY);

    // Line from shape to handle
    ctx.strokeStyle = '#30363d';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(topCenter[0], topCenter[1]);
    ctx.lineTo(handle[0], handle[1]);
    ctx.stroke();

    // Handle circle
    ctx.beginPath();
    ctx.arc(handle[0], handle[1], ROTATE_HANDLE_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = '#d29922';
    ctx.fill();
    ctx.strokeStyle = '#0d1117';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}
