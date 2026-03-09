#!/usr/bin/env node

/**
 * Generate continent outline data from Natural Earth GeoJSON.
 * Projects lat/lon to Mercator pixel coordinates for a 1600x900 canvas.
 * Outputs multi-polygon data grouped by continent.
 *
 * Usage: node scripts/generate-continents.js
 */

const https = require("https");
const fs = require("fs");
const path = require("path");

const WIDTH = 1600;
const HEIGHT = 900;
const LAT_CLAMP = 85;
const MIN_POLYGON_POINTS = 4; // skip very tiny polygons

// Minimum pixel-space area to keep a polygon (filters out tiny specks)
const MIN_AREA_THRESHOLD = 20;

const SOURCES = [
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson",
  "https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json",
];

const CONTINENT_COLORS = {
  Africa: "#E57373",
  Europe: "#64B5F6",
  Asia: "#FFD54F",
  "North America": "#81C784",
  "South America": "#FF8A65",
  Oceania: "#BA68C8",
  Antarctica: "#B0BEC5",
};

// Comprehensive country-to-continent mapping
// Uses names as they appear in Natural Earth 110m dataset
const COUNTRY_TO_CONTINENT = {
  // Africa
  Algeria: "Africa",
  Angola: "Africa",
  Benin: "Africa",
  Botswana: "Africa",
  "Burkina Faso": "Africa",
  Burundi: "Africa",
  Cameroon: "Africa",
  "Cape Verde": "Africa",
  "Central African Republic": "Africa",
  "Central African Rep.": "Africa",
  Chad: "Africa",
  Comoros: "Africa",
  "Congo (Brazzaville)": "Africa",
  "Congo (Kinshasa)": "Africa",
  Congo: "Africa",
  "Dem. Rep. Congo": "Africa",
  "Democratic Republic of the Congo": "Africa",
  "Republic of the Congo": "Africa",
  "Republic of Congo": "Africa",
  "Côte d'Ivoire": "Africa",
  "Ivory Coast": "Africa",
  Djibouti: "Africa",
  Egypt: "Africa",
  "Equatorial Guinea": "Africa",
  "Eq. Guinea": "Africa",
  Eritrea: "Africa",
  Ethiopia: "Africa",
  Gabon: "Africa",
  Gambia: "Africa",
  "The Gambia": "Africa",
  Ghana: "Africa",
  Guinea: "Africa",
  "Guinea-Bissau": "Africa",
  "Guinea Bissau": "Africa",
  Kenya: "Africa",
  Lesotho: "Africa",
  Liberia: "Africa",
  Libya: "Africa",
  Madagascar: "Africa",
  Malawi: "Africa",
  Mali: "Africa",
  Mauritania: "Africa",
  Mauritius: "Africa",
  Morocco: "Africa",
  Mozambique: "Africa",
  Namibia: "Africa",
  Niger: "Africa",
  Nigeria: "Africa",
  Rwanda: "Africa",
  "São Tomé and Príncipe": "Africa",
  "Sao Tome and Principe": "Africa",
  Senegal: "Africa",
  "Sierra Leone": "Africa",
  Somalia: "Africa",
  Somaliland: "Africa",
  "South Africa": "Africa",
  "South Sudan": "Africa",
  "S. Sudan": "Africa",
  Sudan: "Africa",
  Swaziland: "Africa",
  eSwatini: "Africa",
  Tanzania: "Africa",
  "United Republic of Tanzania": "Africa",
  Togo: "Africa",
  Tunisia: "Africa",
  Uganda: "Africa",
  "Western Sahara": "Africa",
  "W. Sahara": "Africa",
  Zambia: "Africa",
  Zimbabwe: "Africa",
  Seychelles: "Africa",
  "Cape Verde": "Africa",
  "Cabo Verde": "Africa",

  // Europe
  Albania: "Europe",
  Andorra: "Europe",
  Austria: "Europe",
  Belarus: "Europe",
  Belgium: "Europe",
  "Bosnia and Herzegovina": "Europe",
  "Bosnia and Herz.": "Europe",
  Bulgaria: "Europe",
  Croatia: "Europe",
  Cyprus: "Europe",
  "Czech Republic": "Europe",
  Czechia: "Europe",
  Denmark: "Europe",
  Estonia: "Europe",
  Finland: "Europe",
  France: "Europe",
  Germany: "Europe",
  Greece: "Europe",
  Hungary: "Europe",
  Iceland: "Europe",
  Ireland: "Europe",
  Italy: "Europe",
  Kosovo: "Europe",
  Latvia: "Europe",
  Liechtenstein: "Europe",
  Lithuania: "Europe",
  Luxembourg: "Europe",
  Malta: "Europe",
  Moldova: "Europe",
  Monaco: "Europe",
  Montenegro: "Europe",
  Netherlands: "Europe",
  "North Macedonia": "Europe",
  Macedonia: "Europe",
  Norway: "Europe",
  Poland: "Europe",
  Portugal: "Europe",
  Romania: "Europe",
  Russia: "Europe",
  "Russian Federation": "Europe",
  "San Marino": "Europe",
  Serbia: "Europe",
  "Republic of Serbia": "Europe",
  Slovakia: "Europe",
  Slovenia: "Europe",
  Spain: "Europe",
  Sweden: "Europe",
  Switzerland: "Europe",
  Ukraine: "Europe",
  "United Kingdom": "Europe",
  "Vatican City": "Europe",
  "Northern Cyprus": "Europe",
  "N. Cyprus": "Europe",

  // Asia
  Afghanistan: "Asia",
  Armenia: "Asia",
  Azerbaijan: "Asia",
  Bahrain: "Asia",
  Bangladesh: "Asia",
  Bhutan: "Asia",
  Brunei: "Asia",
  Cambodia: "Asia",
  China: "Asia",
  "East Timor": "Asia",
  "Timor-Leste": "Asia",
  Georgia: "Asia",
  India: "Asia",
  Indonesia: "Asia",
  Iran: "Asia",
  Iraq: "Asia",
  Israel: "Asia",
  Japan: "Asia",
  Jordan: "Asia",
  Kazakhstan: "Asia",
  Kuwait: "Asia",
  Kyrgyzstan: "Asia",
  Laos: "Asia",
  Lebanon: "Asia",
  Malaysia: "Asia",
  Maldives: "Asia",
  Mongolia: "Asia",
  Myanmar: "Asia",
  Nepal: "Asia",
  "North Korea": "Asia",
  Oman: "Asia",
  Pakistan: "Asia",
  Palestine: "Asia",
  Philippines: "Asia",
  Qatar: "Asia",
  "Saudi Arabia": "Asia",
  Singapore: "Asia",
  "South Korea": "Asia",
  "Sri Lanka": "Asia",
  Syria: "Asia",
  Taiwan: "Asia",
  Tajikistan: "Asia",
  Thailand: "Asia",
  Turkey: "Asia",
  Turkmenistan: "Asia",
  "United Arab Emirates": "Asia",
  Uzbekistan: "Asia",
  Vietnam: "Asia",
  Yemen: "Asia",

  // North America
  "Antigua and Barbuda": "North America",
  Bahamas: "North America",
  "The Bahamas": "North America",
  Barbados: "North America",
  Belize: "North America",
  Canada: "North America",
  "Costa Rica": "North America",
  Cuba: "North America",
  Dominica: "North America",
  "Dominican Republic": "North America",
  "Dominican Rep.": "North America",
  "El Salvador": "North America",
  Grenada: "North America",
  Guatemala: "North America",
  Haiti: "North America",
  Honduras: "North America",
  Jamaica: "North America",
  Mexico: "North America",
  Nicaragua: "North America",
  Panama: "North America",
  "Saint Kitts and Nevis": "North America",
  "Saint Lucia": "North America",
  "Saint Vincent and the Grenadines": "North America",
  "Trinidad and Tobago": "North America",
  "Trinidad and Tobago": "North America",
  "United States of America": "North America",
  "United States": "North America",
  Greenland: "North America",
  "Puerto Rico": "North America",

  // South America
  Argentina: "South America",
  Bolivia: "South America",
  Brazil: "South America",
  Chile: "South America",
  Colombia: "South America",
  Ecuador: "South America",
  "Falkland Islands": "South America",
  "Falkland Is.": "South America",
  "French Guiana": "South America",
  Guyana: "South America",
  Paraguay: "South America",
  Peru: "South America",
  Suriname: "South America",
  Uruguay: "South America",
  Venezuela: "South America",

  // Oceania
  Australia: "Oceania",
  Fiji: "Oceania",
  Kiribati: "Oceania",
  "Marshall Islands": "Oceania",
  Micronesia: "Oceania",
  Nauru: "Oceania",
  "New Caledonia": "Oceania",
  "New Zealand": "Oceania",
  Palau: "Oceania",
  "Papua New Guinea": "Oceania",
  Samoa: "Oceania",
  "Solomon Islands": "Oceania",
  "Solomon Is.": "Oceania",
  Tonga: "Oceania",
  Tuvalu: "Oceania",
  Vanuatu: "Oceania",

  // Antarctica
  Antarctica: "Antarctica",
};

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

