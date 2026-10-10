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

## 35. Draw the World: merge the sizing stage into placement

**REVIEW:** play a few rounds of Draw the World (any region). After you finish a drawing you
now land straight on the map: drag the shape to move it, drag a blue corner to resize, drag the
orange handle to rotate, wheel/pinch to zoom. Check the shape lands at a workable size, that
sizing against real coastlines feels like a geography question rather than a guess, and that
scores still read sensibly with size at 30% of the total.

**✅ DONE 2026-09-08** — `TransformControls`, the `transform` screen and `STATES.TRANSFORM` are
deleted. Handle geometry, hit-testing and drag maths were extracted to `js/shape-handles.js` and
are consumed by `js/world-canvas.js`. Neutral drop size is 15% of the canvas's shorter side,
derived from the viewport alone (`WorldCanvas.setNeutralScale`) — verified at 14.9% desktop /
15.0% at 390px. **That fraction is 15%, not the ~25% this entry proposed**: measured against
the geometry, the median country is only 3% of the world view's shorter dimension and 2-18% of
a region view's, so 25% started every shape absurdly large. Two-finger pinch zooms the view; one
finger belongs to the shape. Placement Only
keeps scale locked at true size, Tweak stays move-only, Hard mode still has no basemap. Verified
end to end with Playwright at 1440×900 and 390×844 (resize, rotate, move, zoom, place, skip,
Blind, Shape Only, Tweak): 45 checks, no page errors.

**⚠️ Known rough edge:** in World mode the neutral size is larger than most countries — at world
zoom a typical country is ~30 world units and the drop size is ~180, so nearly every round starts
by shrinking. That is deliberate (a start size small enough to match a median country is too small
to grab, and one derived from the answer would hand away 30% of the score), but if it annoys in
play the fix is to zoom the placement view in a little rather than to shrink the drop.

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

**REVIEW:** open the hub → "Top 10 / Bottom 10". Play a World round in each of the three input
styles, and one on a continent. Judgement calls to check: whether three lives is the right
number, whether the ladder's empty slots take too much of the phone screen before a round gets
going, whether the flags-only and typing styles earn their place, and whether the boundary rule
is set right — it is at **0.5%, not the ~1% this entry proposed** (see below), so a round can
still come down to one near-miss.

**✅ v3 2026-09-08 — the shared rank ladder.** Owner feedback on v2: keep the growing result list
from the typing style everywhere, so it is clear which ranks are taken and which are left, and
make the score screen use the same shape.
- **Slots 1..N are always on screen**, in every input style. A filled slot names the country and
  its value; an empty one is its number and a dashed line, so the gaps are read at a glance
  rather than counted. Wrong picks collect beneath under "Missed", at the rank they actually
  hold — being sixty places out looks different from being one place out.
- **The results screen is that same ladder with every slot revealed** — one builder renders both,
  so the end of a round is the finished version of the board you were filling in, not a new
  layout. Only the results rows link to the country panel: mid-round it would show every metric
  for that country, including the one being played.
- **Easy/Hard kept as they were, with the reason spelled out.** The owner noticed a Top 10 round
  plays partly by exclusion, because Easy draws its wrong options from across the whole ranking
  and some are obviously not contenders. Tightening Easy to a rank band was offered and declined
  — the spread is wanted — so instead the picker now states what the setting does, as a tooltip
  and as a visible line: *"Easy — wrong options are drawn from across the whole ranking"* /
  *"Hard — wrong options are the countries just below the cut"*.

Verified with Playwright at 1440×900 and 390×844: 40 further checks on the ladder (empty slots,
slot filling, misses landing below and not consuming a slot, all three styles, results
completeness and clickability, the difficulty hints), on top of the 60 from v2. No page errors.

**✅ v2 2026-09-08 — the loop was rebuilt on owner feedback.** (Layout superseded by v3 above.) The first version had you tick N
countries blind and lock them all in at once; the owner's verdict was that the countries ate the
screen, the menu was a long vertical scroll, and it would be more interesting one at a time with
the data shown as you go. So:
- **One pick at a time, three lives.** Each pick immediately reveals that country's true rank and
  value in a feedback strip and on the card itself. Correct picks lock in; a wrong one costs a
  life and stays on screen, dimmed, so the miss teaches something. The round ends when you find
  all N or run out of lives. Score is still hits out of N.
- **Three input styles**, all sharing that loop: **Cards** (flag + name, packed three-across so
  all 24 fit a 390px screen without scrolling), **Flags only** (five-across, name revealed on the
  pick, so it doubles as flag practice), and **Type the name** (no pool at all — an autocomplete
  over the eligible countries, recalling from memory). Difficulty is the distractor rule, so it is
  disabled for typing, which has no distractors.
- **A typo is not a wrong answer.** In the typing style a name that is not a country in range, or
  one already guessed, is a nudge that costs no life. Only a real, in-range country that misses
  the cut takes one. Names are matched with diacritics stripped, so `Cote d'Ivoire` works.
- **The picker is a form now**, not a scroll: five selects (metric / filter / direction /
  difficulty / input), a summary line, Start and Random roll. It fits one phone screen with no
  scrolling — verified. Metrics that are not playable under the current filter appear disabled
  with their reason, and if a filter change strands the current metric the picker falls back to
  the first playable one.
- **High scores start over.** Keys moved to a `topn2-` namespace and now include the input style:
  finding 8 of 10 with feedback and three lives is not the feat the old blind pick-N scored, and
  naming countries from memory is not the same as ticking a pool. Old bests are orphaned, not
  migrated.

Verified with Playwright at 1440×900 and 390×844: 60 checks over both end conditions, lives
accounting, reveal contents, re-pick prevention, all three styles, the typo rule and the picker.
No page errors.

**✅ v1 2026-09-08 (superseded by v2 above)** — `js/top-n-game.js`, modelled on `js/rank-line-game.js`, plus a hub card,
`STATES.TOP_N` and its styles. Picker offers direction (Top/Bottom), difficulty (Easy/Hard),
scope (World + 6 continents), a random roll, the Force-10 override and the shared territories
toggle. Rounds go through `getEntries()` + `inCountryPool()`, and the metric list reuses Rank the
World's own `rankable` verdict, so new datasets join automatically and degenerate ones stay out.
Selection is capped at N, so the score is always hits out of N. Results show the true ranked list
with hits and misses, then "You also picked" with each wrong pick's real rank — the near-miss is
the point. Verified with Playwright at 1440×900 and 390×844: 38 checks, no page errors.

