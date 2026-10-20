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

**Active work** (5 of 5 Opus builders)

| Work | Branch / worktree | State |
| --- | --- | --- |
| C3: compose the playable world and ecology | `t3/compose-playable-world-ecology` / `t3-8e10510b` | Building |
| W1-pre: Fanvault cave kit and cave lab | `t3/siltwake-fanvault-cave` / `t3-cfb3bfb4` | Fixing Sol R2 (W1-PRE-04) |
| LC: large-cave technology proof (Canopy root caves, 250 m) | `siltwake-lc-large-cave-tech-opus-7519cfb` | Building |
| SYS-1: fleet upgrades (common pool and signature upgrades) and power | `siltwake-sys1-upgrades-power-opus-7519cfb` | Building |
| SYS-2: outposts, decoder, cultivation, survey, chart, journal, play timeline | `siltwake-sys2-bases-knowledge-opus-7519cfb` | Building |

P1 (the playthrough harness) was accepted at R5 and integrated at `73d347a`.

**Next**
1. C3 handoff → Sol review → integrate. Then both routes to the ending on the 3090, then the experience audit.
2. Compose W1-pre, SYS-1 and SYS-2 after C3, in one schema change. Then build the Canopy cave biome on the LC technology.
3. Follow the order of work in [GAME-DIRECTION](GAME-DIRECTION.md).

**Not in the world yet:** caves and the systems in GAME-DIRECTION. The cave kit, the large-cave technology and the systems are being built in new files, to be composed after C3.

**Unverified:** human pacing and enjoyment, the audible mix, representative 1080p/60 performance, full-world memory and eviction.
