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
#/draw/<daily|quick3|famous5|speed|streak|continents|world|africa|…>
#/top10                                   Top 10 / Bottom 10 picker
#/rank[/<datasetId>]                      Rank the World
#/flags  #/flag-picker                    the two flag games
#/explore[/map|/shapes|/coverage]?metric=<id>&continent=<name>
#/scores                                  Your Scores
#/country/<code>                          menu with that country's panel open
```

Unknown routes, views and continents fall back rather than rendering blank. The app writes its
own URL with `history.replaceState`, which fires neither `hashchange` nor `popstate` — so there
is no guard flag and no re-entry loop. Keep it that way.

## Verifying a change

See `~/HobbyProjects/CLAUDE.md`. Specific to this app: reference-shape ghosts on the placement
and results maps are behind `?dev=1` (`index.html?dev=1#/draw/daily`) — there is no on-screen
control for them any more.
