# Rank Line Mode — Design

**Date:** 2026-06-20
**Status:** Approved, ready for implementation planning
**First dataset:** Total GDP (nominal)

## Summary

A new, self-contained mini-game mode in the "place on the line" / *Timeline* style.
The player is handed one country at a time and must drag it into the correct
position on a sorted line, ranking it relative to countries already placed. The
goal is learning real-world magnitudes (the first dataset is total national GDP).

The engine is **dataset-agnostic**: it is driven by a dataset config (entries +
value format + sort direction). GDP ships first; years, population, or any other
numeric-per-country dataset can be added later with no engine changes.

## Goals

- Teach the relative magnitudes of countries on a chosen metric (start: GDP).
- Reusable engine for any "rank these by a number" dataset.
- Match the existing codebase patterns (self-contained mini-game like `flag-game.js`).
- Work on desktop and mobile.

## Non-Goals (YAGNI)

- No dataset-picker submenu yet. One GDP dataset ships; the data structure
  supports multiple datasets for later.
- No per-dataset difficulty settings or country-pool curation.
- No integration with the drawing / transform / world canvases. This is a fully
  independent mini-game (like the flag quiz).

## Architecture

Follows the `flag-game.js` precedent exactly:

- `js/rank-line-game.js` — exports a `RankLineGame` class.
- `index.html` — a new `<div id="screen-rank-line" class="screen">` containing a
  `<div id="rank-line-container">` that the class renders into.
- `css/style.css` — styles for the line, cards, drag/drop, lives, results.
- `js/main.js` — instantiates `RankLineGame` (container element + a
  return-to-menu callback), adds a `startRankLine()` method, and wires a new
  menu button. Mirrors how `FlagGame` is wired (constructor, `STATES` entry,
  `screens` map entry, `_bindEvents` button, `_replay` branch,
  `_updateHighScoreDisplay` badge).

The class owns its full lifecycle: data loading, round flow, drag/drop, scoring,
results, and the menu return callback. It reuses shared utilities:
`high-scores.js` (`saveScore` / `getHighScore`) and `sounds.js`
(`playPlace`, `playSkip`, `playScoreReveal`, `playClick`).

## Data

### File: `data/economy.json`

```json
{
  "datasets": [
    {
      "id": "gdp-nominal",
      "name": "Total GDP",
      "blurb": "Nominal GDP, latest year (World Bank)",
      "format": "currency-short",
      "higherFirst": true,
      "source": "World Bank NY.GDP.MKTP.CD",
      "year": 2023,
      "entries": [
        { "code": "us", "name": "United States", "value": 27360000000000 },
        { "code": "cn", "name": "China",         "value": 17790000000000 }
      ]
    }
  ]
}
```

- `code` is the **ISO 3166-1 alpha-2** code (lowercase), so each country can show
  its flag via `flagcdn.com` images — the same source the flag quiz already uses.
- `value` is a raw number in the dataset's native unit (USD for GDP).
- `format` selects a display formatter (see below).
- `higherFirst: true` means the largest value sits at the **top** of the line.

### Sourcing

During implementation, fetch nominal GDP from the World Bank API
(`https://api.worldbank.org/v2/country/all/indicator/NY.GDP.MKTP.CD?format=json&date=<latest>&per_page=400`),
take the most recent non-null year per country, map ISO3 → ISO2, drop aggregates
(regions/income groups, not real countries), and write `data/economy.json`. The
JSON is committed to the repo — no runtime build step. Target ~190 countries.

### Value formatters (in the engine)

- `currency-short` → `$27.4T`, `$110B`, `$4.5B`, `$220M`
- `year` → `1776` (for future datasets)
- `number` → `1,402,000,000` with thousands separators
- `percent` → `4.2%`

Only `currency-short` is exercised by the GDP dataset; the others exist so future
datasets work without engine edits.

## Gameplay

### Setup

- Player has **3 lives** (❤️❤️❤️).
- The pool is the full dataset (~190 countries).
- One random country is **auto-placed** on the line as the seed, with its real
  value revealed. The seed does not count toward the score.

### Turn loop

1. A **card** for the next random country (not yet drawn this run) appears in a
   tray. The card shows the country's flag + name, but **not** its value.
2. The line is a **vertical sorted axis**: highest value at top, lowest at
   bottom. It scrolls within its panel as it grows.
3. Insertion **gaps** exist above the top entry, between each pair, and below the
   bottom entry. As the player drags the card, the gap under the pointer
   highlights.
4. The player **drops** the card into a gap = their guess at the rank position.

### Resolution

- **Correct gap** (the card's true value falls within that gap's value range):
  - Card locks into the line, real value revealed.
  - No life lost. `playPlace()`. Score +1. Continue.
- **Wrong gap**:
  - Lose one life. `playSkip()`.
  - The card **snaps to its correct position** on the line anyway (real value
    revealed), so the line remains a truthful reference for subsequent guesses.
  - Brief visual indication of the correct slot vs. the chosen slot.
- **0 lives** → run ends, go to results.

The run is **endless** otherwise (no target cap). High score = longest correct
run.

### Why "snap to correct on wrong"

The line is the player's reference for every future guess. If a wrong guess left
the card in the wrong spot (or discarded it), the line would misrepresent the
true order and corrupt later rounds. Snapping to the correct slot keeps the line
honest while still penalizing the mistake with a lost life.

## Scoring & Results

- Score for a run = count of **correctly placed** countries (seed excluded).
- High score stored via `saveScore('rank-line-gdp-nominal', runLength, ...)`;
  longest run wins. A best badge shows on the menu button via
  `_updateHighScoreDisplay` (key `rank-line-gdp-nominal`).
- Results screen shows:
  - Final run length + a grade band (e.g. "Economist!", "Solid run", etc.).
  - "New high score" note when applicable.
  - The full final ranked list with flags + real values, so the player learns
    the actual numbers.
  - Play Again / Menu buttons.

## UI / Interaction details

- **Line:** vertical, scrollable, sorted with highest at top. Each placed row:
  flag, name, formatted value. The most recently placed row is briefly
  highlighted.
- **Card:** the to-be-placed country, draggable. Pointer + touch drag both
  supported (the game is drag-heavy already; touch support is expected).
- **Lives:** a ❤️ row in the header, depleting on wrong guesses.
- **Header:** title, current run length, lives, Menu button.
- **Mobile:** vertical line + touch-drag fits narrow screens; gaps are large tap/
  drop targets.

## Menu integration

- New button under the existing **Mini Games** section in `index.html`, styled
  like `btn-flag-quiz`. Working title 🏦 **"Rank the Economies"** /
  `id="btn-rank-line"`.
- `main.js`: `STATES.RANK_LINE = 'rank-line'`, `screens['rank-line']` entry,
  `startRankLine()` (loads data, shows screen, calls `rankLineGame.start()`),
  `_bindEvents` click handler, `_replay` branch, and high-score badge.

## Reuse / extensibility

To add a new dataset later (e.g. independence year):

1. Add an entry to `data/economy.json` `datasets` (or a new JSON file) with its
   `entries`, `format`, and `higherFirst`.
2. Optionally add a menu button (or a dataset picker) that calls
   `start(datasetId)`.

No changes to `RankLineGame`'s game logic are required — only data and a way to
select it.

## Files touched

- `data/economy.json` — new, generated from World Bank data.
- `js/rank-line-game.js` — new, the engine.
- `js/main.js` — wire-up (button, state, start, replay, high-score badge).
- `index.html` — menu button + screen container.
- `css/style.css` — mode styles.
