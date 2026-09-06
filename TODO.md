# TODOS

Backlog for Geo Draw the World. Each item is self-contained so it can be picked
up cold in a future session. Decisions already made with the owner are recorded
under **Decided**.

---

## Needs review

Work that has shipped but the owner has not signed off on. Each entry keeps its full
text; the **REVIEW** line says exactly what to look at. Clear it by either deleting the
entry (add a line to `## Shipped`) or moving it back into the queue with what's missing.

---

## 27. Export share of GDP (dataset expansion, wave 1)

**REVIEW:** open Data Explorer → "Exports % of GDP". Check the top end reads sensibly
(Luxembourg/Singapore/Ireland are re-export & finance hubs, so >100% is correct, not a bug).

**✅ DONE 2026-09-06** — shipped as `export-share-gdp` from World Bank `NE.EXP.GNFS.ZS`
(188 countries). Luxembourg 217.4%, Singapore 180.4% top; Sudan 1.1% bottom. Live.

**🔍 REVIEW 2026-09-06** — the dataset is live and matches acceptance (Luxembourg 217.4%, San Marino 186%, Singapore 180.4% at the top). **But its own precondition was skipped**: the entry says a `summable` flag must exist in `build-datasets.mjs` before this or any wave dataset lands, and it does not. Decide: close and re-open the flag as its own item, or keep this open until #37 needs it. Built by session `geo-draw-the-world-43`, still open.

**⚠️ Blocks #37** — this is a *percentage*, so it is NOT summable. Before this or any other wave dataset lands, `scripts/build-datasets.mjs` needs a `summable` flag (default false) that #37's combination generator opts in on. Without it the generator will produce nonsense questions from percentages and years.

**What:** New rankable dataset: exports as a percentage of GDP. A country exporting
$3M of a $4M economy ranks far above one exporting $3M of $400M.

**Why:** Owner request (2026-09-06) — an interesting number derivable from data we
already show, separating trade-dependent economies (Singapore, Ireland, Luxembourg)
from large domestic ones (US, Japan, Brazil).

**Approach / notes:**
- **No derivation needed.** World Bank publishes it directly as `NE.EXP.GNFS.ZS`
  ("Exports of goods and services, % of GDP"). Dividing our existing `exports` by
  `gdp-nominal` would be worse: the two datasets can resolve to different latest
  years per country, so the ratio would silently mix 2019 exports with 2023 GDP.
- One entry in the `INDICATORS` table in `scripts/build-datasets.mjs`, format
  `percent`, `higherFirst: true`. Add the id to `METRIC_IDS` in
  `scripts/build-entities.mjs` so coverage tracking stays honest.
- No UI work — Explorer and Rank pick up new datasets generically.

**Acceptance:** Appears in Data Explorer + Rank the World; Singapore/Ireland near the
top, US/Japan/Brazil near the bottom; coverage board shows the new metric.

---

## 28. Independence year (dataset expansion, wave 1)

**REVIEW:** open Data Explorer → "Independence year". Two judgement calls to sign off:
the US shows **1776** (declaration) not 1783 (recognition), and Japan shows **1947**
(current constitution) — both are what the Factbook leads with. Say if you'd rather have
different dates. Ethiopia is absent on purpose.

**✅ DONE 2026-09-06** — shipped as `independence-year`, parsed from the Factbook,
oldest-first (196 countries). San Marino 301, Sweden 1523, US 1776 (first year outside
the parenthetical, so not the 1783 recognition date). New `year` formatter. Live.
Ethiopia is deliberately null — the Factbook gives prose, not a date. See #33.

**🔍 REVIEW 2026-09-06** — live and matches acceptance: ranks oldest-first (San Marino 301, France 486, UK 927), no thousands separator, BC handled. Built by session `geo-draw-the-world-43`, still open — confirm with it before closing.

**What:** New rankable dataset for when the country became independent, ranked
oldest-first.

**Why:** Owner request (2026-09-06). Paired with #33 (curated oldest-statehood) —
the owner explicitly asked for **both**, since they disagree interestingly.

