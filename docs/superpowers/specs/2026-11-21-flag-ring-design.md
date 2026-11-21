# Flag Ring — design

**Status:** approved in conversation 2026-11-21. Source idea: rl `e095` ("flag simulator, bounce
around — stupid simulations brainrot to watch").

## What it is

A screensaver, not a game. Every flag bounces inside a slowly turning ring that has one gap. A flag
that escapes through the gap is out; the last flag left inside wins. Then it starts over, forever.
Frontend only, no input beyond fullscreen.

**Non-goals:** betting, multiplayer, sound, saving winners. (Betting/party mode was considered and
dropped in favour of something that just runs.)

## Approaches

- **Hand-written circle physics on a 2D canvas — chosen.** Balls against balls and against a ring
  wall with a gap is a small amount of code, and geo has no runtime dependencies.
- matter.js — the first runtime library in geo, for a problem that is only circles.
- three.js — the scene is flat.

## Decisions

- Route `#/flag-ring`, and a hub card beside the two flag games. `#/flags` is already the quiz.
- Every flag in `data/flags.json`, drawn as a ball with the flag clipped inside.
- An escaped ball falls under gravity off the ring and out of play; a counter shows how many remain.
- Pacing: the ring spins faster and the gap widens as the count drops, aiming at a 3–5 minute round.
  Balls grow as the field thins, so the last few are legible.
- The winner is shown large, with its name, for about five seconds, then a new round.
- `f` or a button toggles fullscreen. That is the only control besides going back.
- Standalone: one module (`js/flag-ring.js`) owns its screen, its loop and its teardown; `main.js`
  only routes to it.

## Left to the builder

Physics constants, sizes and the exact pacing curve — tune by watching.
