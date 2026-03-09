// Shape class: holds a drawn polygon with transform properties
// Supports both single polygon (player-drawn) and multi-polygon (reference) shapes

import {
  polygonCentroid, multiPolygonCentroid, polygonArea, multiPolygonArea,
  boundingBox, multiPolygonBoundingBox, transformPoints,
  pointInPolygon, pointInMultiPolygon,
  drawPolygon, drawMultiPolygon
} from './utils.js';

export class Shape {
  // rawPolygons: array of polygon arrays, e.g. [[[x,y],...], [[x,y],...]]
  // For player-drawn shapes, pass a single polygon: [points]
  constructor(rawPolygons, name, color) {
    this.name = name;
    this.color = color;

    // Normalize: ensure array of polygons
    if (rawPolygons.length > 0 && typeof rawPolygons[0][0] === 'number') {
      // Single polygon passed as flat array of points
      rawPolygons = [rawPolygons];
    }

    // Store points relative to the weighted centroid
    const centroid = multiPolygonCentroid(rawPolygons);
    this.localPolygons = rawPolygons.map(poly =>
      poly.map(([x, y]) => [x - centroid[0], y - centroid[1]])
    );

    // Transform state
    this.position = [0, 0];
    this.scale = 1;
    this.rotation = 0;
  }

  getTransformedPolygons() {
    return this.localPolygons.map(poly =>
      transformPoints(poly, this.position, this.scale, this.rotation)
    );
  }

  // Convenience: all transformed points flattened (for bounding box etc)
  getAllTransformedPoints() {
    return this.getTransformedPolygons().flat();
  }

  getBoundingBox() {
    return multiPolygonBoundingBox(this.getTransformedPolygons());
  }

  getArea() {
    return multiPolygonArea(this.getTransformedPolygons());
  }

  containsPoint(x, y) {
    return pointInMultiPolygon(x, y, this.getTransformedPolygons());
  }

  draw(ctx, { fillAlpha = 0.4, strokeColor = null, ghostMode = false } = {}) {
    const polygons = this.getTransformedPolygons();
    if (ghostMode) {
      drawMultiPolygon(ctx, polygons, {
        stroke: this.color + '88',
        lineWidth: 0.8,
        dash: [4, 3],
        fill: this.color + '11'
      });
    } else {
      const alpha = Math.round(fillAlpha * 255).toString(16).padStart(2, '0');
      drawMultiPolygon(ctx, polygons, {
        fill: this.color + alpha,
        stroke: strokeColor || this.color,
        lineWidth: 2
      });
    }
  }
}