**Adaptive N confirmed against live data** (2026-09-08): the eligible counts in the table below
still hold exactly. World plays Top 10 of 24, Oceania and South America drop to Top 5 of 12, and
exports × South America (10 eligible) is unreachable, as designed.

**⚠️ Deviation — boundary gap is 0.5%, not 1%.** At 1% the rule rejects 33 of 134 combos, and one
of them is the mode's most obvious round: Top 10 Population — World, because Mexico (129.7M)
edges Ethiopia (128.7M) by 0.8%. The ~1% intuition comes from a 1-versus-1 comparison, where a
tight boundary decides the whole question; here you pick N from a pool, so it costs at most one
point out of N. 0.5% offers 110 combos and rejects 24, still excluding all 10 exact ties
(independence years — Armenia and Azerbaijan are both 1991). Revisit if a round feels unfair.

**Not built:** the "mind the flex-shrink trap" note from #25 did not apply — the pool is a CSS
grid, not a flex column.

**Related: #38** — the letter filter would be a third scope alongside world/continent here, and the
adaptive-N rule is what makes most letters unplayable in this mode. It now lives in
`N_RULES` in `js/top-n-game.js`; reuse it, don't fork it.

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

## 39. Top 10 / Bottom 10: the data gap, a steady ladder, roll locks, readable flags

**REVIEW:** play **Bottom 10 · Total exports · World** with the typing style. Type
*Tuvalu* — it should say it has no exports data rather than calling it wrong, and the
"25 not in this round" strip at the bottom should list it. Watch the ladder as you fill
slots: nothing above or below should move. Then go back and try the 🔒/🎲 locks in the
picker — lock the metric, roll, and check only the filter and end change. Finally switch
Input to **Flags only** and see whether the default size is now readable, and whether
🔍 Bigger is big enough.

**✅ DONE 2026-09-12** — all four, verified with Playwright at 1440×900 and 390×844
(26 checks, no page errors).

**What the owner hit (2026-09-12):**

1. **"I was doing bottom 10 for total exports and instantly wanted to write Tuvalu. But we
   lacked data on Tuvalu — implying it was probably one of the lowest."** The metric's
   coverage gap *is* the answer-shaped hole: the countries too small to report exports are
   exactly the ones with the smallest exports. Being told "not one of the 188 countries in
   range" reads as *wrong*, not as *we have no figure*.
   - `TopNGame._unranked(datasetId, scope)` is the registry minus the dataset's own keys,
     through `inCountryPool` and the scope filter. Stored on the round as `unranked`.
   - `_renderUnranked()` renders it as a collapsed `<details>` under the round — reference,
     not part of the loop. The open state lives on the instance because the board is rebuilt
     on every single pick.
   - A typed name that matches the roster now gets its own note: *"Tuvalu has no Total
     exports data, so it is not in this round — no life lost."*
   - Counts measured 2026-09-12 (territories off): 0 for population, 2 for GDP, 25 for
     exports, 3 for independence year. With territories on, 3–63.
   - **Not done, deliberately:** letting you *name* a country with no data. It cannot be
     ranked, so it can be neither right nor wrong — the roster tells you the same thing
     without pretending the pick means something.

