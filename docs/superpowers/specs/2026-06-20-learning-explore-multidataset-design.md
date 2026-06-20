# Learning/Explore Section + Multi-Dataset Support — Design

**Date:** 2026-06-20
**Status:** Approved, implementing

## Summary

Add a **Learning / Explore** section to the main menu for browsing the datasets
we collect (ranked country lists with a continent filter and sort toggle), and
generalize the single-GDP data file into a **multi-dataset** model used by both
the new explorer and the existing Rank line game. Add four datasets beyond Total
GDP: Population, GDP per capita, Land area, Life expectancy. The line game gets a
dataset picker so any dataset is playable.

## Data model

Replace `data/economy.json` with **`data/datasets.json`**, normalizing country
metadata once:

```json
{
  "continents": ["Africa","Asia","Europe","North America","South America","Oceania"],
  "countries": { "us": { "name": "United States", "continent": "North America" } },
  "datasets": [
    { "id":"gdp-nominal", "name":"Total GDP", "blurb":"Nominal GDP (World Bank)",
      "format":"currency-short", "higherFirst":true,
      "values": { "us": 27360000000000 } }
  ]
}
```

- `code` = ISO 3166-1 alpha-2 (lowercase) → flags via flagcdn, joins across datasets.
- Country `name` + `continent` stored once under `countries`; each dataset is `code → value`.
- Datasets: `gdp-nominal`, `population`, `gdp-per-capita`, `land-area`,
  `life-expectancy`. All `higherFirst: true`.

### Sourcing (build script, committed output)

`scripts/build-datasets.mjs` fetches at build time and writes `data/datasets.json`:
- World Bank indicators (most-recent non-empty value per country):
  `NY.GDP.MKTP.CD`, `SP.POP.TOTL`, `NY.GDP.PCAP.CD`, `AG.LND.TOTL.K2`,
  `SP.DYN.LE00.IN`.
- World Bank `/country` for names + to drop aggregates (region === "Aggregates").
- Continent per ISO2 from REST Countries (`fields=cca2,continents`), static
  fallback map if unreachable. Antarctica omitted.

## Shared loader — `js/datasets.js`

Single source both features consume:
- `loadDatasets()` — fetch + cache `data/datasets.json`.
- `getDatasetList()` / `getDataset(id)` — dataset configs.
- `getContinents()`.
- `getEntries(id, { continent, higherFirst })` → sorted `[{code,name,value,continent}]`.
- `formatValue(format, value)` — formatters: `currency-short` ($27.4T / $81k),
  `number-short` (1.41B / 331M), `area-km2` (17.1M km² / 377,975 km²),
  `years` (84.5 yrs), `number`, `percent`.

## Learning view — `js/data-explorer.js`

Self-contained module (flag-game / rank-line pattern): `screen-explore` container,
menu callback. Top controls: **dataset** dropdown, **continent** filter
(All + each continent), **sort** toggle (high→low / low→high). Below: ranked list
of `#`, flag, name, formatted value, reranking live on control change. Read-only.
A **"Rank this →"** button starts the line game on the currently viewed dataset.
Mobile: list + stacked controls.

## Line game changes — `js/rank-line-game.js`

- Use `js/datasets.js` for loading/entries/formatting (remove its private fetch +
  formatters; keep game logic).
- Menu button **"Rank the Economies" → "Rank the World"**; clicking shows a
  **dataset picker** (datasets + per-dataset best-run badge), then `start(id)`.
- Per-dataset high score key `rank-line-<id>` (already wired).

## Menu + wiring

- New **"Learn & Explore"** menu section with 📊 **"Data Explorer"** (`btn-explore`).
- `main.js`: `STATES.EXPLORE`, screens entry, `DataExplorer` instance, start method,
  button binding; line-game button opens the picker; `_replay`/high-score badges.
- `index.html`: section + button + `screen-explore`; line-game picker screen/overlay.
- `css/style.css`: explorer + picker styles (reuse rank-line list styles).

## Files

- `data/datasets.json` — new (generated); `data/economy.json` removed.
- `scripts/build-datasets.mjs` — new generator.
- `js/datasets.js` — new shared loader/formatters.
- `js/data-explorer.js` — new Learning view.
- `js/rank-line-game.js` — refactor to shared loader + add picker.
- `js/main.js`, `index.html`, `css/style.css` — wiring.

## Scope / YAGNI

No search, favorites, charts, or editing. 5 datasets only. Antarctica omitted.
Countries missing a continent still appear under "All", filtered out of specific
continents.
