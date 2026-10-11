# Data layer

How the country data is structured and regenerated. Established by TODOS items 5–6.

The same picture, drawn and kept honest: open `data-map.html` on the served site
(see `CLAUDE.md` for the port — not `npm start`). It graphs source → script → file →
consumer and recomputes the cross-file integrity checks from the committed data on
every load, so where this file and that page disagree, the page is right.

Per-entity coverage is in the app rather than on that page: **Data Explorer →
Coverage** (`#/explore/coverage`) lists every entity against every field, and its
Colors column checks each curated flag colour against the flag's own image (TODOS #55).

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
   Each fetched dataset carries a **`years`** map beside `values`: the latest non-null
   year is resolved per country *independently*, so the window is not uniform (GDP is
   2023 for most of the table but 2015 for South Sudan). A missing year is meaningful —
   it marks a `MANUAL_VALUES` backfill, which carries a `provenance` string instead.
1b. `node scripts/build-attributes.mjs` — fetches capital + religion from the CIA
   World Factbook (public domain), name-matched to `entities.json` (alias table +
   manual backfill), writes `data/attributes.json`. Independent of the metric build.
2. `node scripts/build-entities.mjs --write` — resolves geometry names → codes,
   reconciles `datasets.json` display names to the common-name form (Vietnam,
   South Korea, Russia, …), and writes `data/entities.json`.

`flags.json` is hand-curated (not generated).

The two geometry builds download their own inputs — the Natural Earth layers and the
ISO2→ISO3 table — through `scripts/lib/sources.mjs`, cached in a gitignored `.cache/`.
They previously read these out of `/tmp`, which meant they only ran on a machine where
someone had already fetched them by hand.

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

De-facto entities also carry **`claimedBy`** — the claim `disputed` already states in prose,
as a code — which `canCombine()` in `js/datasets.js` reads to refuse a summed pair that
would count the same people twice (TODOS #54). It records that double-counting is *possible*;
it does **not** assert that the claimant's World Bank figure includes those people, because
that varies by country and is not derivable from the data here. Cyprus is the measurable
case: its GDP per capita sits 40% above GDP ÷ population, because the Bank's Cyprus GDP
covers the government-controlled area while `SP.POP.TOTL` covers the whole island.

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
sourced from **[geoBoundaries](https://www.geoboundaries.org) gbOpen (CC BY 4.0)**,
normalized to a ~1000px box and simplified there, so detail survives. Natural Earth is the
fallback for the entities geoBoundaries lacks.

- Build: `node scripts/build-shapes.mjs [code...]` — with codes, rebuilds only those
  files and leaves the rest alone; with none, wipes and rebuilds all of them.
  (fetches geoBoundaries via the LFS-resolving
  `github.com/.../raw/main` URL; ISO2→ISO3 via `mledoze/countries`).
- **Which of geoBoundaries' two releases.** `ADM0_simplified` is small but pre-thinned,
  and for a microstate it — not our own Douglas-Peucker pass — decides the result: San
  Marino arrives with 52 vertices where the full release has 929. The full release is the
  opposite problem; Norway's is 54 MB and yields 18 more points, because once DP is the
  binding constraint a finer source changes nothing. So the build takes the simplified
  file, and re-fetches the full one only when the local simplify barely removed anything
  (`REFETCH_RETENTION`) or the result is tiny anyway (`REFETCH_UNDER`) — keeping whichever
  yields more points, so it can never lose detail. Currently 72 full / 158 simplified /
  21 Natural Earth; the rebuild takes about 17 seconds.
- Each file records **`src`** (`gb-full` / `gb-simplified` / `ne`) so the tier split is
  auditable from the shipped data without re-running the build. `data-map.html` reads it.
- **Attribution (required by CC BY 4.0):** shown in the country panel footer
  ("Outlines © geoBoundaries (CC BY 4.0)").
- Per-country files (not one blob) so the panel loads only the shown country (~a few KB).
- A territory made of far-apart islands normalizes to the ocean between them and flattens —
  St Helena ships 39 points from either release, across islands spanning 32° of latitude.
  That is handled in the **drawing** rather than here (TODOS #53): `js/silhouette.js` keeps
  every ring in its true position and draws any ring under 3.5px on screen as a dot, so an
  archipelago reads as an archipelago. Per-ring simplification was considered and rejected —
  nothing displays these at a size where the extra vertices would show.

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
- Religion **ranges** parse to their midpoint (e.g. Greece "Greek Orthodox 81–90%"
  → 85.5%), and parentheticals like "(official)" are stripped, so majorities are not
  dropped. Parenthetical stripping counts **depth** — a flat `/\([^)]*\)/` stopped at the
  first `)`, so on a nested entry (Bolivia's "Protestant 19.6% (Evangelical
  (non-specific) 11.9%, …)") the sub-groups survived and were counted as siblings of
  their own parent, totalling 108%.
- Three other parser repairs, all found by the checks on `data-map.html`: an entry
  holding **two surveys** joined by `<br><br>` keeps the first only (Uruguay totalled
  201% with "Roman Catholic" listed twice); the integer part of a percentage is optional
  so Brazil's ".06%" is six hundredths rather than six; and a bare number immediately
  before a comma is read as a dropped `%` (Andorra's "Christian … 89.5, other 8.8%" lost
  its entire majority). That last one only works because the note separator is matched as
  both `note:` and `note - ` — Morocco's "note - Jewish about 3,000-3,500" was otherwise
  left in the text to be misparsed.
- **A religion named without a percentage is kept** (TODOS #52). The Factbook gives San
  Marino as simply "Roman Catholic" and Sudan as "Sunni Muslim, small Christian minority";
  Saudi Arabia's only numbers sit inside a parenthetical and describe a split among
  citizens, not a national share. Those rows carry **no `pct`** — which *is* the statement
  that they are unquantified — and `buildBreakdown` in `js/country-panel.js` branches on
  that to list names instead of drawing bars. 12 entities recovered.
  `entities.json` splits the coverage flag accordingly: `hasReligion` means "we can name
  one" (234), `hasReligionPct` means "we can draw a breakdown" (222).
- `MANUAL_ATTR` religion backfill is gap-fill against a **quantified** breakdown, not
  against any breakdown — otherwise Western Sahara's curated `Muslim 100%` is displaced by
  the Factbook's bare "Muslim" the moment that starts parsing.
- A handful of multi-capital strings are cosmetically rough (e.g. Ivory Coast
  "Yamoussoukro , Abidjan"); `capitalNote` preserves the full Factbook text.
