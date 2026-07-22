// Drawing canvas: freehand draw with multi-shape support
// Hold mouse to draw, release near start to close. Draw multiple shapes before confirming.

import { distance, drawPolygon, hidpiReset } from './utils.js';

const CLOSE_THRESHOLD = 20;
const MIN_POINT_DIST = 6;
const SIMPLIFY_TOLERANCE = 3;

export class DrawingCanvas {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    // Multi-shape state
    this.completedShapes = [];  // Array of closed polygon point arrays
    this.currentPoints = [];     // Current in-progress shape
    this.rawPoints = [];
    this.currentClosed = false;
    this.isDrawing = false;
    this.nearStart = false;
    this.onShapeComplete = null;  // Called when any shape is closed
    this.onAllClear = null;       // Called when everything is cleared

    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
    this._onTouchStart = this._onTouchStart.bind(this);
    this._onTouchMove = this._onTouchMove.bind(this);
    this._onTouchEnd = this._onTouchEnd.bind(this);
    this._mousePos = [0, 0];
  }

  activate() {
    this.canvas.style.display = 'block';
    this.canvas.addEventListener('mousedown', this._onMouseDown);
    this.canvas.addEventListener('mousemove', this._onMouseMove);
    this.canvas.addEventListener('mouseup', this._onMouseUp);
    this.canvas.addEventListener('touchstart', this._onTouchStart, { passive: false });
    this.canvas.addEventListener('touchmove', this._onTouchMove, { passive: false });
    this.canvas.addEventListener('touchend', this._onTouchEnd, { passive: false });
    this.clear();
  }

  deactivate() {
    this.canvas.removeEventListener('mousedown', this._onMouseDown);
    this.canvas.removeEventListener('mousemove', this._onMouseMove);
    this.canvas.removeEventListener('mouseup', this._onMouseUp);
    this.canvas.removeEventListener('touchstart', this._onTouchStart);
    this.canvas.removeEventListener('touchmove', this._onTouchMove);
    this.canvas.removeEventListener('touchend', this._onTouchEnd);
    this.canvas.style.display = 'none';
  }

  clear() {
    this.completedShapes = [];
    this.currentPoints = [];
    this.rawPoints = [];
    this.currentClosed = false;
    this.isDrawing = false;
    this.nearStart = false;
    this.render();
    if (this.onAllClear) this.onAllClear();
  }

  undo() {
    if (this.currentClosed) {
      // Undo closing — reopen current shape
      this.currentClosed = false;
    } else if (this.currentPoints.length > 0) {
      // Remove last ~20% of current shape
      const removeCount = Math.max(1, Math.floor(this.currentPoints.length * 0.2));
      this.currentPoints.splice(-removeCount);
      this.rawPoints = this.currentPoints.slice();
    } else if (this.completedShapes.length > 0) {
      // Pop last completed shape back to current for editing
      this.currentPoints = this.completedShapes.pop();
      this.rawPoints = this.currentPoints.slice();
      this.currentClosed = true;
    }
    this.render();
  }

  // Get all shapes as array of polygon arrays (for multi-polygon Shape)
  getAllPolygons() {
    const result = [...this.completedShapes];
    if (this.currentClosed && this.currentPoints.length >= 3) {
      result.push(this.currentPoints.slice());
    }
    return result;
  }

  hasAnyShape() {
    return this.completedShapes.length > 0 ||
      (this.currentClosed && this.currentPoints.length >= 3);
  }

  // Finalize current shape and prepare for drawing another
  nextShape() {
    if (this.currentClosed && this.currentPoints.length >= 3) {
      this.completedShapes.push(this.currentPoints.slice());
      this.currentPoints = [];
      this.rawPoints = [];
      this.currentClosed = false;
      this.nearStart = false;
      this.render();
    }
  }

  _getCanvasPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }

  _onMouseDown(e) {
    // If current shape is closed, auto-finalize it and start new one
    if (this.currentClosed) {
      this.nextShape();
    }

    const pos = this._getCanvasPos(e);

    // Close current shape if near its start
    if (this.currentPoints.length >= 3 && distance(pos, this.currentPoints[0]) < CLOSE_THRESHOLD) {
      this._closeCurrentShape();
      return;
    }

    this.isDrawing = true;
    this.rawPoints = this.currentPoints.slice();
    this.rawPoints.push(pos);
    this.currentPoints = this.rawPoints.slice();
    this.canvas.style.cursor = 'crosshair';
    this.render();
  }

  _onMouseMove(e) {
    this._mousePos = this._getCanvasPos(e);

    if (this.isDrawing) {
      const last = this.rawPoints[this.rawPoints.length - 1];
      if (distance(this._mousePos, last) >= MIN_POINT_DIST) {
        this.rawPoints.push([...this._mousePos]);
        this.currentPoints = simplifyPath(this.rawPoints, SIMPLIFY_TOLERANCE);
      }
      this.render();
      return;
    }

    if (!this.currentClosed && this.currentPoints.length >= 3) {
      this.nearStart = distance(this._mousePos, this.currentPoints[0]) < CLOSE_THRESHOLD;
    } else {
      this.nearStart = false;
    }

    this.canvas.style.cursor = this.nearStart ? 'pointer' : 'crosshair';
    this.render();
  }

  _onMouseUp() {
    if (!this.isDrawing) return;
    this.isDrawing = false;

    if (this.rawPoints.length > 2) {
      this.currentPoints = simplifyPath(this.rawPoints, SIMPLIFY_TOLERANCE);
    }

    // Auto-close if ended near start
    if (this.currentPoints.length >= 3 && distance(this._mousePos, this.currentPoints[0]) < CLOSE_THRESHOLD) {
      this._closeCurrentShape();
      return;
    }

    this.render();
  }

  _getTouchPos(e) {
    const touch = e.touches[0] || e.changedTouches[0];
    const rect = this.canvas.getBoundingClientRect();
    return [touch.clientX - rect.left, touch.clientY - rect.top];
  }

  _onTouchStart(e) {
    e.preventDefault();
    const pos = this._getTouchPos(e);
    this._onMouseDown({ clientX: pos[0] + this.canvas.getBoundingClientRect().left, clientY: pos[1] + this.canvas.getBoundingClientRect().top });
  }

  _onTouchMove(e) {
    e.preventDefault();
    const pos = this._getTouchPos(e);
    this._onMouseMove({ clientX: pos[0] + this.canvas.getBoundingClientRect().left, clientY: pos[1] + this.canvas.getBoundingClientRect().top });
  }

  _onTouchEnd(e) {
    e.preventDefault();
    this._onMouseUp();
  }

  _closeCurrentShape() {
    this.currentClosed = true;
    this.isDrawing = false;
    this.render();
    if (this.onShapeComplete) this.onShapeComplete();
  }

  render() {
    const ctx = this.ctx;
    const [w, h] = hidpiReset(this.canvas, ctx);

    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = '#161b22';
    ctx.fillRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = '#21262d';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y < h; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // Draw completed shapes
    for (let i = 0; i < this.completedShapes.length; i++) {
      const poly = this.completedShapes[i];
      drawPolygon(ctx, poly, {
        fill: '#58a6ff15',
        stroke: '#58a6ff',
        lineWidth: 2
      });
      // Shape number label
      const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length;
      const cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
      ctx.fillStyle = '#58a6ff';
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${i + 1}`, cx, cy + 5);
    }

    // Draw current shape
    if (this.currentPoints.length > 0) {
      if (this.currentClosed) {
        drawPolygon(ctx, this.currentPoints, {
          fill: '#58a6ff33',
          stroke: '#58a6ff',
          lineWidth: 2.5
        });
        // Label
        const cx = this.currentPoints.reduce((s, p) => s + p[0], 0) / this.currentPoints.length;
        const cy = this.currentPoints.reduce((s, p) => s + p[1], 0) / this.currentPoints.length;
        ctx.fillStyle = '#58a6ff';
        ctx.font = 'bold 14px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${this.completedShapes.length + 1}`, cx, cy + 5);
      } else {
        // Open path
        ctx.beginPath();
        ctx.strokeStyle = '#58a6ff';
        ctx.lineWidth = 2.5;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.moveTo(this.currentPoints[0][0], this.currentPoints[0][1]);
        for (let i = 1; i < this.currentPoints.length; i++) {
          ctx.lineTo(this.currentPoints[i][0], this.currentPoints[i][1]);
        }
        ctx.stroke();

        // Preview close line
        if (this.currentPoints.length >= 3 && !this.isDrawing) {
          const last = this.currentPoints[this.currentPoints.length - 1];
          ctx.beginPath();
          ctx.strokeStyle = this.nearStart ? '#4CAF50' : '#58a6ff44';
          ctx.lineWidth = this.nearStart ? 2 : 1;
          ctx.setLineDash([5, 5]);
          ctx.moveTo(last[0], last[1]);
          ctx.lineTo(this.currentPoints[0][0], this.currentPoints[0][1]);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Start dot
        const [sx, sy] = this.currentPoints[0];
        const r = this.nearStart ? 8 : 5;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fillStyle = this.nearStart ? '#4CAF50' : '#4CAF5088';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    this._drawInstructions();
  }

  _drawInstructions() {
    const ctx = this.ctx;
    const h = this.canvas.height / (window.devicePixelRatio || 1);
    ctx.fillStyle = '#8b949e';
    ctx.font = '13px system-ui, sans-serif';
    ctx.textAlign = 'left';

    const shapeCount = this.completedShapes.length + (this.currentClosed ? 1 : 0);

    if (this.currentClosed) {
      ctx.fillText(
        `Shape ${shapeCount} done — draw another part or click Done (${shapeCount} shape${shapeCount > 1 ? 's' : ''})`,
        12, h - 12
      );
    } else if (this.currentPoints.length === 0 && shapeCount === 0) {
      ctx.fillText('Hold mouse and draw the shape — you can draw multiple parts', 12, h - 12);
    } else if (this.currentPoints.length === 0 && shapeCount > 0) {
      ctx.fillText(`${shapeCount} shape${shapeCount > 1 ? 's' : ''} drawn — draw another or click Done`, 12, h - 12);
    } else if (this.isDrawing) {
      ctx.fillText('Drawing... release near the green dot to close', 12, h - 12);
    } else {
      ctx.fillText('Hold to keep drawing, or click the green dot to close', 12, h - 12);
    }

    // Shape count badge (top right)
    if (shapeCount > 0) {
      ctx.fillStyle = '#58a6ff';
      ctx.font = '12px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`${shapeCount} shape${shapeCount > 1 ? 's' : ''}`, w - 12, 20);
    }
  }
}

// Douglas-Peucker path simplification
function simplifyPath(points, tolerance) {
  if (points.length <= 2) return points.slice();

  let maxDist = 0;
  let maxIdx = 0;
  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDist(points[i], first, last);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }

  if (maxDist > tolerance) {
    const left = simplifyPath(points.slice(0, maxIdx + 1), tolerance);
    const right = simplifyPath(points.slice(maxIdx), tolerance);
    return left.slice(0, -1).concat(right);
  }

  return [first, last];
}

function perpendicularDist(point, lineStart, lineEnd) {
  const dx = lineEnd[0] - lineStart[0];
  const dy = lineEnd[1] - lineStart[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return distance(point, lineStart);

  let t = ((point[0] - lineStart[0]) * dx + (point[1] - lineStart[1]) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const proj = [lineStart[0] + t * dx, lineStart[1] + t * dy];
  return distance(point, proj);
}
