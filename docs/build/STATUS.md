# Build status

Updated 2026-10-20 by the Opus 5.5 coordinator. Direction and rules: [DIRECTION](DIRECTION.md). Streams and review log: [STREAMS](STREAMS.md). History: [archive/](archive/README.md).

**Current**
- **Milestone (2026-10-20): a rough complete game.** C3 is integrated at `a21e764`, and both fleet routes reach the ending in `npm run playthrough`, with all 5 scenarios complete and milestone reloads matching. Root checks: 1,071 fast tests pass, and the build is OK.
- **Accepted:**
  - B1, S1–S9, C1, C2, C3, A1 and P1;
  - W1-pre (the cave kit);
  - SYS-1 (upgrades and power);
  - SYS-2 (bases and knowledge);
  - CY (currents and cycles);
  - CB (the content bible).

  W1-pre, SYS-1, SYS-2 and CY are **merged but not yet wired into the game**.
- **Saves:** schema 5 / `expedition.6`.
- **Owner actions:** `main` and the public deployment.

**GPU:** the RTX 3090 is attached and verified. See [LIVE-RESULT](gpu-enablement/LIVE-RESULT.md); the procedure is archived in [archive](archive/STATUS-gpu-attach-2026-10-20.md). GPU browser work uses a task-owned Chrome with `--use-gl=angle --use-angle=gl-egl --ignore-gpu-blocklist`. The shared T3 preview stays software.

**Active work** (5 of 5 Opus)

| Work | State |
| --- | --- |
| **C4:** compose W1 caves and CY currents (stage A), then SYS-1, SYS-2, CB recipes, UI and timeline (stage B) into the game | Building, with a Sol review per stage |
| **M2 stage-exit experience audit** (fresh Opus, on `ffc9847`) | Playing |
| **LC:** large-cave technology (Canopy root caves, 250 m) | Building |
| **CA-1:** Reef and Isles small and medium caves | Building |
| **CA-2:** Canopy and Basin small and medium caves | Building |

**Next**
1. C4 stage A → Sol → stage B → Sol → integrate.
2. Apply the M2 audit's findings.
3. Owner playtest once the timeline and feedback key are wired in (C4 stage B).
4. Then: the remaining regions' caves; the cave biomes on LC; the hub (W2); the density pass, creatures and lost sites; then the atmosphere pass.

**Not in the world yet:** caves and the systems in GAME-DIRECTION. The cave kit, the large-cave technology and the systems are being built in new files, to be composed after C3.

**Unverified:** human pacing and enjoyment, the audible mix, representative 1080p/60 performance, full-world memory and eviction.
