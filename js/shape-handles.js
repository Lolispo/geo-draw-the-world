// Resize + rotate handles for a Shape, in screen space.
//
// Extracted from the old transform-controls.js when sizing was merged into the
// placement screen (TODOS #35). The canvas owns the world-to-screen mapping and
// passes it in, so this module stays independent of any particular view.
//
// Handles are screen-space by design: they must keep a constant on-screen size
// however far the view is zoomed, or they become untappable at world zoom.

const HANDLE_SIZE = 11;
const ROTATE_HANDLE_DIST = 34;
const ROTATE_HANDLE_RADIUS = 9;
// Hit slop on top of the handle's own radius. HANDLE_SIZE/2 + 12 gives a ~34px
// touch target, over the 28px floor the mobile pass (TODOS #25) asked for.
const HIT_SLOP = 12;

const MIN_SCALE = 0.005;
const MAX_SCALE = 40;

export class ShapeHandles {
  // worldToScreen: (wx, wy) => [sx, sy]
  constructor(worldToScreen) {
    this.worldToScreen = worldToScreen;
    this.showCorners = false;
    this.showRotate = false;

    this.active = null;      // handle name currently being dragged
    this._startScale = 1;
    this._startRotation = 0;
    this._startPos = [0, 0];
    this._center = [0, 0];   // shape centre in screen space, frozen at drag start
  }

  get enabled() {
    return this.showCorners || this.showRotate;
  }

  // Screen-space positions, keyed by handle name. Empty when nothing is shown.
  positions(shape) {
    if (!shape || !this.enabled) return {};
    const bb = shape.getBoundingBox();
    const out = {};

    if (this.showCorners) {
      out.topLeft = this.worldToScreen(bb.minX, bb.minY);
      out.topRight = this.worldToScreen(bb.maxX, bb.minY);
      out.bottomLeft = this.worldToScreen(bb.minX, bb.maxY);
      out.bottomRight = this.worldToScreen(bb.maxX, bb.maxY);
    }
    if (this.showRotate) {
      out.rotate = this._rotateGeometry(bb).handle;
    }
    return out;
  }

  // The rotate arm normally reaches up out of the shape's top edge. Near the top
  // of the canvas there is no room for it, and an off-canvas handle can't be
  // grabbed at all — so it flips below the shape instead.
  _rotateGeometry(bb) {
    const midX = (bb.minX + bb.maxX) / 2;
    const top = this.worldToScreen(midX, bb.minY);
    const handle = [top[0], top[1] - ROTATE_HANDLE_DIST];
    if (handle[1] >= ROTATE_HANDLE_RADIUS + 4) return { anchor: top, handle };

    const bottom = this.worldToScreen(midX, bb.maxY);
    return { anchor: bottom, handle: [bottom[0], bottom[1] + ROTATE_HANDLE_DIST] };
  }

  // Nearest handle under pos, or null. Rotate wins ties — it sits clear of the
  // box, so overlap only happens on a shape too small for the corners to matter.
  hitTest(shape, pos) {
    const handles = this.positions(shape);
    const radius = HANDLE_SIZE / 2 + HIT_SLOP;
    let best = null;
    let bestDist = radius * radius;
    for (const [name, [hx, hy]] of Object.entries(handles)) {
      const dx = pos[0] - hx;
      const dy = pos[1] - hy;
      const d = dx * dx + dy * dy;
      if (d <= bestDist) {
        bestDist = d;
        best = name;
      }
    }
    return best;
  }

  begin(shape, name, pos) {
    this.active = name;
    this._startScale = shape.scale;
    this._startRotation = shape.rotation;
    this._startPos = pos;
    this._center = this.worldToScreen(shape.position[0], shape.position[1]);
  }

  // Apply a drag to the shape. Returns true if anything changed.
  //
  // Both gestures are measured against the shape's centre as it was when the
  // drag began: rotation from the change in angle, scale from the change in
  // radius. Re-reading the centre mid-drag would feed the shape's own movement
  // back into the gesture.
  drag(shape, pos) {
    if (!this.active || !shape) return false;
    const [cx, cy] = this._center;

    if (this.active === 'rotate') {
      const angle = Math.atan2(pos[1] - cy, pos[0] - cx);
      const startAngle = Math.atan2(this._startPos[1] - cy, this._startPos[0] - cx);
      shape.rotation = this._startRotation + (angle - startAngle);
      return true;
    }

    const startDist = Math.hypot(this._startPos[0] - cx, this._startPos[1] - cy);
    const dist = Math.hypot(pos[0] - cx, pos[1] - cy);
    // Under ~5px from the centre the ratio explodes, so ignore those grabs
    if (startDist <= 5) return false;
    shape.scale = clamp(this._startScale * (dist / startDist), MIN_SCALE, MAX_SCALE);
    return true;
  }

  end() {
    this.active = null;
  }

  cursorFor(name) {
    if (!name) return null;
    if (name === 'rotate') return 'crosshair';
    if (name === 'topLeft' || name === 'bottomRight') return 'nwse-resize';
    return 'nesw-resize';
  }

  // Dashed bounding box plus the handles themselves. Call with the canvas
  // transform reset to screen space.
  draw(ctx, shape) {
    if (!shape || !this.enabled) return;
    const handles = this.positions(shape);
    const bb = shape.getBoundingBox();
    const tl = this.worldToScreen(bb.minX, bb.minY);
    const br = this.worldToScreen(bb.maxX, bb.maxY);

    ctx.strokeStyle = '#30363d';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(tl[0], tl[1], br[0] - tl[0], br[1] - tl[1]);
    ctx.setLineDash([]);

    if (handles.rotate) {
      const { anchor } = this._rotateGeometry(bb);
      ctx.strokeStyle = '#30363d';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(anchor[0], anchor[1]);
      ctx.lineTo(handles.rotate[0], handles.rotate[1]);
      ctx.stroke();
    }

    for (const [name, [hx, hy]] of Object.entries(handles)) {
      ctx.beginPath();
      if (name === 'rotate') {
        ctx.arc(hx, hy, ROTATE_HANDLE_RADIUS, 0, Math.PI * 2);
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

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