2. **"Have the height of the row not change when something pops in, so the list doesn't
   jump around."** `.topn-row` is now one box for every state — empty slot, hit, miss —
   at `min-height: 30px` with `line-height` pinned at 1.2 (the body's 1.3 made a filled
   row's 1rem value text a 21px line box, one pixel taller than an empty row). The empty
   slot also carries a mark spacer so the rank column does not shift sideways, `.topn-flag`
   is a fixed 24×16 frame with `object-fit: contain` (Nepal's pennant and Switzerland's
   square are not 3:2, and used to make their own rows taller), and `.topn-result-name`
   ellipsises rather than wrapping to a second line.

3. **"Allow locking some things and randoming from the rest."** Every picker field has a
   lock beside it: 🔒 keeps it, 🎲 means the roll may change it. Difficulty and input style
   start locked, because the roll never touched them before and one that silently drops you
   into typing is a different game. `_rollCombos()` filters the valid-combination list by
   the locks; style and difficulty are rolled separately since they never affect whether a
   combination is playable. A line under the button says what the roll will change, and the
   button disables itself when the locks leave nothing playable. The "repair a metric that
   stopped being playable" rule in `showPicker()` now skips a **locked** metric — silently
   swapping it is exactly what the lock exists to prevent.

4. **"In flag mode the flags are very tiny at 100% zoom."** Flags-only columns went from
   58px/38px flags to 76px/62px, with a 🔍 Bigger toggle for 124px/108px, and the cards now
   load `w320` rather than the `w40` thumbnail the text rows use — at 38px the emblem-heavy
   flags (Mexico, Sri Lanka, most of the Caribbean) were a smudge whatever the CSS said.

**Also asked: Artsakh.** It is not in the data and never was — `docs/territories-candidates.md`
dropped it when the other de-facto states (Abkhazia, N. Cyprus, S. Ossetia, Transnistria)
landed, because it dissolved in 2024 and has neither geometry nor a flag asset. Asia's
territory list holds the other three, which is what made its absence look like a bug.

---

## 27. Export share of GDP (dataset expansion, wave 1)

**REVIEW:** open Data Explorer → "Exports % of GDP". Check the top end reads sensibly
(Luxembourg/Singapore/Ireland are re-export & finance hubs, so >100% is correct, not a bug).

**✅ DONE 2026-09-06** — shipped as `export-share-gdp` from World Bank `NE.EXP.GNFS.ZS`
(188 countries). Luxembourg 217.4%, Singapore 180.4% top; Sudan 1.1% bottom. Live.

**🔍 REVIEW 2026-09-06** — the dataset is live and matches acceptance (Luxembourg 217.4%, San Marino 186%, Singapore 180.4% at the top). Built by session `geo-draw-the-world-43`. Only the data itself is still awaiting sign-off.

**✅ Precondition settled 2026-09-08** — the missing `summable` flag now exists.
`scripts/build-datasets.mjs` declares it (default false) on the four extensive metrics
only — `gdp-nominal`, `population`, `land-area`, `exports` — and `js/datasets.js`
surfaces it as `isSummable(id)` / `getSummableDatasets()`. `export-share-gdp` is a
percentage and is correctly excluded, as are `independence-year` and the electricity
shares. A build-time guard throws if an intensive *format* (`percent`, `year`, `years`)
is ever marked summable. #37 can now opt in on the flag rather than inferring.

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

**REVIEW:** open Draw the World. **Quick 3** is now the big button at the top; Daily Challenge
sits first in Special Modes. Play a round from each and check nothing about the swap feels
backwards.

**✅ DONE 2026-10-10** — the open half of this item was always a decision, and the owner made
it: *promote Quick 3 to hero* (2026-10-10). A daily is a returning-player feature; someone
opening the game for the first time wants to play. Quick 3 takes the hero slot, Daily Challenge
takes Quick 3's place at the head of Special Modes, and `.btn-daily-mode` is renamed
`.btn-hero-mode` — the treatment is now "whatever leads", not "the daily".

The long modes were left where they are. World and Continents already sit below the special
modes, under their own heading, and burying them further would make them hard to find for the
one player who wants them.

**#35 has landed** (2026-09-08) — sizing is merged into placement, so the weakest step in
the draw loop is gone. That was half the reason the default played badly.

**✅ Half done 2026-09-08 — Quick 3 shipped.** `Quick 10` is replaced outright (not
supplemented) by `Quick 3`: `startQuick3()` / `btn-quick3`, three random countries, same
loop. Replacing rather than adding was the read of "Quick 10 is too long for drawing" —
keeping both would have left the slog as the prominent option. Rank the World is untouched.
Note the high-score key moved from `quick10` to `quick3`, so any existing Quick 10 best is
orphaned in localStorage rather than migrated; a best over ten items is not comparable to
one over three.

**❓ Still open — the "default", which needs an owner decision.** There is no auto-start
default to change: Draw the World is a menu, so "the default" is really *what the menu
puts forward*. Today the hero button is **Daily Challenge** (one country), with Quick 3,
Famous 5, Speed Round and Streak below it, then Continents/World, then the six regions.
With Quick 3 in place both prominent options are now short, which may be all this item
needed. Decide one of:
- leave it — Daily Challenge as hero is already a good first impression; close this item;
- promote **Quick 3** to hero instead, on the grounds that a daily is a returning-player
  feature and a first-time player wants to just play;
- de-emphasise the long modes (World is ~197 items, Continents 7) by moving them below the
  regions or behind a "more" disclosure.

Nothing about the modes *dead-ends* — verified by playing Quick 3 end to end after the
change, so the acceptance criterion below is met apart from the default question.

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

## 40. Country name aliases: "UK", "UAE", "DRC" count as the country

**REVIEW:** Top 10 → Input: *Type the name*, play a round, and try `uk`, `uae`, `drc`,
`holland`, `czechia`. Then Data Explorer → **🔤 Aliases: On** and read down the list for a
country that should answer to something it doesn't — that column is the audit, and adding to
`data/aliases.json` is a one-line edit.

**✅ DONE 2026-10-10** — `data/aliases.json`: 82 countries, 131 aliases, validated as it was
written against `data/entities.json` (every key is a real country; no alias is some *other*
country's real name; no alias is claimed twice). `normalizeName` moved from `js/top-n-game.js`
to `js/datasets.js`, where the names it compares live.

**Stored as written, normalized at load** — the entry proposed storing them pre-normalized.
Keeping "U.K." and "Côte d'Ivoire" as written makes the Explorer column read as names rather
than as matcher keys, and normalization still happens in exactly one place. Each alias is
indexed **twice, with and without its spaces**: "U.K." normalizes to `u k` and "uk" does not,
and both have to work.

Matching order in `_submitName` is exact name → exact alias → prefix of name, so an
abbreviation outranks a two-letter prefix of some other country. The suggestion list matches on
aliases too and names the one that found the country, so typing `uk` both scores and teaches.

**Deliberate omission: "England" is not an alias for the United Kingdom.** Say the word and it
goes in — losing a life to it is annoying — but a geography game teaching England = UK seemed
the worse trade.

Verified in the browser: `uk` → ✓ United Kingdom #6, no life lost; `uae` → ✗ United Arab
Emirates #27, correctly treated as a real in-range country; `zzzz` → "not one of the 195
countries in range — no life lost". Thirty-one probes resolve, including `U.K.`, `u k`, `DRC`,
`PNG`, `czechia`, `cape verde`, `burma`, `swaziland`, `holland`, `east timor`, `dprk`, `rok`,
`macedonia`, `persia`, `siam`, `ceylon`, `malvinas`, `holy see`, `bvi`, `usvi`, `eire`,
`aotearoa`, `trnc`; `nope` resolves to nothing, and so does `ivory coast` — correctly, since
that is already the country's real name. Explorer column: 195 rows, 133 of them blank, aligned
under the name at 390px and 1440px, no horizontal overflow.

**What:** A curated alias table so typed answers accept the shortenings people actually
use — UK, UAE, USA, DRC, CAR, PNG, Holland, Burma, Ivory Coast, Czechia — plus a way to
*see* the whole table, so gaps can be found without playing into them.

**Why:** Owner request (2026-10-10). Sporcle accepts these and the game feels broken
without them: typing `uk` today matches nothing and is told it "is not one of the N
countries in range". The viewing half is not decoration — *"if i cant validate the data
set in the list i cant see if it misses anything"*.

**Decided (owner, 2026-10-10):**
- **Typing acceptance is the feature.** The list view exists to audit the data behind it.
- **Not its own screen.** It rides into the Data Explorer as an extra column behind a
  toggle, the way Territories already does.

**Approach / notes:**
- New `data/aliases.json`, `{ "<code>": ["uk", "great britain", …] }`, hand-curated and
  loaded by `js/datasets.js` beside the other optional layers. A failed fetch must leave
  typing working on real names, exactly as `electricity.json` is kept separable.
- **Store aliases already normalized** by the same rule as names (`normalizeName`,
  `js/top-n-game.js:86`: diacritics stripped, case folded, punctuation to spaces). Then
  `U.K.`, `UK` and `u k` collapse to one key for free and the file cannot drift from the
  matcher.
- Two consumers, both in the typing style today: the submit matcher (`_submitName`,
  `js/top-n-game.js:808`) and the suggestion filter (`:707`) — typing `uae` must *offer*
  United Arab Emirates, not merely accept it once typed in full. Put the lookup in
  `js/datasets.js` so any future typed mode inherits it.
- **Exact alias beats prefix-of-name.** `_submitName` falls back to `startsWith`; try the
  alias map before that fallback or a short prefix can out-rank a deliberate abbreviation.
- Aliases go through `inCountryPool()` like everything else — an alias must not drag a
  territory into a round the toggle excluded.
- Explorer column: a `🔤 Aliases: On/Off` button in `_renderControls()`
  (`js/data-explorer.js`) adding an "also accepted" cell per row. Countries with none
  render an empty cell — that blank *is* the audit signal.
- Seed the list from the names that actually cost a life: the four-plus-word official
  names, the two-word islands, and the handful with a competing common name
  (Czechia/Czech Republic, Myanmar/Burma, Türkiye/Turkey, Eswatini/Swaziland,
  Netherlands/Holland, Côte d'Ivoire/Ivory Coast, Cabo Verde/Cape Verde,
  North Macedonia/Macedonia, East Timor/Timor-Leste).

**Acceptance:** Typing `uk`, `uae`, `usa`, `drc` in a Top-N typing round scores the right
country, and the suggestion list offers them mid-word. The Explorer can show every alias
per country so the table can be read for gaps. A country with no alias is visibly blank
rather than absent.

---

## 41. "Your Scores": a record of every preset you have played

**REVIEW:** menu → **🏅 Your Scores**. Everything you have ever finished should be listed
under the activity it belongs to, newest first, with a best that reads correctly for that mode
(a drawing round is out of 100, a streak is a count, Top 10 is hits out of N). Check nothing you
recognise is missing or mislabelled — and that **Clear all scores** asks first.

**✅ DONE 2026-10-10** — new `js/scores-screen.js` and a seventh hub card, read-only over
`getAllHighScores()`. The only write added anywhere is `clearScores()`, behind a confirm, in the
one place the whole store is visible.

The work was the labels, as expected. Keys are minted in five places and two of them hold
dashes inside dashes, so Top-N keys are read from the **right** — optional difficulty, style,
N, direction — and the dataset is then matched against the live registry rather than guessed:
`topn2-elec-renewable-pct-north-america-lo-5-type` resolves to *Bottom 5 · Electricity from
renewables · North America · typing*. Orphans are kept, never dropped: `quick` still reads
"Quick 10" though #9 retired it, and anything no current mode mints lands under **Older rounds**
with its raw key.

Verified against a seeded store holding all eleven key shapes: every row resolved, groups in
order, newest first, per-mode formatting correct (82/100, 12 in a row, run of 14, 8/10, 850
pts). Empty store shows an invitation; clear-all empties and re-renders; back returns to the
menu; 390px has no overflow; no console errors.

**Not built:** replaying a preset by tapping its row. That needs every key mapped back to a
mode start, which is a bigger job than this screen — a natural follow-up if the screen earns it.

**What:** A Seterra-style scores screen: every game preset you have actually played, with
your best on it and when. Presets you have never touched do not appear.

**Why:** Owner request (2026-10-10). The scores already exist — `js/high-scores.js` keeps
one record per mode key — but they are only ever shown at the moment you finish, or on
the six region buttons (`js/main.js:165`). There is nowhere to see what you have played
and how you did, which is most of what makes Seterra sticky.

**Decided (owner, 2026-10-10):** one screen in the hub. Not inline badges on every button.

**Approach / notes:**
- Read-only over the existing `geo-draw-high-scores` localStorage blob
  (`getAllHighScores()`); no new store, no new write path, so nothing can regress scoring.
- **The hard part is labels, not layout.** Keys are flat strings minted in five places:
  `countries-<region>` and the draw mode names (`js/main.js:1379`), `rank-line-<id>`
  (`js/rank-line-game.js:630`), the Top-N key (`_scoreKey`, `js/top-n-game.js`), and the
  two flag games (`js/flag-game.js:517`, `js/flag-picker-game.js:419`). A resolver needs
  to turn each back into something readable ("Top 10 · Total GDP · Europe · typing").
- **Decide what happens to orphans** — keys from modes that were renamed or deleted
  (Quick 10 became Quick 3 in #9; the `transform` screen died in #35). Showing a raw key
  is ugly; hiding it silently loses a record. Suggest: group them under "Older rounds"
  with the raw key, and never delete anything the player earned.
- Records carry `{ score, counted, total, date }` only — no play count, no time, no
  attempt history. Say what you can honestly say; do not invent a "times played".
- Group by activity (Draw / Rank / Top-N / Flags), newest-played first inside each group.
- Needs a **clear-scores** control with a confirm, since this is now the only place the
  whole store is visible.

**Acceptance:** Play two different presets, open the screen, and see exactly those two
with correct bests and dates. A player with an empty store sees an invitation, not an
empty table. Readable at 390px.

---

## 42. Metric descriptions on hover and tap

**REVIEW:** open a country panel (tap any row in the Data Explorer) and tap a metric tile
— it should say what that metric measures; hovering does the same on a desktop. Then open the
Top 10 picker and change the metric: the line under the dropdown follows it, and nothing below
moves.

**✅ DONE 2026-10-10** — the `blurb` is now surfaced in the two places that had only a bare
name: a hint line under the Top-N metric dropdown (the pattern the difficulty hint already
set), and the country panel's metric tiles, which get an ⓘ, a hover title, and tap- or
keyboard-toggled text. Rank the World's cards and the Explorer header already showed it.
Reserved height measured, not guessed: the longest blurb needs 30px at 320/390/1440, reserve
is 31px, and the form below it does not move when the metric changes.

**Still open:** `data/datasets.json` records no year per dataset, so "latest year" is as
precise as the text can honestly be. Naming the year is a `scripts/build-*.mjs` change.

**What:** Show what a metric actually measures wherever one is chosen — hover on desktop,
an ⓘ tap on touch. *"Electricity from renewables"* should say which year, which source,
and what counts as renewable.

**Why:** Owner request (2026-10-10). The data is already written and already loaded:
every dataset in `data/datasets.json` carries a `blurb`, and today it is rendered in
exactly one place — the Data Explorer's list header (`js/data-explorer.js`,
`.explore-blurb`). Every other metric picker shows a bare name.

**Approach / notes:**
- Surfaces: the Explorer's metric `<select>`, the Top-N picker's Metric row
  (`_selectRow`, `js/top-n-game.js:497`), the Rank-the-World dataset cards
  (`js/rank-line-game.js:95`), and the metric rows in the country panel.
- A `<select>` cannot hold rich hover text per option in any portable way. Either put the
  description under the control (it changes as you change metric) or keep `title` on the
  option and accept that touch devices will never see it. **Under the control is the
  honest choice** — and #44 has already established that a line of explanatory text below
  a control needs reserved height so it cannot shift the layout when its length changes.
- Touch has no hover: an ⓘ button beside the control toggling the same text is the whole
  mobile story. Do not build a tooltip library.
- **Audit the twelve blurbs as part of this.** They were written as a header suffix
  ("Nominal GDP, latest year (World Bank)"), not as teaching text, and the three `elec-*`
  ones are the ones that prompted this. Each should name the source and the year.

**Acceptance:** Every metric picker in the app explains the selected metric without
leaving the screen, on desktop and on a phone. No blurb reads as a column header.

---

## 43. Top 10 / Bottom 10: a "hide results" toggle

**REVIEW:** Top 10 picker → **🙈 Hide answers: On**, then play a round and lose it. The
ladder should stay blank where you never answered, with **👀 Reveal answers** to spoil it
deliberately. Check the toggle survives a reload, and that with it Off the results screen looks
exactly as it always did.

**✅ DONE 2026-10-10** — `getHideAnswers`/`setHideAnswers` in `js/settings.js`
(`gdtw.hideAnswers`, default off). `_showResults()` split into the scoring half and
`_renderResults(reveal)`, so Reveal redraws the ladder without re-saving the score or replaying
the sound. Verified end to end: a hidden round shows 10 blank slots, the subhead reads "Your 0
of 10 — 10 still hidden", the three wrong picks stay listed, and Reveal fills all ten and
removes its own button. The default path renders identically to before.

**What:** An option that stops the results screen from handing you the answers you never
found. Persisted like the other toggles. A deliberate **Reveal answers** button is the
escape hatch.

**Why:** Owner request (2026-10-10): today the results ladder fills in every slot you
missed, so Play Again is a formality — you have just been told the answer. Hiding them
makes the replay the point.

**Decided (owner, 2026-10-10):**
- Unfound slots stay blank at results; a **Reveal answers** button spoils it on purpose.
- Not "hidden until you replay" — a round you cannot finish must not become a dead end.
- The score still saves exactly as it does now.

**Approach / notes:**
- `_showResults()` already builds the ladder through `_slotsHtml({ reveal })`
  (`js/top-n-game.js:747`), which renders an empty-but-full-height row when `reveal` is
  false. The hidden state is therefore already written and already layout-stable: pass
  the setting through and re-render on Reveal.
- Wrong picks (`_missesHtml`) stay visible either way — you typed them, they are yours.
- The setting belongs in `js/settings.js` next to `getIncludeTerritories`, with a stable
  key, and a button in the picker's options row beside Territories and Force 10.
- The results subhead ("The real top 10") must not read as a promise when nothing is
  shown — say how many are hidden.

**Acceptance:** With the toggle on, finishing a round shows only what you found, plus a
Reveal that fills the ladder in. With it off, behaviour is exactly as today. The setting
survives a reload.

---

## 44. Top-N picker: two more locks, and a roll hint that stops jumping

**REVIEW:** Top 10 picker → Territories and Force 10 now each have a 🔒/🎲 beside them, and
Territories starts locked. Free them and roll a few times. Then watch the row of toggles while
you change metric or flip locks: it should not move.

**✅ DONE 2026-10-10** — seven lockable fields. Territories and Force 10 are rolled *before*
the combo list is built, since they change which combinations exist at all, and both are put
back if the flip leaves nothing playable — a roll that never starts a round cannot strand the
global territories setting. The roll hint moved below the toggles with 3.1em reserved (longest
message measures 35px, reserve 37px). Verified at 320/390/1440: the toggle row holds the same
y through every hint message and the longest metric blurb; three rolls with everything free
started rounds with no console errors.

**What:** Give **Territories** and **Force 10** the same 🔒/🎲 treatment the other picker
fields have, and move the roll hint below the options row with its height reserved, so a
longer message cannot shove the buttons around.

**Why:** Owner request (2026-10-10). The lock row (#39) stops at Metric / Filter / End /
Difficulty / Input, but the two toggles below it are just as much part of a preset. And
the hint text swaps between three sentences of very different length — the layout moves
under your finger as you tap.

**Decided (owner, 2026-10-10):**
- **Territories defaults to locked.** It is a *global* setting shared with Draw, Rank and
  the Explorer (`js/settings.js`), so a roll that flips it changes other modes behind your
  back. Force 10 is local to this picker and can start free.

**Approach / notes:**
- Add both to `LOCKABLE` (`js/top-n-game.js:75`) and to `this.locks`; `_lockBtn` already
  handles rendering, `aria-pressed` and the title text, and `startRandom()` already has
  the "roll only what is unlocked" shape.
- **Rolling Territories changes the eligible pool**, so the combo list must be recomputed
  after the roll flips it, not before — otherwise the roll can pick a filter that the new
  pool cannot support (the adaptive-N table in #36 is what decides playability).
- Force 10 interacts with the same table: rolling it on must not produce a round the
  N rule would have refused for fairness. Roll it only where the plan stays valid.
- The hint (`.topn-roll-hint`, `js/top-n-game.js:452`) moves below `.topn-options`, and
  gets a `min-height` sized to its longest message at 390px — measure it, do not guess.

**Acceptance:** All seven picker fields can be locked. A roll with Territories free can
flip it and still produce a playable round. The options row does not move when the hint
text changes length, at 390px or on desktop.

---

## 45. Hub card icons: make them read as a guess, not a category

**REVIEW:** look at the menu — Top 10 / Bottom 10 is now 🪜 (a
ladder, which covers both ends of a ranking and matches what the code already calls the board).
**Check it on your phone:** 🪜 is a 2020 addition, so an older device may draw a box. Say so
and it gets swapped.

**✅ DONE 2026-10-10** — Top 10 / Bottom 10 is 🪜. Rank the World was tried as 📏 and **put
back to 🏦** (owner, 2026-10-10): at card size a ruler reads as a blank slab, and an icon you
have to squint at is worse than one that is merely off-topic. Still the weakest of the six if
a better idea turns up.

**What:** An emoji pass over the six menu cards, Rank the World (🏦) and Top 10 (🔟)
first.

**Why:** Owner request (2026-10-10). 🏦 says "bank" where the card is about ranking
countries by any of a dozen metrics, and 🔟 is the mode's own name repeated back. Neither
suggests guessing, which is what the game is.

**Approach / notes:**
- Six icons in `index.html` (`.hub-icon`, lines 41-69). No JS, no CSS — unless a
  replacement needs a size tweak, since emoji metrics differ wildly.
- Keep them a **set**: one visual idea across all six, not six good individual picks.
- Check every candidate at 390px and in the actual menu font — a few emoji render as flat
  monochrome glyphs on some platforms, and the globe behind the cards eats low-contrast
  ones.

**Acceptance:** The six cards read as one family, and Rank the World and Top 10 no longer
look like a bank and a numeral.

---

## 46. UNESCO World Heritage sites per country

**What:** Sites per country as a rankable dataset, joining the Explorer, Rank the World
and Top 10 like every other metric. Named sites, and anything quiz-shaped, come later.

**Why:** Owner request (2026-10-10). It is a genuinely different axis from the economic
metrics — Italy and Spain at the top, with small countries scoring far above their size.

**Decided (owner, 2026-10-10):** data layer first. *"if we could start doing 'world top
20' ones and just focus data layer, we could add quizzes and things to it later"* — so a
curated famous-sites list is explicitly a phase 2, not a reason to delay the count.

**Sourcing is the first task, and it is harder than it looks (measured 2026-10-10):**
- **UNESCO's own list XML (`whc.unesco.org/en/list/xml/`) is behind a Cloudflare
  challenge.** A `curl` from a build script gets a "Just a moment..." HTML page, not data.
  Plan on a manual download committed to the repo, or a mirror — do not write a script
  that silently ships an empty dataset.
- **Wikidata is not a drop-in substitute.** Counting items that carry the World Heritage
  Site ID property and grouping by country gives **Spain 1241, Germany 424, France 355,
  UK 299, Italy 285** against real figures around 50-60 — the IDs sit on every *component*
  of a serial site. Any Wikidata route needs a de-component pass first and must be
  spot-checked against a handful of known country totals before it is trusted.

**Approach / notes:**
- Follow the existing dataset pipeline: a `scripts/build-*.mjs` writing into
  `data/datasets.json` with `name`, `blurb`, `format`, `higherFirst` and an honest
  `summable` (site counts *are* summable — see #37).
- Join on the canonical registry by ISO code (#5). Transboundary sites are shared between
  countries and will double-count if handled naively; decide and record the rule.
- A country with zero sites is a real zero, not missing data. The coverage board must not
  show it as a gap.

**Phase 2 (deferred, sketched):** the famous sites themselves — a curated ~20-50 with a
name and the country, shown in the country panel, and the seed for a "which country is
this site in" round.

**Acceptance:** Sites-per-country is selectable in the Data Explorer and playable in Rank
the World and Top 10. The top ten match UNESCO's published figures when checked by hand.
The build either produces the real list or fails loudly.

---

## 47. Data Explorer lists must be readable on a phone without zooming

**REVIEW:** open the Data Explorer on your phone and read the list *without* zooming — then
zoom in and check the flag, the name and the value are still together. The Coverage view should
still scroll sideways as it did.

**✅ DONE 2026-10-10** — three changes. The name is back to 1rem at every width (it dropped to
0.88rem under 768px, which is what sent you to the zoom). At ≤480px the value stacks under the
name on the same left edge — rank 30px + flag 26px + two 12px gaps — so a magnified row keeps
both ends within a screen width. And the horizontal scroll is now scoped to the coverage table
(`.explore-list.is-coverage`), so a long country name can no longer widen a rank row off-screen.
Measured at 390px: no horizontal overflow on the list or the document, rows 64px tall (was ~40,
the cost of the second line). Rank the World's rows were checked at the same width and do not
share the fault, so they were left alone.

**What:** Make the ranked rows legible at phone width as they are, and keep a row
self-contained when the browser *is* zoomed — flag, name and value must not drift apart.

**Why:** Owner report (2026-10-10): *"i try to read the list better by zooming in to see
text. then i zoom in so i dont see flag on the left and value on the right."* The row is a
single flex line (`.explore-row`) with the value pushed to the far right, so browser zoom
widens it past the viewport and the two ends of the row stop being visible together. The
mobile rule set is two font-size tweaks (`css/style.css` ~2465) and the list is also
`overflow-x: auto`, which lets the row grow sideways rather than wrap.

**Approach / notes:**
- **Default type size is the actual bug.** `.explore-name` drops to 0.88rem under 768px
  and the rank column to 0.85rem — the zooming is a symptom. Fix the readable size first,
  then see whether the zoom problem remains.
- Keep the value on the same visual row as the name **or** stack it under the name at
  narrow widths — either is fine, as long as zooming cannot separate them. A stacked
  two-line row at ≤480px is the simplest version and needs no horizontal scroll at all.
- `overflow-x: auto` on `.explore-list` exists for the coverage table, which is genuinely
  wide (`width: max-content`). Scope the horizontal scroll to the coverage view so the
  rank list cannot scroll sideways at all.
- Same shape appears in the Rank the World result rows and the Top-N ladder — check them
  at the same widths and fix together if they share the fault.
- Verify at 390px and at 200% browser zoom on a real phone viewport, not just a narrow
  desktop window.

**Acceptance:** At 390px the rank list is comfortable to read with no zoom. At 200% zoom
the flag, name and value of a row are all still visible without scrolling sideways. The
coverage table keeps its horizontal scroll.

---

## 48. Data Explorer: a world map view

**REVIEW:** Data Explorer → **🗺️ Map**. Change the metric and watch the world re-shade;
hover a country for its figure; tap one for its panel; set the continent filter and check it
zooms to that continent and re-bands *within* it. Read the legend — the bands are equal-count,
so the edges are real values, not round numbers.

**✅ DONE 2026-10-10** — a fourth Explorer view, on the segmented control #51 built.

**Geometry is the draw game's own world** (`data/countries-*.json`, the 1600×1600
Mercator-conformal space), via a new `loadWorldOutlines()` in `js/geo-data.js` that
deliberately **ignores the pool rules**: the basemap draws every country so the world has no
Greenland-shaped hole when the territories toggle is off, and only the *shading* goes through
`inCountryPool()` and the continent filter. No mapping library, no second projection.

**Five equal-count bands, said out loud in the legend.** GDP and population are skewed enough
that an equal-width ramp paints the entire world the lowest colour and calls it a map, so the
edges are quantiles and the legend prints them as real values ($50.5M – $7.6B … $400B – $27.81T).
The ramp is viridis' bright half — its dark end disappears into this app's background, and a
band you cannot see is not a band. Two distinct greys: *no data* (in scope, no figure) and *not
in this filter*, which the hover label says in words.

**Hit-testing is colour-index picking**, not point-in-polygon: every country is drawn a second
time to an offscreen buffer in a colour that *is* its index, so a hover is one `getImageData` of
one pixel rather than a walk over ~250k vertices. The shaded world is then cached as a bitmap
and a hover only blits and strokes one outline — **ten hover moves went from 148ms to 14ms**.

Verified: the world shades for Total GDP; hovering gives "Canada — $2.20T"; Greenland reads
"not in this filter" with territories off; clicking opens Canada's panel; the Africa filter
zooms and re-bands to $690M–$487B; independence-year re-bands to 301–2011; at 390px the map box
takes the world's own proportions instead of letterboxing, with no horizontal overflow; all four
views still render; no console errors.

**Not in scope, as decided:** palettes, two-metric overlays and categorical layers.

**What:** A third Explorer view: the world map, countries shaded by the selected metric,
hover for the value and tap for the country panel.

**Why:** Owner request (2026-10-10): *"we start looking at having a data explorer that
looks at a world map so its easy to see high low, yes or no, or values."* A ranked list
tells you the order; a map tells you where the pattern is.

**Decided (owner, 2026-10-10):** baseline is **one metric at a time** — switch to map
view, pick a metric, see it. Palettes, two-metric overlays and categorical (non-numeric)
layers are not in scope for the first version.

**Approach / notes:**
- The geometry and the Mercator projection already exist (`js/geo-data.js`,
  `data/countries-*.json`, `data/shapes/`), as does a canvas that draws and hit-tests
  countries (`js/world-canvas.js`) with pinch-zoom. Reuse that path; do not introduce a
  mapping library.
- Shading: decide **quantile vs linear** deliberately and say which in the UI. GDP and
  population are so skewed that a linear ramp paints the whole world one colour — a
  quantile or log scale is almost certainly right, and a legend is not optional.
- Countries with no value for the metric need a distinct "no data" fill that cannot be
  mistaken for a low value.
- Respect `inCountryPool()` for *what is shaded*, but the basemap can still draw
  everything — an unplayable territory should not be a hole in the map.
- **View switching:** `this.view` is a two-way cycle today, rendered as a single button
  that flips between 📋 Coverage and ↩ Rankings (`js/data-explorer.js`). A third view
  (and #51's fourth) needs a real segmented control. Whichever of #48/#51 lands first
  owns that change.

**Acceptance:** Explorer → Map → any metric paints the world, with a legend, a no-data
colour, hover values on desktop and tap-to-panel everywhere. Works at 390px.

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

## 51. Browse the country shapes as a table

**REVIEW:** Data Explorer → **✏️ Shapes**. Scroll the outlines, sort by largest first, filter
to a continent, flip Territories on, and tap a row for the country panel. The thumbnails are
normalised to their own box, so this is shape and not size — the area column is there to say
what the picture cannot.

**✅ DONE 2026-10-10** — a third Explorer view, and with it the segmented view control the
entry said whichever of #48/#51 landed first would owe: Rankings / Shapes / Coverage, replacing
the two-way toggle button. **#48 inherits it.**

`drawSilhouette` was lifted out of `js/country-panel.js` into `js/silhouette.js` with a size
option rather than copied — the panel draws at 150px, the table at 48px, and there is still one
bbox-and-scale loop. 251 canvases are too many to paint up front, so each waits on an
`IntersectionObserver` (300px margin) that is torn down whenever the view re-renders.

Columns are outline, flag, name, continent (dropped under 480px) and land area with its rank.
Sorts A→Z / largest first / by continent; the continent filter and the territories toggle both
apply.

Verified: 197 rows with territories off, 251 with them on, built in 12ms; thumbnails paint as
they scroll; largest-first gives Russia, China, United States, Canada; a row opens the country
panel; the stacked value lines up with the name at 390px; no horizontal overflow; Rankings and
Coverage both still render; no console errors.

**It also makes #53 browsable.** St Helena, Åland, American Samoa and the other scattered-island
territories show up here as specks — exactly the symptom that entry describes, now something you
can scroll rather than something you have to be told.

**What:** A view listing every country's shape as a thumbnail beside its name, so the
shapes can be studied and compared without starting a round.

**Why:** Owner request (2026-10-10). The shapes are the heart of Draw the World and there
is no way to look at them — you can only meet one at a time, under time pressure, in a
round.

**Approach / notes:**
- The geometry exists per country in `data/shapes/<code>.json` (251 files) and the
  renderer already knows how to draw one to a canvas (`js/shape.js`, `js/geo-data.js`).
- Thumbnails: each shape drawn to its own small canvas, normalized to its bounding box so
  Russia and Monaco are both legible — at which point the table teaches *outline*, not
  size, and should say so. 251 canvases need lazy rendering (`IntersectionObserver`) or
  the view will stall on open.
- Columns worth having: shape, flag, name, continent, land area, and its rank in that
  metric. Sortable by name/area/continent; tap a row for the country panel.
- Respect `inCountryPool()` so the territories toggle behaves as everywhere else.
- **View switching:** see #48 — the Explorer's two-way view button needs to become a real
  segmented control before a fourth view lands.

**Acceptance:** Open the view, scroll every country's outline, sort it, and tap through to
a country panel. Opens without a visible stall at 390px.

---

## 52. Religion: keep the name when the Factbook gives no percentage

**What:** 30 entities show no religion at all because the Factbook names the religion
without quantifying it. Keep the name, and let the country panel render it without a bar.

**Why:** Found in the data review (2026-10-10). `parseReligion` in
`scripts/build-attributes.mjs` only writes the field when the parsed list is non-empty,
and the list needs percentages — so a known answer is discarded along with the missing
number. San Marino's Factbook entry is literally `"Roman Catholic"`; Sudan's is
`"Sunni Muslim, small Christian minority"`; Ukraine lists denominations with no shares.

**Approach / notes:**
- Affected (`hasReligion: false`, 30): `ax bl bq er gf gg gl gp gs io jg kn kp mf mp mq
  mv re sa sd sj sm tf ua va xa xc xo xt yt`. Not all are recoverable — Eritrea and North
  Korea are genuinely thin at source — so the build should report what it recovered.
- **Saudi Arabia is the awkward one.** Its only numbers live inside a parenthetical:
  `"Muslim (official; citizens are 85-90% Sunni and 10-12% Shia)"`. Those are a split
  *among citizens*, not a national share, so they must not be read as one. "Muslim", with
  no number, is the honest answer.
- **The blocker is the data shape, not the parse.** `js/country-panel.js` →
  `buildBreakdown()` renders `[{name, pct}]` as proportional bars; a row with no `pct`
  has no bar to draw and would divide by a wrong total. Decide between:
  (a) a separate `religionNames: [...]` field the panel renders as plain text, or
  (b) `pct: null` entries plus a `buildBreakdown` branch that lists rather than bars.
  (a) keeps the existing consumer honest and is probably right.
- `hasReligion` in `entities.json` then needs to mean "has *something*", or split into
  `hasReligion` / `hasReligionPct` so the Coverage board and `data-map.html` stay truthful.

**Acceptance:** San Marino, Sudan and Ukraine show a religion in the country panel. Saudi
Arabia shows "Muslim" with no fabricated percentage. The live check on `data-map.html`
still reports zero breakdowns over 105%.

---

## 53. Shapes: scattered island territories normalise to the ocean between them

**What:** St Helena ships a 39-point outline from either geoBoundaries release. Decide what
a territory made of far-apart islands should show, and build that.

**Why:** Found in the data review (2026-10-10), while fixing the outline tier — it is
pre-existing and unrelated to that change. St Helena, Ascension, Tristan da Cunha and Gough
are four comparably-sized islands spanning 32° of latitude. All four clear `CLIP_AREA_FRAC`
in `scripts/build-shapes.mjs`, so the normalising bounding box is mostly open ocean, each
island lands ~30px wide inside the 1000px box, and Douglas-Peucker flattens it. The full
release has 7,677 vertices and none survive.

**Approach / notes:**
- Confirmed for `sh`. Check `ki` (309 pts), `mh` (362), `fm` (316), `pf`, `mv` — same shape
  of problem, unverified.
- The options are a product call, not a tuning one: show only the principal island (loses
  the territory's real extent), keep the scatter but normalise per-island into a grid, or
  accept it and let these entities fall back to a single island by area.
- Whatever is chosen, `data/shapes/<code>.json` now records `src`, so the thin ones are
  listable: see the outline check on `data-map.html`.
- Do not solve it by loosening `CLIP_DEG` / `CLIP_AREA_FRAC` globally — those thresholds
  are what keep overseas territories out of every other country's outline.

**Acceptance:** St Helena's panel shows a recognisable island rather than a 39-point blob,
and no other country's outline changes.

---

## 54. Population double-counts where a de-facto state ships separately

**What:** `population` is declared `summable: true`, and some entities overlap. Decide which
questions must exclude the overlap, and enforce it where the flag is consumed.

**Why:** Found in the data review (2026-10-10). Cyprus's World Bank GDP per capita is 40%
above GDP ÷ population, and both inputs are 2023 — not year mixing. The Bank's Cyprus *GDP*
covers the government-controlled area (~958k people) while `SP.POP.TOTL` covers the whole
island (1.34M). Northern Cyprus also ships as its own entity (`xc`) with its own population
from Natural Earth, so "is A + B bigger than C?" (#37) can count the same people twice.

**Approach / notes:**
- The `summable` flag is declared in `scripts/build-datasets.mjs` and its contract is
  documented there; this is the one failure mode the declaration cannot catch, because each
  value is individually correct.
- Check the other de-facto states against their parents the same way: `xa` Abkhazia /
  Georgia, `xo` South Ossetia / Georgia, `xt` Transnistria / Moldova, `xs` Somaliland /
  Somalia, `eh` Western Sahara / Morocco. Their populations come from Natural Earth
  `POP_EST`; whether the parent's World Bank figure includes them has to be checked per case.
- Cheapest honest fix is probably a `overlaps: ['cy']` field on the de-facto entity in
  `entities.json`, and a rule in the combination-question builder that refuses a pair where
  one overlaps the other.
- The GDP-per-capita mismatch itself is the World Bank's and should be left alone — but it
  is worth a note in the country panel rather than looking like our arithmetic error.

**Acceptance:** A combination question can never pair an entity with one it overlaps. The
live "GDP per capita ≈ GDP ÷ population" check on `data-map.html` explains Cyprus rather
than just flagging it.

---

## 55. Flag colours for the 53 entities that have none

**What:** 53 of 252 entities have no entry in `data/flags.json`, so they are silently absent
from the Flag Color Quiz and the Flag Color Picker.

**Why:** Found in the data review (2026-10-10). `flags.json` is hand-curated — no script
writes it — so this is curation work that has simply never been done for the territories.
Most of them *do* have a flag image (the build's flagcdn probe finds 47 of 48 colour-less
entities have one), which is exactly the gap that confused the owner before: an entity can
show a flag everywhere and still be missing from the colour quizzes.

**Approach / notes:**
- The list is `entities.json` where `hasFlag: false` — the Coverage board and
  `data-map.html` both show it, and `hasFlagImage` tells you which have an image to work
  from.
- `jg` Channel Islands is an aggregate and has no flag at all. Leave it.
- The four de-facto states and `xs` Somaliland have no ISO code and ship bundled SVGs in
  `assets/flags/`; colours can be read off those.
- Colours are the *dominant* colours of the flag, 2–6 per entry — see any existing entry.
  Getting these wrong is worse than omitting them, because the colour quiz scores against
  them.
- Worth deciding whether the colour quizzes should respect `inCountryPool()` so territories
  only appear with the Territories toggle on, before adding 50 territories to the pool.

**Acceptance:** `hasFlag` coverage on `data-map.html` rises, and the colour quizzes still
only offer entities the territories toggle allows.

---

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
- **#26** Sizing-screen footer overlap — retired 2026-09-08, the screen was deleted by #35
- **#10** Push draw shape fidelity to Sporcle level — retired 2026-10-10, the same bar
  as #24, which the owner signed off on 2026-09-06
