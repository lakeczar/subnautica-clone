# M1-ASTRA-R2-01 — coherent carrier world boundaries

2026-10-17. Bounded author correction under root Astra xhigh; **not independent acceptance**. Actual T3 runtime: **gpt-6.1-sol / max**. Clean exact parent **f2129a3ffeea52745dcad43adda89bee83187cd3**; verified its production bytes equal **47d8872942e95120241af014e667084c75a54e39**. Source commit **1c8f719a25690cf8a4b8ce374286f6d1ccba8479**. Source and this evidence are separate commits on `t3/carrier-world-boundaries`.

Read AGENTS/STATUS first, PLAN/CONTRACTS, revised build input and applicable expedition, fleet/survival, delivery and carrier geometry contracts, settled map/tracker, both complete R2 reports and R1/R2 dispositions. Only the accepted carrier boundary defect is corrected. No children, advisory/peer coordination, parent mutation, push, PR or merge. No schema/validator/state, registry/economy, UI/render/art/audio, package/config or root-record changes.

## Exact paths and interfaces for root reconciliation

Production paths: `src/sim/world.ts`, `src/sim/step.ts`, `src/sim/carrier.ts`. New test: `tests/carrier-boundary.test.ts`. No existing test expectation changed. Sole evidence path is this file.

```ts
// src/sim/world.ts — additive exports
export interface HorizontalBounds {
  minX: number; maxX: number; minZ: number; maxZ: number;
}
export function withinWorldBounds(position: Vec3): boolean;
// Inclusive horizontal origin check against unchanged WORLD_BOUNDS; no Y policy.

export function moveHull(
  world: WorldQueries, origin: Vec3, delta: Vec3, shape: Capsule,
  bounds?: HorizontalBounds,
): ReturnType<WorldQueries["moveCapsule"]>;
// Existing four-argument callers retain their prior behavior. Only carrier
// piloting supplies bounds. Each requested travel slice is restricted BEFORE
// its physical solid/terrain sweep; the resulting pose is never projected.

// src/sim/carrier.ts — additive exports
export function carrierTravelBounds(): HorizontalBounds;
export function constrainCarrierYaw(s: GameState, desiredYaw: number): number;
// Read-only. No carrier => desiredYaw. With a carrier: longest safe prefix of
// the shortest current->desired yaw arc, checking actual attached origins at
// its endpoints and every X/Z extremum; 48 bisections when contact intervenes.
// Test precisely the normalized representation returned for the saved yaw.

// Private carrier helper (not a new external API)
function carrierInteriorEntry(
  s: GameState, world: WorldQueries, preferred: Vec3,
): Vec3 | null;
```

`carrierInteriorEntry` first checks the existing helm/vestibule destination against local structure and world clearance using the existing walking capsule. If that destination crosses a world plane in a retained old assembly, it partitions existing walking space by capsule-expanded room/wall faces, clips clear cells against the world planes and chooses the closest clear cell-centre candidate. Both local and world clearance are checked again. An ordinary in-world obstruction does not trigger this alternative destination. Failure returns before ownership/pose mutation. The fallback is an explicitly requested boarding/helm-exit transaction with visible feedback, not a save migration or carrier relocation.

The existing command/event/state/schema and `WorldQueries` interface are unchanged. Step uses the accepted hull yaw for both view/steering and saved hull yaw, including stationary, station-kept, disabled and unpowered turns; it does not accumulate a blocked view heading. Pitch, upright attachment transforms and piloting input conventions remain. Boundary contact uses the existing boundary event.

## Boundary and compatibility policy

**New travel:** reserve the existing yaw-independent **17 m Hearthline piloting proxy**, giving carrier-origin **X[-59,171], Z[-167,49]** inside unchanged WORLD_BOUNDS X[-76,188], Z[-184,66]. No arbitrary additional assembly margin or registry dimension change. The physical proxy already encloses deck corners (about13.56m), walking corners (about11.96m), both berth layouts/craft shapes and the exterior vestibule (about13.45m, plus the.34m diver radius) at every yaw. Thus all attached origins and reachable interior/helm/vestibule positions fit through a full turn. Launch has an additional exterior envelope and still runs its existing full-path preflight/commit checks; impossible outward launch/exit may refuse atomically.

Per-slice boundary restriction precedes continuous solid sweeps and the unchanged.2m terrain/full-footprint checks. It never drags the hull to an inner boundary after collision resolution. Tangential movement survives diagonal contact; inward input escapes despite ordinary velocity damping. The generic swimmer, Dart and carrier-local physical sweeps keep their previous defaults.

**Valid older overhangs:** decode is unchanged and performs no new migration. Keep the carrier's saved origin even if beyond the new conservative margin. Each origin coordinate can stay there or move toward its new interval; further outward travel is blocked. Safe tangent/inward movement remains swept. Looking can turn without propulsion, but stops at the first world-plane contact of an attached origin, including an intervening arc extremum even if the requested endpoint would fit. Exact yaw normalization is included in the search to prevent strict-boundary roundoff.

