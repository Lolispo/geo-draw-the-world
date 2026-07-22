// Math and geometry utilities

export function polygonArea(points) {
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i][0] * points[j][1];
    area -= points[j][0] * points[i][1];
  }
  return Math.abs(area / 2);
}

export function multiPolygonArea(polygons) {
  return polygons.reduce((sum, poly) => sum + polygonArea(poly), 0);
}

export function polygonCentroid(points) {
  let cx = 0, cy = 0;
  const n = points.length;
  let signedArea = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const cross = points[i][0] * points[j][1] - points[j][0] * points[i][1];
    signedArea += cross;
    cx += (points[i][0] + points[j][0]) * cross;
    cy += (points[i][1] + points[j][1]) * cross;
  }
  signedArea /= 2;
  if (Math.abs(signedArea) < 1e-10) {
    const avgX = points.reduce((s, p) => s + p[0], 0) / n;
    const avgY = points.reduce((s, p) => s + p[1], 0) / n;
    return [avgX, avgY];
  }
  cx /= (6 * signedArea);
  cy /= (6 * signedArea);
  return [cx, cy];
}

// Weighted centroid across multiple polygons (by area)
export function multiPolygonCentroid(polygons) {
  let totalArea = 0;
  let cx = 0, cy = 0;
  for (const poly of polygons) {
    const area = polygonArea(poly);
    const c = polygonCentroid(poly);
    cx += c[0] * area;
    cy += c[1] * area;
    totalArea += area;
  }
  if (totalArea < 1e-10) {
    // Fallback: average all points
    const all = polygons.flat();
    return [
      all.reduce((s, p) => s + p[0], 0) / all.length,
      all.reduce((s, p) => s + p[1], 0) / all.length
    ];
  }
  return [cx / totalArea, cy / totalArea];
}

// Nonzero winding number test — self-intersecting polygons fill as union
export function pointInPolygon(x, y, polygon) {
  let winding = 0;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    if (yj <= y) {
      if (yi > y) {
        const cross = (xj - x) * (yi - y) - (xi - x) * (yj - y);
        if (cross > 0) winding++;
      }
    } else {
      if (yi <= y) {
        const cross = (xj - x) * (yi - y) - (xi - x) * (yj - y);
        if (cross < 0) winding--;
      }
    }
  }
  return winding !== 0;
}

export function pointInMultiPolygon(x, y, polygons) {
  for (const poly of polygons) {
    if (pointInPolygon(x, y, poly)) return true;
  }
  return false;
}

export function distance(p1, p2) {
  return Math.sqrt((p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2);
}

export function boundingBox(points) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

export function multiPolygonBoundingBox(polygons) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const poly of polygons) {
    for (const [x, y] of poly) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

export function normalizePolygon(points, targetSize = 100) {
  const bb = boundingBox(points);
  const scale = targetSize / Math.max(bb.width, bb.height);
  const centroid = polygonCentroid(points);
  return points.map(([x, y]) => [
    (x - centroid[0]) * scale,
    (y - centroid[1]) * scale
  ]);
}

export function transformPoints(points, position, scale, rotation) {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return points.map(([x, y]) => {
    const px = x * scale;
    const py = y * scale;
    const rx = px * cos - py * sin;
    const ry = px * sin + py * cos;
    return [rx + position[0], ry + position[1]];
  });
}

// Trace a closed ring, optionally smoothed with midpoint-quadratic curves
// (curve passes through edge midpoints using each vertex as a control point —
// gently rounds facets without overshooting). TODOS #24.
// Hi-DPI: reset the transform to render in logical CSS px on a dpr-scaled backing
// store, and return [logicalW, logicalH]. Call at the top of every render (TODOS #24).
export function hidpiReset(canvas, ctx) {
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return [canvas.width / dpr, canvas.height / dpr];
}

export function traceRing(ctx, pts, smooth) {
  const n = pts.length;
  if (!smooth || n < 3) {
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < n; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    return;
  }
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const start = mid(pts[n - 1], pts[0]);
  ctx.moveTo(start[0], start[1]);
  for (let i = 0; i < n; i++) {
    const curr = pts[i];
    const m = mid(curr, pts[(i + 1) % n]);
    ctx.quadraticCurveTo(curr[0], curr[1], m[0], m[1]);
  }
  ctx.closePath();
}

export function drawPolygon(ctx, points, { fill, stroke, lineWidth = 2, dash = [], closePath = true, smooth = false } = {}) {
  if (points.length < 2) return;
  ctx.beginPath();
  ctx.setLineDash(dash);
  if (closePath && smooth && points.length >= 3) {
    traceRing(ctx, points, true);
  } else {
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    if (closePath) ctx.closePath();
  }
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

// Draw multiple polygons as a single fill (so overlapping areas work correctly)
export function drawMultiPolygon(ctx, polygons, { fill, stroke, lineWidth = 2, dash = [], smooth = false } = {}) {
  if (polygons.length === 0) return;
  ctx.beginPath();
  ctx.setLineDash(dash);
  for (const poly of polygons) {
    if (poly.length < 2) continue;
    traceRing(ctx, poly, smooth);
  }
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
  ctx.setLineDash([]);
}
