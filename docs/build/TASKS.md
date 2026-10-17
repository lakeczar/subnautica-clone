# Build task ledger

Only the coordinator dispatches. Default cap is four active agents including coordinator. Completed historical planning workers are not active implementation tasks. A task with live nested work is unfinished. Check durable task status before retrying a launch; each T3 review round gets a fresh stable request ID.

| Batch | Task/agent ID | Model/effort | Baseline / owned paths | State |
| --- | --- | --- | --- | --- |
| FND-01 | Native `/root/foundation_builder` | `gpt-6.1-sol` / `max` | `a3e400b`; production `src/`, `public/`, tests/scripts, package/config/lockfile, index.html, README, .gitignore, CI, `docs/build/evidence/FND-01.md` | Running on shared `feat/siltwake-foundation`; builder may commit assigned files |
| ECO-01 proposal | Native `/root/expedition_economy` | `gpt-6.1-sol` / `max` | `a3e400b`; only `docs/build/design/ECONOMY_CANDIDATE.md`, `economy-candidate.json`, `check-economy.mjs` | Running; provisional arithmetic for later runtime registry integration, no commit by worker |

Coordinator retains other documentation, integration and reviews. Builders return commit/path/check evidence and do not dispatch children or edit planning/canon without an explicit path assignment. Independent reviewers author no candidate changes.
