#!/usr/bin/env node

/**
 * Generate country outline data for ALL continents from Natural Earth 50m GeoJSON.
 * Projects lat/lon to Mercator pixel coordinates for a 1600x900 canvas.
 * Outputs separate files per continent with regionBounds.
 *
 * Usage: node scripts/generate-all-countries.js
 */

const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");

const WIDTH = 1600;
const HEIGHT = 900;
const LAT_CLAMP = 85;
const MIN_POLYGON_POINTS = 4;
const MIN_AREA_THRESHOLD = 10;
const RDP_EPSILON = 0.8;
const RDP_EPSILON_FALLBACK = 0.5; // less simplification for 110m fallback

const SOURCES = [
  {
    url: "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson",
    type: "geojson",
    resolution: "50m",
  },
  {
    url: "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json",
    type: "topojson",
    resolution: "50m",
  },
  {
    url: "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson",
    type: "geojson",
    resolution: "110m",
  },
];

// 25 distinct colors that cycle nicely
const COUNTRY_COLORS = [
  "#E57373", "#64B5F6", "#81C784", "#FFD54F", "#FF8A65",
  "#BA68C8", "#4DD0E1", "#F06292", "#AED581", "#FFB74D",
  "#7986CB", "#4DB6AC", "#DCE775", "#FF8A80", "#82B1FF",
  "#B388FF", "#84FFFF", "#CCFF90", "#FFD180", "#A1887F",
  "#EF5350", "#42A5F5", "#66BB6A", "#FFA726", "#AB47BC",
];

// Continent slug to display name
const CONTINENT_NAMES = {
  africa: "Africa",
  europe: "Europe",
  asia: "Asia",
  "north-america": "North America",
  "south-america": "South America",
  oceania: "Oceania",
};

// Manual continent overrides for edge cases and countries that may have
// ambiguous or missing CONTINENT property in Natural Earth data.
// Keys are lowercase for matching.
const CONTINENT_OVERRIDES = {
  // Russia -> Asia
  russia: "Asia",
  "russian federation": "Asia",
  // Turkey -> Asia
  turkey: "Asia",
  "republic of turkey": "Asia",
  // Egypt -> Africa
  egypt: "Africa",
  // Central Asian -stan countries -> Asia
  kazakhstan: "Asia",
  uzbekistan: "Asia",
  turkmenistan: "Asia",
  tajikistan: "Asia",
  kyrgyzstan: "Asia",
  afghanistan: "Asia",
  pakistan: "Asia",
  // Caribbean -> North America
  cuba: "North America",
  jamaica: "North America",
  haiti: "North America",
  "dominican republic": "North America",
  "dominican rep.": "North America",
  "puerto rico": "North America",
  "trinidad and tobago": "North America",
  bahamas: "North America",
  "the bahamas": "North America",
  barbados: "North America",
  "antigua and barbuda": "North America",
  "antigua and barb.": "North America",
  "st. lucia": "North America",
  "saint lucia": "North America",
  dominica: "North America",
  grenada: "North America",
  "st. vincent and the grenadines": "North America",
  "saint vincent and the grenadines": "North America",
  "st. kitts and nevis": "North America",
  "saint kitts and nevis": "North America",
  // Central America -> North America
  guatemala: "North America",
  belize: "North America",
  honduras: "North America",
  "el salvador": "North America",
  nicaragua: "North America",
  "costa rica": "North America",
  panama: "North America",
  mexico: "North America",
  // Greenland -> North America
  greenland: "North America",
  // Oceania
  australia: "Oceania",
  "new zealand": "Oceania",
  "papua new guinea": "Oceania",
  fiji: "Oceania",
  "solomon islands": "Oceania",
  "solomon is.": "Oceania",
  vanuatu: "Oceania",
  "new caledonia": "Oceania",
  "french polynesia": "Oceania",
  samoa: "Oceania",
  "american samoa": "Oceania",
  tonga: "Oceania",
  "marshall islands": "Oceania",
  "marshall is.": "Oceania",
  kiribati: "Oceania",
  micronesia: "Oceania",
  "federated states of micronesia": "Oceania",
  palau: "Oceania",
  nauru: "Oceania",
  tuvalu: "Oceania",
  // Timor-Leste -> Asia
  "timor-leste": "Asia",
  "east timor": "Asia",
  // Cyprus -> Asia
  cyprus: "Asia",
  "n. cyprus": "Asia",
  "northern cyprus": "Asia",
  // Armenia, Azerbaijan, Georgia -> Asia
  armenia: "Asia",
  azerbaijan: "Asia",
  georgia: "Asia",
  // Island nations
  seychelles: "Africa",
  mauritius: "Africa",
  "saint helena": "Africa",
  "st. helena": "Africa",
  "cabo verde": "Africa",
  "cape verde": "Africa",
  "sao tome and principe": "Africa",
  "s\u00e3o tom\u00e9 and pr\u00edncipe": "Africa",
  comoros: "Africa",
  maldives: "Asia",
  "sri lanka": "Asia",
  singapore: "Asia",
  brunei: "Asia",
  "brunei darussalam": "Asia",
  "br. indian ocean ter.": "Asia",
  iceland: "Europe",
  malta: "Europe",
  // South Atlantic
  "s. geo. and the is.": "South America",
  "south georgia and the islands": "South America",
  "falkland islands": "South America",
  "falkland is.": "South America",
  "heard i. and mcdonald is.": "Oceania",
  // Antarctica -> skip
  antarctica: null,
};

