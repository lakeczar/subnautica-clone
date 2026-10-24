# M2-A hunter contact and withdrawal

The hunter now investigates at a stand-off, approaches an occupied actor's visible surface, makes bounded mouth contact and backs away between attacks. A retained overlapping animal separates through active simulation without an inside bite. Damage rates, warning/counterplay, static Canopy landmark, camera, player movement and save decoding remain unchanged. This is the assigned implementation handoff, **not independent M2-A acceptance**.

Source commits are **f3c5d79c26daf1a0baa338069f9d4552e257a526** and the carrier end-contact correction **4583671b2df61bfb181a49813e9877d6921c2bf0**. Final production is4583671. The exact clean parent was **256f1c79a926ec7b355c5ecc50942d6ffddfca2a**, containing inspected assembly9877c8a. The original runtime `turn_context` confirms **gpt-6.1-sol/max** in this T3-bound checkout, branch `t3/hunter-contact-withdrawal`. See `original-runtime-context.json`, `raw/original-startup-verification.json` and `raw/final-worktree-binding.json` in the artifact directory.

**Final `npm run check` is527/530: three unowned immediate-bite fixtures require reconciliation.** Typecheck, the separate production build, all three economies including fresh/completed-earned M2 inputs, and the ten new contact tests pass. No unowned repository file was edited. The exact proposed fixture patch passes109/109 affected app/expedition tests in a disposable derivative; details follow below.

All new artifacts are under **[/tmp/siltwake-m2-a-hunter-contact/](/tmp/siltwake-m2-a-hunter-contact/)**. `README.md` indexes reproduction, provenance, motion and receipts. `manifest.json`, `artifacts.tar.gz` and `seal-receipt.json` freeze the handoff; the receipt contains their final hashes. Prior compose, direction, correctness and landmark roots remain read-only. Only the ten assigned source/test paths and this new report changed. No children, peer messaging/polling/waits, parent edits, push, PR or merge occurred.

## Implementation and shared interfaces

`src/content/encounterGeometry.ts` exports readonly numeric `Point3`, `LoftSection`, `ContactBox`, the unchanged scout/Spindle/Creel/Hearthline primitives, `HUNTER_GEOMETRY` and conservative animated `HUNTER_PART_ENVELOPES`. No Babylon object enters simulation. `expedition.ts` consumes those unchanged authored values and the derived hunter pose; its static Canopy section is untouched.

`src/sim/hunter.ts` exports `encounterRotation`, `hunterPhase`, `hunterStandOff`, `hunterPose`, `hunterPenetratesActor`, `hunterContact` and `moveHunter`. Actor queries use the actual loft, pane, box and float surfaces, including projecting tools/fins and the carrier's twin keels. Dart pitch and semantic yaw match the renderer. The mouth, body yaw, bounded roll and fin phase derive from saved state/tick. The existing threat timer supplies the cycle; there is no additional saved or mutable renderer-only phase. The follow-up commit selects an existing keel end-face centre for an end-on carrier approach within keel span, avoiding an unreachable inner corner without enlarging reach or changing vertices.

| Parameter | Final value |
| --- | --- |
| Local mouth | `(0, .46, -4.01)` metres |
| Planned mouth gap / maximum damage reach | `.5m / .65m` |
| Investigate extra gap | `4m` beyond contact |
| Pursuit cycle | `3s`: first `2s` approach/contact, final `1s` withdraw |
| Withdrawal extra gap | `3.5m` beyond contact; nose continues to face the actor |
| Pursuit / investigate speeds | Existing `7m/s / 3m/s` |
| Penetration-only outward yield | At most `13m/s`; no bite during the yielding step |
| World sweep descriptor | `{ radius:4.65, bottom:-1.23, height:2.91 }` |
| Hull / diver contact loss rate | Unchanged `12 / 10` per active second |

Contact is tested **after the accepted sweep**, from the actual transformed mouth to the closest visible actor surface. Actor penetration, world-envelope obstruction, blocked mouth LOS, withdrawal, refuge, cover or distraction prevents damage. `survival.ts` retains the outer state machine, interest/noise, warning timing, territory/release and quiet logic, existing positive raw-loss/clamp behavior, target identity, disable/incapacity priority and periodic spatial sound policy. Bites no longer use a several-metre origin sphere. Zero/vertical direction uses a deterministic home-relative horizontal direction, then+X. Overlap yield tries a finite ordered set of swept directions and can block safely.

