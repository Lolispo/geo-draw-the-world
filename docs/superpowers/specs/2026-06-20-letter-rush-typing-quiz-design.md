# Letter Rush — Sporcle-style typing quiz (design)

**Date:** 2026-06-20
**Status:** Approved design, pre-implementation

## Summary

A new timed typing game mode. Each round picks a random letter (e.g. "C"); the
player types as many geographic answers **starting with that letter** as they
can before the timer runs out. Four answer categories are live at once under a
single shared input: **Countries, World Capitals, US States, US State
Capitals**. A correct answer instantly clears the input (Sporcle-style) and
fills in on screen.

The mode lives alongside the existing standalone game modes (Draw, Rank, Flag
Quiz, Flag Picker, Data Explorer) as a self-contained ES-module class, launched
from a hub card.

## Decided gameplay

- **Core loop:** one random letter per round, all four categories scored
  together under one timer and one input box. Goal: clear as many entries across
  all categories as possible.
- **Letter selection:** random each round, **weighted by how many total answers
  the letter has** across the four categories. Letters with fewer than a
  threshold (3) total answers are excluded so rounds are never trivial.
- **Match rule:** "starts with" only at launch. The matching engine is written
  so "ends with" / "contains" can be added later as a per-round rule without
  data changes.
- **Timer:** scales with answer count — roughly **5 seconds per possible
  answer**, clamped to **[120s, 360s]**. Computed once when the round starts and
  shown as a fixed countdown (e.g. "Letter C — 47 answers · 3:55").
- **End conditions:** timer reaches 0 **or** all answers found.
- **Found display:** correct answers appear live in their category section as
  they're typed (classic Sporcle). Per-category `found / total` counters always
  visible.
- **High score:** **best per-letter** (26 independent bests, A–Z) stored in
  localStorage. Score = total entries found that round. Results screen highlights
  a new per-letter record.
- **Hub name:** **Letter Rush**, icon ⌨️.

## The Sporcle input

A single auto-focused text field. On **every keystroke** (`input` event), the
current text is normalized and looked up in a precomputed map.

- **On match to an un-found entry:** mark it found, **clear the input
  immediately**, play a success sound, animate the entry filling in, update
  counters.
- **No match / partial:** do nothing (let the player keep typing).

### Normalization (covers all stated requirements)

```js
function normalize(s) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics: São Tomé → sao tome
    .replace(/[^a-z0-9]/g, '');      // strip all separators/punct: south korea → southkorea
}
```

- Case-insensitive.
- Diacritic-insensitive (`São Tomé` → `saotome`, `Bogotá` → `bogota`).
- Separator-insensitive (`south korea`, `southkorea`, `south-korea`,
  `south  korea` all collapse to `southkorea`).

### Aliases / multiple spellings

Each entry carries an `aliases` array. Every alias is normalized into the same
lookup target as the canonical name. Examples:

- Democratic Republic of the Congo ← `DRC`, `DR Congo`, `Congo-Kinshasa`
- United States ← `USA`, `US`, `United States of America`
- United Kingdom ← `UK`, `Great Britain`, `Britain`
- United Arab Emirates ← `UAE`

### Collision handling — credit all matches

A single typed string credits **every** entry it matches across all categories.
Example: typing `georgia` on letter "G" fills **both** the Countries slot
(Georgia the country) **and** the US States slot (Georgia the state), because
they are two distinct entries. This falls out naturally from the
one-input/all-categories model and is the desired behavior.

Implementation: the lookup map maps `normalizedKey -> [entryRef, ...]` (an array,
not a single ref), so one keystroke can resolve to multiple entries.

## Screen layout

### Intro / start (brief)
Reveal the letter and the computed timer, then a "Start" affordance (or auto-start
after a short countdown). Keep it light — the randomness is the hook.

### During play
- **Header:** the big letter, the countdown timer, total found across categories.
- **Input box** (auto-focused; re-focuses after each match).
- **Four category sections**, each with:
  - Label + icon + `found / total` counter (total visible, Sporcle-style).
  - Found answers rendered as they're typed; remaining shown as blanks/slots.
- Mobile: stacked sections, input pinned near the top so the on-screen keyboard
  doesn't cover it.

### Results
- Per-category lists of **found vs missed**, with missed answers revealed.
- Total found, and a **new-record** celebration when the per-letter best is beaten.
- Actions: play again (new random letter) and back to hub.

