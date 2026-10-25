# Setup ledger: the owner's laptop (alickers)

Every change made on the owner's Windows laptop or its Linux sandbox gets a row here: what it is, where it lives, why, and exactly how to undo or redo it. The owner decides when anything is undone. Agents never undo or remove anything here on their own. Agents don't make Windows-side changes; anything Windows-side is done by fleet or the owner.

**Rules for adding a row:**
- **When:** record the change before it's made, then mark it done, with the date and the commit or ticket.
- **Undo:** must be a copy-paste sequence that returns that thing to exactly how it was before.
- **Redo:** must reapply it from scratch. Use a script in the repo where possible.
- **Windows-side changes:** fleet or the owner makes them, with the owner's approval. Agents never touch Windows settings.

## Baseline: fleet's sandbox provisioning (2026-10-22)

Fleet set this up. Its full record and its own controls are in fleet's handoff, `/work/tmp/siltwake-alickers-handoff/SANDBOX-HANDOFF.md` on factory-worker. In summary:

| What | Where | Undo / control |
| --- | --- | --- |
| WSL2 Ubuntu 24.04 distro named **Siltwake** (hostname `siltwake-alickers`), with its own disk | `%LOCALAPPDATA%\SiltwakeSandbox\distro\ext4.vhdx` | Fleet's removal steps (unregistering the distro). Ask fleet; never `wsl --shutdown`. |
| Hidden supervisor: keepalive, reverse SSH tunnel, sleep helper | `%LOCALAPPDATA%\SiltwakeSandbox\scripts\Sandbox.ps1` | `& $sandbox -Action Stop` stops it; removal is fleet's. |
| WSL settings: GUI disabled, resource limits. **These apply to every WSL distro for this Windows user** | `C:\Users\racza\.wslconfig` (newly created) | Delete or restore the file. Fleet has the exact contents. |
| Inside Linux: Node 24, Chrome Stable, Mesa, a private Xvfb wrapper (`/usr/local/bin/siltwake-chrome`), `siltwake-job`, a shared checkout at `/work/repos/subnautica-clone` | sandbox | Part of the distro; removed with it. |
| Owner controls | PowerShell `Sandbox.ps1 -Action Status/Pause/Resume/Stop/Start` | none |

## Siltwake's own changes

| # | Date | What | Where | Why | Status | Undo | Redo |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 2026-10-25 | **A read-only Windows reader**, approved by the owner, added to fleet's supervisor by a fleet thread on alickers. An in-process runspace polls `\\wsl.localhost\Siltwake\home\worker\.local\state\siltwake\acceptance\<ticket>\active` once a second, and samples only while one exists. Each row appends JSONL to that ticket's `host.jsonl`, with `cpuPct`, `idleMs` (GetLastInputInfo), `ac`, `powerMode` (scheme GUID) and the top 5 `gpu` processes (`\GPU Engine(*)\Utilization Percentage`). No Windows settings, input, tasks or services are changed. Errors go to `%LOCALAPPDATA%\SiltwakeSandbox\reader.err.log`. | `%LOCALAPPDATA%\SiltwakeSandbox\scripts\Sandbox.ps1` (+163 lines). Evidence, snapshots, hashes and the full diff are in `C:\Users\racza\.t3\scratch\2026-10-25-you-are-working-on-alek-a32f5b22\reader-evidence\` (see `coordinator-handoff.txt`). | Quiet-host proof for 4070 acceptance runs (SCHED-4b) | **done**. Tested: 9 rows at 1.000–1.016 s; overlapping tickets OK; stops when `active` is removed. Supervisor restarted (PID 9548); interop and automount still disabled. The restart interrupted PACE-1's alickers job `e49b`, which the queue confirmed stopped and reran with no duplicate. | On alickers, in PowerShell: `& 'C:\Users\racza\.t3\scratch\2026-10-25-you-are-working-on-alek-a32f5b22\reader-evidence\Set-Reader.ps1' -Mode Undo`. It verifies hashes, stops the supervisor, restores the snapshot and restarts. **Pause the queue's alickers jobs first** (the Stop terminates the distro). | Same script with `-Mode Redo`. |
| 2 | planned | **Virtual display plus Blender** (Option A asset authoring) inside the Linux sandbox; the owner runs one install command (the sandbox has no sudo). | sandbox | Opus asset authoring | planned (after the asset debate) | To be filled: exact packages and `apt-get remove` | To be filled |
| 3 | planned | **A separate scratch checkout** for Blender sessions | sandbox `/work/…` (path to be decided) | Keeps the shared test checkout untouched | planned | `rm -rf` of that path | its clone command |

**Notes on row 1:**
- **Timing:** rate counters need one second of priming, plus up to one second for marker detection. Acceptance jobs must create `active` before measured frames and wait for the first row.
- **GPU totals:** they combine engines and adapters, so they can exceed 100%. An empty `gpu` list means no positive engine values.
- **Restarts:** any supervisor restart stops the distro, so do it only with no alickers job running.