The only world interface extension is readonly `MovementOptions { readonly separateBoxOverlaps?: boolean }`: optional fourth `WorldQueries.moveCapsule` argument and optional **seventh** `moveHull` argument. The **sixth `observeSupport` callback is unchanged**. Only hunter movement opts in; `step.ts` needs no edit. Ordinary-box escape is non-deepening for every initial overlap, honours supplied solid/floor rosters, checks all slide segments/endpoints and newly encountered terrain/solids, and handles ties, ribs, boundaries and nonfinite refusal without teleporting.

## Checks and essential unowned proposal

Final logs and their hashes are indexed by `raw/final-check-receipts.json`; source/build identity is in `raw/source-build-receipts.json`.

| Check on4583671 | Result |
| --- | --- |
| Clean full `npm run check` | Typecheck passes;527/530 tests, three failures below; chained build consequently not reached |
| Separate `npm run build` | Pass,9.21s; existing large-chunk warning retained |
| Ten new contact tests |10/10, including carrier end approach, all hulls/diver, cycle boundaries/large timers, overlap, moving/turning/disabled actor replacement, obstruction, supplied rosters/ribs/terrain/bounds |
| M1 economy / design economy | Pass; arithmetic/staged-rule scope retained |
| M2 fresh / completed earned economy | Both pass, including original completed-save provenance |
| Existing35 source/work views | Full original targeting coverage passes: collision validity, aim/LOS, matching actions, looking away, depletion and saveability |
| Default movement compatibility |1,350 exact direct movement comparisons;1,350 `moveHull` plus sixth-callback comparisons;1,350 clearance/LOS comparisons |
| Retained decoding | All13 copied earned/economy inputs decode to their complete original state without relocation or rewrite |

Final main bundle is `index-DJKuwSqO.js`,1,480,299 bytes, SHA256 **`524d2acde8ba93135ad9fbc36d45ae867de7bb65f8028e33dc9d09205252d16a`**. All27 production build files and192 compiled files equal their final archived snapshots. The receipts verify104 baseline source/test/config snapshot files,107 first-source files,107 final files and110 final Git inputs. The default movement screen is bounded evidence, not an exhaustive proof for every possible retained pose.

The remaining full-suite failures are:

- `app: several fixed steps in a frame deliver each actual bite once against its own installed state`.
- `app: a later real pressure-disable batch cancels the real HUD onset without a second bite`.
- `continued hunter damage keeps the original disabled hull saveable without renewing air or losses`.

These seed the animal inside the actor and expect an immediate bite. The new no-penetration rule correctly withholds it. **Root proposal:** in `tests/app.test.ts`'s shared `appInjury` fixture, import `hunterStandOff`, seed an exterior bearing atx144 for actorx132, then set the hunter to `hunterStandOff(s)`. In `tests/expedition.test.ts`'s continued-damage fixture, seedx+12 rather thanx+3 and likewise select the actual contact pose. Preserve every existing assertion. The complete unapplied patch is [raw/unowned-fixture-proposal.patch](/tmp/siltwake-m2-a-hunter-contact/raw/unowned-fixture-proposal.patch). Its final-source disposable diagnostic is **109/109**, `logs/proposed-fixtures-final.log`. An exterior seed matters: choosing stand-off from inside a projecting fin can point at an unsuitable surface. Repository app/expedition tests remain byte-identical to the parent; root owns their reconciliation.

## Actual play evidence and source attribution

Browser work used T3 `preview_status/open`, a verified **factory-worker/Linux x86_64** environment, one owned incognito/storage-isolated tab at a time and free port5190. Browser rules were read from both fleet and repository before the sessions. Chrome154/WebGL2 uses **SwiftShader**. Captures are actual production rendering with ordinary keyboard/menu actions, controlled rAF scheduling and coordinate assistance; the recorder observes input, clocks, DOM events and application export Blobs without setting gameplay state. Simulation events and contact geometry are reconstructed by final-source replay against those actual exports. Videos include tool/menu pauses and were inspected muted. Active-step timing, rather than wall-clock duration or playback feel, owns the measurements.

Most full affected routes were recorded on **f3c5d79**, production bundle `index-BJ5TWisb.js`; their source/build snapshot is `f3c5d79-browser-source/`. Earlier initial trials remain separately labelled `trial1/`, with failed/menu-only tool attempts retained in the ledger. Final4583671 changes only carrier contact targeting; final compiled modules reproduce the retained Dart/diver routes. A fresh final production session explicitly served `index-DJKuwSqO.js` and repeated original043 load/yield/Save/page reload/Continue and open-water diver contact/withdrawal. The ledger's `FINAL-SOURCE-BEGIN` and `FINAL4583671 production confirmation` markers distinguish these sources. Do not relabel every earlier video as a final458 browser run.

