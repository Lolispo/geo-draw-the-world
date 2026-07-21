# Geometry source spike (TODOS #21)

Read-only evaluation of higher-fidelity shape sources to replace the draw-the-world
geometry. Run 2026-07-21. **No production data changed** — this is the recommendation
that gates the actual regeneration.

## Current baseline

- **Source:** Natural Earth — 1:50m base, 1:10m only for tiny states (`< 150 px²`).
- **Pipeline:** `scripts/build-geometry.mjs` — projects NE lon/lat into the fitted
  Mercator 1600×900 space, clips to the main landmass, Douglas–Peucker simplifies
  (tolerance cap `DP_EPS = 0.7 px`), joins on `ISO_A2_EH`.
- **Size:** 220 countries, **12,677 vertices**, ~182 KB of raw coordinates
  (~830 KB across the pretty-printed region files).

## Key finding

The **DP tolerance cap (0.7 px) is the binding fidelity limiter**, not the source
resolution. Switching to 1:10m *without* lowering the tolerance barely helps, because
DP throws away everything finer than 0.7 px anyway. The real gain is **1:10m + a lower
tolerance**.

Measured (same pipeline, only source + tolerance varied):

| Config | Countries | Vertices | Coord KB | vs current |
|---|---|---|---|---|
| **CURRENT** (50m base, 10m<150px², eps 0.7) | 220 | 12,677 | 182 | — |
| 10m-all, eps 0.7 | 220 | 17,952 | 256 | +42% (weak) |
| 10m-all, eps 0.5 | 220 | 22,895 | 323 | +81% |
| **10m-all, eps 0.35 ⭐** | 220 | **29,872** | **419** | **+136%** |
| 10m-all, eps 0.25 | 220 | 38,941 | 543 | +207% |
| 10m-all, eps 0.15 | 220 | 58,556 | 813 | +362% (diminishing) |

Coord KB is raw arrays; gzipped ~3–4×smaller, so the ⭐ option is **~250–300 KB over
the wire**, loaded once and cached.

## Visual result (⭐ = 10m eps 0.35)

Side-by-side silhouettes (generated in the spike) show the jump from blobby to crisp:
Greece gains its islands + Peloponnese/Halkidiki peninsulas, Iceland its fjords,
Norway its coastline (516 → 1,634 pts), Croatia the Dalmatian coast, Italy/Japan/UK/
NZ/Philippines all noticeably sharper. This reads as Sporcle-competitive.

## Recommendation

**Stay on Natural Earth; regenerate at 1:10m across the board with `DP_EPS = 0.35`.**

Why this over alternatives:

| Source | License | Fidelity | Fit | Verdict |
|---|---|---|---|---|
| **Natural Earth 1:10m** | Public domain (no attribution) | Great at our render sizes | Reuses the whole existing pipeline | ✅ **pick** |
| geoBoundaries (CGAZ) | CC BY 4.0 (attribution) | Higher, admin-grade | New source + heavier simplify | Only if we need entities NE lacks |
| OpenStreetMap / OSM extracts | ODbL (share-alike + attribution) | Highest | Heaviest processing; licence friction | Overkill for a game |
| world-atlas (TopoJSON) | PD data / MIT code | = Natural Earth | Convenience wrapper | Same as NE, no gain |

The NE 1:10m upgrade is **low-risk, ~1 day**: two constants change and 1:10m is always
preferred; the projection, clipping, and entity join are unchanged, so placement +
scoring alignment holds. The item-18 showcase silhouette improves for free.

### Implementation notes (for the actual #21 work)

1. In `build-geometry.mjs`: prefer the 1:10m feature for every entity (not just
   `< 150 px²`), and set `DP_EPS = 0.35`. Re-fetch NE sources to `/tmp/ne10.geojson`
   + `/tmp/ne50.geojson` (nvkelso `natural-earth-vector` geojson mirror).
2. Re-verify scoring (`js/scoring.js`) still yields sensible IoU numbers and that
   placement/results alignment is unchanged (same projection → expected fine).
3. Check gzipped transfer size + first-load time; if a few huge countries (Canada,
   Russia, Norway) dominate, allow a slightly higher per-ring tolerance for them.
4. **Rendering lever (relates to #10):** part of the on-screen roughness is the canvas
   render, not the data. Draw shapes on a devicePixelRatio-scaled canvas with
   smoothing; cheap extra crispness independent of vertex count.
5. If #20 (territories/de-facto states) needs shapes NE doesn't carry (Abkhazia,
   Transnistria, …), source *those specific entities* from geoBoundaries/OSM and
   accept their attribution — don't switch the whole base off Natural Earth for them.
