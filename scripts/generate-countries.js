#!/usr/bin/env node

/**
 * Generate African country outline data from Natural Earth GeoJSON.
 * Projects lat/lon to Mercator pixel coordinates for a 1600x900 canvas.
 * Outputs multi-polygon data grouped by country.
 *
 * Usage: node scripts/generate-countries.js
 */

const https = require("https");
const fs = require("fs");
const path = require("path");

const WIDTH = 1600;
const HEIGHT = 900;
const LAT_CLAMP = 85;
const MIN_POLYGON_POINTS = 4;
const MIN_AREA_THRESHOLD = 20;
const RDP_EPSILON = 1.5;

const SOURCES = [
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson",
  "https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json",
];

// All African countries as they appear in Natural Earth 110m dataset
// Maps variant names to a canonical name
const AFRICAN_COUNTRIES = {
  Algeria: "Algeria",
  Angola: "Angola",
  Benin: "Benin",
  Botswana: "Botswana",
  "Burkina Faso": "Burkina Faso",
  Burundi: "Burundi",
  Cameroon: "Cameroon",
  "Central African Republic": "Central African Republic",
  "Central African Rep.": "Central African Republic",
  Chad: "Chad",
  "Congo (Brazzaville)": "Republic of the Congo",
  "Congo (Kinshasa)": "Democratic Republic of the Congo",
  Congo: "Republic of the Congo",
  "Dem. Rep. Congo": "Democratic Republic of the Congo",
  "Democratic Republic of the Congo": "Democratic Republic of the Congo",
  "Republic of the Congo": "Republic of the Congo",
  "Republic of Congo": "Republic of the Congo",
  "Côte d'Ivoire": "Ivory Coast",
  "Ivory Coast": "Ivory Coast",
  Djibouti: "Djibouti",
  Egypt: "Egypt",
  "Equatorial Guinea": "Equatorial Guinea",
  "Eq. Guinea": "Equatorial Guinea",
  Eritrea: "Eritrea",
  Ethiopia: "Ethiopia",
  Gabon: "Gabon",
  Gambia: "Gambia",
  "The Gambia": "Gambia",
  Ghana: "Ghana",
  Guinea: "Guinea",
  "Guinea-Bissau": "Guinea-Bissau",
  "Guinea Bissau": "Guinea-Bissau",
  Kenya: "Kenya",
  Lesotho: "Lesotho",
  Liberia: "Liberia",
  Libya: "Libya",
  Madagascar: "Madagascar",
  Malawi: "Malawi",
  Mali: "Mali",
  Mauritania: "Mauritania",
  Morocco: "Morocco",
  Mozambique: "Mozambique",
  Namibia: "Namibia",
  Niger: "Niger",
  Nigeria: "Nigeria",
  Rwanda: "Rwanda",
  Senegal: "Senegal",
  "Sierra Leone": "Sierra Leone",
  Somalia: "Somalia",
  Somaliland: "Somaliland",
  "South Africa": "South Africa",
  "South Sudan": "South Sudan",
  "S. Sudan": "South Sudan",
  Sudan: "Sudan",
  Swaziland: "eSwatini",
  eSwatini: "eSwatini",
  Tanzania: "Tanzania",
  "United Republic of Tanzania": "Tanzania",
  Togo: "Togo",
  Tunisia: "Tunisia",
  Uganda: "Uganda",
  "Western Sahara": "Western Sahara",
  "W. Sahara": "Western Sahara",
  Zambia: "Zambia",
  Zimbabwe: "Zimbabwe",
};

// Distinct color palette for African countries - 20 colors that cycle
const COUNTRY_COLORS = [
  "#E57373", // red
  "#64B5F6", // blue
  "#81C784", // green
  "#FFD54F", // yellow
  "#FF8A65", // orange
  "#BA68C8", // purple
  "#4DD0E1", // cyan
  "#F06292", // pink
  "#AED581", // light green
  "#FFB74D", // light orange
  "#7986CB", // indigo
  "#4DB6AC", // teal
  "#DCE775", // lime
  "#FF8A80", // red accent
  "#82B1FF", // blue accent
  "#B388FF", // purple accent
  "#84FFFF", // cyan accent
  "#CCFF90", // light green accent
  "#FFD180", // orange accent
  "#A1887F", // brown
];

// ---- Mercator projection ----

function projectMercator(lon, lat) {
  const clampedLat = Math.max(-LAT_CLAMP, Math.min(LAT_CLAMP, lat));
  const x = ((lon + 180) / 360) * WIDTH;
  const latRad = (clampedLat * Math.PI) / 180;
  const y =
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
    HEIGHT;
  return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
}

// ---- Polygon area in pixel space (shoelace formula, absolute value) ----

function polygonArea(points) {
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i][0] * points[j][1];
    area -= points[j][0] * points[i][1];
  }
  return Math.abs(area) / 2;
}

// ---- Simplify with Ramer-Douglas-Peucker ----

