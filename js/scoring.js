// Scoring: compare player shapes to reference shapes
// Supports multi-polygon reference shapes
//
// The shape term lives in js/raster.js, because the match panel (TODOS #58) scores
// against build-time country masks produced by that same code.

import { multiPolygonArea, multiPolygonCentroid, distance } from './utils.js';
import { computeIoU } from './raster.js';

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
