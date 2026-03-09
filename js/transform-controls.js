// Transform controls: resize and rotate a shape before placing
// Renders in world-coordinate space so scale matches the placement canvas

import { multiPolygonBoundingBox, multiPolygonCentroid, drawMultiPolygon, transformPoints } from './utils.js';

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

const HANDLE_SIZE = 10;
const ROTATE_HANDLE_DIST = 35;

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
    this.worldHeight = 900;
    this.regionBounds = null;  // same as world canvas
    this.viewScale = 1;
    this.viewOffset = [0, 0];

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
    this.worldHeight = worldHeight || 900;
  }

  _computeView() {
    const w = this.canvas.width;
    const h = this.canvas.height;

    if (this.regionBounds) {
      const b = this.regionBounds;
      const pad = 30;
      const rw = b.maxX - b.minX;
      const rh = b.maxY - b.minY;
      this.viewScale = Math.min((w - pad * 2) / rw, (h - pad * 2) / rh);
      this.viewOffset = [
        w / 2 - (b.minX + rw / 2) * this.viewScale,
        h / 2 - (b.minY + rh / 2) * this.viewScale
      ];
    } else {
      const sx = this.canvas.width / this.worldWidth;
      const sy = this.canvas.height / this.worldHeight;
      this.viewScale = Math.min(sx, sy) * 0.92;
      this.viewOffset = [
        (w - this.worldWidth * this.viewScale) / 2,
        (h - this.worldHeight * this.viewScale) / 2
      ];
    }
  }

  _worldToScreen(wx, wy) {
    return [wx * this.viewScale + this.viewOffset[0], wy * this.viewScale + this.viewOffset[1]];
  }

  _screenToWorld(sx, sy) {
    return [(sx - this.viewOffset[0]) / this.viewScale, (sy - this.viewOffset[1]) / this.viewScale];
  }

  activate(shape) {
    this.shape = shape;
    this._computeView();

    // Position player shape left of center to leave room for hint on the right
    if (this.regionBounds) {
      const b = this.regionBounds;
      const rw = b.maxX - b.minX;
      shape.position = [b.minX + rw * 0.35, (b.minY + b.maxY) / 2];
    } else {
      shape.position = [this.worldWidth * 0.35, this.worldHeight / 2];
    }

    shape.scale = 1;
    shape.rotation = 0;

    const bb = multiPolygonBoundingBox(shape.localPolygons);
    const shapeLocalSize = Math.max(bb.width, bb.height);

    let targetWorldSize;
    if (this.regionBounds) {
      const b = this.regionBounds;
      targetWorldSize = Math.max(b.maxX - b.minX, b.maxY - b.minY) * 0.3;
    } else {
      targetWorldSize = Math.max(this.worldWidth, this.worldHeight) * 0.15;
    }

    if (shapeLocalSize > 0) {
      shape.scale = targetWorldSize / shapeLocalSize;
    }

    // Move hint shape to the right side so it doesn't overlap with player shape
    if (this.hintShape) {
      this._positionHintOnSide();
    }

    this.canvas.style.display = 'block';
    this.canvas.addEventListener('mousedown', this._onMouseDown);
    this.canvas.addEventListener('mousemove', this._onMouseMove);
    this.canvas.addEventListener('mouseup', this._onMouseUp);
    this.canvas.addEventListener('touchstart', this._onTouchStart, { passive: false });
    this.canvas.addEventListener('touchmove', this._onTouchMove, { passive: false });
    this.canvas.addEventListener('touchend', this._onTouchEnd, { passive: false });
    this.render();
  }

  // Compute offset to render hint shape on the right side
  _positionHintOnSide() {
    if (!this.hintShape) return;
    const hintBB = this.hintShape.getBoundingBox();
    const hintCx = (hintBB.minX + hintBB.maxX) / 2;
    const hintCy = (hintBB.minY + hintBB.maxY) / 2;

    let targetX, targetY;
    if (this.regionBounds) {
      const b = this.regionBounds;
      const rw = b.maxX - b.minX;
      targetX = b.minX + rw * 0.75;
      targetY = (b.minY + b.maxY) / 2;
    } else {
      targetX = this.worldWidth * 0.75;
      targetY = this.worldHeight / 2;
    }

    this.hintOffset = [targetX - hintCx, targetY - hintCy];
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
    const w = this.canvas.width;
    const h = this.canvas.height;

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

    const gridStep = this.regionBounds ? 50 : 100;
    const startX = this.regionBounds ? Math.floor(this.regionBounds.minX / gridStep) * gridStep : 0;
    const endX = this.regionBounds ? this.regionBounds.maxX : this.worldWidth;
    const startY = this.regionBounds ? Math.floor(this.regionBounds.minY / gridStep) * gridStep : 0;
    const endY = this.regionBounds ? this.regionBounds.maxY : this.worldHeight;

    for (let x = startX; x <= endX; x += gridStep) {
      ctx.beginPath(); ctx.moveTo(x, startY); ctx.lineTo(x, endY); ctx.stroke();
    }
    for (let y = startY; y <= endY; y += gridStep) {
      ctx.beginPath(); ctx.moveTo(startX, y); ctx.lineTo(endX, y); ctx.stroke();
    }

    // Ocean labels in world space
    ctx.textAlign = 'center';
    for (const ocean of OCEAN_LABELS) {
      const isLarge = ocean.name.includes('OCEAN');
      const fontSize = isLarge ? 16 : 10;
      ctx.fillStyle = isLarge ? '#1a3a5a' : '#1a3050';
      ctx.font = `${isLarge ? 600 : 400} ${fontSize}px 'Space Grotesk', system-ui, sans-serif`;
      const lines = ocean.name.split('\n');
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], ocean.x, ocean.y + i * (fontSize + 4));
      }
    }

    // Draw hint reference shape offset to the right side
    if (this.hintShape) {
      ctx.save();
      ctx.translate(this.hintOffset[0] || 0, this.hintOffset[1] || 0);
      this.hintShape.draw(ctx, { ghostMode: true });
      // Draw name label on the hint shape
      const hintBB = this.hintShape.getBoundingBox();
      const hcx = (hintBB.minX + hintBB.maxX) / 2;
      const hcy = (hintBB.minY + hintBB.maxY) / 2;
      const fontSize = Math.max(8, Math.min(14, (hintBB.maxX - hintBB.minX) * 0.12));
      ctx.fillStyle = this.hintShape.color + 'aa';
      ctx.font = `${fontSize}px 'Space Grotesk', system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(this.hintLabel, hcx, hcy + fontSize * 0.4);
      ctx.fillStyle = this.hintShape.color + '66';
      ctx.font = `${Math.max(6, fontSize * 0.6)}px 'Space Grotesk', system-ui, sans-serif`;
      ctx.fillText('(example for scale)', hcx, hcy + fontSize * 1.3);
      ctx.restore();
    }

    // Draw player shape (in world space — localPolygons * scale + position)
    if (this.shape) {
      this.shape.draw(ctx, { fillAlpha: 0.35 });
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
