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

---

## 71. Flag-colour review moves into Coverage; data-map becomes pipeline-only

**REVIEW:** `#/explore/coverage` — the **Colors** column now shows the curated colours
themselves instead of a tick, and checks each against that entity's own flag image as the
row scrolls into view. Turn **Territories: On** to see all 251. Scan the column beside the
flag thumbnail: 13 entities carry a ⚠ (Azerbaijan, Belize, Comoros, Dominica, Honduras,
Mauritania, Palau, Panama, Saint Vincent, Slovenia, Solomon Islands, South Sudan,
Uzbekistan), with the colour the image lacks ringed in red. Hover the ⚠ for what was not
found. Then open `/data-map.html` and check it still reads as a page about the *pipeline* —
the coverage table and flag board are gone from it.

**✅ DONE 2026-10-11** — Owner's call: this is in-app information, not something that
belongs on a page outside the app. Filling the last 52 colour gaps had left Coverage's
Colors column reading ✓ for all 251, so it had stopped carrying information; the question
had moved from "are there any" to "are they right".

The reader lives in `js/flag-colors.js` rather than being copied out of `data-map.html`,
with its thresholds and the evidence for them beside the code. Checks run through an
`IntersectionObserver` as rows scroll in, so the table renders as fast as before and an
unchecked row simply shows its swatches — absence of a warning is never a claim.
`datasets.js` gains `loadFlagColors`/`getFlagColors` so the quizzes and the board share one
loader. Verified against all 251: the in-app check reproduces the old board's worklist
exactly, same 13 entities.

`data-map.html` keeps the provenance graph, the cross-file integrity checks, the dated
review and the rebuild order — the things that are about the repo rather than about
countries.

**✅ Integrity checks moved too, 2026-10-11.** All 11 now run in the app, in a collapsed
health strip above the Coverage table — one line unless something wants attention, because a
wall of green ticks only pushes the table off screen. They are a different shape from the
flag colours ("religion totals ≤ 105%" is a statement about the dataset, not about one
entity), which is why a strip rather than a column.

The logic lives in `js/data-health.js` and is gone from `data-map.html`, so there is one
implementation rather than two that drift. Same verdicts as before the move: 8 pass, 3 to
look at (the World Bank disagreeing with itself about Cyprus and Cuba, and 12 pre-2020
figures shown undated).

---

## 70. Coverage: sortable columns and a gaps-only view

**REVIEW:** `#/explore/coverage?gaps=1&sort=exports` — opens straight into gap mode sorted
by exports. Toggle **Gaps only** off and on: 251×17 becomes 84×13 with Territories on,
30×11 with them off. Click any heading to pull that column's ✗ to the top, click again to
reverse. Check the URL updates and that reloading it restores the same view. Also
`#/explore/coverage` plain, to confirm the full board still reads as before.

**✅ DONE 2026-10-11** — Measured first: 4,267 cells, 460 missing, 167 entities with
nothing missing, 4 columns with no gap anywhere. So gap mode hides both — rows and
columns — and the reduction is about three quarters.

Aggregates drop out of gap mode before anything is measured: `jg` alone was keeping Geo,
Flag and Colors on screen, because it has none of them, because it is not a place.

Columns come from one table that the heading, the completeness maths and the cell all
read, so a new column cannot be added to one and forgotten in the others.

**✅ Expected gaps separated, 2026-10-11.** `build-datasets.mjs` records *why* each missing
metric value is missing, because only the build saw what the source answered — "nobody has
entered this" and "the source publishes nothing" are identical in the data and completely
different jobs. **439 of 439 missing metric values turn out to be explained by their source.**

The gap view therefore went from 84×13 to **20 rows × 2 columns** with territories on, and to
a single row with them off: Saint Kitts and Nevis, missing a religion breakdown. That is the
whole actionable gap in the standard country set.

Explained gaps render as a muted `–` with the reason on hover and do not count as gaps for
hiding or sorting; they stay visible on the full board so the write-offs can be audited. The
reasons are evidence, not assumption — each names the source and what it did, and says
*unavailable from the configured source*, never *unobtainable*: Taiwan's figures are absent
from the World Bank and present in the manual backfill, and that distinction is the point.

Getting there needed one fix of the same class as #52's: `parseIndependence` threw away
"none (overseas department of France)", so 53 territories looked like nobody had got round to
them when the Factbook had in fact answered. Ethiopia keeps a named exception — never
colonised, so there is no event to record — because a rule would have to over-reach to cover
one country, and over-reaching means silently writing off work that is doable.

