# High-definition shapes — plan (TODOS #24)

## The finding (Bahamas spike, 2026-07-22)

The low detail is **not** the source — it's our pipeline.

| Bahamas | Islands | Points |
|---|---|---|
| **Shipped now** | 1 | **18** (squeezed into a 3×3 px box) |
| Natural Earth 1:10m (our source, public domain) | 44 | **1,629** |
| geoBoundaries (OSM-derived) | 42 | 1,609 |
| OSM `admin_level=2` | — | 167 (maritime border, *not* coastline) |

Natural Earth 1:10m and geoBoundaries are essentially identical detail. We already
have a public-domain source with all the detail we need — we throw ~99% of it away.

**Why the loss happens (three pipeline choices):**
1. Everything is projected into one **1600×900 whole-world** space → Bahamas becomes
   3×3 px, so sub-pixel detail is physically unstorable.
2. `clipToMain` drops outlying rings → 43 of 44 islands gone.
3. Douglas–Peucker runs at that tiny scale → the survivor collapses to 18 points.

So switching to OSM/geoBoundaries would **not** help — same detail, plus licensing +
weight. The fix is to stop destroying what Natural Earth already gives us.

## Is high-def "heavy"? (measured)

Full NE 1:10m detail for all 236 entities = **523,192 points ≈ 6 MB raw, ~1.5 MB
gzipped** (biggest: Canada 68k pts). Current shipped total is 29,872.

- **Single-country views** (draw reference, compare overlay, panel silhouette — one
  country shown large): full detail is **cheap** — drawn once, per-country payload a
  few KB (Canada worst ~200 KB). No frame-rate cost. **This is where detail is visible.**
- **Live world-placement map** (every country redrawn each drag frame): full detail
  *would* be heavy (500k pts/frame) — **and invisible**, since each country is a few px
  at world scale. So there's cost and zero benefit there.

**Answer to "high-ref everywhere?":** yes everywhere it's visible; keep the interactive
world map light. You lose nothing — the two look identical at world scale.

## Plan — two-tier geometry (same public-domain source, done right)

1. **New per-country hi-res tier.** Rebuild from NE 1:10m storing each country's outline
   **normalized to its own box at native resolution**, keeping the whole island cluster
   (fix the clip to be relative to the country's own extent, not a global px distance;
   still drop distant exclaves e.g. mainland France vs its Pacific islands). Minimal DP,
   tuned to a large render size (~1000 px), not 3 px. Store as `data/shapes/{code}.json`,
   **lazy-loaded per country** (draw shows one at a time → trivial payload).
2. **Keep the current light world set** for placement (unchanged; fast drag).
3. **Rendering upgrade:** devicePixelRatio-scaled canvas + rounded joins, optional
   curve smoothing, for the single-country views.
4. **Wire** draw reference, shape-only compare, and the panel silhouette to the hi-res
   tier; scoring's shape IoU then runs on real detail.
5. **Verify + owner approval** (Bahamas, Norway, Greece, Chile, Canada) before closing.

Est. effort: ~half a day for the build rewrite + wiring; low risk (additive tier, the
world map and scoring contract are untouched). No new license (stays Natural Earth PD).
