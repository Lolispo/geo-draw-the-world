// Scoring: compare player shapes to reference shapes
// Supports multi-polygon reference shapes

import { polygonArea, multiPolygonArea, multiPolygonCentroid, distance, multiPolygonBoundingBox, pointInMultiPolygon } from './utils.js';

// Rasterize multi-polygon onto a grid
function rasterizeMulti(polygons, bb, gridSize = 80) {
  const filled = new Set();
  const scaleX = gridSize / (bb.width || 1);
  const scaleY = gridSize / (bb.height || 1);

  for (let gy = 0; gy < gridSize; gy++) {
    for (let gx = 0; gx < gridSize; gx++) {
      const x = bb.minX + (gx + 0.5) / scaleX;
      const y = bb.minY + (gy + 0.5) / scaleY;
      if (pointInMultiPolygon(x, y, polygons)) {
        filled.add(`${gx},${gy}`);
      }
    }
  }
  return filled;
}

// Normalize polygons: center and scale to fit in a target bounding box
function normalizeMultiPolygon(polygons, targetSize = 80) {
  const bb = multiPolygonBoundingBox(polygons);
  const centroid = multiPolygonCentroid(polygons);
  const scale = targetSize / Math.max(bb.width || 1, bb.height || 1);

  return polygons.map(poly =>
    poly.map(([x, y]) => [
      (x - centroid[0]) * scale,
      (y - centroid[1]) * scale
    ])
  );
}

function computeIoU(polys1, polys2) {
  const GRID = 80;
  // Use a shared bounding box for both
  const norm1 = normalizeMultiPolygon(polys1, GRID * 0.8);
  const norm2 = normalizeMultiPolygon(polys2, GRID * 0.8);

  const allPoints = [...norm1.flat(), ...norm2.flat()];
  const bb = {
    minX: -GRID / 2, minY: -GRID / 2,
    maxX: GRID / 2, maxY: GRID / 2,
    width: GRID, height: GRID
  };

  const raster1 = rasterizeMulti(norm1, bb, GRID);
  const raster2 = rasterizeMulti(norm2, bb, GRID);

  let intersection = 0;
  for (const key of raster1) {
    if (raster2.has(key)) intersection++;
  }
  const union = raster1.size + raster2.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function scoreShape(playerShape, referenceShape) {
  const playerPolygons = playerShape.getTransformedPolygons();
  const refPolygons = referenceShape.getTransformedPolygons();

  // 1. Shape similarity (IoU on normalized shapes)
  const iou = computeIoU(playerPolygons, refPolygons);
  const shapeScore = Math.round(iou * 100);

  // 2. Size accuracy
  const playerArea = multiPolygonArea(playerPolygons);
  const refArea = multiPolygonArea(refPolygons);
  const areaRatio = Math.min(playerArea, refArea) / Math.max(playerArea, refArea || 1);
  const sizeScore = Math.round(areaRatio * 100);

  // 3. Placement accuracy
  const playerCenter = multiPolygonCentroid(playerPolygons);
  const refCenter = multiPolygonCentroid(refPolygons);
  const dist = distance(playerCenter, refCenter);
  const maxDist = 300;
  const placementScore = Math.round(Math.max(0, 1 - dist / maxDist) * 100);

  const total = Math.round(shapeScore * 0.4 + sizeScore * 0.3 + placementScore * 0.3);

  return {
    shape: shapeScore,
    size: sizeScore,
    placement: placementScore,
    total,
    details: { iou, areaRatio, dist }
  };
}