**What to watch:** everything being explained is the expected result today, not a permanent
one. A new metric, or a source dropping a country, puts rows back. The reasons are rebuilt
from scratch on every `build-datasets` run, so they cannot rot into a lie.
---

## 79. Vatican City cannot be scored on size

**What:** Its world-scale polygon in `data/countries-europe.json` is seven points at one
coordinate — `[855.56, 553.95]` x7, area exactly 0 — so the size term can never be satisfied
and its map ghost is a degenerate point. `#/draw/country/va` scores 71 shape / 0 size / 81
placement = 53. Every other microstate is fine: Monaco, San Marino and Liechtenstein all reach
100.

**Why it is still here:** found measuring #73, which fixed everything else. One country of 197,
so it is not urgent — but it is the only row that is not 100 in Coverage's Draw column.

**Fix:** a minimum footprint in `build-geometry.mjs`, which also changes how it draws on the
world map, or drop it from the draw pool. Owner's call, not taken yet.

---

## 78. Tweak mode loses scores after a skip

**What:** Finishing Tweak mode rescores by position — `js/main.js:1342`,
`this.scores = this.playerShapes.map((shape, i) => …)` reading `itemData[i]` and
`referenceShapes[i]`. A skipped item pushes a score and a reference shape but **no** player
shape, so from the first skip onward `playerShapes[i]` is a different country's drawing than
`itemData[i]`. Two consequences: every drawing after the skip is rescored against the wrong
country, and `this.scores` is replaced by an array as short as `playerShapes`, so the skipped
row and the tail of the results table vanish.

**Repro:** any mode with the Skip button and **Tweak mode** on — `#/draw/quick3`, draw item 1,
skip item 2, draw item 3, then Finish out of the tweak stage.

**Why it is still here:** pre-existing, found while building #58 and deliberately left alone
there — #58 needed the drawing that belongs to a score, which it now carries as `score.drawn`,
and that is the fix for this too. Rescoring should walk `this.scores`, use each row's own
`drawn` shape and `code`, and leave a row without one untouched; `referenceShapes` can then be
indexed by the score row rather than by the shape.

**Not being fixed (owner, 2026-10-18):** *"we don't have to fix things here i never touched
tweak mode."* Kept because the diagnosis is the expensive part and nobody rediscovers this on
purpose — it reaches a reviewer as missing rows, not as an error. Pick it up only if Tweak mode
starts getting used.

**Acceptance:** with Tweak mode on and a skip in the middle, finishing the tweak stage leaves
every row scored against its own country and the results table keeps every row it had before.

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
- **#9** Draw the World: better default modes — Quick 3 now leads the menu — 2026-10-10
- **#40** Country name aliases ("UK", "UAE", "DRC") + the Explorer audit column — 2026-10-10
- **#41** "Your Scores": every preset you have played — 2026-10-10
- **#42** Metric descriptions on hover and tap — 2026-10-10
- **#43** Top 10 / Bottom 10: a "hide results" toggle — follow-ups in #59 — 2026-10-10
- **#44** Top-N picker: two more locks, and a roll hint that stops jumping — 2026-10-10
- **#45** Hub card icons — 🪜 for Top 10; Rank the World stayed 🏦 — 2026-10-10
- **#47** Data Explorer lists readable on a phone without zooming — 2026-10-10
- **#48** Data Explorer: a world map view — zoom and pan in #60 — 2026-10-10
- **#51** Browse the country shapes as a table — nameless grid in #61 — 2026-10-10
- **#56** Deep links: open any screen by URL — 2026-10-10
- **#57** Placement & results maps: a floor on zoom-out, and a pannable results map — 2026-10-11
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
- **#76** Placement: a small shape can always be grabbed to move — 2026-10-11 (written as #71; that number belongs to the Coverage entry the code cites)
- **#10** Push draw shape fidelity to Sporcle level — retired 2026-10-10, the same bar
  as #24, which the owner signed off on 2026-09-06
- **#52** Religion: keep the name when the Factbook gives no percentage — 2026-10-10
- **#53** Shapes: scattered island territories render as archipelagos — 2026-10-10
- **#54** Guard summed pairs against de-facto/claimant double-counting — 2026-10-10
- **#55** Flag colours for the 52 entities that had none — 2026-10-10
- **#58** Results: the five countries your drawing matched best — 2026-10-18
- **#72** Freestyle: draw anything, find out what it is — 2026-10-18
- **#73** Scoring: a perfect drawing could score zero (bbox framing, sub-pixel islands, placement centroid) — 2026-10-18
- **#77** Reach any country, and any toggle, from a URL — 2026-10-18
