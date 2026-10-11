# Know the World — working notes

## Handing work over for review: one URL per item, opened for him

Every screen has a hash route (`js/router.js`, TODOS #56). That exists for one reason: a change
should be handed over as a **link to the thing you changed**, not as a path through the menus for
him to retrace. When work is waiting on the owner's review:

1. **Serve the repo** — `python3 -m http.server 8129` from the root. **Not `npm start`**: that is
   port 8080, which another app on this machine already holds, and it answers 200 from the wrong
   site.
2. **Give every item under `## Needs review` in `TODO.md` its own URL**, and put that URL in the
   entry's `**REVIEW:**` line, so the backlog is self-serve afterwards.
3. **`open` them, in review order, one tab per item.** A list of links he has to copy is not
   showing him the work — that is the whole difference between this working and not.

A route reaches a *screen*, not a state mid-round. Changes to the placement or results map still
need a round played to be seen, so say that in the REVIEW line rather than pretending the link
lands on it.

**A new screen is not finished until it has a route.** One screen reachable only by clicking
breaks the handover for every item after it.

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

Drive **Playwright directly** for anything stateful — `~/.claude/skills/gstack/node_modules/playwright`.
The gstack `browse` server is shared between sessions, so another session can navigate your tab
mid-measurement, and it caches ES modules and JSON hard enough that a stale module makes a new
export fail to link with no console error at all. Serving on a fresh port sidesteps the cache.
