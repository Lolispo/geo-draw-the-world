// Scoring: compare player shapes to reference shapes
// Supports multi-polygon reference shapes
//
// The shape term lives in js/raster.js, because the match panel (TODOS #58) scores
// against build-time country masks produced by that same code.

import { multiPolygonArea, multiPolygonCentroid, distance } from './utils.js';
import { computeIoU, maskIoU, rasterizeToMask } from './raster.js';

// `refMask` is the country's detailed outline, prerasterised (data/shape-masks.json).
// The shape term scores against it rather than against the world-scale reference,
// because the world-scale geometry carries every far-flung territory and the
// normalisation frame is then set by the most remote speck: the Netherlands' bounding
// box is 16x its main landmass, so a perfect drawing of it scored ZERO (TODOS #73).
// Size and placement still come from the world-scale reference — those are questions
// about the real map, which is what you placed the shape on.
// Without a mask (continents, or a country with no detailed outline) this falls back to
// comparing the reference polygons directly, exactly as it did before.
export function scoreShape(playerShape, referenceShape, { refMask = null, refCenter = null } = {}) {
  const playerPolygons = playerShape.getTransformedPolygons();
  const refPolygons = referenceShape.getTransformedPolygons();

  // 1. Shape similarity (IoU on normalized shapes)
  const iou = refMask
    ? maskIoU(rasterizeToMask(playerPolygons), refMask)
    : computeIoU(playerPolygons, refPolygons);
  const shapeScore = Math.round(iou * 100);

  // 2. Size accuracy
  const playerArea = multiPolygonArea(playerPolygons);
  const refArea = multiPolygonArea(refPolygons);
  const areaRatio = Math.min(playerArea, refArea) / Math.max(playerArea, refArea || 1);
  const sizeScore = Math.round(areaRatio * 100);

  // 3. Placement accuracy
  const playerCenter = multiPolygonCentroid(playerPolygons);
  const refPoint = refCenter || multiPolygonCentroid(refPolygons);
  const dist = distance(playerCenter, refPoint);
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
