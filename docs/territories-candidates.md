# Territories candidate list (TODOS #20)

Read-only survey of autonomous/dependent/de-facto entities we do **not** currently
have, with feasibility per source. Built 2026-07-22 by diffing `mledoze/countries`
(ISO-coded, with capitals) against `data/entities.json`, probing flagcdn for images,
and checking Natural Earth 1:10m for geometry. **No entities added yet** — this is the
list to pick an inclusion cutoff from.

Feasibility columns: **Flag** = flagcdn image exists · **Geo** = Natural Earth 1:10m
has a shape (⇒ drawable + panel silhouette) · **Cap** = capital known (all below have one).

## Tier 1 — ISO code + flag + capital + geometry (drop-in, easiest)

Everything the pipeline needs is present. Note **Vatican City is a sovereign UN-observer
state we're simply missing** — arguably belongs in the *standard* pool, not behind a toggle.

| code | name | capital | note |
|---|---|---|---|
| **va** | **Vatican City** | Vatican City | **sovereign — real gap, add to main set** |
| ai | Anguilla | The Valley | UK |
| ax | Åland Islands | Mariehamn | Finland |
| ck | Cook Islands | Avarua | NZ associated |
| gg | Guernsey | St. Peter Port | Crown dependency |
| je | Jersey | Saint Helier | Crown dependency |
| ms | Montserrat | Plymouth | UK |
| nu | Niue | Alofi | NZ associated |
| nf | Norfolk Island | Kingston | Australia |
| pn | Pitcairn Islands | Adamstown | UK |
| bl | Saint Barthélemy | Gustavia | France |
| sh | Saint Helena, Asc. & Tristan | Jamestown | UK |
| pm | Saint Pierre and Miquelon | Saint-Pierre | France |
| wf | Wallis and Futuna | Mata-Utu | France |
| io | British Indian Ocean Terr. | Diego Garcia | UK (disputed w/ Mauritius) |
| tf | French Southern & Antarctic | Port-aux-Français | France (near-uninhabited) |

## Tier 2 — ISO code + flag + capital, but NO Natural Earth geometry

Addable to the data layer / showcase panel / quiz, but **no drawable shape** (the French
overseas départements are folded into France in NE; would need separate sourcing —
geoBoundaries/OSM, ties to #21's fallback plan). Would show "no shape" in the panel.

| code | name | capital | parent |
|---|---|---|---|
| gp | Guadeloupe | Basse-Terre | France (dépt) |
| mq | Martinique | Fort-de-France | France (dépt) |
| gf | French Guiana | Cayenne | France (dépt) |
| re | Réunion | Saint-Denis | France (dépt) |
| yt | Mayotte | Mamoudzou | France (dépt) |
| bq | Caribbean Netherlands (Bonaire, St Eustatius, Saba) | Kralendijk | Netherlands |
| cx | Christmas Island | Flying Fish Cove | Australia |
| cc | Cocos (Keeling) Islands | West Island | Australia |
| sj | Svalbard and Jan Mayen | Longyearbyen | Norway |
| tk | Tokelau | Fakaofo | NZ |

Note: Sint Eustatius (the entity the owner named) is part of `bq` in ISO; splitting the
three BES islands individually is possible but they lack their own ISO codes → synthetic
keys, same as Tier 3.

## Tier 3 — non-ISO de-facto states (synthetic keys, patchy sources)

No ISO code ⇒ no flagcdn image (need a bundled flag asset) and a synthetic key like the
existing `xs` Somaliland. Politically sensitive — present neutrally as "de-facto / disputed".

| name | NE geometry | flag | notes |
|---|---|---|---|
| Northern Cyprus (TRNC) | ✅ yes | needs asset | most feasible of this tier |
| Abkhazia | ❌ no | needs asset | needs sourced geometry |
| South Ossetia | ❌ no | needs asset | needs sourced geometry |
| Transnistria | ❌ no | needs asset | needs sourced geometry |
| Nagorno-Karabakh (Artsakh) | ❌ no | needs asset | **dissolved 2024 — probably exclude** |

(Already in our set: `xk` Kosovo, `tw` Taiwan, `xs` Somaliland, `eh` Western Sahara.)

## Recommendation

1. **Add Vatican City (`va`) to the main pool now** — it's a sovereign state, not a
   toggle case. Clean drop-in (flag + capital + geometry all present).
2. **Tier 1 (the rest) behind the "include territories" toggle** — all drop-in, low risk,
   proves the toggle mechanic on well-documented entities.
3. **Tier 2 behind the same toggle, but flagged geometry-less** — data/panel/quiz only,
   excluded from draw modes until shapes are sourced.
4. **Tier 3 later** — start with Northern Cyprus (has NE geometry); the rest need sourced
   geometry + flag assets. Drop Artsakh (dissolved).

The **toggle + synthetic-key policy is the real work** (it must gate the country pool in
every mode). Suggested build order: (1) `va` into main set; (2) toggle infra + Tier 1;
(3) Tier 2 with a `hasGeometry:false` guard; (4) Tier 3 case by case.
