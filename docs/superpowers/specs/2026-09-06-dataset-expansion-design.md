# Dataset expansion: economy, energy, history, relations

Design for eight new data points requested by the owner (2026-09-06), targeting the
Data Explorer and Rank the World. Two of them introduce data *shapes* the app has
never had: country→country relations, and time-ranged history.

Owner decisions recorded under **Decided**. Superseded options are kept where the
reasoning matters, so a future session doesn't re-litigate them.

---

## Goals

Add, in rough order of value-per-effort:

1. **Export share of GDP** — exports ÷ GDP, as a rankable percentage.
2. **Electricity generation mix** — coal / nuclear / hydro / wind / solar / gas / oil /
   bio, as a per-country breakdown *and* as derived rankable percentages.
3. **Founded year** — two separate datasets (see Decided).
4. **Top export commodities with percentages** — "30% oil", with product icons.
5. **Biggest trade partner** — "the countries this country trades with the most".
6. **Country emblems** — coat of arms, shown in the country panel.
7. **Historical territories** — which kingdoms/empires held today's land, and when.

Explicitly **out of scope**: "biggest enemy" / hostile foreign relations. See Decided.

## Non-goals

- No new game mode. These feed the existing Data Explorer, Rank the World and the
  country panel. A "guess the electricity mix" mode is a separate future item.
- No change to the draw/place/score pipeline.
- No runtime data fetching. Every source is resolved at build time into committed
  JSON, matching how `datasets.json` and `attributes.json` already work.

---

## Decided

