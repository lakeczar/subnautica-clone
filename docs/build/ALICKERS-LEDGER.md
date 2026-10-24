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
| 1 | 2026-10-24 | **A read-only Windows reader**, approved by the owner: Windows CPU load, input idle time, power source (AC or battery) and power mode, sampled during 4070 acceptance runs. It only reads, never changes a setting. | **Mechanism to be decided by the SCHED-4b probe:** either WSL interop (`powershell.exe`, read-only queries, nothing installed on Windows) or an addition to fleet's supervisor writing samples into the sandbox. This row will name exact files. | Lets 4070 frame-time runs prove the laptop was quiet (the gate is "60 fps on a GPU", owner 2026-10-24) | planned | To be filled when built. For interop: turn the reader off in the queue config; nothing to remove on Windows. For the supervisor: revert fleet's script change. | To be filled when built. |
| 2 | planned | **Virtual display plus Blender** (Option A asset authoring) inside the Linux sandbox; the owner runs one install command (the sandbox has no sudo). | sandbox | Opus asset authoring | planned (after the asset debate) | To be filled: exact packages and `apt-get remove` | To be filled |
| 3 | planned | **A separate scratch checkout** for Blender sessions | sandbox `/work/…` (path to be decided) | Keeps the shared test checkout untouched | planned | `rm -rf` of that path | its clone command |
