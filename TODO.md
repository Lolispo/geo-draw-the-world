# TODOS

Backlog for Geo Draw the World. Each item is self-contained so it can be picked
up cold in a future session. Decisions already made with the owner are recorded
under **Decided**.

Every entry under **Needs review** carries a URL in its `**REVIEW:**` line. Serve the repo and
open them one tab per item — see `CLAUDE.md` for the protocol and the full route list.

---

## Needs review

Work that has shipped but the owner has not signed off on. Each entry keeps its full
text; the **REVIEW** line says exactly what to look at. Clear it by either deleting the
entry (add a line to `## Shipped`) or moving it back into the queue with what's missing.

*One item shipped 2026-10-25, waiting on sign-off.*

---

## 81. Explorer map: whose island is that?

**REVIEW:** http://localhost:8129/#/explore/map?metric=population&focus=ms — zoom the Lesser Antilles and hover, with Territories off and on.

**What:** On the Explorer map a dependency now says whose it is, three ways. Hovering one names
its sovereign whatever the toggle says — `Aruba — 106k · Netherlands` with Territories on,
`Netherlands — 18.0M · Aruba` with it off — so **no ` · owner` suffix means an independent
country**. With Territories off a dependency is painted its sovereign's band colour instead of
the out-of-scope grey, so Puerto Rico wears the United States' shade and Greenland Denmark's;
grey goes back to meaning only "no figure". With Territories **on**, where a dependency is drawn
as itself, it carries a pale rim in place of the dark border, so the Caribbean reads as
whose-is-whose before anything is hovered; with it off it is bordered like its sovereign too. The
map also zooms to 48x the fitted view rather than 12x, where a Caribbean island was still about
five pixels across.

**Why:** Owner request (2026-10-25): *"i want to be able to zoom in on central america and look
at an island and see if it belongs to netherlands france or is its own country"*. The first half
of #69 already named the owner, but only for a territory the filter **excluded** — with
Territories on, the state a reader turns on to see dependencies as themselves, the label never
mentioned the sovereign at all.

**Approach / notes:**
- The rim marks the 48 entities carrying a `sovereign` in the registry. Western Sahara, Palestine
  and the four de-facto states have no sovereign and get no rim and no suffix — they are disputed,
  not dependencies.
- `scope` was built from the dataset's own entries, so a dependency the metric had no row for fell
  out of scope *even with Territories on* — and World Bank reports most series nationally only
  (GDP covers 19 of the 48, population 45). The toggle therefore did nothing on most metrics.
  `js/data-explorer.js` now adds every dependency to scope when the toggle is on, so the toggle
  means one thing regardless of which metric is showing.
