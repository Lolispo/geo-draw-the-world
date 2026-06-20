# Data layer

How the country data is structured and regenerated. Established by TODOS items 5–6.

## Files

| File | Purpose | Keyed by |
|---|---|---|
| `data/countries-{region}.json` | Drawing geometry (polygons) | `code` (ISO 3166-1 alpha-2) + `name` |
| `data/datasets.json` | Stats (GDP, population, etc.) + per-code country registry | `code` |
| `data/flags.json` | Flag quiz (code, name, colors) | `code` |
| `data/entities.json` | **Canonical registry** — the join across all three | `code` |

Every system now shares the **ISO 3166-1 alpha-2 code** as its join key. Geometry
previously had names only; `code` was added to all 164 entries.

## Regeneration pipeline (order matters)

1. `node scripts/build-datasets.mjs` — fetches 5 World Bank indicators, merges
   manual backfill (`MANUAL_VALUES`, gap-fill only), writes `data/datasets.json`
   with a `provenance` map for the manual values.
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