### Retained disabled overlap043

Original earned043 loads unchanged at tick11865, retaining its disabled original Dart and complete state. Within90 active steps/1.5s the hunter is at `(124.31582858424548,-102.69059434668404,-94.74634699355951)`, outside the current actor, with no penetration bite, health100 and unchanged player/camera pose. The baseline camera remains obscured by the coincident animal after the same interval; the candidate view opens without transparency, scale, FOV or seat changes.

- [Matched baseline/candidate043 image](/tmp/siltwake-m2-a-hunter-contact/frames/baseline-final043-comparison.png): baseline left, f3c candidate right.
- [Final458 actual yield motion](/tmp/siltwake-m2-a-hunter-contact/motion/production458043-yield.mp4) and [final458 view after1.5s](/tmp/siltwake-m2-a-hunter-contact/frames/production458043-after-1.5s.png).
- Actual Save/page reload/Continue preserves the loaded complete state and produces the same candidate90-step future. Decode itself does not separate the animal.

### Original controls, separate loud motion and recovery

The exact original012→043 released-input sequence now produces a different valid outcome: first hull contact at11337, and **48.70205715200832 hull at the old failure tick11865**, still mobile. [Original controls on candidate](/tmp/siltwake-m2-a-hunter-contact/motion/final012-original-released-controls.mp4) and `inputs/original012-043-controls.json` preserve this result. It is not presented as another disabled043 trajectory.

A separate ordinary W/S piloting continuation keeps making noise through normal movement, without injected loudness or health loss. The same Dart actually disables at **12373**,17.2667 active seconds after first contact. Protected exit works at12405. A separate ordinary sprint W/S diver continuation first takes health damage at12453 and incapacitates at **13683**,20.5s later. Refuge recovery leaves one failure/cache and retains the original disabled Dart, investment and remaining charge; no duplicate hull or resource subsidy is introduced.

The ledger checkpoint `final-ordinary-hunter-disable-withdrawal` at12285 was named prematurely: hull was **.7020571520081667 and still mobile**. Its durable correction note and the actual12373 disable remain; no label or trajectory was rewritten.

- [Ordinary loud piloting/contact motion](/tmp/siltwake-m2-a-hunter-contact/motion/final-ordinary-loud-motion-contacts.mp4), [actual disable](/tmp/siltwake-m2-a-hunter-contact/motion/final-approach-actual-disable.mp4), [ordinary diver contacts/incapacity](/tmp/siltwake-m2-a-hunter-contact/motion/final-diver-ordinary-contacts-incapacity.mp4), [recoverable outcome](/tmp/siltwake-m2-a-hunter-contact/frames/final-recoverable-incapacity.png).
- An initial look-toward-hunter diver branch had the abandoned Dart obstructing the eye line. [That blocked-view motion is retained](/tmp/siltwake-m2-a-hunter-contact/motion/final-diver-view-blocked-by-original-Dart.mp4). Ordinary rightward swimming and arrow turning then reached open water for a separate face-on inspection; no camera/player setter moved the actor.
- [Open-water approach/contact/withdrawal motion](/tmp/siltwake-m2-a-hunter-contact/motion/final-open-water-diver-contact-withdrawal.mp4), [motion sheet](/tmp/siltwake-m2-a-hunter-contact/frames/open-water-motion-contact-sheet.png), and [final458 production confirmation](/tmp/siltwake-m2-a-hunter-contact/motion/production458-open-water-contact-withdrawal.mp4). The last repeats13311→13431 exactly, health34.6667→26.1667. The animal recedes enough to expose the forward scene between approaches; individual moving-target damage-frame interruptions can be shorter than the sustained withdrawal interval.

### Stationary rule fixtures: measured reduced duty cycle

These are explicitly **100-health stationary loudness1 fixtures**, separate from ordinary-control evidence. Full events, geometry, mouth/actor/hunter poses and health are retained in `raw/stationary-rule-trace.jsonl`. Earlier76-health diver diagnostics are kept under `stationary-rule-initial76-*` and are not the100-health measurement.

| Fixture | First contact | Failure | Time after first contact | Sustained separated breaks |
| --- | --- | --- | --- | --- |
| Diver,100 health |209 |1335 |18.7667s |1.45–1.4667s |
| Dart,100 hull |209 |1147 |15.6333s |1.45–1.4667s |

