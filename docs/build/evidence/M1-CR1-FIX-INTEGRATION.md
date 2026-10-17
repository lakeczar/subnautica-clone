# CR-1 / EXP-2 correction inspection

2026-10-17. Coordinator verification and provisional assembly; **not independent batch or M1 acceptance**.

Correction task `siltwake-m1-cr1-fix-sol-max-b5cedfe` completed with no children/question. Source `f5b6ec2390d51d472d4113495c609125733099a0`, final source including two guidance literals `20451a8dafd014012986e0c8aa1e60df0da7ff25`, evidence `b0bf0aba4ed22a8c9328a419b604d385aca6255a`. Preserved by provisional merge **`83a577b6afe7f16c74bfe63322c4890fec8a9995`**. [Author evidence](M1-CR1-FIX.md). Clean author worktree; owned tab/controller/recordings/servers closed, port5193 free.

## Source and verification

Root inspected the full four-file source/test diff. The three existing hull damage operations in survival.ts now saturate at zero; pre-disable rates, first-disable notice/loss, air/power, threat behavior and strict save validation are unchanged. Tests exercise hunter/pressure/surface-only exposure, continued save round-trips, one loss/notice, original inventory/knowledge/hull identity and air exhaustion. Three failures before the correction are retained; the original malformed pressure fixture attempt is excluded. Only the two authorized guidance literals change in view.ts/progression.ts. No public interface, schema, geometry or economy change needs reconciliation.

Root verified **282 payload hashes/283 archive files**, safe member paths/no links, and **54 exact final source/test/compiler copies** against author Git and assembled checkout. Archive `/tmp/siltwake-m1-cr1-fix-artifacts.tar.gz`, **4,765,442 bytes**, SHA256 `335120dcea0818ed9000381c9602f32b3965886ac0acaadfd72516e2de49e2dd`.

Root **`npm run check` passes140/140 tests, strict typecheck and production build** on assembled `83a577b`. Log `/tmp/siltwake-m1-cr1-fix-root/check.log`. Bundle `index-fUae0k5W.js`, SHA256 **`8993d62a8c97f8dea5749cf7943e0fd3d169da57ad3dc7ded83fa58d49e80e8b`**; CSS `index-DONjl4IF.css`, SHA256 `14756146fd5523913bc59b8079703e86ae867d0250079c88ed57e6198ab0a797`, both match author final bytes. Existing large-chunk warning remains.

Root repeated the retained ordinary-input simulator replay using assembled modules: **224/224 states saveable**, one disable/loss, final health0. Each state matches the original failing replay except formerly negative health saturates to0. Charge94.7241388888877% and air118.61666666666675s remain unchanged. The earlier root baseline reproduced invalid tick25029/−0.2, so the before/after result is observed, not inferred.

Root also reproduced the correction analyzer with independent copied inputs/outputs: **13 exact serialized-state comparisons plus2 actual-export comparisons**,22 valid envelope round-trips. One additional rapid walking/boarding reconstruction is non-exact and explicitly excluded: sampled HUD ticks lag input consumption; its full differences remain, including swimmer versus pilot mode. Saved actual boarding/egress outcomes and the exact480-step egress/3840-step quiet-depth replay are separate evidence. Two exact swimmer rows normalize signed zero through JSON only. No omitted-field or tolerance pass is claimed. Outputs stay under `/tmp/siltwake-m1-cr1-fix-root/`; originals remain untouched.

## Actual evidence inspected and disposition

Root viewed final disabled/pursued cockpit with hull0, limited116s air and Saved notice; unobscured south-launch guidance; actual depth-exit refusal; and post-exit Swimming/original disabled transponder. Close collision/hull/creature geometry occludes much of the failure views; they are not general exterior-quality proof. Voluntary upper-flank hint text is in trace/saved feedback, not the expired-toast image. Root opened no browser and does not claim a fresh gameplay run.

Author's actual final production Save/Export and zero-tick reload/Continue preserve the disabled hull, followed by ordinary protected exit and another successful save/export. Supplemental unmodified earned checkpoints show clear south egress without damage and ordinary suit refusal at153m followed by safe exit at147m. All retain original source/preparation attribution. No fresh long preparation, pressure-only180m browser failure, battery-exhaustion marathon or full recovery rerun is claimed.

**Coordinator disposition:** CR-1/EXP-1 and EXP-2 are corrected provisionally. No new blocker reproduced in this bounded check. All implementation/validation authors are complete; freeze one candidate for fresh non-author Astra xhigh and Sol6.1 max to review both full named batches. This pair must cover all M1 changes since accepted M0, including the earlier art/presentation/core deliverables—not merely this small correction. Separate integrated M1 verification/review still follows batch acceptance.