**Approach / notes:**
- Source: CIA Factbook `Government → Independence`, already downloaded by
  `scripts/build-attributes.mjs`. Verified for Sweden: `"6 June 1523 (Gustav VASA
  elected king of Sweden, marking the abolishment of the Kalmar Union…)"`.
- Parse to `attributes[code].independence = { year, text }` — keep the full text as
  provenance, the way `religionRaw` already does. Year = first 3-4 digit number.
- Watch: entries with several dates ("1776 … 1783"), "no independent state" for
  territories, and non-year leading numbers. Report unparsed entries rather than
  dropping them silently.
- Then merge into `datasets.json` as `independence-year` with `higherFirst: false`
  (oldest ranks first). `higherFirst: false` is already supported end-to-end.
- Needs a new `year` formatter in `js/datasets.js`: render `1523`, not `1,523`.

**Acceptance:** Ranks oldest-first by default; San Marino / Japan / France near the
top, South Sudan / Montenegro near the bottom; no thousands separator.

---

## 29. Electricity generation mix (dataset expansion, wave 2)

**REVIEW:** open any country panel (e.g. Germany, France, Norway) → "Electricity"
section. Two calls to sign off: nuclear and coal are **hidden from Rank the World** as
degenerate rounds but still browsable in the Explorer; and the source is Ember
(generation) not the Factbook (installed capacity) — the swap you asked about.

**✅ DONE 2026-09-06** — `scripts/build-electricity.mjs` → `data/electricity.json` from
Ember via OWID (213 entities, all shares total 100±2%). Country panel shows the mix as a
coloured breakdown with its year; three derived rankables added. France 68.8% nuclear,
Botswana 98.3% coal, Iceland 100% renewable.

