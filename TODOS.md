# TODOS

Backlog for Geo Draw the World. Each item is self-contained so it can be picked
up cold in a future session. Decisions already made with the owner are recorded
under **Decided**.

---

## 1. Improve reference-shape dataset precision

**✅ DONE 2026-06-20** — `scripts/build-geometry.mjs` regenerates all geometry from Natural
Earth (1:50m base, 1:10m for small countries) into the original Mercator 1600×900 projection
(reverse-engineered, RMSE ~5px). 220 countries (all entities except the `jg` aggregate),
clipped to the main landmass (antimeridian + distant overseas dropped), Douglas-Peucker
simplified, colors preserved by code. World map verified crisp with ocean labels aligned.

**What:** The country/continent outline polygons used as the drawing references
are not precise enough — shapes look rough/inaccurate, which hurts both the
reference display and IoU scoring.

**Why:** Better outlines make the draw game fairer and the references more
recognizable. The owner called shape precision a real weakness.

**Approach / notes:**
- Current data: `data/continents.json`, `data/countries-{region}.json`; loaded and
  turned into reference polygons in `js/geo-data.js` (`createReferenceShape` /
  `createCountryReferenceShapes`). Projection is Mercator → 1600×900 world coords
  (see project memory). First: audit how shapes are currently sourced/stored and
  at what resolution, and where simplification is losing detail.
- Likely fix: regenerate outlines from a higher-resolution source (Natural Earth
  1:50m, or 1:10m for small countries) with light, shape-preserving simplification
  (e.g. Visvalingam) instead of whatever low-res source is in use now. Keep the
  same Mercator→1600×900 projection so existing placement/scoring still line up.
- Watch multi-polygon countries (islands), the antimeridian, and tiny states.

**Acceptance:** Outlines visibly crisper at the sizes shown in peek/transform/
results; scoring (`js/scoring.js`) still produces sensible numbers; no regression
in load time.

---

## 2. New "Shape Only" draw mode (draw + compare, skip placement & sizing)

**✅ DONE 2026-06-20** — added as a combinable **modifier toggle** (mutually exclusive with
Placement Only). After drawing it skips transform/placing and shows an overlay-compare
screen (your outline vs the reference, each normalized centroid+scale) scoring the shape
(IoU) alone. `_enterCompare`/`_renderCompare` in main.js; new `screen-compare`.

**What:** A drawing mode where you only draw the shape from memory, then it's
compared to the reference and scored on shape alone — no resize, no map placement.

**Why:** The globe placement step is the weakest part of the draw game. A pure
shape-matching mode is more focused and fun, and isolates the drawing skill.

**Decided:**
- After drawing, show the player's outline **overlaid on the reference shape**
  (NOT on the globe). Center and scale both to match before comparing.
- Score = **pure outline similarity** with size & position normalized away.
  Orientation is kept (the player should draw it the right way up).
- This is effectively isolating the existing `shape` sub-score from
  `js/scoring.js` after normalizing translation + scale.

**Approach / notes:**
- Add as a new mode (likely a hub entry or a draw-menu mode), reusing the existing
  `DrawingCanvas`. After "Done drawing", skip `TRANSFORM` and `PLACING`; go to a
  new compare/score view.
- New comparison view: render reference + player outline aligned (centroid + scale
  normalized), show overlap %. Reuse `scoreShape`'s shape component or factor it
  out into a normalized-shape scorer.
