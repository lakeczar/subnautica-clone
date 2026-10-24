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

## GPU attach, second attempt (2026-10-20 04:10 UTC)
- **Rehearsal** `20261020T040634Z-8a53` returned `rehearsal-ok`. The gate reported that libvirt accepts the target, and the argv has `-fw_cfg … X-PciMmio64Mb,string=65536` plus `vfio-pci` for `01:00.0` and `01:00.1`.
- **Checkpoint:** all builders (S1, S6, S7, S8) and reviewers (B1, S2, S3-R2, S4-R2) were told to commit and stop. All worktrees are clean. `check pre` shows the same four dashboard baseline failures.
- **Attach** submitted for owner approval.

**After boot:**
1. Read `result.json`.
2. Run `check post` with the probe.
3. Resume S1, S6, S7 and S8, and send "continue" to the four reviewers. Check each reviewer's summary first: some may already have finished.