- **Founded year is two datasets, not one.** `independence-year` is derived
  automatically from the Factbook and ships first; `statehood-year` ("oldest
  continuous statehood") is hand-curated and ships last. They rank very differently
  — Sweden is 1523 by independence and ~970 by statehood — and that disagreement is
  itself interesting to browse. Shipping the automatic one first also de-risks the
  curated one: the format, the UI and the ranking behaviour are all proven before
  anyone hand-researches 200 dates.
- **Electricity comes from Ember, not the Factbook.** The Factbook reports *installed
  capacity* — the nameplate rating of the plants a country built. Ember reports
  *generation* — the electricity actually produced. These differ systematically:
  a 1 GW solar farm generates for ~10–20% of the year's hours, a 1 GW nuclear plant
  for ~90%, so capacity share overstates solar/wind and understates nuclear/coal/gas.
  "This country runs on nuclear" is a claim about generation. An earlier draft of this
  design proposed shipping the Factbook numbers first because Ember looked like a
  heavier integration; that was wrong — Ember arrives as a single 560 KB CSV from Our
  World in Data with the shares pre-computed, which is a *smaller* integration than
  regex-parsing `"28.6% of total installed capacity (2023 est.)"` out of Factbook
  prose. No interim Factbook version will be built.
- **"Biggest enemy" is skipped.** The owner's call. The relations data shape built for
  trade partners is deliberately general enough to hold hostile pairs later, so
  reversing this decision is additive rather than a rewrite.
- **Historical territories are auto-derived, then hand-fixed for the top ~50.**
  Full automated coverage everywhere, then manual correction for the countries people
  actually open. Year ranges stay snapshot-granular until curated, and the data model
  records which is which so the UI can hedge honestly.
- **Emblems hotlink Wikimedia Commons**, exactly as flags already hotlink flagcdn.
  Zero repo weight. Some state emblems are legally restricted rather than freely
  licensed; those are skipped rather than bundled. *(Owner did not answer this
  directly — assumption made to keep implementation moving, and reversible.)*

---

## Where each item lands

Three shapes already exist in the codebase and absorb six of the eight items.

| Item | Shape | Source | Wave |
|---|---|---|---|
| Export share of GDP | rankable dataset | World Bank `NE.EXP.GNFS.ZS` | 1 |
| Independence year | rankable dataset | Factbook `Independence` | 1 |
| Electricity mix | breakdown attribute | Ember via OWID | 2 |
| % nuclear / coal / renewable | 3 rankable datasets | derived from the above | 2 |
| Biggest trade partner | **new: relation** | Factbook `Exports - partners` | 3 |
| Emblems | **new: image asset** | Wikidata `P94` → Commons | 3 |
| Top exports + % | breakdown attribute | OEC | 3 |
| Oldest statehood | rankable dataset | hand-curated | 4 |
| Historical territories | **new: time-ranged relation** | historical-basemaps ∩ our polygons | 4 |

### Existing shape 1: rankable dataset

An entry in `datasets.json.datasets[]`: `{ id, name, blurb, format, higherFirst, values }`
where `values` maps ISO2 → number. The Data Explorer and Rank the World consume these
generically, so a new dataset needs **no UI work at all** — it appears in both the
moment it exists. `higherFirst: false` is already supported end-to-end
(`js/datasets.js:93`, `js/rank-line-game.js:312`), which is what `independence-year`
needs to rank oldest-first.

### Existing shape 2: breakdown attribute

`attributes.json` already holds `religion: [{name, pct}, ...]` plus a `religionRaw`
provenance string, rendered as a labelled bar in the country panel. Electricity mix and
top exports are structurally identical and reuse that renderer.

### Existing shape 3: hotlinked image

Flags are `https://flagcdn.com/w320/{code}.png`, built as a URL from the code with an
`onerror` handler hiding the element (`js/country-panel.js`). Emblems follow the same
pattern against Commons, differing only in that the filename is per-country data rather
than derivable from the code.

### New shape 1: relations

`data/relations.json`, keyed by code:

```json
{ "relations": { "se": { "exportPartners": [
  { "code": "de", "pct": 10 }, { "code": "us", "pct": 10 }, { "code": "dk", "pct": 8 }
] } } }
```

Rendered in the country panel as flag + name + share rows. Each row calls
`openCountryPanel(code)`, which makes the panel **navigable for the first time** —
you can walk from Sweden to Germany to its partners. That is a genuine UX gain beyond
the data itself.

The top-level key is `exportPartners` rather than something like `partners` precisely
so `importPartners` and (if the owner ever reverses the skip) `noRelationsWith` can be
added as sibling keys without touching consumers.

### New shape 2: timeline

`data/history.json`, keyed by code:

```json
{ "history": { "se": [
  { "name": "Kalmar Union", "from": 1397, "to": 1523, "confidence": "curated" },
  { "name": "Swedish Empire", "from": 1611, "to": 1721, "confidence": "derived" }
] } }
```

`from`/`to` are signed integers so BC years are negative. `confidence` is `"derived"`
(spatial intersection, snapshot-granular, approximate) or `"curated"` (hand-checked).
The UI renders derived rows with a hedge — a lighter bar and an "approximate" title —
so the app never asserts more precision than it has.

Rendered as horizontal bars on a shared time axis.

---

## Build pipeline

Each source gets its own script writing its own file, so a failing or rate-limited
upstream can never block the others. This mirrors the existing split between
`build-datasets.mjs` and `build-attributes.mjs`.

```
build-datasets.mjs     -> data/datasets.json    (World Bank + manual + derived merge)
build-attributes.mjs   -> data/attributes.json  (Factbook: capital, religion, independence)
build-electricity.mjs  -> data/electricity.json (Ember)          [new]
build-trade.mjs        -> data/relations.json   (Factbook partners + OEC products) [new]
build-emblems.mjs      -> data/emblems.json     (Wikidata P94)   [new]
build-history.mjs      -> data/history.json     (historical-basemaps) [new]
build-entities.mjs     -> data/entities.json    (registry + coverage flags)
```

### Derived datasets and build ordering

`independence-year` is parsed by `build-attributes.mjs` but has to *end up* in
`datasets.json` to be rankable. Same for the electricity percentages, which are
computed from `electricity.json`.

Rather than adding a separate merge script with fragile ordering, **`build-datasets.mjs`
merges derived datasets at the end of its run**, reading `attributes.json` and
`electricity.json` if they are present and skipping with a warning if not. This keeps
one owner for `datasets.json` and tolerates any build order.

This is the same convergence pattern the repo already uses: `build-attributes.mjs`
reads `entities.json`, `build-entities.mjs` optionally reads `attributes.json` in a
`try/catch`. The graph is cyclic and resolved by re-running, not by strict ordering.

Recommended full order: `attributes → electricity → datasets → entities`.

### Coverage flags

`build-entities.mjs` gains `hasElectricity`, `hasEmblem`, `hasPartners`, `hasHistory`
alongside the existing `hasCapital` / `hasReligion`, so the Coverage audit board keeps
showing the truth about what is and isn't populated.

---

## Formats

Two new value formatters in `js/datasets.js`:

- `year` — renders `1523`, and negative values as `3100 BC`. Used by both founded-year
  datasets. Must not thousands-separate (`1,523` is wrong for a year).
- `percent` already exists and covers export share and the electricity percentages.

---

## Waves

Each wave is independently shippable and independently valuable.

**Wave 1 — trivial numerics.** `export-share-gdp` (one line in the `INDICATORS`
table) and `independence-year` (Factbook parse + derived merge + `year` formatter).
Both appear in Explorer and Rank with no UI work.

**Wave 2 — energy.** `build-electricity.mjs`, the breakdown in the country panel, and
three derived rankables (`elec-nuclear-pct`, `elec-coal-pct`, `elec-renewable-pct`).

**Wave 3 — panel richness.** Trade partners (new relations shape + clickable panel
navigation), emblems, and top export products. Carries the one real unknown.

**Wave 4 — the expensive ones.** Curated `statehood-year`, and historical territories.
Not started until the owner has seen waves 1–3 land.

---

## Risks

- **OEC country-code format is unresolved.** The v2 tesseract API answers
  unauthenticated (probed: HTTP 200 on the BACI HS6 cube), but a filtered query
  returned zero rows, and their cube listing returned non-JSON. Timebox a spike before
  committing wave 3's product shares. **Fallback:** Factbook `Exports - commodities`
  gives the top five product *names* with no percentages — the list survives, the bar
  chart does not.
- **Name matching, everywhere.** Every new source names countries its own way. The repo
  already has the answer — `build-attributes.mjs`'s `strip`/`flip`/`NAME_ALIAS` triple
  plus an explicit unmatched report. Reuse it rather than reinventing per script, and
  never silently drop an unmatched row.
- **Historical polygon labels are inconsistent** across snapshots ("Ottoman Empire" vs
  "Ottomans"), which will fragment year ranges. The curated pass over the top ~50 is
  the mitigation, and `confidence` makes the gap visible rather than hidden.
- **Emblem licensing.** Coats of arms are frequently *not* freely licensed even when
  the country is otherwise well covered. Skipping is correct; the coverage board will
  show the holes.
- **Ember covers fewer entities than the World Bank** — no territories, no de-facto
  states. Expect gaps against the territories toggle. Gaps are normal here; every
  dataset already has them and the UI handles missing values.

## Acceptance

- Every new rankable dataset appears in both the Data Explorer and Rank the World
  without bespoke UI code, and sorts in the correct natural direction.
- The country panel shows electricity mix, top exports, trade partners and the emblem
  where data exists, and degrades cleanly to nothing where it doesn't.
- Trade-partner rows are clickable and open that country's panel.
- Every build script reports unmatched source rows rather than dropping them silently.
- No runtime fetch beyond the committed JSON and the two hotlinked image CDNs.
