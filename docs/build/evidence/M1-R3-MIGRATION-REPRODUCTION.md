# M1 R3 carrier migration — coordinator reproduction

2026-10-17. **M1-ASTRA-R3-01 is substantiated and requires correction.** This is diagnosis, not acceptance. Astra's report-only commit `e16139ba8f6f74f7f426fddeff1c953037dc97d6` is reconciled at `dbfca53`; Sol's independent R3 verdict remains pending on unchanged `21d50df`.

Root verified all 80 manifest payloads and 81 unique safe regular archive members, including byte identity between local and archived files. Archive SHA256 `dd98cdb1decc2d283961dfd4eaaa20d6f5b99068628c8c93fd6f38c32004e0bc`; manifest SHA256 `001267aa02e0a6d3e80326ddcea072e4476b6271cd33dd13317b36a6ef9ebb97`. Original reviewer artifacts remain untouched.

On clean root `206a6ec`, production-identical to frozen `21d50df`, root freshly compiled the TypeScript test modules and ran a copied reviewer script with output redirected to `/tmp/siltwake-m1-r3-root/`. Historical imports remain read-only under the reviewer's separately compiled `c0aa5cb` directory. The staged historical fixture is locally clear and accepted by the historical codec; it is not a captured old player save or an earned expedition.

- Carrier `(188,-24,0)`, yaw π/2, interior player `(-3,4,4.5)`: current pre-migration semantics pass. Decode then reports success but moves world player X from183.5 to194, beyond maxX188. The result fails current validation and encoding.
- 120 ordinary forward movement ticks do not restore a valid position. Taking helm does restore validity/saveability. Fleet and inventory remain exactly conserved; no irreversible loss is claimed.
- A local journal reports ready and Continue installs the invalid migrated state. Manual Save fails and disables autosave; Export encoding fails. The original raw journal is unchanged with zero writes.
- Import reaches confirmation but replacement commit fails; active state and storage remain unchanged.

Root inspected the codec, existing migration tests and `carrierInteriorEntry` in carrier.ts. Explicit boarding/helm exit already checks carrier-local and world clearance; decoder migration bypasses it and does not validate its output. [Correction assignment](../tasks/M1-MIGRATION-FIX.md) scopes reuse of this checked placement logic, safe refusal and composed persistence tests. Strict bounds, saved identities and vessel transforms remain protected.

Evidence: `/tmp/siltwake-m1-r3-root/{astra-artifact-verification.json,legacy-migration.mjs,legacy-source.save.json,legacy-migration.json,legacy-session.json,reproduction.log}`. No browser, fresh full test matrix, visual change or new route was required for this reproduction. Existing 174-test assembly/reviewer results retain their recorded source attribution.