Both meet the≤30s active-time danger trial and≥.75s between sustained contact runs with unchanged10/12 rates. Withdrawal and travel reduce damage duty cycle rather than raising damage/noise. Moving actors can briefly cross the animal and can interrupt contact within the approach phase; penetration suppresses damage and invokes outward yield. This is not a guarantee that every one-frame damage gap lasts.75s, nor that a fast quiet/boosting Dart cannot escape.

### Warning to true cover; separate quiet retreat

The retained ordinary-control assisted responses still show warning/investigate **before** real cover, followed by disengagement:

| Input | Immediately before cover | First true cover | Disengage |
| --- | --- | --- | --- |
|009 |11043, investigate, no cover |11044 /8.05s from import |11089 |
|012 |11157, investigate, no cover |11158 /4.2333s from import |11158 |

Both retain hull99.30205715200904/health100, inventory and no pulse/cell consumption. The012 response includes observation/turning. Actual012 Save/page reload/Continue at11215 is complete-state equal. [009 response motion](/tmp/siltwake-m2-a-hunter-contact/motion/final009-warning-cover.mp4) and [012 response motion](/tmp/siltwake-m2-a-hunter-contact/motion/final012-warning-cover.mp4) preserve the elevated fork/descent and existing physical west-edge cover. Exact011 Rich/Light images at1280/960 are retained; Light internal pixels are853×533 and640×533 respectively. This does not establish unaided landmark recognition.

The **separate** quiet012 open-water branch runs264 steps including an extra.1s observation, never enters cover, disengages without damage and uses no pulse/cell. [Quiet open-water motion](/tmp/siltwake-m2-a-hunter-contact/motion/final012-quiet-open-water.mp4) is not an already-disengaged shelter branch.

## Persistence and earned recovery preservation

The durable ledger contains actual inputs/UI actions, phase/timing, state/export records and errors; `saves/` holds application Blob bytes. Final compiled replay covers **57 actual browser exports,5,622 active steps and one command**: **55 complete states exact**, two differing only in hunter coordinates by at most **5.684341886080802e−14m** between Chrome/Node Math runtimes. All other fields/events match; there are no replay errors. These counts include trial and reload branches, not57 independent full routes.

`raw/evidence-analysis.json` verifies nine original actual complete-state Save/Continue pairs through contact, withdrawal, approach, disabled overlap, cover and active Bobbin recovery, plus final458 original043 load equality and its identical90-step future. Final458 open-water future equals the earlier candidate future, a separate source-equivalence comparison. Reload is compared against the **candidate's** future, not old AI health/position expectations. Across retained branch/reload samples, **1,528 threat-damage events** have valid clear nonpenetrating post-sweep contact. On the fatal step, inspection reconstructs the pre-relocation actor from the actual recovery cache, previous look and next timer, because damage precedes same-step refuge relocation; it does not mistake the relocated refuge actor for the bitten actor.

Bounded earned continuations are distinct from new browser campaign play:

| Original input and continuation | Steps / actual commands | Minimum oxygen / power | Preservation |
| --- | --- | --- | --- |
|025 Basin cargo→026/027/028 useful return |4,851 /4 |63.96296% /83.96677% | Original cargo, refits, discoveries, paid investment, original Dart and return/service result |
|036/037 mid-Bobbin→038–041 recovery/return |8,844 /9 from037 |88.81481% /87.91255% | Same disabled vessel/tow, local paid patch, useful return and stored cargo |

All named checkpoints match original complete gameplay state excluding the intentionally changed `world.threat`; in these suffixes that threat state also happens to match. There are45 codec-round-trip/candidate-future equality checks. Original036/037 operation identity remains; actual036 import/Save/page reload/Continue and120 active steps retain the same operation/vessel. Actual025 and036–041 browser imports/exports are retained unchanged. The historical whole earned route remains attributed to b91cde9, including its61.63%/83.97% minima; these affected suffixes are not relabelled as a fresh complete campaign or fresh unaided route.

Twenty native exports from the first tab were copied before cleanup and match retained application Blob bytes20/20. **Six final-confirmation native download files were removed by normal tab close before the copy**; the copy failed with `FileNotFoundError`. Their six actual application Blob exports remain intact in the ledger/saves with hashes. `raw/production458-native-download-receipts.json` records this distinction. No claim is made that those six native files were archived.

## Geometry, lifecycle and costs

