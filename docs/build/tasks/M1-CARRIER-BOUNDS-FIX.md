# M1-ASTRA-R2-01 — coherent carrier world boundaries

2026-10-17. Bounded **Sol 6.1 max implementation** under root Astra xhigh. Fix the newly reproduced carrier boundary/save defect while the independent owner-requested Opus design advisory continues on its frozen source. The main M1 scope and all previous corrections remain intact.

## Baseline, authority and ownership

Start clean at the exact parent supplied in delegation. Production equals `47d8872942e95120241af014e667084c75a54e39`, reviewed at e0a7d0d. Read AGENTS/STATUS first, PLAN/CONTRACTS, revised build input, applicable EXPEDITION_INTEGRATION/FLEET_AND_SURVIVAL/DELIVERY_AND_ACCEPTANCE, carrier geometry contracts and both complete R2 reports/dispositions. Root alone delegates/integrates. No children, peer polling or advisory coordination.

Own only:

- `src/sim/world.ts`, `src/sim/step.ts`, `src/sim/carrier.ts`, narrowly for coherent carrier/world boundary handling.
- New `tests/carrier-boundary.test.ts`; existing carrier/clearance or simulation tests only if a directly affected expectation requires adjustment, with explanation.
- `docs/build/evidence/M1-CARRIER-BOUNDS-FIX.md`.

No save validator/schema/state, registry dimensions/economy, UI/render/art/audio, package/config or root-record changes. A small world/carrier helper or additive parameter inside these owned files is permitted; return its exact signature/semantics for root reconciliation. If an actual saved-state/API change outside ownership is necessary, explain the concrete need before editing that path. No push/PR/merge, parent mutation or other workers' source copying. Commit source and evidence separately; return clean.

## Accepted finding and immutable reproduction

[Astra R2 report](../reviews/M1-BATCH-R2-ASTRA.md), **M1-ASTRA-R2-01, P2**: ordinary movement of the production carrier fixture can put attached craft outside WORLD_BOUNDS and block Save/Export. Sol R2 accepted the candidate without detecting this case; root reproduced the new failure independently and accepts it for correction. Both reviewers resolved all three R1 defects; no regression in those fixes is implied. Presentation has paired acceptance at e0a7d0d, but this core blocker prevents overall M1 batch completion.

Moving-origin clamping in world.ts does not reserve assembly extent. stepGame assigns the carrier pose/yaw; updateBerth transforms local attachments into world positions beyond the allowed save range. Strict validation correctly rejects them. Do not widen bounds or loosen validation, independently clamp child poses, break local/world coherence, hide failure or disable saving to mask the issue.

Artifacts `/tmp/siltwake-m1-batch-r2-astra/` are immutable. Root copies/reproduction live at `/tmp/siltwake-m1-batch-r2-astra-root/`.

- `carrier-boundary.mjs`: unmodified fixtureGame → ordinary helm command →600 ascent steps → reverse/level look. Last valid tick1680; first invalid1681. Carrier `(65,-1.5,65.028571...)`, compact attached origins Z66.028571 beyond maxZ66. No pose/progress injection in this rules route.
- `carrier-browser-result.json`: actual production seeded fixture, ordinary helm/Space/S. At2466 carrier/player `(65,-.9,66)`, attached origins Z67; actual Save/Export refused and autosave disabled. Previous journal at1800 remained byte-identical.
- `carrier-browser-recovered.json`:160 ordinary W ticks inward, explicit Save at2626 succeeds/re-enables autosave.
- `verify-browser-carrier.mjs`: full failed state equals journal+666 S steps; recovered state equals invalid+160 W steps. Root reran both scripts and viewed `carrier-save-refusal.png`. Browser and standalone schedules are distinct.
- Original archive `/tmp/siltwake-m1-batch-r2-astra/review-artifacts.tar.gz`, SHA256 `0df5198d6fce446b7ece6f332d43eb3c1b733b057b297f93a9bb8b09e41689b9`;113 payloads/114 files, root verified. Copy and redirect hardcoded output/module paths before any analyzer run.