- Rim weight was tuned down from 1.2px to 0.6px after looking: a crenellated coastline carries far
  more stroke than its area, and at world zoom the first version turned Greenland's fjords into a
  white mass. It is then gated on scope rather than on the registry, so it appears only in the
  state where a dependency is drawn as itself (owner, 2026-10-25: *"the border should only show
  with territories on... takes too much focus without it"*).
- `MAX_ZOOM` 12 → 48. The outlines can take it: a small island's segments stay well under a pixel
  at that scale. Big crenellated coastlines cannot — see #82.
- **Does not touch #74.** Galápagos, Madeira, the Azores and the Canaries have no ISO 3166-1 code,
  so they are rings inside their parent's geometry and still read as Ecuador, Portugal and Spain
  at every toggle setting. The Caribbean needed none of that work: all 16 dependencies there
  already exist as entities with geometry.
- Explorer map only, by request. The play pools, the quizzes and the country panel are unchanged
  (the panel already said "Territory of Netherlands").

**Open question for the review:** an independent microstate — Barbados, Grenada, St Lucia — is
dark fill on a near-black ocean with a dark border, so "no rim" is read off something barely
visible. Lifting every country's border would fix it and is a change to how the whole map is
drawn, so it is not in this change.

**Acceptance:** Zoomed into the Lesser Antilles, hovering any island says whether it is French,
Dutch, British, American or its own country, at either toggle setting; with Territories off the
dependencies wear their sovereign's colour.

---


---


---

## 78. Famous landmarks, not World Heritage sites

**What:** A landmarks dataset to replace UNESCO sites as the thing you browse per country —
the Eiffel Tower, the Colosseum, Christ the Redeemer — reusing the wall, the site card and
the country-panel section that #46 already built.

**Why:** Owner, 2026-10-18, after browsing the UNESCO wall: *"im more interesting in
landmarks than unesco sites probably. I suggest this is the next one we look at fixing."*

**The concrete reason UNESCO cannot be it.** UNESCO inscribes *areas*, not landmarks, so
roughly half of what a person pictures is not in the list under its own name. Checked:

| Not an entry of its own | Is an entry |
|---|---|
| Eiffel Tower, Colosseum, Pyramids, Hagia Sophia, Christ the Redeemer, Sagrada Família, Big Ben, Mount Fuji, Niagara, Golden Gate, Burj Khalifa | Stonehenge, Taj Mahal, Petra, Acropolis, Great Wall, Machu Picchu, Statue of Liberty |

The Eiffel Tower is inside *Paris, Banks of the Seine*; the Colosseum inside *Historic Centre
of Rome*; Hagia Sophia inside *Historic Areas of Istanbul*. That is why the wall reads as a
list of unfamiliar regions.

**What carries over, unchanged:** `js/heritage.js`'s `siteCard`, the `#/explore/heritage`
wall, the country-panel section, and the Commons photo hotlinking. Only the data source
changes.

**Parked (owner, 2026-10-18)** after the sourcing spike below came back without a cheap
answer. The UNESCO wall stays as the browsable thing until there is appetite for this.

**Sourcing spike, 2026-10-18 — measured, so none of it needs repeating:**

1. **No Wikidata class captures "landmark".** Checked the obvious ones: the Eiffel Tower is a
   *lattice tower*, the Taj Mahal a *mausoleum*, Hagia Sophia a *mosque*, Big Ben a *belfry*,
   Petra an *ancient city*, Mount Fuji a *stratovolcano*, the Golden Gate a *road bridge*.
   `tourist attraction` (Q570116) has **115** members with a country — far too narrow.
2. **`architectural landmark` (Q2319498, 70,896 members) has the right quality and useless
   coverage.** At 45+ sitelinks it yields Eiffel Tower, Burj Khalifa, St Peter's, Al-Masjid
   Al-Haram, Persepolis, Sydney Opera House, Brandenburg Gate, CN Tower, St Basil's — but only
   **17 countries, 234 with none**, skewed to Russia 15 and Iran 7. France gets the Eiffel
   Tower alone; no Notre-Dame, Louvre or Versailles. The class is applied inconsistently.
3. **Fame separates landmarks cleanly** — Wikipedia language count is 88-191 for the landmarks
   above and 2-5 for an ordinary church — **but fame alone returns the wrong things.** France's
   most-linked items with coordinates are France, Paris, German, French, the Mediterranean,
   Dutch, Swahili, Lyon…; the Eiffel Tower is **17th**. Any fame-first route needs exclusions
   for settlements, administrative areas, languages, bodies of water and people.
4. **The query service is the binding constraint.** WDQS 504s on: a global fame scan
   (`sitelinks >= 90` + coordinates), any `P31/P279*` class walk, the `P297` ISO join over a
   large set, and even a single-country query once a third pattern is added. It answers
   two-pattern queries reliably and nothing more, so every route has to assemble results
   locally from narrow queries — the same shape #46 ended up with.

**The three routes, if this is picked up:** fame-per-country minus the non-places (~500 narrow
queries, class-agnostic so nothing is missed for being filed oddly, exclusion list is the
tuning knob, and a landmark that is also a settlement like Petra needs care); a union of 25-40
concrete classes (predictable, but coverage follows Wikidata's uneven tagging — see 2); or a
curated ~2,000 rows of bare QIDs, so only the *choice* is hand-made and name, photo and fame
still come from Wikidata.

**What is already built and waiting:** `js/heritage.js`'s `siteCard`, the `#/explore/heritage`
wall, the country-panel section, and Commons photo hotlinking. Only the data source changes.

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
- **Summability is declared, not inferred — and the flag now exists (2026-09-08).**
  `scripts/build-datasets.mjs` marks exactly the four extensive quantities
  `summable: true` (`gdp-nominal`, `population`, `land-area`, `exports`); everything
  else defaults to false, including `gdp-per-capita`, `life-expectancy` and
  `urbanization` (all need population weighting), `export-share-gdp` (#27, a
  percentage), `independence-year` (#28, a point on a timeline) and the electricity
  shares (#29). A build-time guard throws if an intensive format is ever flagged.
  Read it through `isSummable(id)` / `getSummableDatasets()` in `js/datasets.js` and
  **opt in** — never enumerate metric ids in the generator, or the next dataset wave
  silently joins the question pool.
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

## 38. Letter filter: "countries starting with A-Z"

**What:** A cross-cutting **letter filter** alongside the existing continent/region
filter: play only the countries whose name starts with a chosen letter — *"Draw every
country starting with S"*, *"Rank the B countries by GDP"*, *"Flag quiz: M"*. Manual
pick from an A-Z grid, plus a "random letter" roll.

**Why:** Owner request (2026-09-08). It slices the same 197 countries a completely
different way from continents, and the alphabet is a natural, memorable challenge unit
("all 27 S countries") that maps well to daily/streak framing.

**The letter distribution is measured, not assumed** (2026-09-08, against
`data/entities.json`; sovereign countries only, territories off). Every sovereign
entity has both geometry and a flag image, so the counts are identical for draw, flag
and rank modes — only the dataset-backed modes drop below these numbers, and only where
a metric has gaps:

| letter | n | letter | n | letter | n |
|---|---|---|---|---|---|
| A | 11 | J | 3 | S | **27** |
| B | 17 | K | 6 | T | 12 |
| C | 16 | L | 9 | U | 7 |
| D | 5 | M | **18** | V | 4 |
| E | 8 | N | 11 | W | **0** |
| F | 3 | O | **1** | X | **0** |
| G | 11 | P | 9 | Y | **1** |
| H | 3 | Q | **1** | Z | 2 |
| I | 9 | R | 3 | | |

Total 197. The distribution is the whole design problem:

- **W and X have zero sovereign countries.** W only becomes non-empty with the
  territories toggle on (Western Sahara, Wallis and Futuna, West Bank and Gaza — see
  #20). X is empty under every setting.
- **O, Q and Y are one country each** (Oman, Qatar, Yemen) and Z is two. A "quiz" of one
  is not a quiz — but it *is* a legitimate one-country draw round.
- **S (27), M (18), B (17), C (16)** are longer than any existing draw mode. Ten freehand
  countries is already called a slog in #9, so a 27-country draw round needs a cap.

**Decided (owner, 2026-09-08):** concept accepted, details open — see the questions
below before building.

**Open questions to resolve when scoping:**
- **Which modes get it.** Cheapest useful set is Draw the World country modes + Rank the
  World + the flag quizzes. Is it a filter on *every* mode (like the continent filter),
  or its own hub entry ("A-Z Challenge")?
- **Empty and tiny letters.** Grey out a letter with 0 eligible, or hide it? Minimum
  playable n per mode — draw can honestly play n=1, rank-line needs ~5, Top 10 (#36)
  needs ≥12 by its own table, so under the adaptive rule only A, B, C, G, I, L, M, N, P,
  S, T (and U at Top 5) would offer it. The grid must be filtered **per mode**, not
  globally.
- **Cap on the long letters.** Sample k of the 27 S countries, or play all of them?
  Sampling breaks the "all the S countries" completionist appeal, which is most of the
  charm; a cap is probably right for draw and wrong for flags.
- **Does it combine with the continent filter?** "African countries starting with M" is
  4-ish and mostly empty combos; likely they should be mutually exclusive.

**Approach / notes:**
- **Normalize the first letter.** Territories include `Åland Islands`; bucket by
  `name.normalize('NFD').replace(/\p{Diacritic}/gu,'')[0].toUpperCase()` so Å lands under
  A rather than creating a 27th bucket. Verify nothing else non-ASCII sneaks in when the
  territories toggle is on.
- **Sort by the displayed name**, and remember `The Gambia` / `The Bahamas` style names
  are already stored as `Gambia` / `Bahamas` in `entities.json` — check the few
  article-prefixed and "Saint …" names read the way a player expects before shipping.
- Eligibility goes through `inCountryPool()` (`js/datasets.js`) like every other mode, so
  aggregates and (by default) territories stay out — do not re-filter by hand (#5, #20).
- Draw modes select their pool via `getCountryRegions()` / `startCountries(regionFile)`
  (`js/geo-data.js:119`, `js/main.js:470`), which loads one `data/countries-<region>.json`
  per region. A letter set spans all six files, so it needs the `loadAllCountries()` path
  (`js/geo-data.js:38`) plus world region bounds (`this._regionBounds = null`), not the
  per-region loader.
- High-score keys: mirror the region pattern — `countries-letter-s`, `rank-letter-s`, etc.
  Keys are permanent once shipped; pick the shape deliberately.
- The A-Z grid is 26 buttons; at 390px that is a 5- or 6-column grid of ≥44px targets.
  Disabled states must be visibly distinct, not just non-clickable.

**Acceptance:** Pick a letter in at least one mode and play only those countries, with
the count shown up front ("S — 27 countries"). Letters with too few countries for the
chosen mode are visibly unavailable and unreachable. Random-letter roll never lands on an
unplayable letter. Works at 390px wide.

---

## 49. Civilization leaders by country

**What:** The leaders from Civilization IV, V and VI mapped to the modern countries that
hold their territory, shown in the country panel — open Turkey, see Suleiman.

**Why:** Owner request (2026-10-10). It is the most recognisable historical roster there
is, and it attaches names and faces to countries that are otherwise a shape and a number.

**Decided (owner, 2026-10-10):**
- **Data only** to start. No quiz mode in this entry.
- Cover **all Civ IV / V / VI leaders** and which real-life country each maps to.
- **May depend on #34** (historical territories) — *"its fine to depend this todo on doing
  historical nations first"*. The mapping problem is the same one: an empire's land is now
  several countries.

**Approach / notes:**
- ~150 leaders across the three games, with heavy overlap — one leader can appear in all
  three. Store the leader once with the games they appear in, not three times.
- **The mapping is the design.** Some are trivial (Elizabeth → United Kingdom), some are
  a judgement call (Genghis Khan → Mongolia, but his empire covers a dozen modern
  countries; Montezuma → Mexico; Gandhi → India). Decide the rule — *capital/heartland,
  not maximum extent* is the defensible one — and record it in the data as a note so the
  panel can hedge where it should.
- If #34 lands first, reuse its historical-entity names rather than inventing a parallel
  list; if it does not, keep the shape compatible with `data/history.json`.
- Licensing: leader names and the civilizations are facts, but **do not ship Firaxis
  artwork**. Text only, or nothing.
- A country with no leader is the normal case — most of the 197 have none. The panel must
  not show an empty section.

**Acceptance:** Opening Turkey shows Suleiman with the games he leads in; opening a
country with no Civ leader shows no leaders section at all. Every mapping follows the
recorded rule, and the ambiguous ones say so.

---

## 50. GeoGuessr-style country clues (driving side, language, signage)

**What:** A per-country facts layer of the things that identify a place from a street
photo: which side of the road they drive on, official language(s) and script, and the
look of road signs and plates.

**Why:** Owner request (2026-10-10). These are the facts a GeoGuessr player actually
learns, and the app has none of them.

**Decided (owner, 2026-10-10):** **data layer only.** No clue-guessing mode in this entry,
not even sketched. #14 (Guess the Language) stays the separate, mode-shaped item.

**Approach / notes:**
- Driving side and official languages are clean, finite, sourceable facts — start there.
  They belong with the other non-metric facts in `data/attributes.json` (capital,
  religion, independence year — #17), built by `scripts/build-attributes.mjs`.
- **Signage and plates are not a clean dataset.** "Yellow plates, blue EU strip" is a
  sentence someone writes, not a field in a database, and it varies within a country.
  Either curate short text for the countries where it genuinely identifies the place, or
  leave it out — do not auto-derive prose.
- Script matters as much as language for recognition (Cyrillic, Arabic, Devanagari,
  Hanzi): store it as its own field, not buried in a language string.
- Language overlaps #14 — whichever lands first owns the field, and the other reads it.

**Acceptance:** The country panel shows driving side and official language(s)/script for
every country that has them, sourced and dated. Nothing in the layer is invented prose
dressed as data.

---

## 74. Sub-national islands are not on the map as themselves

**What:** Madeira, the Azores, the Canaries and their like are rings inside their sovereign's
geometry, not entities. On the Explorer map they therefore read as *Portugal* or *Spain* whatever
the Territories toggle says, and cannot be hovered, shaded or opened as themselves.

**Why:** Owner request (2026-10-11): *"if i hover Madeira with territories off, i want it to show
as Portugal. if i toggle it with territories on i want it to show as Madeira."* The first half
works today — it is the second half that has nowhere to come from.

**Approach / notes:**
- This is **registry work, not map work** (#5, #20). Each island group needs an entity with a
  code, a name, a `sovereign`, `optional: true`, and its own geometry split out of the parent's
  rings — the map, the pool rule and the hover label then all work with no further changes,
  because `inCountryPool()` and the sovereign fallback (#69) already handle exactly this shape.
- **ISO 3166-2 subdivision codes** are the obvious key (`PT-30` Madeira, `PT-20` Azores,
  `ES-CN` Canaries), but the registry is keyed on ISO 3166-1 alpha-2 and every dataset joins on
  it. Decide deliberately whether these get real codes in the same namespace or a prefixed one,
  and what `inCountryPool()` should do with them by default.
- **The data mostly does not exist for them.** World Bank figures are national; Madeira has no
  GDP row. So they would be shaded "no data" in every metric unless regional statistics are
  added, which is a much bigger job. The honest first version is: hoverable, nameable,
  openable — and explicitly without figures.
- Splitting the geometry means deciding which rings belong to which island group, per sovereign.
  Doable by bounding box for the obvious ones (Madeira, Azores, Canaries are far from the
  mainland) but it is hand-checked work, not a script that can be trusted blind.
- **Scope check first:** list every sovereign whose geometry contains rings more than N degrees
  from its mainland, and see how long the real list is before committing to it.

**Acceptance:** With Territories on, hovering Madeira on the map says Madeira, and pressing it
opens a panel for Madeira that is honest about having no figures of its own. With Territories
off it still reads as Portugal.

---


## 75. Top 10: no guard that the three input styles stay in step

**What:** The card grid renders a pick's outcome in its own visual language (`.topn-card.is-hit`
/ `.is-miss` plus a rank chip), separate from the row component the board and the miss list
share. Nothing stops a future change landing in one input style and not the others.

**Why:** Owner review (2026-10-11), kept when the rest of that work was signed off. The three
output pieces — board, misses, feedback strip — already come from one builder each, so this is
insurance rather than a defect; the cost of it going wrong is a fix that silently only works in
one of three modes.

**Approach / notes:** the repo has no test framework, which is the whole reason this is a note
and not a test. If one ever lands, the assertion is: for each of cards / flags / typing, a round
renders the same set of output components.

---

## 80. Heritage wall: a throttled photo looks exactly like a missing one

**What:** `_renderHeritage` (`js/data-explorer.js:793`) appends all ~1,170 tiles in one pass and
leans entirely on `loading="lazy"` to pace the Commons requests. `siteCard`'s error handler
(`js/heritage.js:80`) drops a failed image into `whs-shot--empty` — the same state a site with no
photo gets. If a hard scroll ever outruns Wikimedia's rate limit, the wall degrades silently and
is indistinguishable from missing data.

**Why:** A thumbnail-size survey from this machine drew `429` from Commons at four concurrent
requests (2026-10-24). Not reproduced in a browser — lazy loading may well keep the burst under
the limit — so this is a check, not a confirmed defect. It earns an entry anyway because the
failure is invisible by construction: neither the UI nor the console separates a throttled tile
from a site that genuinely has no photograph, so nobody will rediscover it on purpose.

**Approach / notes:** confirm first — scroll `#/explore/heritage` hard with the network panel
open and look for non-200s. Only if it trips: give the error state its own appearance so it
stops impersonating the empty one, and cap how many tiles sit in the DOM at once. Self-hosting
the photos would also remove it, but that was weighed and declined (~75 MB at tile size, plus
per-photo CC BY-SA attribution for 1,167 files).

**Acceptance:** a hard scroll through the full wall shows no failed image requests; or, if it
does, a throttled tile is visibly distinct from a photo-less one.

---

---

## 82. Explorer map: deep zoom outruns the world outlines

**What:** The Explorer map draws `data/countries-*.json`, which is simplified hard for world-scale
drawing — Aruba is fifteen vertices there against 1,392 in `data/shapes/aw.json`. Now that the map
zooms to 48x (#81), that simplification is reachable: a small island arrives as a recognisable but
visibly straight-edged polygon, and a crenellated coastline like Greenland's shows its vertices
well before the zoom limit.

**Why:** Raising the zoom limit was the right call for the owner's question — which island belongs
to whom — and the shapes stay readable. But detail is now the ceiling rather than the zoom
constant, so raising `MAX_ZOOM` again buys nothing without this.

**Approach / notes:**
- The detail already exists and is already fetched on demand: `getCountryByCode()` reads the
  native per-country tier (`js/geo-data.js`, TODOS #24) for the panel, peek and compare.
- So the fix is a swap, not new data: past some zoom threshold, draw the per-country geometry for
  whatever is in frame and keep the simplified outlines for the rest. What needs deciding is the
  threshold, how many files to hold at once, and what hit-testing uses while a fetch is in flight.
- Not worth doing for its own sake. It earns its place only if deep zoom becomes something the
  Explorer is *for*, rather than a way to pick an island out of a chain.

**Acceptance:** At full zoom a small island shows a coastline, not a polygon.

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

- **#30** Trade partners both directions, a navigable panel, and who names you back — 2026-10-24
- **#79** Where our data comes from, in the app — sources, licences and a registry that cannot drift — 2026-10-24
- **#1** Improve reference-shape dataset precision — 2026-06-20
- **#2** New "Shape Only" draw mode (draw + compare, skip placement & sizing) — 2026-06-20
- **#3** Flag Color Quiz: perceptual color accuracy (Lab / CIEDE2000) — 2026-06-20
- **#4** New mode: Flag Color Picker (guess the missing color precisely) — 2026-06-20
- **#5** Foundational: unify the data layer with one canonical entity registry + ISO-code join key — 2026-06-20
- **#6** Fill the data gaps surfaced by the audit — 2026-06-20
- **#7** In-app data coverage / audit report (Data Explorer) — 2026-06-20
- **#8** Rename the "Geo Draw" mode — 2026-07
- **#9** Draw the World: better default modes — Quick 3 now leads the menu — 2026-10-10
- **#10** Push draw shape fidelity to Sporcle level — retired 2026-10-10, the same bar
- **#11** Placement & results-map overhaul — 2026-09-06
- **#12** Flag Color Picker: live-preview the chosen color on the flag — 2026-07-01
- **#16** Add Exports + Urbanization as rankable metrics (World Bank) — 2026-09-06
- **#17** Country profile attributes: capital + religion (new non-metric data layer) — 2026-09-06
- **#18** Country Showcase panel (flag + shape + all data) — FLAGSHIP, build first — 2026-07-21
- **#19** Fix the coverage board's flag-image vs flag-colors confusion — 2026-07-21
- **#20** Autonomous / dependent territories: broad sweep + a play-with-them toggle — 2026-09-06
- **#21** Replace draw-the-world geometry with higher-fidelity vector shapes — 2026-07-22
- **#24** Shape quality: iterate + owner approval — 2026-09-06
- **#25** Bug: Rank the World — can't continue after 10 placements (mobile) — 2026-07-30
- **#26** Sizing-screen footer overlap — retired 2026-09-08, the screen was deleted by #35
- **#27** Export share of GDP (dataset expansion, wave 1) — 2026-09-06
- **#28** Independence year (dataset expansion, wave 1) — 2026-09-06
- **#29** Electricity generation mix (dataset expansion, wave 2) — 2026-09-06
- **#35** Draw the World: merge the sizing stage into placement — 2026-09-08
- **#36** New mode: Top 10 / Bottom 10 (three input styles, shared rank ladder) — 2026-09-08
- **#39** Top 10 / Bottom 10: the data gap, a steady ladder, roll locks, readable flags — 2026-09-12
- **#40** Country name aliases ("UK", "UAE", "DRC") + the Explorer audit column — 2026-10-10
- **#41** "Your Scores": every preset you have played — 2026-10-10
- **#42** Metric descriptions on hover and tap — 2026-10-10
- **#43** Top 10 / Bottom 10: a "hide results" toggle — follow-ups in #59 — 2026-10-10
- **#44** Top-N picker: two more locks, and a roll hint that stops jumping — 2026-10-10
- **#45** Hub card icons — 🪜 for Top 10; Rank the World stayed 🏦 — 2026-10-10
- **#47** Data Explorer lists readable on a phone without zooming — 2026-10-10
- **#48** Data Explorer: a world map view — zoom and pan in #60 — 2026-10-10
- **#51** Browse the country shapes as a table — nameless grid in #61 — 2026-10-10
- **#52** Religion: keep the name when the Factbook gives no percentage — 2026-10-10
- **#53** Shapes: scattered island territories render as archipelagos — 2026-10-10
- **#54** Guard summed pairs against de-facto/claimant double-counting — 2026-10-10
- **#55** Flag colours for the 52 entities that had none — 2026-10-10
- **#56** Deep links: open any screen by URL — 2026-10-10
- **#57** Placement & results maps: a floor on zoom-out, and a pannable results map — 2026-10-11
- **#58** Results: the five countries your drawing matched best — 2026-10-18
- **#59** Top 10: flags on every pick, a reversible reveal, a cheaper re-render — 2026-10-11
- **#60** Data Explorer map: zoom, pan and reset — 2026-10-11
- **#61** Shapes: a nameless grid to test yourself against — 2026-10-11
- **#62** Resizing the window blanked every canvas — 2026-10-11
- **#63** One miss list for every input style — the guard is now #75 — 2026-10-11
- **#64** Map colours: one hue, so higher and lower read without the legend — 2026-10-11
- **#65** Data Explorer controls: one grammar, and its own territories setting — 2026-10-11
- **#66** The map was naming the wrong country, and painting the wrong band — 2026-10-11
- **#67** Four views, one order list, and columns behind a glyph — 2026-10-11
- **#68** Microstates you can hover, bands that fit the data, DEV button removed — 2026-10-11
- **#69** Natural bands, territories that name their owner, and Show on map — 2026-10-11
- **#70** Coverage: sortable columns and a gaps-only view — 2026-10-18
- **#71** Flag-colour review moves into Coverage; data-map becomes pipeline-only — 2026-10-18
- **#72** Freestyle: draw anything, find out what it is — 2026-10-18
- **#73** Scoring: a perfect drawing could score zero (bbox framing, sub-pixel islands, placement centroid) — 2026-10-18
- **#76** Placement: a small shape can always be grabbed to move — 2026-10-11 (written as #71; that number belongs to the Coverage entry the code cites)
- **#77** Reach any country, and any toggle, from a URL — 2026-10-18
- **#31** Country emblems / coats of arms, hotlinked from Commons — 2026-10-18
- **#46** UNESCO World Heritage sites: browsable by name with photos; the count was cut — 2026-10-18