- Consider how it interacts with existing modifiers (Blind/Explorer make sense;
  Placement Only / Tweak / Hard mostly don't apply here).

**Acceptance:** Pick the mode → draw → see overlaid comparison + a shape score,
with no resize/placement steps.

---

## 3. Flag Color Quiz: perceptual color accuracy (Lab / CIEDE2000)

**✅ DONE 2026-06-20** — new `js/color.js` (sRGB→Lab + CIEDE2000, verified against Sharma
test data); flag quiz `_colorDistance` now perceptual, thresholds retuned to ΔE scale.

**What:** Make the flag quiz judge color similarity the way the human eye does, so
"the correct flag contains this color" and decoy selection are actually accurate.

**Why:** The current weighted-RGB distance (`_colorDistance` in `js/flag-game.js`)
mis-ranks perceptually similar colors, so questions can feel wrong/unfair.

**Decided:**
- Replace the weighted-RGB metric with a **perceptual metric: convert hex → CIE Lab
  and use CIEDE2000** (or at least ΔE76 in Lab) for all distance comparisons.

**Approach / notes:**
- Touch `js/flag-game.js`: `_colorDistance`, `_closestColorDist`, `_flagHasColor`,
  `_findFlagWithColor`, `_findDecoyFlags`. Re-tune the thresholds, which are in
  RGB-distance units today and won't map 1:1 to ΔE.
- Add small sRGB→Lab + CIEDE2000 helpers (no external deps).

**Acceptance:** Correct answers reliably contain a truly-matching color; decoys are
clearly-not-the-color but still plausible; spot-check a few rounds by eye.

---

## 4. New mode: Flag Color Picker (guess the missing color precisely)

**✅ DONE 2026-06-20** — `js/flag-picker-game.js`: flag with a removed color + custom HSV
picker (SV square + hue strip), scored 0–100 by CIEDE2000 closeness, 10 rounds, own high
score (`flag-picker-10`). Hub card added. Reuses `js/color.js`.

**What:** A sibling to the Flag Color Quiz. Same setup — a flag is shown with one
color removed — but instead of choosing another flag, the player uses a **color
picker** to reproduce the missing color as precisely as possible, scored by how
close they get.

**Why:** Turns color recognition into a precision challenge; more skill expression
than multiple choice.

**Decided:**
- **Custom HSV picker**: a hue strip + a saturation/value square (build it, don't
  use the native `<input type=color>`).
- **Scoring 0–100 by perceptual distance** (same Lab/CIEDE2000 work as item 3)
  between the picked color and the true removed color — closer = higher.
- **10 rounds**, mirroring the existing quiz structure and results screen.

**Approach / notes:**
- New module `js/flag-picker-game.js` (mirror `js/flag-game.js`: own screen
  container, menu callback, per-round timer optional, high score via
  `high-scores.js` key e.g. `flag-picker-10`).
- Reuse the flag image + color-removal rendering from `flag-game.js` (factor out if
  convenient). Reuse the perceptual color math from item 3.
- Add a hub card / menu entry; wire `STATES`, screen, start method in `js/main.js`.

**Acceptance:** Pick mode → flag with missing region shown → adjust HSV picker →
submit → see closeness score + the true color revealed; 10 rounds → results +
high score.

---

## 5. Foundational: unify the data layer with one canonical entity registry + ISO-code join key

**✅ DONE 2026-06-20** — `code` added to all geometry, `data/entities.json` registry built,
names reconciled. See `docs/DATA.md`, `scripts/build-entities.mjs`. Policy chosen: include
every ISO-coded entity (all playable), tag `type` (sovereign/territory/aggregate).

**What:** The app has **three independent country datasets that share no join key**,
which causes every downstream data inconsistency. Establish a single source of
truth for "what entities exist", give every entity a stable ISO-code key, and
make all three systems reference it.

Current state (audited 2026-06-20):

| System | File(s) | Keyed by | Count |
|---|---|---|---|
| Drawing geometry | `data/countries-{region}.json` | **name only, NO code** | 164 |
| Stats | `data/datasets.json` → `countries` | ISO 2-letter code | 217 |
| Flags | `data/flags.json` | ISO 2-letter code | 194 |

Because geometry has only names, nothing reliably links a drawable shape to its
flag or stats — and names differ by source convention, so a name-based join
silently fails for ~15 countries.

**Why:** The owner wants the foundational data layer prioritized with a strict,
consistent definition of "what is a country" — **no deviation from the norm**.
A shared key + canonical registry is the prerequisite for every gap fix below
and unlocks cross-mode features (draw a country → guess its flag/GDP).

**Decided:**
- One canonical entity definition. **No deviation:** a single policy decides
  whether each entity is a sovereign country, a dependent territory, or a
  non-country statistical aggregate — applied identically across geometry, stats,
  and flags.
- Shared join key = the **ISO 3166-1 alpha-2 code** already used by stats + flags.

**Approach / notes:**
- Add a `"code": "xx"` field to every entry in `data/countries-{region}.json`
  (geometry is the only system missing it). Verify flags already carry it (they do).
- Reconcile naming conventions so display names are consistent. World Bank
  (`datasets.json`) uses formal names that diverge from geometry/flags:
  Czechia↔Czech Republic, Turkiye↔Turkey, Viet Nam↔Vietnam, Russian Federation↔Russia,
  Korea Rep.↔South Korea, Egypt Arab Rep.↔Egypt, Bahamas The↔Bahamas,
  Cote d'Ivoire↔Ivory Coast, Congo Dem. Rep.↔Democratic Republic of the Congo, etc.
  Pick the common-name form for display; keep code as the join key.
- Decide a policy for **non-country World Bank aggregates** currently appearing as
  "countries" in Rank/Data Explorer: `jg` Channel Islands (Jersey+Guernsey aggregate),
  `hk` Hong Kong, `mo` Macao, `ps` West Bank and Gaza, `pr` Puerto Rico,
  `vi`/`vg` Virgin Islands. Either tag them with a `type` (sovereign/territory/aggregate)
  and let modes filter, or exclude aggregates from the country pool.
- Consider a single generated `entities` manifest (code → {name, type, continent,
  hasGeometry, hasFlag, metricCoverage}) as the canonical registry that the three
  files validate against, rather than scattering the truth.

**Acceptance:** Every geometry entry has a `code`; a script can join all three
systems on `code` with zero unmatched real countries; display names are consistent;
a documented rule classifies every entity as sovereign/territory/aggregate.

---

## 6. Fill the data gaps surfaced by the audit

**✅ DONE 2026-06-20** — flags added (gl, nc, xk, eh, fk); stats backfilled with cited
provenance (tw full; xk land-area; er & kp GDP; eh/fk/xs land-area+population). Remaining
gaps documented in `docs/DATA.md` (disputed-territory GDP/life-exp left; Somaliland flagless).

**What:** Once item 5 gives a shared key, close the specific coverage holes the
audit found (2026-06-20).

**Why:** Entities currently behave inconsistently across modes — drawable but no
flag, in stats but no shape, etc.

**Decided / notes (concrete gap list):**
- **Drawable but no flag:** `nc` New Caledonia, `gl` Greenland, `xk` Kosovo. Add
  flags (or decide they're intentionally flagless per the item-5 policy).
- **Drawable but orphaned (no ISO code → no stats, no flag link):** `Somaliland`,
  `Western Sahara`, `Falkland Islands`. Decide their canonical type; assign a code
  or a stable synthetic key, or accept them as geometry-only with a documented reason.
- **Taiwan (`tw`):** drawable + has a flag but **completely absent from
  `datasets.json`** (0/5 metrics). Decide whether to add stats or accept the
  World-Bank-driven omission.
- **Partial metric coverage in `datasets.json`:**
  `er` Eritrea, `gi` Gibraltar, `kp` North Korea, `vg` British Virgin Islands —
  all missing `gdp-nominal` + `gdp-per-capita`; `xk` Kosovo missing `land-area`.
  Backfill where a reputable source exists, else leave (the modes already skip
  missing values gracefully).
- New Caledonia is otherwise **consistent** (separate territory in both geometry
  and stats, never folded into France) — only the flag is missing.

**Acceptance:** Each gap above is either filled or has a one-line documented
decision to leave it; no entity silently behaves differently across modes for an
undocumented reason.

---

## 7. In-app data coverage / audit report (Data Explorer)

**✅ DONE 2026-06-20** — Data Explorer has a "Coverage" toggle rendering a per-entity
matrix (geometry / flag / 5 metrics + type), highlighting incomplete and aggregate rows.
Reads `data/entities.json`. See `js/data-explorer.js` `_renderCoverage`.

**What:** Surface the cross-system coverage matrix inside the app (likely a
Data Explorer panel) so future data gaps are visible instead of discovered by
playing.

**Why:** The "Channel Islands has no flag" surprise should be catchable in-app.
Makes the foundational data layer self-policing.

**Approach / notes:**
- After item 5 lands the shared key, render a table: per entity, show
  ✓/✗ for geometry, flag, and each of the 5 metrics, plus its type
  (sovereign/territory/aggregate).
- Highlight rows that are incomplete or whose type is `aggregate`.
- Could double as a dev-only debug view; keep it cheap (read existing JSON, no new data).

**Acceptance:** A view lists every entity with its coverage across geometry/flag/
metrics and flags incomplete or non-country rows.

---

## 8. Rename the "Geo Draw" mode

**What:** Change the name of the draw game currently labelled "Geo Draw".

**Why:** Owner wants a clearer/better name for the mode.

**Decided:**
- **Scope: rename the whole app** (owner, 2026-07-01) — `<title>`, README header/logo alt,
  `package.json` name + description, and any in-app title/menu strings. **New name still TBD** — ask owner.

**Approach / notes:**
- Grep the current label in `index.html` (menu/hub cards) and `js/main.js` (screen
  titles, mode names); update copy in one place. If the whole app is renamed, also
  touch `<title>`, README header, and `package.json` name/description.
- Pick the new name with the owner first; low-risk copy change.

**Acceptance:** New name shown consistently on the menu/hub and in-mode; no stray
old-name strings.

---

## 9. Draw the World: better default modes, disable the weak ones

**What:** Revisit which modes "Draw the World" offers and which is the default.
Disable/hide the ones that play badly; make the default put the best foot forward.

**Why:** Some draw modes are weak right now (placement especially — item 11), and
the current default doesn't showcase the game well.

**Decided:**
- Disable the "bad" modes (candidate: anything gated on weak placement, e.g.
  **Placement Only**) at least until items 10–11 land.
- Change the default mode to a stronger one (e.g. the **Shape-Only** compare from
  item 2, or a shape-focused Quick 10).

**Approach / notes:**
- Mode list + default live in `js/main.js` (mode toggles / `STATES`) and the hub in
  `index.html`. Prefer a feature flag / commented-out entry over deletion so weak
  modes are easy to re-enable once placement is fixed. Keep it reversible — it's a
  stopgap tied to the placement/shape work.

**Acceptance:** Draw the World opens on a good default; weak modes aren't selectable
(or are clearly de-emphasized); nothing dead-ends.

---

## 10. Push draw shape fidelity to Sporcle level

**What:** Drawn/reference shapes still look rough compared to Sporcle and similar
apps. Improve outline quality further (item 1 regenerated geometry from Natural
Earth; this is the next quality pass).

**Why:** Shape quality is still the game's weakest visual; owner benchmarks against
Sporcle.

**Approach / notes:**
- Re-audit reference-shape creation in `js/geo-data.js` and the simplification in
  `scripts/build-geometry.mjs` (DP epsilon, small-country handling). Consider a
  higher vertex budget for the sizes actually rendered, or smoother display-time
  rendering (curve interpolation) rather than more raw points.
- Compare side-by-side against a Sporcle map screenshot at the same on-screen size.
- Interim lever: since placement is also weak, **start by disabling placement**
  (item 9) so shapes are judged on their own via Shape-Only (item 2).

**Acceptance:** Outlines read as crisp/recognizable at peek/transform/compare sizes,
comparable to reference apps; no load-time regression.

---

## 11. Placement & results-map overhaul

**What:** The globe/map placement step plays badly and the results-screen map is too
big. Rework placement to be more forgiving and legible.

**Why:** Placement is the weakest mechanic; owner wants it focused and clearer.

**Decided (owner):**
- **Focus one continent at a time** for placement instead of the whole world.
- **Mark the North and South poles clearly.**
- Option to use **all continent borders but no islands** as the placement backdrop.
- **More zoomed-in by default.**
- **Shrink the map in the results screen** (currently too large).

**Approach / notes:**
- Placement + results map render in `js/world-canvas.js` (+ results layout in
  `js/main.js` / `css/style.css`). Add a continent-scoped view using per-continent
  bounds (`data/continents.json` / `regionBounds`) and a default zoom level.
- Island-free backdrop: render continent outlines only, skipping island polygons
  (filter by ring area or an island flag) to cut clutter.
- Pole markers: fixed world-space markers/labels like the existing ocean labels.
- Results map: reduce canvas size/scale in the results layout, especially on mobile.

**Acceptance:** Placement defaults to a zoomed, single-continent view with visible
poles and an optional island-free backdrop; the results map is noticeably smaller.

---

## 12. Flag Color Picker: live-preview the chosen color on the flag

**✅ DONE 2026-07-01** — `js/flag-picker-game.js` shows two flags side by side ("Shown" with the
color removed, "With your color" a live preview). A transparent-hole canvas is built once per
round (removed pixels → alpha 0); each picker change fills the background with the picked color
behind it, so no per-pixel work per move. Verified live (Japan → red disc). The terse "show
wrong color" note was confirmed as this same preview — no separate mode. CSS: `.flag-picker-compare`.

**What:** In the color-guessing game, render the flag with the color the player is
currently choosing, shown **in parallel** with the reference (true/"current" color)
version — so they see the effect of their pick in real time.

**Why:** Immediate visual feedback makes the precision challenge clearer and more fun.

**Decided:**
- Show two flag renders side by side: the flag filled with the **player's chosen
  color** vs. the reference render.

**Approach / notes:**
- Enhance `js/flag-picker-game.js` (the HSV-picker mode from item 4): on every picker
  change, re-render the flag with the missing region filled by the picked color, next
  to the reference render. Reuse the existing color-removal/fill rendering.
- May also apply to the Flag Color Quiz (`js/flag-game.js`).
- **Clarify with owner:** the terse "show wrong color game" note — is this the same
  live preview, or a separate "spot the wrong-colored flag" mode idea?

**Acceptance:** Adjusting the picker updates a live flag preview shown beside the
reference; the comparison is obvious.

---

## 13. New mode: Paint / Create-a-Flag

**What:** A creative mode where the player builds their own flag: choose a **base
layout/template** (stripes, cross, canton, etc.), then **fill in the colors**.

**Why:** A relaxed, creative counterpart to the flag quizzes; high shareability.

**Approach / notes:**
- Needs vector flag **templates** (fillable regions). Current `data/flags.json` is
  likely raster/image-based, so this needs a small set of layout templates with
  fillable regions (SVG or canvas paths). Start with a handful of common layouts.
- Color fill via the existing HSV picker (share the component from
  `js/flag-picker-game.js`). Optional: name/save/export the created flag as PNG.
- New module + hub card + `STATES`/screen wiring in `js/main.js`.

**Acceptance:** Pick a base layout → fill each region with a color → see the finished
flag; optionally save/share it.

---

## 14. New mode: Guess the Language

**What:** A "guess the language" mode — show a sample (a text snippet to start;
script/audio possible later) and the player guesses the language.

**Why:** Extends the app beyond geography/flags into a related knowledge game.

**Approach / notes:**
- **Needs a data source the repo lacks:** language samples + answers, ideally with a
  language↔country link via the entity registry (`data/entities.json`). Scope to
  start: text-only, short phrase per language, multiple-choice answers.
- Use permissively-licensed sample text (e.g. UDHR translations) to avoid licensing
  issues.
- New module + hub card + high-score key, mirroring the flag-quiz structure.

**Acceptance:** Pick mode → shown a language sample → choose from options → scored
over N rounds → results + high score.

---

## 15. Toggle: show country names in Chinese

**What:** A toggle (bottom of the screen / settings) to display country names in
**Chinese** instead of English across the app.

**Why:** Owner wants Chinese country names available (matches the Chinese/Swedish
theme already in the menu globe).

**Approach / notes:**
- **Needs a `zh` name field** per entity. Add Chinese names to `data/entities.json`
  (the canonical registry from item 5), keyed by ISO code, then have name-rendering
  read the active language.
- Add a global language toggle (persist in `localStorage`, like high scores);
  default English. Wire it everywhere names are shown (prompts, results, Data
  Explorer, rank line).
- Could generalize into a full i18n switch later; start with EN / 中文.

**Acceptance:** Flipping the toggle swaps country names to Chinese everywhere they
appear; the choice persists across reloads.

---

## 16. Add Exports + Urbanization as rankable metrics (World Bank)

**What:** Two new numeric, rankable metrics in `data/datasets.json`, alongside the
existing 5: **Total exports (current US$)** and **Urban population (% of total)**.

**Why:** Owner wants export dollars (a lot of Sporcle quizzes rank on trade) and
urbanization %. Both are numeric and rank cleanly, so they slot into the existing
rank-the-world + Data Explorer machinery with almost no new plumbing.

**Decided (owner, 2026-07-21):**
- **Source = World Bank**, same pipeline as the current metrics (NOT OEC). Use
  `NE.EXP.GNFS.CD` (Exports of goods and services, current US$) and
  `SP.URB.TOTL.IN.ZS` (Urban population, % of total).
- OEC's product-level "what does this country export" breakdown (treemap) is
  explicitly **deferred** — a separate, richer feature (see item 22 / future), not
  part of this metric add.

**Approach / notes:**
- Extend `scripts/build-datasets.mjs` (already pulls World Bank) to fetch the two
  new indicator codes and emit them into the `datasets` array + per-country values.
- Add two metric defs: exports → `format: "currency-short"`, `higherFirst: true`;
  urbanization → `format: "percent"`, `higherFirst: true`. **The `percent` format
  already exists** in `js/datasets.js` (`formatValue`), so no new formatter needed.
- Regenerate `data/entities.json` (`scripts/build-entities.mjs`) so the coverage
  matrix gains two columns and per-entity booleans.
- Watch coverage: World Bank exports data is sparse for micro-states / territories;
  modes already skip missing values gracefully — document any notable holes in
  `docs/DATA.md` like item 6 did.

**Acceptance:** "Total exports" and "Urbanization" appear as selectable datasets in
rank-the-world and the Data Explorer, values format correctly ($-short and %), and
the coverage matrix shows both columns.

---

## 17. Country profile attributes: capital + religion (new non-metric data layer)

**What:** Add per-entity **attribute** data that isn't a rankable number: **capital
city name** and **religion breakdown**. These live on the canonical entity registry,
not in the numeric `datasets.json` metrics.

**Why:** Owner wants capital names and religion coverage. Unlike GDP/exports these
don't rank on a single axis — they're descriptive facts that power the country
showcase panel (item 18) and the quiz game (item 22).

**Decided (owner, 2026-07-21):**
- **Religion = full % breakdown** (e.g. `{ "Christian": 70.6, "Muslim": 20.2, ... }`),
  not just a majority label. The panel can still surface the majority + top few.
- **Capital = string** (single primary capital; note multi-capital countries like
  South Africa in a secondary field or a joined string).
- Model these as a new **attributes layer** keyed by ISO/synthetic code, distinct
  from the numeric metric model — the metric machinery (ranking, `higherFirst`,
  `formatValue`) does not apply.

**Approach / notes:**
- Source: **CIA World Factbook** (public domain — safe to redistribute) for both
  capital and religion %; cross-check capitals against `mledoze/countries` if handy.
- Storage: add `capital` and `religion` (object of name→percent) fields to
  `data/entities.json` (the canonical registry from item 5), OR a sibling
  `data/attributes.json` joined on `code` — pick whichever keeps `entities.json`
  from bloating; document the choice in `docs/DATA.md`.
- Build step: extend or add a script (mirror `build-datasets.mjs`) that emits the
  attributes; record provenance/year like the metric provenance block.
- Coverage: extend the Data Explorer coverage matrix (item 7) with capital/religion
  presence so gaps are visible.

**Acceptance:** Every entity that has the data carries a `capital` string and a
`religion` percentage breakdown; a documented source + provenance exists; the
coverage matrix reflects both; nothing in the numeric rank modes breaks.

---

## 18. Country Showcase panel (flag + shape + all data) — FLAGSHIP, build first

**✅ DONE 2026-07-21** — new `js/country-panel.js` (`openCountryPanel(code)`): a reusable
modal showing flag (flagcdn), a shape **silhouette rendered from existing Natural Earth
geometry** (`getCountryByCode` in `geo-data.js`, bbox-normalized canvas), capital, every
available metric with its formatted value + **live rank** (`getRank` in `datasets.js`), and
a religion bar breakdown. New loaders `loadAttributes`/`getAttributes`/`getEntity`/`getRank`.
Wired to **Data Explorer rows** and **rank-the-world** (placed rows + results list). Closes
on ✕ / backdrop / Esc. CSS in `style.css` (`.country-panel*`), mobile-stacked. Verified live
(US, Japan). Flag games / draw results intentionally left out of v1 (same component can wire in).

**What:** Press a country anywhere it's listed to open a **profile/showcase panel**
that displays everything the app knows about it: flag image, the country's **shape
silhouette**, and all metrics + attributes (GDP, population, exports, urbanization,
life expectancy, land area, capital, religion breakdown).

**Why:** This is the payoff that makes all the new data (items 16–17) visible and
useful in one place, and it's a satisfying "learn about this country" moment.
**Owner picked this cluster (16 → 17 → 18) as the top priority to build next.**

**Decided (owner, 2026-07-21):**
- **Reachable from: Data Explorer rows** ("browsing countries") **and the
  rank-the-world game** (tap a country). (Flag games / draw results NOT in scope
  for the first version — can be added later behind the same component.)
- **Shape silhouette is rendered from the EXISTING Natural Earth geometry**
  (normalized: centroid + scale to a box), so the panel needs **no new shape data**
  and isn't blocked on the item-21 geometry upgrade — it'll simply improve when that
  lands.
- Show flag **image** (flagcdn), silhouette, every available metric with its
  formatted value + rank, capital, and religion (majority + top-few, expandable to
  the full breakdown).

**Approach / notes:**
- New reusable module, e.g. `js/country-panel.js`: given a `code`, read
  `entities.json` + `datasets.json` + attributes, render a modal/overlay panel.
  Keep it presentation-only and data-driven so new metrics/attributes appear
  automatically.
- Silhouette: factor a normalized single-shape renderer out of `js/geo-data.js` /
  `js/shape.js` (reuse the compare-view normalization from item 2).
- Wire triggers: click handler on Data Explorer rows (`js/data-explorer.js`) and on
  rank-line country cards/rows (`js/rank-line-game.js`). One shared open function.
- Missing-data resilience: skip absent metrics/attributes gracefully (like existing
  modes); handle entities with geometry-only or flag-image-only.
- Mobile: the panel must be usable on the stacked mobile layout.

**Acceptance:** Clicking a country in the Data Explorer or rank-the-world opens a
panel showing its flag, shape silhouette, and all available data; missing fields are
omitted cleanly; works on mobile; adding a future metric needs no panel changes.

---

## 19. Fix the coverage board's flag-image vs flag-colors confusion

**✅ DONE 2026-07-21** — chose approach (a): the coverage matrix now has separate
**Flag** (image on flagcdn) and **Colors** (flag colors in `flags.json`) columns, plus
new **Cap**/**Rel** columns, with a legend. `build-entities.mjs` adds `hasFlagImage` by
probing flagcdn for the color-less entities (20/22 have an image — Hong Kong now reads
Flag ✓ / Colors ✗, exactly resolving the confusion; only `xs`/`jg` lack images).
"Complete" now keys on flag *image* not colors. Table made horizontally scrollable within
its container (no page-body overflow). Verified live.

**What:** The Data Explorer coverage matrix (item 7) marks Hong Kong (and Macao,
West Bank/Gaza) as **flag ✗ "missing"** even though the flag **image displays fine**
everywhere. Disambiguate so the board stops being misleading.

**Why:** Owner hit exactly this ("Hong Kong's flag was 'missing' but it showed the
flag, which made me confused about coverage"). It's a labeling bug, not a data gap.

**Root cause (verified 2026-07-21):** Two independent "flag" concepts exist —
1. **Flag image**: loaded from `flagcdn.com/{code}.png` (rank line, Data Explorer,
   flag quiz). `hk.png` exists there, so the image always renders.
2. **`data/flags.json`**: stores only flag **colors**, used *solely* by the color
   quizzes. `hk`, `mo`, `ps` are absent from it.
The coverage board's `hasFlag` reads `flags.json` (colors), so "✗" really means
"no color data," but reads as "no flag."

**Decided:** Not yet — pick one when implementing:
- (a) Split into **two columns**: "Flag image" (does flagcdn have it) and "Flag
  colors" (in `flags.json`); or
- (b) Relabel the single column to "Flag colors" and add a tooltip; or
- (c) Backfill the missing color entries (`hk`, `mo`, `ps`) into `flags.json`.
Recommended: **(a)** — most honest, and directly answers "what's actually missing."

**Approach / notes:**
- `hasFlag` is computed in `scripts/build-entities.mjs` and rendered in
  `js/data-explorer.js` `_renderCoverage`. Add a `hasFlagImage` vs `hasFlagColors`
  distinction (flag-image presence can be assumed true for any ISO code flagcdn
  serves, or validated at build time).

**Acceptance:** The coverage board no longer implies a flag is missing when its image
renders; the two flag concepts are clearly distinguished.

---

## 20. Autonomous / dependent territories: broad sweep + a play-with-them toggle

**What:** Add smaller autonomous regions & dependent territories (Bonaire, Sint
Eustatius, Saba, Abkhazia, South Ossetia, Transnistria, Artsakh, Northern Cyprus,
etc.) as first-class entities with flag + capital + whatever data exists, and a
**toggle to include/exclude them** in the relevant modes.

**Why:** Owner wants these playable ("allow to toggle if you play with those on or
not when suitable"), with flags/capitals like real countries.

**Decided (owner, 2026-07-21):**
- **Scope = broad territories sweep**: include as many autonomous/dependent/de-facto
  regions **as have flag + capital data**. (Bigger effort accepted; expect missing
  shapes and synthetic-key work.)
- Gated behind a **toggle** so default play stays "standard countries"; turning it on
  mixes territories in where it makes sense (Data Explorer, rank-the-world, showcase,
  quiz — probably NOT forced into the draw modes that lack good geometry for them).

**Approach / notes:**
- **Key policy (extends item 5):** most of these lack ISO alpha-2 codes. Reuse the
  synthetic-key convention already used for `xs` Somaliland; document the scheme.
- **Data sources:** flags — flagcdn covers many (`bq`-BES via subdivisions is patchy;
  de-facto states often absent → may need bundled SVG/PNG assets). Capitals/religion
  — CIA World Factbook / Wikipedia. Geometry — Natural Earth has some map-units; the
  rest may be geometry-less initially (allowed — showcase/quiz don't require shapes).
- **`type` tagging:** extend the entity `type` enum (sovereign/territory/aggregate)
  or add a subtype so the toggle can filter precisely.
- Build a candidate list first (entity → has flag? capital? geometry? religion?) so
  the "as have flag + capital data" cutoff is explicit and auditable.
- Politically sensitive entities (Abkhazia, Artsakh, N. Cyprus, Somaliland): present
  neutrally as "de-facto / disputed" where labeled.

**Acceptance:** A documented list of added territories, each with a stable key +
flag + capital (+ data where available); a persistent toggle includes/excludes them
in the appropriate modes; nothing breaks when the toggle is off; geometry-less
entities are handled gracefully.

---

## 21. Replace draw-the-world geometry with higher-fidelity vector shapes

**🔬 SPIKE DONE 2026-07-21 — see `docs/geometry-spike.md`.** Recommendation: **stay on
Natural Earth (public domain) and regenerate at 1:10m across the board with `DP_EPS`
0.7 → 0.35.** Finding: the DP tolerance cap, not the source resolution, is the fidelity
limiter — 1:10m alone is +42%, but 1:10m + eps 0.35 is +136% (12.7k → 29.9k verts,
~250–300 KB gzipped) and visually Sporcle-competitive (islands/fjords/coastlines
resolve). Low-risk (~1 day): same projection/clipping/join, so placement + scoring
alignment holds; item-18 silhouette improves for free. geoBoundaries/OSM only if #20
needs entities NE lacks. **Awaiting owner OK to run the regeneration.**

**What:** Source and switch to **higher-fidelity vector country shapes** (OEC-grade)
to replace the current draw-the-world geometry — better reference outlines and IoU
scoring, and a crisper silhouette in the showcase panel.

**Why:** Owner: "I want to get better shape data, ideally SVG data like what OEC
uses… this would be a lot better data to use than our current [outlines]." Shape
quality is the draw game's benchmarked weakness (items 1, 10).

**Decided (owner, 2026-07-21):**
- Goal is a **geometry replacement**, not just a panel silhouette — prioritize
  sourcing better vector shapes over reusing the current ones (though item 18's panel
  ships on the existing geometry and simply benefits when this lands).

**Approach / notes:**
- Investigate sources at higher fidelity than the current Natural Earth 1:50m/1:10m
  pass: e.g. Natural Earth 1:10m across the board, OEC's own map GeoJSON/topojson, or
  other permissively-licensed vector country sets. Confirm **license** before adopting.
- Must keep the **Mercator → 1600×900 projection** so existing placement + scoring
  line up (see item 1 and project memory), or migrate scoring alongside.
- This supersedes/absorbs the "next quality pass" framing of item 10 — reconcile the
  two when picking this up (item 10 = smoothing the current data; item 21 = replacing
  the source). Decide whether to smooth or replace, not both.
- Heaviest, most uncertain data effort of this batch — timebox a source-evaluation
  spike first (fidelity, coverage, license, file size) before committing.

**Acceptance:** Reference outlines are visibly crisper/more accurate at peek/
transform/compare sizes; scoring still produces sensible numbers; load time doesn't
regress; the showcase silhouette (item 18) improves automatically.

---

## 22. New game: Random Geography Quiz (drill-down)

**What:** A quiz game that generates **random questions from the datasets** and lets
the player **drill down** (progressively narrower / follow-up questions). Uses every
data axis: metrics (GDP, exports, urbanization, population…), attributes (capital,
religion), flags, and continents.

**Why:** Owner wants a flexible knowledge game that recycles all the data the other
features add — high replay value, and it makes items 16–17 pull double duty.

**Decided (owner, 2026-07-21):** Concept only — **"we can flesh this out later."**
This item is a placeholder to hold the idea; it needs its own brainstorming pass
before implementation.

**Open questions to resolve when scoping (do NOT build yet):**
- Question formats: multiple-choice? "which is bigger/smaller?" (reuse rank-line
  logic)? "what's the capital of X?" "which religion is majority in X?" flag→country?
  Category/attribute question types (grouping, attribute-filtered superlatives) are
  explored in **item 23** — decide here whether they fold in as question types.
- What does "drill down" mean concretely — a branching quiz that narrows by
  continent → country, or increasing difficulty, or follow-ups on the same country?
- Rounds/scoring/high-score structure (mirror the flag/rank games?).
- Data dependencies: best built **after** items 16–17 so the question pool is rich.

**Approach / notes:**
- New module + hub card + high-score key, mirroring existing game structure
  (`js/flag-game.js` / `js/rank-line-game.js`). Data-driven question generator over
  `entities.json` + `datasets.json` + attributes.

**Acceptance (placeholder):** Deferred — first output is a fleshed-out design from a
dedicated brainstorming session, not code.

---

## 23. Explore: category / attribute-based game modes (religion first)

**What:** A game family built on **categorical / compositional** data (religion to
start) rather than ranking a single number like the rank-line game. Candidate
formats to explore:
- **"Pick all countries with the same primary religion"** (grouping / odd-one-out).
- **"Which country has the highest % of religion X?"** (max within a filtered
  attribute — e.g. highest Christian %, highest Muslim %).
- Possibly generalize the shape to **other datasets** (e.g. "pick all countries on
  continent X", "which has the highest urbanization") — unclear how many datasets
  suit this; part of the exploration is deciding which do.

**Why:** Religion is a `[{name, pct}]` breakdown (item 17), not a single rankable
number, so it doesn't fit the rank-line model. This opens a different game shape:
grouping/matching and attribute-filtered superlatives. Owner idea (2026-07-21).

**Decided (owner, 2026-07-21):** Concept only — **write it down to explore later.**
No format locked in yet.

**Open questions / notes:**
- Standalone mode, or a **set of question types inside the Random Geography Quiz
  (item 22)**? Owner flagged it's likely related — decide during #22's design.
- Data is ready: primary religion + full breakdown live in `data/attributes.json`;
  primary = first entry of the `religion` array (already ordered by %).
- Which categorical/attribute axes are "gameable" (religion, continent, majority-
  something) vs too sparse/ambiguous?

**Acceptance (placeholder):** Deferred — output is a design exploration deciding the
format(s) and whether this is standalone or folded into item 22.

---

### Related context
- Multi-dataset / line-game design: `docs/superpowers/specs/2026-06-20-learning-explore-multidataset-design.md`
- Rank line design: `docs/superpowers/specs/2026-06-20-rank-line-mode-design.md`
- Shared dataset loader/formatters: `js/datasets.js`
