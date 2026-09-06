# Data layer

How the country data is structured and regenerated. Established by TODOS items 5–6.

## Files

| File | Purpose | Keyed by |
|---|---|---|
| `data/countries-{region}.json` | Drawing geometry (polygons) | `code` (ISO 3166-1 alpha-2) + `name` |
| `data/datasets.json` | Rankable metrics (GDP, population, exports, …) + per-code country registry | `code` |
| `data/attributes.json` | Non-rankable country facts (capital, religion breakdown) | `code` |
| `data/flags.json` | Flag quiz (code, name, colors) | `code` |
| `data/entities.json` | **Canonical registry** — the join across all four | `code` |
| `data/shapes/{code}.json` | High-detail per-country outline for the panel/peek/compare | `code` (filename) |

Every system now shares the **ISO 3166-1 alpha-2 code** as its join key. Geometry
previously had names only; `code` was added to all 164 entries.

## Regeneration pipeline (order matters)

1. `node scripts/build-datasets.mjs` — fetches 8 World Bank indicators (plus
   `independence-year`, derived from `attributes.json`, so run 1b first for it), merges
   manual backfill (`MANUAL_VALUES`, gap-fill only), writes `data/datasets.json`
   with a `provenance` map for the manual values.
1b. `node scripts/build-attributes.mjs` — fetches capital + religion from the CIA
   World Factbook (public domain), name-matched to `entities.json` (alias table +
   manual backfill), writes `data/attributes.json`. Independent of the metric build.
2. `node scripts/build-entities.mjs --write` — resolves geometry names → codes,
   reconciles `datasets.json` display names to the common-name form (Vietnam,
   South Korea, Russia, …), and writes `data/entities.json`.

`flags.json` is hand-curated (not generated).

