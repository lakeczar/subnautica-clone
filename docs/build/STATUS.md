# Build status

Updated 2026-10-20 by the Opus 5.5 coordinator. Direction and rules: [DIRECTION](DIRECTION.md). Streams and review log: [STREAMS](STREAMS.md). History: [archive/](archive/README.md).

**Current**
- **Accepted and integrated** on `feat/siltwake-first-expedition`:
  - B1, S7, S8, C2 and S1: the streaming renderer;
  - S2: the full 2.0×1.8 km world with baked terrain;
  - C1: the S3, S5 and S6 wiring;
  - A1: vistas with collision.
- **Root checks:** fast 739/739, heavy all pass, build OK, bake verify 220/220, and all 4 economy scripts pass.
- **Also accepted and folded into C3:** S9 (`a67c76a`) and S4 (`854fdf1`).
- **Saves:** schema 5 / `expedition.6`. Additive content needs no bump.
- **Owner actions:** `main` and the public deployment.

**GPU:** the RTX 3090 is attached and verified. See [LIVE-RESULT](gpu-enablement/LIVE-RESULT.md); the procedure is archived in [archive](archive/STATUS-gpu-attach-2026-10-20.md). GPU browser work uses a task-owned Chrome with `--use-gl=angle --use-angle=gl-egl --ignore-gpu-blocklist`. The shared T3 preview stays software.

**Active work** (5 Opus builders max)

| Work | Owner | Branch / worktree | State |
| --- | --- | --- | --- |
| C3: composing the playable world and ecology (S4/S9 wiring, one physical world in the runtime, pending list pruned, P1 bugs 1–5) | Opus 5.5 high | `t3/compose-playable-world-ecology` / `t3-8e10510b` | Building. The P1 merge is in, `pending.ts` is empty and bug 5 is fixed. The research conflicts were sent. |
| P1: campaign playthrough harness | Opus 5.5 high | `t3/campaign-playthrough-harness` / `t3-6639fa97` | R3 fixes at `5079dc0`. The Sol R4 review is running. |

**Next**
1. P1 R4, then integrate. C3 handoff → Sol review → integrate.
2. A full playthrough of both routes on the 3090. Then a fresh Opus experience audit to exit the stage.
3. Iteration 1 of the [world evolution plan](WORLD-EVOLUTION-PLAN.md): W1 caves, W2 central hub and loops, and W3 landmark, creature and resource density. It runs in parallel with the polish stage: an oriented collider if the `VISTA_SOLIDS` cost matters, plus the S8 nits.
4. Remaining campaign production toward the finale.

**Not in the world yet:** caves, overhangs and underground spaces, because the floor is a single heightfield. W1 covers them.

**Unverified:** human pacing and enjoyment, the audible mix, representative 1080p/60 performance, full-world memory and eviction.