## Data

### New file: `data/typing-categories.json`

Self-contained, category-agnostic shape so future categories (rivers, mountains,
world leaders, …) are a pure data addition with no code change:

```json
{
  "categories": [
    {
      "id": "countries",
      "label": "Countries",
      "icon": "🌍",
      "entries": [
        { "name": "Democratic Republic of the Congo",
          "aliases": ["DRC", "DR Congo", "Congo-Kinshasa"] },
        { "name": "Chad", "aliases": [] }
      ]
    },
    { "id": "world-capitals",     "label": "World Capitals",     "icon": "🏛️", "entries": [ /* ~195 */ ] },
    { "id": "us-states",          "label": "US States",          "icon": "🇺🇸", "entries": [ /* 50 */ ] },
    { "id": "us-state-capitals",  "label": "US State Capitals",  "icon": "🏙️", "entries": [ /* 50 */ ] }
  ]
}
```

### Sourcing the data

- **Countries (~195):** baked into the file from the existing country list
  (`data/datasets.json` / `data/entities.json` names), with an alias pass for the
  common multi-spelling cases (DRC, USA, UK, UAE, South/North Korea, Czechia/
  Czech Republic, Myanmar/Burma, Cape Verde/Cabo Verde, etc.). Pre-baked rather
  than re-derived at runtime so the file is the single source of truth for the
  quiz and the engine stays generic.
- **World capitals (~195):** new, authored from a country→capital reference.
  Aliases for known alternates where relevant.
- **US states (50):** new static list.
- **US state capitals (50):** new static list.

A small one-off generator script under `scripts/` may be used to assemble the
countries section from existing data + an alias supplement, but the committed
artifact is the static JSON.

## Code

### New module: `js/typing-quiz-game.js`

Exports `class TypingQuizGame` mirroring `RankLineGame` / `FlagPickerGame`:

- `constructor(containerEl, onFinish)` — `onFinish` returns to the hub.
- Loads `data/typing-categories.json` once (lazy, cached).
- `start()` — pick weighted-random letter, build the per-round lookup map and
  slot lists, compute the timer, render, focus input, start countdown.
- Internal: `_buildIndex()` (normalizedKey → [entryRef]), `_onInput()`,
  `_onMatch()`, `_tick()`, `_renderPlay()`, `_renderResults()`.
- High scores via existing `high-scores.js` (`getHighScore` / `saveScore`) with
  per-letter keys (e.g. `letter-rush:C`).
- Sounds via existing `sounds.js` (`playScoreReveal`/`playPlace` on match,
  `playClick`, end sound).

### Wiring

- `index.html`: new hub card `btn-activity-letter-rush` and a
  `screen-typing-quiz` screen with a `typing-quiz-container`.
- `js/main.js`: import + instantiate `TypingQuizGame`, register the screen,
  add a `startLetterRush()` launcher and the hub button listener, include in the
  replay/back routing.
- `css/style.css`: styles for the play screen (header, input, category sections,
  found/blank slots) and results, responsive/mobile.

### Matching engine details

- Build `Map<normalizedKey, EntryRef[]>` for the active letter only (filter
  entries whose normalized canonical name starts with the normalized letter).
  Aliases that start with the letter also key in; aliases are matched but the
  **canonical** name is what's displayed.
- A `Set` of found entry ids prevents double-counting and drives the
  "already found" state.
- Keystroke handler is O(1) map lookup — no scanning.

## Out of scope (future, architecture-ready)

- "Ends with" / "contains" rule variants (per-round rule param).
- Additional categories (rivers, mountains, leaders, etc.) — pure JSON additions.
- Player-chosen letter, difficulty presets, global/online leaderboards.

## Acceptance

- Hub shows "Letter Rush"; launching gives a random weighted letter with a
  count-scaled timer.
- Typing a correct answer (in any of the 4 categories) clears the input
  instantly, plays a sound, and fills the slot live.
- Aliases work (`drc` → DRC entry); separators/diacritics ignored
  (`southkorea` == `south korea`, `bogota` == `Bogotá`).
- `georgia` credits both the country and the US state.
- Round ends on timer or full clear; results reveal missed answers per category;
  beating the per-letter best is recorded and celebrated.
- No regression to existing modes or load time.