The final-source animated audit compares53 actual actor meshes with the parent: raw positions/normals/indices/colors are identical, SHA256 **`c51c9e23169be4fa82cdd40fbf403a12d5316fd5aaa21c779bfcb573f4b70841`**. Across601 animated pose samples and1,971,881 triangles, maximum horizontal radius is4.5016418158011415m, vertical extent−1→2.700000000000003m and render/numeric mouth discrepancy≤8.222e−6m. Every sampled full art triangle fits a conservative separation piece and the sweep descriptor. This is measured sampled coverage, not an exhaustive continuous-pose proof.

The final actual-skin audit inspects168,256 production world-space hull triangles over96 hull/yaw/bearing cases. All reach valid contact after at most six additional swept approach steps; maximum closest-skin discrepancy is5.275e−7m, with zero current actor art/separation-piece intersections. Its closest-point/SAT kernels are extracted from final source, but the input geometry is the actual full production art rather than the contact descriptor. Tests separately exercise Dart pitch, rapid turning, disabled control, boarding/exit actor replacement, home coincidence and vertical offsets.

No authored meshes/vertices/materials are added by this task. Parent/final Canopy statics have identical names/positions and counts:11 meshes,96,622 vertices,151,052 triangles. Repeated lifecycle probes keep resource/cache counts bounded. Double disposal leaves zero owned meshes/geometries/textures/cache/labels; the two supplied shared materials remain until subsequent scene/engine disposal. Actual visible draw counts can change as the moving animal enters/leaves the view.

Collision/contact work has a material CPU cost. These same-process Node/NullEngine measurements are **not GPU/frame-pacing results**:

| Threat scenario,360 warm steps | Parent mean | Final mean /p95 /max |
| --- | --- | --- |
| Idle |.02899ms |.05095 /.13666 /3.36379ms |
| Investigate→pursue |.01857ms |2.43127 /8.55497 /12.71406ms |
| Pursue |.01134ms |4.24032 /8.99679 /25.40158ms |
| Earned043 overlap |.01641ms |2.53881 /3.08043 /4.07201ms |

Typical active steps use one sweep,18 ground samples, one clearance and one LOS, versus the parent's one sweep/nine ground samples. Yield may try additional sweeps. Final first-call cases are1.95/2.86/.18/1.14ms respectively; they share module warm-up and are not independent cold-process samples. Full numeric meshes and conservative actor penetration tests explain the added work; performance remains for root/review disposition, with no hidden renderer rewrite or waived budget.

Two lifecycle passes measure parent scene construction3.256/3.182s versus final3.475/4.245s; first Canopy352.7/295.7ms versus365.9/361.1ms. Warm reentries span2.83–13.43ms parent and2.84–13.86ms final. Actual browser cold/page/reload activation spans approximately671–844ms; first Basin109.3ms and a later first reef/island activation412.8ms are separate from warm reentries10.1/59.3ms. Historical first scene487.4ms, first Canopy338.3ms, new-page Canopy761.1ms, first Basin90.5ms,138.7ms new-session island activation and **50.6ms return above the50ms trial** retain their original source/context. These costs remain open; SwiftShader and bounded probes do not certify representative dedicated-GPU60fps.

## Limits and release

Hunter sweeps honour the unchanged static world roster and the **current** controlled actor surface. Non-controlled parked vessels are not newly promoted to wildlife world obstacles; the abandoned-Dart inspection exposes overlap with that vessel. The current actor's contacts are audited nonpenetrating. A general dynamic-fleet collision system is outside this assignment and is not claimed. Brief overlap when a player moves into the animal is possible; it cannot bite while penetrating and yields through swept simulation.

Fresh-human route learning/recognition, physical mouse feel, audible mix, screen-reader speech, enjoyment/duration and dedicated-GPU performance remain unverified. Controlled clock playback and coordinate-assisted ordinary controls establish bounded behavior, not those acceptance criteria. The three unowned test-fixture updates and the measured CPU/first-use costs require root inspection; no green full-suite or complete-batch acceptance is claimed.

Both owned incognito tabs were closed through normal T3 lifecycle, recordings stopped and verified owned servers SIGTERM-stopped. Their PIDs are absent and port5190 passes a bind/free probe. `raw/resource-lifecycle-turn-records.json` retains original cleanup results; `raw/production458-resource-release.json` records final release. No human/shared/peer host was stopped. The evidence commit is separate from both source commits; `handoff.json` records the final clean checkout and commit IDs. All assigned paths/resources are released after handoff. Root inspects this correction and dispatches fresh non-author Astra xhigh/Sol6.1 max review of the **whole M2-A batch**.
