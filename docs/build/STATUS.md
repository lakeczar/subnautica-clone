# Build status

Updated 2026-10-20 by the Opus 5.5 coordinator. Direction and rules: [DIRECTION](DIRECTION.md). History: [archive/](archive/README.md).

**Current**
- Accepted production is `eb712f1`: schema 4 / `expedition.5`.
- The integration branch is `feat/siltwake-first-expedition`.
- `main` and the public deployment are owner actions.

**Playable today:** the opening and damaged pod, reef gathering and food, tools and the 150 m suit, the island workshop and Dart, the Canopy investigation with the sound hunter, the 350 m refit, the Basin evidence and haul, and recovery. That covers 4 compact habitats, 1 earnable craft and 6 clues. There is no finale yet. The audit estimates 75–90% of campaign production remains.

**Active work**

| Work | Owner | Branch / worktree | Owns | Next |
| --- | --- | --- | --- | --- |
| M2-B1: earned Creel and mobile refuge | Opus 5.5 high | `t3/earned-creel-mobile-refuge-loop` / `t3-b6aef8ec` | The roots listed in DIRECTION | Handoff, then a fresh Sol review |
| GPU enablement bundle | Opus 5.5 high (author) | `t3/enable-3090-gpu` / `t3-b9861fd3` | `docs/build/gpu-enablement/` | Sol R3 review on `8d6dba9` is running |
| New parallel streams | See [streams](STREAMS.md) | | | |

**Next**
1. GPU: R3 accepted → place the bundle in Fleet → the owner approves the rehearsal → install the guest driver → checkpoint → the owner approves the attach → run the 3090 browser smoke.
2. B1 handoff → Sol review → integrate. Then: save simplification, test tiers, compose the parallel streams, the world scale slice, and a rough complete campaign.

**Blocking:** none. All GPU findings so far are fixed; R3 is pending.

**Unverified:** human pacing and enjoyment, the audible mix, 3090 rendering, full-world memory and eviction.