// ---- Resolve country name to continent ----

function getContinent(feature) {
  const props = feature.properties || {};

  // Natural Earth often has a CONTINENT or continent field
  if (props.CONTINENT) return props.CONTINENT;
  if (props.continent) return props.continent;

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
    if (COUNTRY_TO_CONTINENT[n]) return COUNTRY_TO_CONTINENT[n];
  }

  // Try partial matching as last resort
  for (const n of names) {
    for (const [key, continent] of Object.entries(COUNTRY_TO_CONTINENT)) {
      if (
        n.toLowerCase().includes(key.toLowerCase()) ||
        key.toLowerCase().includes(n.toLowerCase())
      ) {
        return continent;
      }
    }
  }

  return null;
}

// ---- Extract polygon rings from a geometry ----

function extractPolygons(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") {
    // Only take the outer ring (index 0), ignore holes
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

  // Group polygons by continent
  const continentPolygons = {};
  const unmapped = [];

  for (const feature of geojson.features) {
    const continent = getContinent(feature);
    const name =
      feature.properties.NAME ||
      feature.properties.name ||
      feature.properties.ADMIN ||
      "Unknown";

    if (!continent) {
      unmapped.push(name);
      continue;
    }

    if (!continentPolygons[continent]) {
      continentPolygons[continent] = [];
    }

    const rings = extractPolygons(feature.geometry);
    for (const ring of rings) {
      // Project to Mercator pixel coords
      const projected = ring.map(([lon, lat]) => projectMercator(lon, lat));

      // Skip tiny polygons
      if (projected.length < MIN_POLYGON_POINTS) continue;
      const area = polygonArea(projected);
      if (area < MIN_AREA_THRESHOLD) continue;

      // Simplify with RDP (epsilon in pixels)
      const simplified = rdpSimplify(projected, 1.5);
      if (simplified.length >= 3) {
        continentPolygons[continent].push(simplified);
      }
    }
  }

  if (unmapped.length > 0) {
    console.log(`\nUnmapped countries (${unmapped.length}):`);
    unmapped.forEach((n) => console.log(`  - ${n}`));
  }

  // Build output
  const continentOrder = [
    "Africa",
    "Europe",
    "Asia",
    "North America",
    "South America",
    "Oceania",
    "Antarctica",
  ];

  const output = {
    projection: "mercator",
    canvasSize: [WIDTH, HEIGHT],
    continents: continentOrder
      .filter((name) => continentPolygons[name] && continentPolygons[name].length > 0)
      .map((name) => ({
        name,
        color: CONTINENT_COLORS[name],
        polygons: continentPolygons[name],
      })),
  };

  // Stats
  let totalPolygons = 0;
  let totalPoints = 0;
  for (const c of output.continents) {
    totalPolygons += c.polygons.length;
    for (const p of c.polygons) totalPoints += p.length;
    console.log(
      `\n${c.name}: ${c.polygons.length} polygons, ${c.polygons.reduce((s, p) => s + p.length, 0)} points`
    );
  }
  console.log(`\nTotal: ${totalPolygons} polygons, ${totalPoints} points`);

  // Write output
  const outPath = path.join(__dirname, "..", "data", "continents.json");
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