Two things learned building it: the nuclear and coal slices are **not offered in Rank the
World** — 181 of 213 countries are 0% nuclear, which makes a degenerate round — so
`build-datasets.mjs` now measures modal-value share and marks such datasets
`rankable: false`; they stay fully browsable in the Explorer. And `buildReligion` in
`js/country-panel.js` was generalized to `buildBreakdown`, ready for export products (#32).

**What:** Per-country breakdown of how electricity is generated — coal, gas, hydro,
solar, wind, oil, nuclear, bioenergy, other renewables — shown in the country panel
like religion, plus three derived rankable datasets (% nuclear, % coal, % renewable).

**Why:** Owner request (2026-09-06), explicitly modelled on the religion breakdown.

**Approach / notes:**
- **Source: Ember, via Our World in Data.** One CSV, ~560 KB, no API key:
  `https://ourworldindata.org/grapher/share-elec-by-source.csv?csvType=full&useColumnShortNames=true`
  Verified reachable. Columns are ISO3 + year + pre-computed `*_share_of_electricity__pct`
  for all nine sources. Filter to the latest year per country; map ISO3 → our ISO2.
- **Do NOT use the CIA Factbook for this**, even though we already download it. Its
  `Energy → Electricity generation sources` reports *installed capacity*, not
  generation. A 1 GW solar farm generates ~10-20% of the hours a 1 GW nuclear plant
  does, so capacity share overstates solar/wind and understates nuclear/coal/gas.
  "Runs on nuclear" is a claim about generation. This was considered and rejected —
  see the design doc.
- New `scripts/build-electricity.mjs` → `data/electricity.json`. Derived percentages
  merge into `datasets.json` at the end of `build-datasets.mjs` (see design doc on
  build ordering).
- Expect gaps for territories and de-facto states — Ember covers fewer entities than
  the World Bank. Normal; the UI already handles missing values.

**Acceptance:** Panel shows the mix as a labelled bar for well-covered countries
(France nuclear-dominated, Norway hydro-dominated, Poland coal-dominated); three new
rankables appear in Explorer + Rank.

---

## 9. Draw the World: better default modes, disable the weak ones

**Related: #35** — merging sizing into placement removes the weakest step in the draw loop. Re-evaluate the default after #35 lands.

**What:** Revisit which modes "Draw the World" offers and which is the default.
Disable/hide the ones that play badly; make the default put the best foot forward.

**Why:** Some draw modes are weak right now (placement especially — item 11), and
the current default doesn't showcase the game well.

**Decided (owner, 2026-09-06):**
- **Quick 10 is too long for drawing.** Ten freehand countries is a slog when each one
  is draw → size → place. Replace or supplement it with a **Quick 3** for Draw the
  World (`btn-quick10` / `startQuick10()` in `js/main.js:516`, label in
  `index.html:124`). Rank the World can keep 10 — the cost per item there is a tap.
- Shape quality (#24) and placement (#11) both signed off as good enough on
  2026-09-06, so the original "disable modes gated on weak placement" reasoning below
  no longer applies. Re-scope this item to mode *length* and the default, not quality.

**Decided (earlier):**
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

**⚠️ Probably closable** — this is the same bar as #24, which the owner signed off as
"good enough for now" on 2026-09-06. Kept only because it was not named explicitly.
Delete it unless there is a fidelity concern #24's sign-off did not cover.

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

## 26. Bug: sizing screen footer text overlaps itself on narrow viewports

**⛔ SUPERSEDED BY #35** — the sizing screen is being merged into the placement screen, so this footer ceases to exist. Only fix it standalone if #35 is deferred.

**What:** On the transform/sizing screen the two footer strings collide at phone widths —
the left "Drag corners to resize, orange handle to rotate" and the right
`"<Country>" shown at real size for scale reference` render on top of each other.

**Why:** Both are drawn in `TransformControls.render()` (`js/transform-controls.js`), one
`textAlign: left` at x=12 and one `textAlign: right` at w-12, with no width check. Reproduced
at 390×844.

**Acceptance:** Both strings legible at 390px wide — shorten, stack, or drop the right one
below some width threshold.

---

## 30. Biggest trade partner + the relations data shape (dataset expansion, wave 3)

**What:** "The countries this country trades with the most" — top export partners with
percentage shares, shown in the country panel as clickable rows.

**Why:** Owner request (2026-09-06), framed as "biggest trade partner / best friend".

**Approach / notes:**
- Source: CIA Factbook `Economy → Exports - partners`, already downloaded. Verified
  for Sweden: `"Germany 10%, USA 10%, Denmark 8%, Norway 6%, Netherlands 5% (2023)"`.
  Top five **with** percentages. `Imports - partners` is available in the same shape.
- **This introduces a new data shape**: country→country relations. New
  `data/relations.json`, keyed by code, with an `exportPartners` array of
  `{ code, pct }`. Named specifically (not `partners`) so `importPartners` can be a
  sibling key later.
- Partner names must resolve to our ISO2 codes — reuse the `strip`/`flip`/`NAME_ALIAS`
  matcher from `build-attributes.mjs` rather than writing a third one. Report
  unmatched partner names.
- **Panel rows should call `openCountryPanel(code)`**, which makes the country panel
  navigable for the first time (Sweden → Germany → its partners). Guard against the
  panel stacking on itself — it's a single reused overlay.
- **"Biggest enemy" was explicitly skipped** by the owner (2026-09-06) on editorial-risk
  grounds. Do not add it without asking. This shape is deliberately general enough to
  hold `noRelationsWith` or conflict dyads later if that reverses.

**Acceptance:** Panel lists top export partners with flag + name + %; clicking one
opens that country; unmatched partner names are reported at build time, not dropped.

---

## 31. Country emblems / coats of arms (dataset expansion, wave 3)

**What:** Show the country's coat of arms / state emblem in the country panel
alongside the flag.

**Why:** Owner request (2026-09-06).

**Approach / notes:**
- Source: Wikidata property `P94` (coat of arms image) → a Wikimedia Commons filename.
  Verified: Sweden (Q34) → `Great coat of arms of Sweden.svg`.
- **Hotlink Commons**, exactly as flags hotlink flagcdn — no repo weight, same
  `onerror`-hides-the-element degradation. Use `Special:FilePath/<file>?width=240`,
  which redirects to the right thumbnail and handles SVG rasterization.
- New `scripts/build-emblems.mjs` → `data/emblems.json` (code → filename). Resolve
  ISO2 → Wikidata QID via `P297`, ideally in one SPARQL query rather than 200 calls.
- **Licensing caveat:** many state emblems are legally restricted rather than freely
  licensed, even where the flag is public domain. Skip those rather than bundling
  them; the coverage board will show the holes. *(Owner didn't rule on hotlink vs
  bundle — hotlinking assumed, reversible.)*

**Acceptance:** Emblem shows in the panel where available, invisible where not; no
layout shift when it's missing; no non-free emblem bundled into the repo.

---

## 32. Top export commodities with percentages (dataset expansion, wave 3)

**What:** "30% oil" — the country's main export products as shares of total exports,
ideally with product imagery.

**Why:** Owner request (2026-09-06), who specifically suggested OEC as the source.

**Approach / notes:**
- **This item carries the one real unknown in the wave-3 batch — spike it first.**
  The OEC v2 tesseract API answers unauthenticated (probed 2026-09-06: HTTP 200 on the
  BACI HS6 cube, `api-v2.oec.world/tesseract/data.jsonrecords`), but a filtered query
  returned **zero rows** — the exporter-code format wasn't right — and their cube
  listing returned non-JSON. Timebox resolving this before committing to it.
- Shares are derivable: sum `Trade Value` by HS4 product for one exporter-year, divide
  by that country's total. Keep the top ~5 and bucket the rest as "other".
- **Fallback if OEC doesn't resolve:** Factbook `Exports - commodities` gives the top
  five product *names* with no percentages (Sweden: "cars, refined petroleum, packaged
  medicine, paper, vehicle parts/accessories"). The list survives; the bar chart is
  lost. Ship the fallback rather than nothing, and say so in the UI.
- Renders as a breakdown attribute, same widget as religion / electricity.

**Acceptance:** Panel shows top export products; with percentages if OEC resolves,
as a plain named list if it doesn't — labelled honestly either way.

---

## 33. Oldest continuous statehood, curated (dataset expansion, wave 4)

**What:** A hand-curated "how old is this country really" dataset — Sweden ~970,
France 843, Egypt ~3100 BC, San Marino 301 — ranked oldest-first.

**Why:** Owner request (2026-09-06). #28 (independence year) is the automated
counterpart; the owner wanted both because they rank very differently. This is the one
that matches what people *mean* by "oldest country".

**Approach / notes:**
- **Do not start until waves 1-3 have landed** and the owner has seen them. This is
  ~200 hand-researched dates and the format/UI should be proven first by #28.
- Same dataset shape as #28: `statehood-year`, `higherFirst: false`, `year` format.
  The `year` formatter must handle **negative values as BC** for this one.
- Every date needs a one-line justification stored beside it — these are defensible
  but arguable, and the next session must not have to re-derive the reasoning. Store
  as `{ year, basis }` in a committed curated file, not inline in a script.
- Expect genuinely contested cases (China, Greece, Iran, Germany, Italy). Pick a
  consistent rule, write it down at the top of the file, and apply it uniformly rather
  than case-by-case.

**Acceptance:** Ranks oldest-first with BC years rendering correctly; every entry has
a recorded basis; the selection rule is documented in the data file itself.

---

## 34. Historical territories timeline (dataset expansion, wave 4)

**What:** Which historical kingdoms/empires held the land inside today's borders, with
year ranges — e.g. for Sweden, that Denmark controlled parts and when. Overlaps are
expected and fine, since borders moved.

**Why:** Owner request (2026-09-06), called out as "super interesting". Biggest effort
on the list.

**Approach / notes:**
- **Do not start until waves 1-3 have landed.**
- Source: `github.com/aourednik/historical-basemaps` (CC-BY-SA) — verified 2026-09-06
  to hold **54 world GeoJSON snapshots**, 2000 BC → 1994.
- Approach (owner-approved): **auto-derive, then hand-fix the top ~50**. Intersect each
  snapshot's polygons with our existing country geometry; any historical polygon
  overlapping a country's area by more than some threshold counts as having held it.
  Then manually correct the countries people actually click.
- **New data shape**: `data/history.json`, code → `[{ name, from, to, confidence }]`.
  `from`/`to` are signed ints so BC is negative. `confidence` is `"derived"` or
  `"curated"`; the UI must render derived rows with a visible hedge, because
  snapshot-granular ranges are approximate (snapshots jump 1600 → 1700).
- **Known problem:** polygon labels are inconsistent across snapshots ("Ottoman Empire"
  vs "Ottomans"), which fragments year ranges into separate bars. Needs a name
  normalization pass; the curated top-50 is the real mitigation.
- Our geometry is already Mercator-projected to 1600×900 (`js/geo-data.js`), so decide
  deliberately whether to intersect in lon/lat (correct) or projected space (convenient)
  — lon/lat is the right call.
- Renders as horizontal bars on a shared time axis in the country panel.

**Acceptance:** Sweden's panel shows the Kalmar Union and Danish control with plausible
years; derived vs curated rows are visually distinguishable; the app never claims more
precision than it has.

---

## 35. Draw the World: merge the sizing stage into placement

**What:** Delete the standalone sizing/transform screen. The drawn shape goes straight
onto the world map, where you move, rotate **and resize** it in one place, then confirm.
State machine becomes `PROMPT → [PEEK] → DRAWING → PLACING → RESULTS`.

**Why:** Owner (2026-09-06): "the sizing step today is too wonky and uninteresting."
It asks you to judge a country's size against an abstract hint shape on an empty canvas,
with no map context — so it's a guess, not a skill. Judged against real coastlines and
neighbours it becomes a genuine geography question. Also kills a whole screen of UI.

**Decided (owner, 2026-09-06):**
- **Size stays scored.** Weights stay `shape 40 / size 30 / placement 30` in
  `scoreShape()` — this is a UI merge, not a scoring change.
- The shape drops at a **neutral size**, not its true size. Sizing must remain a real
  decision.
- One meaning per gesture: **corner handles resize the shape; wheel and pinch zoom the
  view.** No overloading.

**Approach / notes:**
- **Neutral start size (do not leak the answer):** scale the drawn shape so its bounding
  box's longest side is a fixed fraction (~25%) of the visible world rect's smaller
  dimension. It MUST be computed from the viewport only — never from the reference
  shape's real size, or the starting scale hands the player 30% of the score.
- **Extract, don't duplicate.** The handle hit-testing and drag maths live in
  `js/transform-controls.js` (`_getHandles`, `_hitHandle`, `_onMouseDown/_onMouseMove`,
  `_drawHandles`). Lift them into a shared `js/shape-handles.js` and consume it from
  `js/world-canvas.js`, which already has rotate (`_getRotateHandle`, `_hitRotateHandle`,
  `enableRotation`) and view zoom (`_onWheel`) but no scale handles. Copying 200 lines of
  handle code into the world canvas is the wrong move.
- Once nothing references it: delete `TransformControls`, the `transform` screen in
  `index.html`, `STATES.TRANSFORM` (`js/main.js` ~line 30) and its CSS.
- Call sites to rewire in `js/main.js`: `onDrawingDone()` (currently sets
  `transform-label` and activates `TransformControls`), `onTransformDone()` (folds into
  the placement entry), and the deactivate branches that check `STATES.TRANSFORM`
  (several — grep for it).
- **Placement Only** mode (`_startPuzzlePlacing()`) keeps its scale **locked at true
  size** — placement is the entire point of that mode, so it gets move + rotate only.
- **Hard mode** is unchanged: it already hides the continent basemap (`js/main.js` ~646),
  which is now the only scale reference, so hard mode gets meaningfully harder for free.
  Verify it's still winnable before shipping.
- **Shape Only** mode is unaffected — it already skips both stages.
- Watch the touch ergonomics work from #25: handles need ≥28px touch targets, and four
  corner handles plus a rotate handle on a phone-width map is crowded. Consider hiding
  the corner handles until the shape is tapped/selected.

**Knock-ons:**
- **Retires #26** (sizing-screen footer overlap) — the screen ceases to exist.
- **Folds into #11** (placement & results-map overhaul); do them together.
- **Unblocks #9** (better default draw modes) — the weak sizing step was half the reason
  the default plays badly.

**Acceptance:** One screen between drawing and results. Resize, rotate and move all work
on the map with mouse and touch at 390px wide. Size still scores. The starting scale is
provably independent of the correct answer. No dead references to `TransformControls` or
`STATES.TRANSFORM` anywhere in the repo.

---

## 36. New mode: Top 10 / Bottom 10

**What:** A round states a superlative — *"Top 10 Total GDP — Oceania"*, *"Bottom 10
Urbanization — Africa"* — and shows a shuffled pool of candidate countries. You tap the
ones you think belong, lock in, and score hits out of N. Metric, direction and filter are
chosen manually or rolled at random.

**Why:** Owner request (2026-09-06). Rank the World already covers *ordering*; this
covers a different and arguably more natural kind of knowledge — where the **threshold**
sits. It reuses the whole existing dataset layer, so it's cheap for how much play it adds.

**Decided (owner, 2026-09-06):**
- Play loop is **pick N from a pool**, not ordering and not one-at-a-time. Score = hits.
- Setup supports both **manual** (choose metric × direction × filter) and **random roll**.
- **N adapts to the filter by default** (table below), but the owner wants a manual
  **override to force Top 10 anyway** on a small filter, accepting the degenerate odds.

**The data forces the adaptive N.** Eligible sovereign countries per continent per
metric (territories off), measured 2026-09-06:

| metric | Africa | Asia | Europe | N.Am | S.Am | Oceania | World |
|---|---|---|---|---|---|---|---|
| gdp-nominal | 54 | 47 | 45 | 23 | 12 | 14 | 195 |
| population | 55 | 47 | 46 | 23 | 12 | 14 | 197 |
| gdp-per-capita | 54 | 47 | 45 | 23 | 12 | 14 | 195 |
| land-area | 55 | 47 | 46 | 23 | 12 | 14 | 197 |
| life-expectancy | 54 | 47 | 45 | 23 | 12 | 14 | 195 |
| exports | 50 | 43 | 42 | 15 | 10 | 12 | 172 |
| urbanization | 54 | 46 | 45 | 23 | 12 | 14 | 194 |

Oceania is 14 countries total. "Pick the top 10 of 14" scores ~7 by guessing, so a fixed
N=10 is broken for the small continents. Rule:

| eligible in filter | mode | pool size |
|---|---|---|
| ≥ 22 | Top / Bottom **10** | 24 (or all eligible if fewer) |
| ≥ 12 | Top / Bottom **5** | 12 |
| < 12 | not offered | — |

So Oceania and South America play Top 5, and bad combos self-censor: exports × South
America has only 10 eligible, so it simply never rolls.

**Approach / notes:**
- New `js/top-n-game.js`, modelled on `js/rank-line-game.js` (same screen/deck/results
  skeleton). Data comes from `js/datasets.js`: `getEntries(id, { continent, higherFirst })`
  already returns the sorted, continent-filtered list, and `inCountryPool()` is the
  canonical eligibility rule — go through it, don't re-filter by hand, or territories and
  the `jg` aggregate leak back in (see #5, #20).
- **Direction** is just `higherFirst`; `getEntries` takes it as an override, so Bottom N
  is free.
- **Distractors are the difficulty knob.** Hard: draw the non-answers from ranks
  N+1…N+14, so every wrong option is a near-miss. Easy: sample them across the whole
  tail. Expose this as an Easy/Hard toggle rather than a hidden constant.
- **Boundary fairness:** skip a (metric, filter, direction) combo when rank N and rank
  N+1 differ by less than ~1% — a coin-flip boundary isn't a fair question. This matters
  most for `land-area` and `urbanization`, where the tail bunches up.
- **Override:** a "force Top 10" setting that ignores the adaptive table and plays N=10
  against whatever pool exists. Show the pool size in the UI so it's obvious the pick is
  near-total (e.g. "10 of 14"). Default off.
- **Results screen** should show the true ranked list with formatted values (`formatValue`
  from `js/datasets.js`), marking hits, misses and the ones you wrongly included. The
  near-misses are the interesting part — a country at rank 11 deserves to be seen.
- New datasets (#27-#34) join automatically, since everything reads the dataset registry.
  Sanity-check each new one against the ≥12 eligibility rule as it lands.
- Mind the flex-shrink trap from #25 if the pool renders as a flex column.

**Acceptance:** "Top 10 Total GDP — World" and "Bottom 5 Urbanization — Oceania" both
play end to end. The adaptive table picks N correctly for every metric × continent pair.
A filter with fewer than 12 eligible countries is unreachable unless the override is on.
Results name every correct answer with its value. Playable at 390px wide.

---

## 37. New mode: combination questions ("is X + Y bigger than Z?")

**What:** Auto-generated comparison questions built by *summing* countries:
*"Algeria + Ethiopia combined GDP vs South Africa — bigger or smaller?"* Answer is
binary. Difficulty is a dial, from obvious to near-tied. Nothing is hand-authored — the
generator enumerates the dataset and filters by ratio.

**Why:** Owner request (2026-09-06), who identified the key property: *"if we can
generate so that combination game is possible towards our dataset without manually
holding all the combinations, we have something very interesting."* It is: the question
space is effectively unbounded, and it teaches magnitude intuition that ranking modes
don't touch.

**Feasibility is measured, not assumed** (2026-09-06, script run against
`data/datasets.json`, world scope, `A + B vs C`, each addend ≥15% of its sum):

| metric | gentle (≥4x) | easy (1.8-4x) | medium (1.15-1.8x) | hard (1.0-1.15x) |
|---|---|---|---|---|
| gdp-nominal | 929,217 | 289,269 | 167,523 | 52,227 |
| population | 985,771 | 370,863 | 229,164 | 71,702 |
| land-area | 928,359 | 294,670 | 178,081 | 57,100 |
| exports | 622,005 | 179,221 | 104,323 | 32,851 |

Real generated examples — hard: *"Algeria + Ethiopia vs South Africa"* (1.01x),
*"Afghanistan + Algeria vs Germany"* (1.05x, population). Gentle: *"Afghanistan +
Armenia vs Andorra"* (10.9x), *"Afghanistan + Andorra vs Algeria"* (0.08x).

**Decided (owner, 2026-09-06):**
- **Phase 1 only for now**: grammars `A+B vs C`, `A+B+C vs D`, `A+B vs C+D`, over the
  summable metrics, binary bigger/smaller. Phases 2 and 3 are sketched below but deferred.
- **Skew the mix easy.** The owner's explicit note on the first draft: *"im honestly
  worried your example is too difficult, sometimes it should be a lot easier."* Starting
  mix: **gentle 25% / easy 35% / medium 25% / hard 15%**. Hard is the spice, not the meal.

**Two traps found while designing this — both must be handled:**
1. **Bands must be symmetric around a ratio of 1.** A first pass used bands like
   1.0-1.1 and 2-12, i.e. all `sum > C`, which makes the answer *always* "bigger" — the
   generator leaks its own answer within a few questions. Band on `max(r, 1/r)` so both
   directions are reachable in every tier.
2. **Even then the tiers skew.** Measured answer balance: the gentle tier is naturally
   **65-75% "bigger"**, easy 54-58%, and only hard lands at ~50/50. Rejection-sample
   within a tier to force an even split, or a player learns to guess "bigger" whenever
   the question looks obvious.

**Approach / notes:**
- **Summability must be declared, not inferred.** Only extensive quantities can be added:
  `gdp-nominal`, `population`, `land-area`, `exports`. Adding `gdp-per-capita`,
  `life-expectancy` or `urbanization` is mathematically wrong (they need population
  weighting). **This is urgent given #27-#34**: wave 1 adds `export-share-gdp` (a
  percentage) and independence/statehood **years**, and without an opt-in flag the
  generator would cheerfully ask *"is Sweden's independence year + Norway's bigger than
  Denmark's?"* Add `summable: true` to the dataset definitions in
  `scripts/build-datasets.mjs` (it currently emits only `id, name, blurb, format,
  higherFirst, values`), surface it through `js/datasets.js`, and have the generator
  **opt in** on that flag — default false.
- **Relevance rule:** every addend must contribute **≥15% of its own side's sum**.
  Without it the generator produces "USA + Tuvalu vs China", which is just "USA vs China"
  wearing a hat. All the counts above already apply this filter.
- **Eligibility:** go through `inCountryPool()` (`js/datasets.js`) as every other mode
  does, so aggregates and (by default) territories stay out.
- **Generation strategy:** don't precompute the full space — it's ~10^6 per metric.
  Sample: pick a metric, pick a target tier from the mix, draw candidate addends at
  random, compute the sum, then look for a `C` whose value lands in the tier's ratio
  band (the entries list is already sorted, so binary-search it). Retry on miss. Track
  seen question signatures within a session so nothing repeats.
- **Continent scope is thin for hard questions.** Continent-scoped counts for
  gdp-nominal: Africa 680 hard, Asia 276, Europe 262, N.Am 30, S.Am 6, **Oceania 5**.
  So either default the mode to world scope, or offer only gentle/easy/medium on the
  small continents. Do not silently serve the same 5 Oceania questions forever.
- **Results should teach**: reveal both totals with `formatValue`, and the ratio. Being
  wrong on a 1.01x question should feel different from being wrong on a 10x one.
- Consider a seeded daily variant later, matching the Daily Challenge pattern.

**Phase 2 (deferred, sketched):** a counting format — *"how many Icelands fit in
Germany's GDP?"* — answered with a slider or numeric entry and scored by closeness.
Same summable metrics, same eligibility rules, new UI.

**Phase 3 (deferred, sketched):** a grammar for the **non-summable** metrics, which
phase 1 can't touch: *"is A higher than BOTH B and C?"*, *"is A between B and C?"*,
and population-weighted averages where they're genuinely meaningful. This is what makes
life expectancy, urbanization, GDP per capita and `export-share-gdp` (#27) playable.

**Acceptance (phase 1):** A new mode generates unlimited non-repeating questions across
all four summable metrics with no hand-authored content. The answer distribution is
within a few points of 50/50 in every difficulty tier, verified over a few thousand
generated questions. No question is ever generated from a non-summable dataset. Every
generated question is factually correct against `data/datasets.json` by construction.
Playable at 390px wide.

---

### Related context
- Multi-dataset / line-game design: `docs/superpowers/specs/2026-06-20-learning-explore-multidataset-design.md`
- Rank line design: `docs/superpowers/specs/2026-06-20-rank-line-mode-design.md`
- Shared dataset loader/formatters: `js/datasets.js`

---

## Shipped

Completed items, removed from the queue on 2026-09-06. One line each so the
`TODOS #N` references throughout `js/`, `scripts/` and `docs/` still resolve;
full write-ups are in git history.

- **#1** Improve reference-shape dataset precision — 2026-06-20
- **#2** New "Shape Only" draw mode (draw + compare, skip placement & sizing) — 2026-06-20
- **#3** Flag Color Quiz: perceptual color accuracy (Lab / CIEDE2000) — 2026-06-20
- **#4** New mode: Flag Color Picker (guess the missing color precisely) — 2026-06-20
- **#5** Foundational: unify the data layer with one canonical entity registry + ISO-code join key — 2026-06-20
- **#6** Fill the data gaps surfaced by the audit — 2026-06-20
- **#7** In-app data coverage / audit report (Data Explorer) — 2026-06-20
- **#8** Rename the "Geo Draw" mode — 2026-07
- **#12** Flag Color Picker: live-preview the chosen color on the flag — 2026-07-01
- **#18** Country Showcase panel (flag + shape + all data) — FLAGSHIP, build first — 2026-07-21
- **#19** Fix the coverage board's flag-image vs flag-colors confusion — 2026-07-21
- **#20** Autonomous / dependent territories: broad sweep + a play-with-them toggle — 2026-09-06
- **#21** Replace draw-the-world geometry with higher-fidelity vector shapes — 2026-07-22
- **#25** Bug: Rank the World — can't continue after 10 placements (mobile) — 2026-07-30
- **#16** Add Exports + Urbanization as rankable metrics (World Bank) — 2026-09-06
- **#17** Country profile attributes: capital + religion (new non-metric data layer) — 2026-09-06
- **#11** Placement & results-map overhaul — 2026-09-06
- **#24** Shape quality: iterate + owner approval — 2026-09-06
