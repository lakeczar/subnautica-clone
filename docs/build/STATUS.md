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
| GPU enablement bundle | Opus 5.5 high (author) | `t3/enable-3090-gpu` / `t3-b9861fd3` | `docs/build/gpu-enablement/` | R3 accepted; the MMIO-window fix is in progress |
| New parallel streams | See [streams](STREAMS.md) | | | |

**Next**
1. GPU: R3 accepted → place the bundle in Fleet → the owner approves the rehearsal → install the guest driver → checkpoint → the owner approves the attach → run the 3090 browser smoke.
2. B1 handoff → Sol review → integrate. Then: save simplification, test tiers, compose the parallel streams, the world scale slice, and a rough complete campaign.

**Blocking:** GPU attach. The real rehearsal `20261020T003504Z-f08a` ended `preflight-failed` with nothing changed. Resizable BAR on the host gives BAR1 32 GiB, but the guest's OVMF 64-bit window is exactly 32 GiB. The fix is a 64 GiB OVMF window (`X-PciMmio64Mb`) added with the hostdevs; the GPU author is implementing it, then a fresh Sol review and a new rehearsal follow. The fallback is the owner disabling ReBAR in the BIOS.

**Unverified:** human pacing and enjoyment, the audible mix, 3090 rendering, full-world memory and eviction.

## GPU attach procedure (prepared 2026-10-20)
**State:**
- The rehearsal `20261020T025739Z-cc7c` returned `rehearsal-ok`, with a verified backup at `/boot/config/fleet/vm-backups/factory-worker-gpu-20261020T025739Z-cc7c.xml`.
- The guest driver, nvidia 550.163.01, is installed and built (`~/.local/share/siltwake-evidence/gpu-live/install-apply.log`).
- `check pre` (03:25 UTC) passes everything except `fleet-dashboard` and `fleet-dashboard-v2`, with `:9100` and `:9110` down. The fleet-dashboard project disabled both on purpose when the dashboard moved to the Mac (Fleet PR #19), so treat them as the baseline.

**The owner said go at 03:25 UTC.** All builders committed and idle. The fleet-dashboard project's own agents may be interrupted.

**Before the attach:**
1. Steer B1 and S1–S6 to commit their work-in-progress and finish their turn. `/tmp` is tmpfs and is lost at reboot.
2. Run `worker-gpu.sh check pre`.
3. Submit `ask run $(bash $B/ask-command.sh attach)` and have the owner approve within 30 minutes.

`B=/work/repos/fleet-vm-upgrade/unraid/gpu-enablement`.

**After boot** (resumed root session):
1. `ssh unraid-admin files read /mnt/user/appdata/fleet-gpu/runs/<RUN_ID>/result.json` should read `attached`/0.
2. Build `eb712f1` into a scratch `dist`, then run `webgl-probe.mjs` and `check post`. Follow the README procedure, step 6.
3. Resume every builder with a short "continue" message: B1 (`siltwake-m2-b1-opus-high-7bd259c`) and S1–S6 (IDs in STREAMS).
4. Tell the owner to resume the fleet-dashboard threads if they were interrupted.
5. Record the outcome here and in Fleet `docs/STATE.md`, then fix R3-01 and R4-01.
