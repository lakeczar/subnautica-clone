# Build task ledger

Only the coordinator dispatches. Default cap is four active agents including coordinator. Completed historical planning workers are not active implementation tasks. A task with live nested work is unfinished. Check durable task status before retrying a launch; each T3 review round gets a fresh stable request ID.

| Batch | Task/agent ID | Model/effort | Baseline / owned paths | State |
| --- | --- | --- | --- | --- |
| FND-01 | Pending dispatch | Sol 6.1 max | Build-records baseline; production `src/`, `public/`, tests/scripts, package/config/lockfile, index.html, README, .gitignore, CI, `docs/build/evidence/FND-01.md` | Planned |

Coordinator retains other documentation, integration and reviews. Builders return commit/path/check evidence and do not dispatch children or edit planning/canon without an explicit path assignment. Independent reviewers author no candidate changes.
