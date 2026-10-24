# Know the World — working notes

## Handing work over for review

The protocol lives in `~/HobbyProjects/CLAUDE.md` — numbered items, one tab each, opened for
him. What is specific to this repo:

- **Serve on 8129**: `python3 -m http.server 8129`. **Not `npm start`** — that is port 8080,
  which another app on this machine holds, and it answers 200 from the wrong site.
- Every item under `## Needs review` in `TODO.md` carries its own URL in its `**REVIEW:**` line.
- **A new screen is not finished until it has a route** (`js/router.js`, TODOS #56). One screen
  reachable only by clicking breaks the handover for every item after it.

## Routes

```
#/                                        menu
#/draw                                    Draw the World menu
#/draw/<daily|quick3|famous5|speed|streak|continents|world|freestyle|africa|…>
#/draw/country/<code>[,<code>…]           draw exactly these, in this order
#/draw/…?puzzle|shapeonly|tweak|blind|explorer|hard|territories=1|0
#/top10                                   Top 10 / Bottom 10 picker
#/rank[/<datasetId>]                      Rank the World
#/flags  #/flag-picker                    the two flag games
#/explore[/map|/shapes|/heritage|/coverage|/sources]?metric=<id>&continent=<name>
#/scores                                  Your Scores
#/country/<code>                          menu with that country's panel open
```

`#/draw/country/` takes any code in `data/shapes/`, territories included — naming a code is
the request, so the pool rule does not apply. Unknown codes drop out of the list and out of the
address bar; if none resolve you get the draw menu. The toggle parameters do exactly what the
menu buttons do, including persisting Territories, and a draw URL is rewritten to carry whatever
toggles are on — so a toggle left on from an earlier link follows you until something turns it
off. Spell out `=0` in a link that needs one off.

Unknown routes, views and continents fall back rather than rendering blank. The app writes its
own URL with `history.replaceState`, which fires neither `hashchange` nor `popstate` — so there
is no guard flag and no re-entry loop. Keep it that way.

## Data builds

Every third-party endpoint lives in `scripts/lib/provenance.mjs`, and the build scripts fetch
from it — so a URL is changed there, once, not in the script that uses it.

Two ordering rules the builds do not enforce for themselves:

- **`npm run build:datasets` must be followed by `node scripts/build-entities.mjs --write`.**
  The World Bank's own country names are not the ones the app shows ("Congo, Dem. Rep.",
  "Bahamas, The", "Cote d'Ivoire"); build-entities reconciles them. Skipping it silently
  regresses every one.
- **`npm run build:sources` after any data build.** It regenerates `data/sources.json`, whose
  retrieval dates and coverage counts the Sources view reads. Forgetting is caught rather than
  silent: the Coverage health strip fails with *"data/sources.json is up to date"* as soon as a
  file holds a different number of entities than the registry recorded.

## Verifying a change

See `~/HobbyProjects/CLAUDE.md`. Specific to this app: reference-shape ghosts on the placement
and results maps are behind `?dev=1` (`index.html?dev=1#/draw/daily`) — there is no on-screen
control for them any more.