A legacy bridge/vestibule landing outside the world can use the checked dry-passage alternative above, on the player's explicit command. This matters for a loaded old carrier at the east edge whose fixed bridge landing is outside the world even though its berths are valid. If geometry/world planes leave no clear walking space, the command refuses atomically and explains turning/moving inward; a tested unpowered medium corner gains safe access after a5° turn. No charge/repair, hull relocation or forced exit is introduced. Legacy local walking retains its normal physical sweep and rejects only a candidate world-origin step outside the world, leaving ownership and the previous local/world pose intact; safe walking, tangential and inward steps remain possible.

No attachment is independently clamped. No validator is loosened or save hidden/disabled. Cargo, frame/identity, damage, charge rules, launch sequence/completion and compact/medium economics are unchanged. Root should reconcile these additive helpers and explicit legacy access policy; **no new saved-state/API change outside owned paths or migration is proposed**.

## Reproduction and executable checks

Artifact directory: `/tmp/siltwake-m1-carrier-bounds-fix/`. `README.md` indexes scripts, exact inputs, source snapshots, outputs, actual exports, captures, setup exclusions and closure.

- **Unchanged red:** copied the supplied root `carrier-boundary.mjs`, redirected only its output path and ran against clean parent modules. It reproduces last-valid1680 / first-invalid1681: carrierZ65.028571, both attached originsZ66.028571; strict encode fails. Original reviewer/root files remain untouched. Before implementation, the new production fixture→helm→600 ascent→reverse/level→codec regression also failed specifically at1681. Baseline source snapshots match exact parent Git bytes.
- **Original route fixed:** the entire original2000-step schedule and160 inward steps pass; carrierZ49 and childrenZ50 at1680/1681/2000.640 reverse-contact ticks remain valid without oscillation;160 inward steps reachZ42.745345. Independent identity/cargo/non-piloted health/charge accounting pass. Together with both retained-old-state replays below, **2609 complete encode/decode round trips** pass.
- **Retained old state:** the complete old last-valid1680 state decodes unchanged.60 blocked-turn steps preserve its originZ64.978571, and160 inward steps reachZ58.057349 while remaining beyond the new conservative49 margin. It remains coherent/saveable without snapping; the real old invalid state still fails encode/import. A second input is the **actual old production-browser journal at tick2626**, decoded with every state field unchanged. Station keeping,60 turn steps,3 ordinary bounded look steps to face inward, helm and160 W steps keep it saveable: carrierZ59.753162→52.782824, still beyond49. These are223 simulated control steps /226 complete checks of the retained native Save; this is a replay on corrected modules, not fresh legacy-browser travel.
- **New tests:**416 loaded compact/medium edge/corner/heading combinations (24 fifteen-degree headings plus.31/.83); stationary rotation, inward/tangential escape, old overhangs, disabled/no-power/station keeping, ordinary food/air/power, safe interior access/walking, arc extrema, real solid/terrain blockers, exactly-once launch/capture with prepared/lock save/interruption at16 boundary placements, safe vestibule transitions, impossible outward launch/exterior refusal and empty supported reconfiguration. Placement outside the first route is explicitly diagnostic.
- **Additional legacy matrix:**416 staged valid old overhanging assemblies ×3 power modes ×2 turn directions =2496 cases /24960 complete codec round trips. All edges/corners and26 headings. Its1e-9 initial staging inset prevents constructing invalid input through floating arithmetic; production has no such spatial margin. This is diagnostic, not travelled/naturally depleted play.
- **Precision correction:** that matrix exposed an approximately3e-14m corner overshoot when contact yaw was normalized after searching. `yaw-roundoff-red.log` preserves its meaningful red test. Checking the exact saved representation fixes it; the final suite and entire matrix pass.
- **Final `npm run check`:167/167 tests, strict typecheck and production build pass** on the exact committed source bytes. Existing carrier, clearance, save, occupancy, distraction/cache and app/session regressions remain green. A preceding90-test focused run passed; the final full run additionally includes the exact-yaw regression. Earlier passing166-test build is explicitly superseded. Existing large-bundle warning remains.

Final main JS **index-CQyexEOR.js**, SHA256 **b8d8dd0b20a9aa8558bdf982e1f23d91f6d9543945e926de19b234aaf6fbb9aa**. CSS remains **index-DONjl4IF.css**, SHA256 **14756146fd5523913bc59b8079703e86ae867d0250079c88ed57e6198ab0a797**. Source/build hashes and browser-fetched bundle hash agree (`identity.json`, edge observation).

## Actual production browser, separate from diagnostics