// Map Natural Earth CONTINENT values to our canonical names
const NE_CONTINENT_MAP = {
  Africa: "Africa",
  Antarctica: null, // skip
  Asia: "Asia",
  Europe: "Europe",
  "North America": "North America",
  Oceania: "Oceania",
  "South America": "South America",
  "Seven seas (open ocean)": null, // skip
};

// Canonical country name normalization
const NAME_NORMALIZE = {
  "Dem. Rep. Congo": "Democratic Republic of the Congo",
  "Democratic Republic of the Congo": "Democratic Republic of the Congo",
  "Congo (Kinshasa)": "Democratic Republic of the Congo",
  Congo: "Republic of the Congo",
  "Congo (Brazzaville)": "Republic of the Congo",
  "Republic of the Congo": "Republic of the Congo",
  "Republic of Congo": "Republic of the Congo",
  "Côte d'Ivoire": "Ivory Coast",
  "Ivory Coast": "Ivory Coast",
  "The Gambia": "Gambia",
  "Eq. Guinea": "Equatorial Guinea",
  "S. Sudan": "South Sudan",
  "W. Sahara": "Western Sahara",
  "Central African Rep.": "Central African Republic",
  "Bosnia and Herz.": "Bosnia and Herzegovina",
  "Czech Rep.": "Czech Republic",
  Czechia: "Czech Republic",
  "N. Macedonia": "North Macedonia",
  "Dominican Rep.": "Dominican Republic",
  "Fr. S. Antarctic Lands": null, // skip
  "Falkland Is.": "Falkland Islands",
  "Fr. Polynesia": "French Polynesia",
  "Solomon Is.": "Solomon Islands",
  "Marshall Is.": "Marshall Islands",
  "N. Cyprus": "Northern Cyprus",
  "Lao PDR": "Laos",
  "Korea": "South Korea",
  "Dem. Rep. Korea": "North Korea",
  "Rep. of Korea": "South Korea",
  eSwatini: "eSwatini",
  Swaziland: "eSwatini",
  "United Republic of Tanzania": "Tanzania",
  "United States of America": "United States",
  "United States": "United States",
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

// ---- Polygon area in pixel space (shoelace formula) ----

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

// ---- Fetch with redirects (supports both http and https) ----

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const get = (u) => {
      const getter = u.startsWith("https") ? https : mod;
      getter
        .get(u, (res) => {
          if (
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location
          ) {
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

// ---- Simple TopoJSON to GeoJSON conversion (no dependencies) ----

function topoToGeo(topo) {
  // world-atlas has an object called "countries"
  const objName = Object.keys(topo.objects)[0];
  const obj = topo.objects[objName];
  const arcs = topo.arcs;
  const transform = topo.transform;

  function decodeArc(arcIdx) {
    const reverse = arcIdx < 0;
    const idx = reverse ? ~arcIdx : arcIdx;
    const arc = arcs[idx];
    const coords = [];
    let x = 0,
      y = 0;
    for (const [dx, dy] of arc) {
      x += dx;
      y += dy;
      if (transform) {
        coords.push([
          x * transform.scale[0] + transform.translate[0],
          y * transform.scale[1] + transform.translate[1],
        ]);
      } else {
        coords.push([x, y]);
      }
    }
    if (reverse) coords.reverse();
    return coords;
  }

  function decodeRing(arcRefs) {
    let coords = [];
    for (const ref of arcRefs) {
      const decoded = decodeArc(ref);
      // avoid duplicating the join point
      if (coords.length > 0) decoded.shift();
      coords = coords.concat(decoded);
    }
    return coords;
  }

  const features = [];
  for (const geom of obj.geometries) {
    let geometry;
    if (geom.type === "Polygon") {
      geometry = {
        type: "Polygon",
        coordinates: geom.arcs.map((ring) => decodeRing(ring)),
      };
    } else if (geom.type === "MultiPolygon") {
      geometry = {
        type: "MultiPolygon",
        coordinates: geom.arcs.map((polygon) =>
          polygon.map((ring) => decodeRing(ring))
        ),
      };
    } else {
      continue;
    }
    features.push({
      type: "Feature",
      properties: geom.properties || {},
      geometry,
    });
  }

  return { type: "FeatureCollection", features };
}

// ---- Get country name from feature ----

function getCountryName(feature) {
  const props = feature.properties || {};
  const candidates = [
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

  if (candidates.length === 0) return null;

  // Use NAME_NORMALIZE if available
  for (const n of candidates) {
    if (NAME_NORMALIZE[n] !== undefined) return NAME_NORMALIZE[n];
  }

  // Return the first non-empty name
  return candidates[0];
}

// ---- Get continent for a feature ----

function getContinent(feature) {
  const props = feature.properties || {};
  const name = getCountryName(feature);
  if (!name) return null;

  // Check overrides first (lowercase match)
  const nameLower = name.toLowerCase();
  if (nameLower in CONTINENT_OVERRIDES) {
    return CONTINENT_OVERRIDES[nameLower]; // may be null to skip
  }

  // Also check raw name fields for overrides
  const rawNames = [
    props.NAME,
    props.name,
    props.NAME_LONG,
    props.ADMIN,
    props.BRK_NAME,
  ].filter(Boolean);
  for (const n of rawNames) {
    const lower = n.toLowerCase();
    if (lower in CONTINENT_OVERRIDES) {
      return CONTINENT_OVERRIDES[lower]; // may be null to skip
    }
  }

  // Use CONTINENT property from Natural Earth
  const neCont = props.CONTINENT || props.continent;
  if (neCont && NE_CONTINENT_MAP[neCont] !== undefined) {
    return NE_CONTINENT_MAP[neCont];
  }

  // Use REGION_UN or SUBREGION as fallback hints
  const subregion = (props.SUBREGION || props.REGION_UN || "").toLowerCase();
  if (subregion.includes("africa")) return "Africa";
  if (subregion.includes("europe")) return "Europe";
  if (
    subregion.includes("asia") ||
    subregion.includes("middle east") ||
    subregion.includes("eastern asia")
  )
    return "Asia";
  if (subregion.includes("caribbean") || subregion.includes("central america"))
    return "North America";
  if (subregion.includes("northern america")) return "North America";
  if (subregion.includes("south america")) return "South America";
  if (
    subregion.includes("oceania") ||
    subregion.includes("australasia") ||
    subregion.includes("melanesia") ||
    subregion.includes("polynesia") ||
    subregion.includes("micronesia")
  )
    return "Oceania";

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

// ---- Continent name to file slug ----

function continentSlug(continent) {
  return continent.toLowerCase().replace(/\s+/g, "-");
}

// ---- Main ----

async function main() {
  console.log("Fetching GeoJSON data...\n");

  let geojson = null;
  let resolution = "50m";

  for (const source of SOURCES) {
    try {
      console.log(`  Trying ${source.resolution} (${source.type}): ${source.url}`);
      const raw = await fetchUrl(source.url);
      const parsed = JSON.parse(raw);

      if (source.type === "topojson") {
        geojson = topoToGeo(parsed);
        console.log(
          `  Success (TopoJSON)! ${geojson.features.length} features loaded.\n`
        );
      } else {
        geojson = parsed;
        console.log(
          `  Success! ${geojson.features.length} features loaded.\n`
        );
      }
      resolution = source.resolution;
      break;
    } catch (err) {
      console.log(`  Failed: ${err.message}\n`);
    }
  }

  if (!geojson) {
    console.error("Could not fetch GeoJSON from any source.");
    process.exit(1);
  }

  const epsilon = resolution === "110m" ? RDP_EPSILON_FALLBACK : RDP_EPSILON;
  console.log(
    `Using ${resolution} data with RDP epsilon=${epsilon}, min area=${MIN_AREA_THRESHOLD}\n`
  );

  // Group features by continent -> country
  // Structure: { "Africa": { "Nigeria": [[ring], [ring], ...], ... }, ... }
  const continentData = {};
  let skipped = 0;
  let unclassified = [];

  for (const feature of geojson.features) {
    const countryName = getCountryName(feature);
    if (!countryName) {
      skipped++;
      continue;
    }

    const continent = getContinent(feature);
    if (continent === null) {
      // Explicitly skipped (e.g. Antarctica) or unclassified
      // Check if it was an explicit skip via override
      const lowerName = countryName.toLowerCase();
      const isExplicitSkip =
        (lowerName in CONTINENT_OVERRIDES && CONTINENT_OVERRIDES[lowerName] === null);
      if (!isExplicitSkip) {
        unclassified.push(countryName);
      }
      continue;
    }
    if (!continent) {
      unclassified.push(countryName);
      continue;
    }

    if (!continentData[continent]) {
      continentData[continent] = {};
    }
    if (!continentData[continent][countryName]) {
      continentData[continent][countryName] = [];
    }

    const rings = extractPolygons(feature.geometry);
    for (const ring of rings) {
      const projected = ring.map(([lon, lat]) => projectMercator(lon, lat));

      if (projected.length < MIN_POLYGON_POINTS) continue;
      const area = polygonArea(projected);
      if (area < MIN_AREA_THRESHOLD) continue;

      const simplified = rdpSimplify(projected, epsilon);
      if (simplified.length >= 3) {
        continentData[continent][countryName].push(simplified);
      }
    }
  }

  if (skipped > 0) {
    console.log(`Skipped ${skipped} features with no name.`);
  }
  if (unclassified.length > 0) {
    const unique = [...new Set(unclassified)];
    console.log(
      `Unclassified countries (${unique.length}): ${unique.join(", ")}`
    );
  }
  console.log("");

  // Write a file for each continent
  const dataDir = path.join(__dirname, "..", "data");
  fs.mkdirSync(dataDir, { recursive: true });

  const allContinentSlugs = Object.keys(CONTINENT_NAMES);

  for (const slug of allContinentSlugs) {
    const displayName = CONTINENT_NAMES[slug];
    const countries = continentData[displayName] || {};

    // Sort alphabetically, filter out countries with no polygons
    const sortedNames = Object.keys(countries)
      .filter((name) => countries[name].length > 0)
      .sort();

    // Assign colors
    const countryEntries = sortedNames.map((name, idx) => ({
      name,
      color: COUNTRY_COLORS[idx % COUNTRY_COLORS.length],
      polygons: countries[name],
    }));

    // Compute regionBounds
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const c of countryEntries) {
      for (const poly of c.polygons) {
        for (const [x, y] of poly) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }

    const regionBounds =
      countryEntries.length > 0
        ? {
            minX: Math.floor(minX),
            minY: Math.floor(minY),
            maxX: Math.ceil(maxX),
            maxY: Math.ceil(maxY),
          }
        : { minX: 0, minY: 0, maxX: WIDTH, maxY: HEIGHT };

    const output = {
      projection: "mercator",
      canvasSize: [WIDTH, HEIGHT],
      region: displayName,
      regionBounds,
      countries: countryEntries,
    };

    const outPath = path.join(dataDir, `countries-${slug}.json`);
    fs.writeFileSync(outPath, JSON.stringify(output, null, 2));

    // Stats
    let totalPolygons = 0;
    let totalPoints = 0;
    for (const c of countryEntries) {
      totalPolygons += c.polygons.length;
      for (const p of c.polygons) totalPoints += p.length;
    }

    const stats = fs.statSync(outPath);
    console.log(
      `${displayName}: ${countryEntries.length} countries, ${totalPolygons} polygons, ${totalPoints} points -> ${outPath} (${(stats.size / 1024).toFixed(1)} KB)`
    );
  }

  console.log("\nDone! All continent files generated.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