## Required behavior

Constrain carrier movement and orientation through the shared simulation/world authority so the carrier, attached local craft and reachable interior/helm positions remain coherent and saveable at every boundary. Use existing physical/layout definitions rather than arbitrary duplicated margins. Choose the smallest clear solution and explain why its spatial envelope is sufficient. Preserve physical swept solid/terrain checks; avoid correcting one boundary by projecting a hull through an obstacle or teleporting it. Generic swimmer/Dart/local-interior movement must not change incidentally.

Cover translation and rotation, including stationary/disabled/no-power cases where look input currently changes hull heading. Preserve the semantics of saved yaw, local-to-world transforms and piloting view/input. No independent attachment clamping, artificial charge/repair, frame/cargo changes or forced player exit. World-edge contact should allow understandable inward/tangential escape, without oscillation or repeated invalid ticks.

Inspect valid older saves near an edge, not only the pristine fixture. Do not silently strand or corrupt a codec-valid old assembly, and do not weaken invalid-import rejection. If an older valid pose lies beyond a newly chosen conservative margin, define a safe behavior for inward movement, turning, helm/interior transitions and local walking without an unchecked relocation. Return any genuinely necessary compatibility decision to root rather than adding an unreviewed migration.

Ensure launch/capture, station keeping, prepared/lock interruption and empty compact/medium reconfiguration remain exactly-once/saveable at supported boundaries. An impossible exterior exit/launch may refuse with the existing physical rules; it must never produce out-of-world state. This is coherent boundary behavior, not a new carrier control redesign, full rotating-hull collision system or M2 campaign expansion.

## Checks and evidence

1. Reproduce the failing route against unchanged source and retain a meaningful red regression at production command/step/codec boundaries.
2. Exercise the fixed original route, loaded compact and medium layouts, cardinal/non-cardinal headings, all reachable edge/corner orientations, rotation without translation, and a valid retained old near-edge state. Use explicit diagnostic staging only for cases not reached in bounded ordinary controls; do not claim those as travel.
3. Check complete player/carrier/attachment local/world coherence and immediate/moving-step encode/decode. Check ordinary drains and cargo/identity conservation against elapsed control steps. Refusals remain atomic; valid inward/tangential movement remains possible. Cover safe helm/interior access, launch/capture or refusal as relevant to the boundary policy.
4. Run appropriate targeted regressions and one final `npm run check` after source settles. Existing carrier, save, occupancy, distraction and cache regressions must remain green. Do not rerun unchanged broad historical browser matrices without a new concern.
5. Use a bounded actual current production seeded carrier route to the formerly failing edge, Save/Export and actual reload/Continue; preserve full input schedule before reload, actual exported envelopes, elapsed ticks, source/bundle hashes and useful captures. Include a short turn/inward escape demonstration if it checks the chosen policy. No fresh full expedition or hours-long natural depletion run is required here.

Temporary artifacts `/tmp/siltwake-m1-carrier-bounds-fix/`; browser port5193 checked free first. Before browser work read `/work/repos/fleet/BROWSER_RULES.md` and `docs/BROWSER_RULES.md`. Prefer retained artifacts/APIs when sufficient; verify actual Linux browser-process ownership, T3 preview_status then preview_open, task-owned incognito storage and page-local inputs. Preserve historical tab14, Opus5197 and all shared/user resources. No Windows desktop automation/cursor capture or process-name kills. Release keys/controllers, close only owned tabs normally through T3 and stop only your own server normally. State SwiftShader/muted-audio limits.

Return source/evidence SHAs, exact changed paths/interfaces and boundary/compatibility policy, check results, actual observations versus diagnostics, portable hashed artifacts and known limits. No independent acceptance claim. Root inspects/assembles affected checks and commissions fresh non-author paired review of a frozen revision with both R1/R2 reports and all dispositions. Ordinary depleted-power runtime proof stays open for integrated M1; later fleet/campaign and design reviews remain.