Read both browser-rule files before use. Verified Linux factory-worker and actual Linux Chrome headless shell PID827911 under T3 serve811435. T3 preview_status→preview_open; port5193 checked free, task-owned incognito tab with fresh origin storage. Chrome154/WebGL2 ANGLE Vulkan SwiftShader Subzero, Rich1280×800 CSS /DPR2, muted host. No desktop automation, cursor capture or pointer lock. Historical tab14 and concurrent Opus5197 were untouched.

Actual seeded-menu fixture, ordinary UI helm command and balanced page-local keyboard events through production PlayerInput; **no state/progress/pose/inventory/charge/storage/timing assignment**. A passive forwarding clone/input observer retained exact tick inputs and menu commands without changing clone results, and was restored before reload. Full schedule, actual envelopes/journals and controller runs were saved to disk **before navigation**. The initial232 no-input ticks before observer installation are reconstructed and exactly checked against the first actual export, rather than omitted.

| Actual native export | Tick | Observation |
| --- | ---: | --- |
| Initial paused fixture |232| Complete match from fixture plus232 no-input steps; Take helm then occurs at232 while paused. |
| Edge Save/Export |1709| After661 Space ticks and816 S ticks: carrier(65,-.9,49); attached originsZ50. Both actions succeed; autosave enabled, preceding232 journal valid. |
| Stationary turn Save/Export |1797| After40 no-input capture ticks and48 ArrowRight ticks: yaw1.2; carrier origin unchanged; all attached transforms coherent. |
| Inward Save/Export |1957|160 W ticks reach(71.496627,-1.161035,46.489450), ordinary power/velocity behavior, same identities/cargo. |
| Cold Continue Save/Export |2010| Actual same-origin cold navigation/Continue from the1957 journal, then53 no-input ticks; entire state equals the saved state plus normal simulation. Autosave enabled. |

`browser-verification.json` establishes **five whole-state exact actual-export comparisons and2010 codec round trips**, with no omitted fields and only JSON signed-zero normalization. Journal generations and exports match; cold navigation leaves the journal unchanged until the real later Save. Cargo/identity, non-piloted charge/health and carrier charge loss versus power-use accounting agree. `browser/pre-reload-trace.json` contains the complete run-length input schedule and UI/edge trace; all key edges are balanced. This is fresh seeded feasibility, not an earned expedition/campaign carrier acquisition.

Inspected actual `media/edge-playing.png`; retained edge successful-save menu, reload-playing and ascent captures plus their full console/network/accessibility snapshots. The close helm views support this boundary/runtime check, not a new general art-quality acceptance. Browser and standalone schedules are distinct.

Setup exclusions remain explicit: about:blank is unsupported by preview_open, corrected to local HTTP; tracer evaluation initially rejected trailing whitespace while paused, corrected by trimming. An environment-port navigation resolved localhost instead of127.0.0.1 and thus showed a different empty origin; the recorded wrong-origin attempt was excluded, explicit127.0.0.1 navigation restored the unchanged correct journal before Continue. Early test fixture typing/height setup failures are excluded from passing results. The optional old-browser-journal analyzer initially assumed post-turn W pointed inward;3 ordinary station-kept look steps corrected that schedule without source/build changes. No production browser error was recorded.

## Portable integrity, closure and remaining gates

Archive **`/tmp/siltwake-m1-carrier-bounds-fix/carrier-bounds-artifacts.tar.gz`**: **2059316 bytes**, **105 payloads plus SHA256SUMS**, SHA256 **484106c5eeabf3d74f212a0672a006ee8c03713765c2ce343f30a0cdb50fffe4**. Manifest SHA256 **7dd65d379d5235e3a89c87e47c0a8b668e2137f27ea9f43f88112a91b0ef30ff**. Independently verified every indexed local/archive byte, unique safe regular paths and exact manifest. `archive-info.json` stays outside the archive/manifest to avoid self-reference. Scripts resolve inputs/output beside themselves and compiled modules from repository cwd; replay instructions are in README. The original Astra R2 archive still hashes to **0df5198d6fce446b7ece6f332d43eb3c1b733b057b297f93a9bb8b09e41689b9**.

`closure.json`: keys released, observer removed, no controller/recording or pointer lock; owned tab **tab_2a_0430977b-1ed3-45f2-ac72-3683f9fe8942** closed normally through T3. Owned preview session7594 stopped with Ctrl-C (reported exit1);5193 verified free. Source returned clean; this evidence is committed separately. No shared/user/peer resource or original artifact was mutated.

Root owns inspection, helper/compatibility reconciliation, affected integration checks and fresh non-author Astra xhigh + Sol max review on one frozen revision with complete R1/R2 reports/dispositions. Ordinary healthy-battery depletion remains **open for integrated M1**; no hours-long runtime is claimed. The existing conservative hull proxy is retained, not a full rotating-hull collision system. M2 registered mobile refuge/full fleet, campaign/design review, human enjoyment/duration, representative-GPU performance and audible mix remain their existing open gates. This author correction makes no independent batch, integrated-M1 or release acceptance claim.
