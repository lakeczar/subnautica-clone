# Fixed views: capture B against capture A (same build, `af6d85de`, RTX 3090)

Transcribed from the comparison's report (`compare.mjs` against a throwaway store holding capture A's 131 eligible views, ticket `261023-220108-181d`). The file itself was overwritten by the next comparison against the re-accepted baselines, saved beside this as `views-b-vs-baselines.md`.

143 captured: 125 unchanged (57 pixel-identical), 5 changed, 0 without a baseline; 12 quarantined and 1 not judged (unsettled or unstable).

| View | SSIM (threshold 0.97) | Pixels changed | Seen in the strip |
| --- | --- | --- | --- |
| place.home_pod | 0.963 | 3.1% | a few creatures and the right-hand structure's lights differ |
| cave.hub_glimmer_crack.interior | 0.817 | 48.2% | (not opened) |
| cave.isles_headland_west.interior | 0.968 | 68.2% | (not opened) |
| cave.canopy_root_arch.interior | 0.887 | 88.5% | same geometry; B has a warm light that A does not: a different light set |
| cave.divide_brine_cistern.interior | 0.475 | 46.4% | B draws open water where A draws the cave, and B's two pictures matched (it passed as stable) |
| cave.basin_west_rim.interior (not judged) | — | — | B's first picture open water, its last the same as A: the cave arrived about 6 s late; unstable after its tries |

All six were then quarantined and their baselines withdrawn (`2e10705d`).