function rdpSimplify(points, epsilon) {
  if (points.length <= 2) return points;

  let maxDist = 0;
  let maxIdx = 0;
  const start = points[0];
  const end = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], start, end);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }

  if (maxDist > epsilon) {
    const left = rdpSimplify(points.slice(0, maxIdx + 1), epsilon);
    const right = rdpSimplify(points.slice(maxIdx), epsilon);
    return left.slice(0, -1).concat(right);
  } else {
    return [start, end];
  }
}

function perpendicularDistance(point, lineStart, lineEnd) {
  const dx = lineEnd[0] - lineStart[0];
  const dy = lineEnd[1] - lineStart[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    const ex = point[0] - lineStart[0];
    const ey = point[1] - lineStart[1];
    return Math.sqrt(ex * ex + ey * ey);
  }
  const t = Math.max(
    0,
    Math.min(
      1,
      ((point[0] - lineStart[0]) * dx + (point[1] - lineStart[1]) * dy) /
        lenSq
    )
  );
  const projX = lineStart[0] + t * dx;
  const projY = lineStart[1] + t * dy;
  const ex = point[0] - projX;
  const ey = point[1] - projY;
  return Math.sqrt(ex * ex + ey * ey);
}

// ---- Fetch with redirects ----

function fetch(url) {
  return new Promise((resolve, reject) => {
    const get = (u) => {
      https
        .get(u, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            get(res.headers.location);
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode} for ${u}`));
            return;
          }
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
          res.on("error", reject);
        })
        .on("error", reject);
    };
    get(url);
  });
}

// ---- Resolve feature to African country name ----

function getAfricanCountryName(feature) {
  const props = feature.properties || {};

  // Try various name fields
  const names = [
    props.NAME,
    props.name,
    props.NAME_LONG,
    props.name_long,
    props.ADMIN,
    props.admin,
    props.NAME_EN,
    props.FORMAL_EN,
    props.BRK_NAME,
    props.SOVEREIGNT,
    props.sovereignt,
  ].filter(Boolean);

  for (const n of names) {
    if (AFRICAN_COUNTRIES[n]) return AFRICAN_COUNTRIES[n];
  }

  // Try partial matching as last resort
  for (const n of names) {
    for (const [key, canonical] of Object.entries(AFRICAN_COUNTRIES)) {
      if (
        n.toLowerCase().includes(key.toLowerCase()) ||
        key.toLowerCase().includes(n.toLowerCase())
      ) {
        return canonical;
      }
    }
  }

  return null;
}

// ---- Extract polygon rings from a geometry ----

function extractPolygons(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") {
    return [geometry.coordinates[0]];
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.map((poly) => poly[0]);
  }
  return [];
}

// ---- Main ----

async function main() {
  console.log("Fetching GeoJSON data...");

  let geojson;
  for (const url of SOURCES) {
    try {
      console.log(`  Trying: ${url}`);
      const raw = await fetch(url);
      geojson = JSON.parse(raw);
      console.log(`  Success! ${geojson.features.length} features loaded.`);
      break;
    } catch (err) {
      console.log(`  Failed: ${err.message}`);
    }
  }

  if (!geojson) {
    console.error("Could not fetch GeoJSON from any source.");
    process.exit(1);
  }

  // Group polygons by country
  const countryPolygons = {};

  for (const feature of geojson.features) {
    const countryName = getAfricanCountryName(feature);
    if (!countryName) continue;

    if (!countryPolygons[countryName]) {
      countryPolygons[countryName] = [];
    }

    const rings = extractPolygons(feature.geometry);
    for (const ring of rings) {
      const projected = ring.map(([lon, lat]) => projectMercator(lon, lat));

      // Skip tiny polygons
      if (projected.length < MIN_POLYGON_POINTS) continue;
      const area = polygonArea(projected);
      if (area < MIN_AREA_THRESHOLD) continue;

      // Simplify with RDP
      const simplified = rdpSimplify(projected, RDP_EPSILON);
      if (simplified.length >= 3) {
        countryPolygons[countryName].push(simplified);
      }
    }
  }

  // Sort country names alphabetically
  const sortedNames = Object.keys(countryPolygons).sort();

  // Build output
  const output = {
    projection: "mercator",
    canvasSize: [WIDTH, HEIGHT],
    region: "Africa",
    countries: sortedNames
      .filter((name) => countryPolygons[name].length > 0)
      .map((name, idx) => ({
        name,
        color: COUNTRY_COLORS[idx % COUNTRY_COLORS.length],
        polygons: countryPolygons[name],
      })),
  };

  // Stats
  let totalPolygons = 0;
  let totalPoints = 0;
  for (const c of output.countries) {
    totalPolygons += c.polygons.length;
    for (const p of c.polygons) totalPoints += p.length;
    console.log(
      `  ${c.name}: ${c.polygons.length} polygon(s), ${c.polygons.reduce((s, p) => s + p.length, 0)} points`
    );
  }
  console.log(`\n${output.countries.length} countries, ${totalPolygons} polygons, ${totalPoints} total points`);

  // Write output
  const outPath = path.join(__dirname, "..", "data", "countries-africa.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\nWritten to ${outPath}`);
  const stats = fs.statSync(outPath);
  console.log(`File size: ${(stats.size / 1024).toFixed(1)} KB`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
