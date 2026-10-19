# VM upgrade pause — 2026-10-19

Construction is paused for the owner's factory-worker resource upgrade. Do not restart implementation or reviews until the owner asks to resume. No VM settings or resource limits were changed by the coordinator.

## Upgrade execution checkpoint

Opus 5.5/high authored the host-side upgrade bundle. Fresh Sol 6.1/xhigh [R3 review](vm-upgrade/REVIEW-SOL-R3.md) and coordinator inspection accept it **for staging**: 225 suite checks pass independently, plus 55 reviewer focused checks. All review findings are closed. This is not real-host upgrade acceptance.

- Reviewed script: `docs/build/vm-upgrade/vm-ram-upgrade.sh`, SHA-256 `226d89df08dbf50eeac0d80b6ad85f60db9d32139fd4792d884e09e42b272bd1`; [runbook](vm-upgrade/RUNBOOK.md).
- Identical operational bundle is published in Fleet commit `881b72c0a1ca8d9952a21b8d255756db6ed9d4a5`, branch `ops/factory-worker-16g`, checkout `/work/repos/fleet-vm-upgrade`, [draft PR #16](https://github.com/lakeczar/fleet/pull/16). Shared Fleet main and its unrelated research file were preserved.
- Script staged at `/mnt/user/appdata/fleet-vm-upgrade/vm-ram-upgrade.sh` on Unraid; readback is byte-identical. Current host prechecks pass: 12 GiB, six vCPUs/pins unchanged, roughly 10 GiB available on the host, archive present.
- **Nondisruptive rehearsal request `20261019-152953-5ebd` is awaiting the host's native owner approval.** It cannot shut down or change the VM. No real-upgrade request has been submitted.
- Local durable receipts are in `/home/worker/.local/share/siltwake-checkpoints/vm-upgrade-20261019/`: `host-script-staging.json`, `rehearsal-command.txt`, `rehearsal-ask.json`, `fleet-upgrade-pr-readback.json`, and the coordinator/reviewer records. `READY.json` retains the original pre-upgrade game checkpoint, not the later infrastructure-documentation commits.

Next, use `ssh unraid-admin 'ask result 20261019-152953-5ebd'` after approval. Verify the resulting host run against every rehearsal criterion in RUNBOOK (successful durable result, launcher gone, different session, stable expected reads/plan and records). Only then publish the final restart handoff and submit the separately approved real upgrade. The detached host process owns shutdown through restart because T3 and this coordinator run inside the VM. Communicate the maintenance exclusion window. After boot inspect actual resources, all services/endpoints, cgroup WARNs, archive and retained paths before claiming completion; update Fleet `machines.yaml`/`docs/STATE.md` together. Game work remains paused until the owner resumes it.

## Saved checkpoint

- Branch `feat/siltwake-first-expedition`; pre-pause published HEAD `9ddb5e9538abe6a66edf51955d744d7681f56ed0`. Later pause records are documentation only.
- Production `eb712f1527439ec1f38f2c52ef61ac78989ba74c`, byte-identical to Opus author `e4062ae`: **567 tests**, typecheck/build, four economy invocations and progression checker pass. [Inspection](evidence/SPACE-1-COMPOSE-INTEGRATION.md).
- M2-A remains accepted on `51c4dcd`; SPACE-1 is provisionally integrated, **not independently accepted**. Schema4 / expedition.5 is current. No production edit accompanies this pause.
- PR #4 remains the feature draft; #3 remains M0-only. Main/game integration and public deployment have not occurred.

## Interrupted work

Task `node:delegated-task:command%3Amcp%3A5985d710-87d8-4895-8c9f-7f33b0d85699%3Adelegate-task%3Asiltwake-space1-sol-xhigh-r1-2b1a252` was stopped with `task_cancel` for the upgrade. Terminal status **interrupted**, no pending children/questions; automatic completion delivery is disposed. Do not treat its partial summary as an acceptance report.

The reviewer was a verified fresh `gpt-6.1-sol/xhigh` on candidate `2b1a252f9fdd88d91116efc0bb72d2b24876b9f5`, checkout `/home/worker/.t3/worktrees/subnautica-clone/t3-e1f5656e`. The checkout is still clean at that commit; no report commit exists. Its last message reports matching17 frozen-domain projections/validator body and an interrupted suite after551 passing assertions without a reported failure. This is incomplete review evidence, not a replacement for the root's completed567-test result or an overall verdict.

Partial reviewer artifacts persist at `/home/worker/.local/share/siltwake-evidence/space1-sol-xhigh-r1/`; dispatch/runtime receipts are in `space1-sol-xhigh-r1-root/`. The cancellation and clean-checkout observations are in the checkpoint directory below. Root found no remaining process in that review checkout and port5190 was free. No other Siltwake worker remains active in this coordination chain; shared/user browser hosts were preserved.

## Persistent evidence and VM handling

Preserve the **existing VM disk and `/home/worker`**, including `.t3`, `.codex`, repositories/worktrees and `.local/share/siltwake-evidence`. Resizing the same VM with its existing disk is the intended operation. A normal shutdown is appropriate after the coordinator confirms archive verification and record publication; do not replace the disk with a clean image. A hypervisor snapshot/backup offers additional protection if available.

`/tmp` is RAM-backed and will not reliably survive shutdown. The coordinator archived **390 top-level Siltwake-named paths**, including old evidence and the art prototype, into:

`/home/worker/.local/share/siltwake-checkpoints/vm-upgrade-20261019/tmp-siltwake.tar`

The archive is **4,137,226,240 bytes**. `tmp-paths.json` lists coverage; `archive.log`, `archive-compare.log` and `archive-verification.json` record creation, full source comparison (exit0, no differences) and SHA256. Verified archive SHA256: `188e1a36213ddb7f8ae58af26f4d1ea48280d938835883c4f2a50f37b1c13b1a`. The original `/tmp` files were retained. This is a reboot-survival copy on the same disk, not an off-machine backup. Unrelated `/tmp` data is outside this project checkpoint.

After restart, verify the archive hash. Prefer extracting into a fresh **disk-backed** directory beside the archive and creating missing `/tmp/<original-name>` symlinks to the preserved entries, so historical evidence paths continue to resolve without filling RAM-backed `/tmp` again. Do not overwrite any new `/tmp` entries; inspect collisions. The archived prototype has a Git worktree binding at its original `/tmp` path, so verify that binding before using it. Current implementation/review worktrees already live under persistent `/home`.

## Resume procedure

1. Owner starts the resized VM, reconnects T3 and asks to resume Siltwake from this file. Read STATUS, PLAN, CONTRACTS and MODEL_POLICY as usual.
2. Confirm branch/HEAD/worktree state and retained evidence. Inspect actual vCPU/RAM, free disk and the agent cgroup limits. Before upgrade the VM exposed6 vCPUs/about12 GiB RAM; the shared agent group had memory.high6,271,401,984 and memory.max9,407,102,976 bytes. VM RAM alone may not lift those ceilings. Choose limits with host/other-workload headroom; no automatic infrastructure changes were authorized here.
3. Restore needed historical `/tmp` paths from verified persistent evidence as above. Preserve originals and partial review receipts.
4. Dispatch a **new fresh Sol6.1/xhigh review task** with a distinct request ID, the entire [SPACE-1 brief](tasks/SPACE-1-SOL-XHIGH-REVIEW.md), original scope/evidence/limits and this interrupted-review context. Review production remains unchanged; use the current committed documentation baseline. Do not continue a delegated review by messaging the old child thread. Partial observations may guide inspection but are not acceptance.
5. Reconcile the complete result; Opus5.5/high fixes substantiated findings, then fresh affected review. After acceptance continue M2-B earned Creel/service/fleet progression, M2-C deep routes/both endings, integrated M2 plus fresh Opus experience audit, M3 and M4.

Model policy remains **Opus5.5/high builder, Sol6.1/xhigh independent reviewer**. Narrative spoilers stay out of ordinary summaries. The planned2.0×1.8 km world, six craft, purposeful progression, concise menus and full campaign remain required.