**Geometry** (`data/countries-{region}.json`) is regenerated separately by
`node scripts/build-geometry.mjs --write` from Natural Earth (1:50m base, 1:10m for
small countries, then `admin_0_map_units` for dependencies the country layer folds
into a parent — Svalbard, the French overseas départements — and
`admin_0_disputed_areas` for the de-facto states, matched on `BRK_NAME` only because
a disputed area's `NAME` is the state claiming it), projected into the original
Mercator 1600×900 space (coefficients
reverse-engineered from the legacy data, RMSE ~5px). Shapes are clipped to the main
landmass (antimeridian + distant overseas territories dropped), Douglas-Peucker
simplified, and colored by code (existing colors preserved). Requires `entities.json`
first (it drives the country set + continent→region mapping). `data/continents.json`
(the coarse continent outlines for Continents mode) is left as-is.

## Entity types (`entities.json` → `type`)

Classified in `scripts/build-entities.mjs`. The type is mostly a label, but it is
**not** purely informational: `aggregate` is excluded from every country pool, and
`territory` / `de-facto` set `optional: true`, which the Territories toggle gates.
`js/datasets.js` → `inCountryPool()` is the single place that rule lives; the Coverage
board and country panel deliberately bypass it so they can show everything.

- `sovereign` — sovereign states, plus the widely-recognized de-facto ones that
  predate this scheme and stay in the standard pool (Taiwan, Kosovo, Somaliland).
- `territory` — dependent or disputed territories (Greenland, New Caledonia,
  Hong Kong, Puerto Rico, Western Sahara, Falklands, Palestine, …).
- `de-facto` — self-governing, little or no recognition, claimed by another state
  (`xc` Northern Cyprus, `xa` Abkhazia, `xo` South Ossetia, `xt` Transnistria).
  Carries a `disputed` note, shown neutrally in the country panel.
- `aggregate` — World Bank statistical aggregate, not a country (`jg` Channel
  Islands = Jersey + Guernsey summed, so including it double-counts its members).

## Manual data decisions (TODOS #6)

**Flags added to the quiz** (`flags.json`): Greenland `gl`, New Caledonia `nc`,
Kosovo `xk`, Western Sahara `eh`, Falkland Islands `fk`.

**Stats backfilled** (`MANUAL_VALUES` in `build-datasets.mjs`, with `provenance`):
Taiwan `tw` (all 5 metrics), Kosovo `xk` (land area), Eritrea `er` (GDP, GDP/cap),
North Korea `kp` (GDP, GDP/cap — Bank of Korea estimate), plus land area +
population for Western Sahara `eh`, Falklands `fk`, Somaliland `xs`.

**Gaps intentionally left** (no reliable source; modes skip missing values):
- GDP, GDP-per-capita, life-expectancy for Western Sahara `eh`, Falklands `fk`,
  Somaliland `xs` (disputed/very small; figures unreliable).
- Entities with no ISO code get no flagcdn image (`xs` Somaliland and the four
  de-facto states). They ship as **bundled public-domain SVGs** in `assets/flags/`,
  resolved by `js/flags.js` → `flagUrl()`; `BUNDLED_FLAGS` in `build-entities.mjs`
  mirrors that list so `hasFlagImage` stays truthful. They still have no entry in
  `flags.json`, so they don't appear in the *color* quizzes.
- `jg` Channel Islands is the only entity with no flag at all — it is an aggregate,
  not a country, and has none.

## High-detail country outlines (TODOS #24)

`data/shapes/{code}.json` holds a **native-resolution** outline per country, used only by
the showcase panel / draw reference / compare (single-country display). The world geometry
(`countries-*.json`) squeezes everything into 1600×1100, so microstates become sub-pixel
blobs — and Natural Earth 1:10m itself only has ~17 points for San Marino. This tier is
sourced from **[geoBoundaries](https://www.geoboundaries.org) gbOpen (CC BY 4.0)**
(San Marino ~929 pts), normalized to a ~1000px box and simplified there, so detail survives.
Natural Earth is the fallback for the few entities geoBoundaries lacks.

- Build: `node scripts/build-shapes.mjs [code...]` — with codes, rebuilds only those
  files and leaves the rest alone; with none, wipes and rebuilds all of them.
  (fetches geoBoundaries via the LFS-resolving
  `github.com/.../raw/main` URL; ISO2→ISO3 via `mledoze/countries`).
- **Attribution (required by CC BY 4.0):** shown in the country panel footer
  ("Outlines © geoBoundaries (CC BY 4.0)").
- Per-country files (not one blob) so the panel loads only the shown country (~a few KB).

## Metrics & attributes added (TODOS #16–17)

**Rankable metrics** (`datasets.json`, World Bank, 2015–2023 latest-value window):
- `exports` — Exports of goods & services, current US$ (`NE.EXP.GNFS.CD`), 188 countries.
- `urbanization` — Urban population, % of total (`SP.URB.TOTL.IN.ZS`), 217 countries.

Both are enumerated dynamically by the rank-line picker and Data Explorer, so no UI
wiring is needed. `urbanization` uses the existing `percent` formatter.

**Country attributes** (`data/attributes.json`, CIA World Factbook, public domain):
- `capital` (string) + optional `capitalNote` (full text when multi-capital, e.g.
  South Africa) — 218/221 entities.
- `religion` — ordered `[{ name, pct }]` breakdown + `religionRaw` (source text) —
  205/221 entities. `entities.json` gains `hasCapital` / `hasReligion` coverage flags.

**Attribute gaps / known rough edges** (acceptable; modes should skip missing):
- `jg` Channel Islands (aggregate) — no attributes (Factbook lists Jersey/Guernsey
  separately). Left empty by design.
- Manual backfill (`MANUAL_ATTR` in `build-attributes.mjs`): Western Sahara `eh`,
  West Bank & Gaza `ps`, Somaliland `xs` — Factbook has no *conventional* name for
  these, so they're filled manually (capital + majority religion).
- Religion **ranges** now parse to their midpoint (e.g. Greece "Greek Orthodox 81–90%"
  → 85.5%), and parentheticals like "(official)" are stripped, so majorities are no
  longer dropped. The only remaining gap is religions whose percentages live *entirely
  inside* a parenthetical (e.g. Saudi Arabia "Muslim (official; citizens are 85–90%
  Sunni…)") — those still yield `capital` but no `religion`.
- A handful of multi-capital strings are cosmetically rough (e.g. Ivory Coast
  "Yamoussoukro , Abidjan"); `capitalNote` preserves the full Factbook text.
