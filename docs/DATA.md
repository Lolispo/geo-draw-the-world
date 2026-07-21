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

Every system now shares the **ISO 3166-1 alpha-2 code** as its join key. Geometry
previously had names only; `code` was added to all 164 entries.

## Regeneration pipeline (order matters)

1. `node scripts/build-datasets.mjs` — fetches 7 World Bank indicators, merges
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
small countries), projected into the original Mercator 1600×900 space (coefficients
reverse-engineered from the legacy data, RMSE ~5px). Shapes are clipped to the main
landmass (antimeridian + distant overseas territories dropped), Douglas-Peucker
simplified, and colored by code (existing colors preserved). Requires `entities.json`
first (it drives the country set + continent→region mapping). `data/continents.json`
(the coarse continent outlines for Continents mode) is left as-is.

## Entity types (`entities.json` → `type`)

Informational only — **all entities are playable** in every mode; the type just
labels them. Classified in `scripts/build-entities.mjs`:

- `sovereign` — sovereign / de-facto states (incl. Taiwan, Kosovo, Somaliland).
- `territory` — dependent or disputed territories (Greenland, New Caledonia,
  Hong Kong, Puerto Rico, Western Sahara, Falklands, Palestine, …).
- `aggregate` — World Bank statistical aggregate, not a country (`jg` Channel Islands).

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
- Somaliland `xs` has **no flag** in the quiz — no official ISO code, so no
  flagcdn image exists. It remains drawable and in stats, flagless by necessity.

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
