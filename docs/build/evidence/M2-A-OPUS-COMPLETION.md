# M2-A Opus completion — regional residency and expedition presentation

2026-10-19 · builder **claude-opus-5-5, effort high** (requested; T3 does not expose an independent effective-effort readout). T3 worktree `/home/worker/.t3/worktrees/subnautica-clone/t3-3fcfcfbd`, branch `t3/canopy-basin-expedition`, clean baseline **b52155eb05d16bfcb5e8e2cd4e3ee8bbd491493c** (production identical to 6319184). Commits: **941008e** region retention + idle preparation, **018f8ba** Pale Basin water, pulse refusal reasons, build tag. This report is the builder's evidence, not acceptance; root inspects it and commissions the fresh Sol6.1/xhigh review.

Private evidence: `/home/worker/.local/share/siltwake-evidence/m2-a-opus-completion/` (README, `MANIFEST.txt` SHA256 `57db371b8279c8b5c605491627d11c9484162a32bf9560a8a0b3de23edb96bd6`, 168 files). Paths below are relative to it.

## What changes for the player

- **Returning to a region no longer rebuilds it.** Leaving the two-region detailed view used to dispose a region; coming back rebuilt every mesh and GPU buffer from numeric recipes, 10–25 ms per return on SwiftShader. Under contention the previously recorded tails reached 51.8/78/65.6 ms. A region that leaves the detailed pair is now detached from the scene with its buffers intact and re-attached on return: **0.25 ms median, 3.0 ms maximum** across 56 warm transitions.
- **The first trip into the Canopy or Basin no longer stalls mid-swim.** While the title, pause or entry-ready screen is idle, the game builds nearby regions into retention, one per frame. On the title this happens right after startup (Canopy 281.8 ms, Basin 61.7 ms on the final build). The first Canopy entry then costs 17–23 ms instead of 272–387 ms cold; the remainder is the page's first Dart hull construction.
- **Pale Basin looks like its own place.** Below the Canopy edge the deep water blends to a pale silt jade at unchanged haze density. Ridges, survey towers and dishes silhouette against it instead of disappearing into the darkest navy on the route. Canopy and shallower water are untouched.
- **An unavailable G pulse says why**: `G · no cell with 25 charge` or `G · face the survey area`, followed by the free alternatives, instead of `G · unavailable`.
- The title/pause build tag reads `FIELD BUILD / M2`.

Simulation, saves, collision, hunter, region selection/hysteresis and economy are unchanged: schema 3 / `expedition.4`, no migration needed.

## Design and tradeoffs

**Retention, not faster reconstruction.** Prior evidence showed the misses on Reef/Isles reconstruction, including returns that create no Dart. Wall time could not be attributed between work, GC and descheduling, and further caching would only shave the same work. The decisive change is to stop doing that work on a return. `createRegionResidency` now keeps owners that leave the detailed pair in an LRU of *retained* owners, bounded by `RESIDENT_REGION_LIMIT = 4` (detailed plus retained). Retention mirrors Babylon's asset containers: `removeMesh`/`removeGeometry` on suspend, `addGeometry`/`addMesh` on resume. Retained meshes are absent from `scene.meshes`, cost nothing per frame and draw nothing. On return `update(state)` reconciles them before drawing, so depletion, imports and replacements read the current state exactly as a fresh build would. Retained owners do not count as resident for actors.

- **Memory.** The four benchmark regions total about 450k vertices. That is roughly 6 MB of attribute/index data per region on the GPU plus Babylon's CPU copy, beside the unchanged 22.8 MB numeric recipe cache. The limit of 4 equals the current region count, so after preparation every benchmark region stays resident. That is deliberate and measured. The limit is what keeps the planned 2.0×1.8 km, seven-region world bounded, with eviction tested.
- **Context loss.** Detached geometries are not engine-rebuilt, so `onContextLostObservable` discards retained owners. The recipe cache then rebuilds them, which is the old warm path. Context loss is rare, and idle preparation refills retention afterwards.
- **Idle preparation.** `GameRenderer.prepare()` builds the nearest non-resident region (by adjacency) straight into retention. `canvas.dataset.prepared` records its cost separately from `activationMs`. The app calls it only when play is not advancing: no panel open, no session work, tab visible, canvas ready, and at least 250 ms after the last active frame so a pause menu draws first. Stalls of a few hundred milliseconds therefore land on the title or pause screen, never during swimming or panel use. If a player starts immediately, first entries behave as before: cold, with no regression.
- **Parked hulls** outside the detailed regions are hidden rather than disposed and rebuilt. They are disposed when absent from state, when their hull changes, or when the session ends (`update(null)`). The fleet is small and bounded by design.
- **Alternatives rejected.** Shared GPU buffers with leases would need a new ownership model for the same benefit. Time-sliced construction is the right future answer for a much larger world, but here it would rewrite four synchronous factories. All-region scene residency would keep evaluation cost and lack a bound. A threshold change was never considered.

**Pale Basin tint.** The world specification calls the Basin a place of rippled sediment, where you "read visibility and sediment", yet it rendered as the darkest water on the route. A render-only factor in `updateOpticalUniforms` blends across z −168→−194, x 92→112 and depth 116→146 m toward `#4f807c` (weight 0.82). Haze density, the Canopy band and all shallower water are exactly unchanged; the test pins them.

## Warm activation and the 50 ms trial

Predeclared `PLAN.json` (SHA256 `6cb0bbad…`): same host and session, interleaved **candidate/rich → baseline/rich → baseline/light → candidate/light**. Each block runs Continue refuge13845, setup A0/B0/C0, then A1–A6, B1–B6 and C1–C3. A is the compose008 return to 10149, B the refuge13845→diver12645 replacement, C the paused cockpit import at 9899. The setup is factory-worker Linux, T3 headless Chrome154, ANGLE/SwiftShader, CSS 1280×800 at DPR 2, muted, drag controls and a controlled-RAF observer, with no reruns. The baseline bundle is rebuilt from b52155e and byte-matches root's `index-kTTrtuXt.js` (SHA256 `7877db88…`).

| Population | Warm n | Median | p95 | Max | >50 ms | Whole-callback max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Baseline, Rich + Light | 56 | 11.75 ms | 20.2 ms | 22.7 ms | 0 | 31.4 ms |
| **Candidate, Rich + Light** | 56 | **0.25 ms** | **1.2 ms** | **3.0 ms** | 0 | 9.7 ms |

Cold first-use stays separately classified: startup 343.9–427.1 ms; first Canopy entry without idle 271.8–386.9 ms in both builds. Host load average was 1.83 at the first block and 5.05 (five-minute) after the final candidate block, from other users; candidate/Light still peaked at 1.3 ms. All 11 page sessions are gap-free in `raw/input-ledger.jsonl`.

**Preservation.** Across 1,038 paired baseline/candidate frames (`raw/comparison.json`), HUD, tick, active regions, camera position, readiness and **draw calls are identical in every frame**. Two counters differ, as expected: materials/textures (+5, retained sign rasters) and mesh/vertex counts in 15 frames (a hidden parked Dart, zero draws). After the same A→B→C sequence, baseline and candidate cockpit screenshots are **byte-identical PNGs** (`captures/*-cockpit-after-ABC.png`, SHA256 `0d14e9fe…`, 0 differing pixels). NullEngine tests add exact identity: retained or prepared output equals a cold build, and recipe rebuild after loss equals the first build.

**First entry after title idle** (`FIRST-ENTRY-PLAN.json`, final build): four title frames, then Continue. Canopy is prepared on the title in 284.8/293.2 ms. The first Canopy entry costs **23.3 ms Rich / 17.0 ms Light**, including the first Dart construction, against 272–387 ms cold. Every later transition costs 0.3–0.8 ms.

**Disposition — no waiver claimed, and an explicit recommendation.** The baseline did not reproduce a miss on this quieter host either, consistent with the dedicated profile. So this is not a reproduced-and-fixed miss. It is a removal of the measured activation work (about 50× smaller median) that previously stretched into the misses. A warm return now detaches and re-attaches a few dozen meshes, independent of region geometry. Three paths remain that can still do construction work in a warm-classified frame:
1. the first activation after a context loss (recipe rebuild, the old path);
2. first construction of a hull actor never seen in the page (17–23 ms observed);
3. any future world large enough that eviction occurs.

I recommend **keeping the 50 ms warm predicate unchanged** and adding a separately measured **first-entry budget** to the gate. On the target machine, that cold region construction during play is the larger visible hitch. Idle preparation now makes it avoidable for ordinary play, but it remains cold when the player starts immediately. Dedicated-GPU pacing remains unverified.

## Play and visual checks

- Real-RAF `play.html` (final build) from New Game title: regions prepared before New Game; the opening and the M1 pod check are unchanged.
- Earned012 in the Canopy (hunter warning): readable cockpit, lantern plants, HUD. This surfaced the bare `G · unavailable`, now replaced with a reason.
- Earned022 Basin parking and earned024 C06 site, deterministic frames, before and after the tint: `captures/basin-tint-before-after.png`. The final-build capture `final-basin-earned022-rich.png` is byte-identical to the tinted candidate capture.
- Final title: `FIELD BUILD / M2`; real-time preparation as stated above.

Unchanged and reused, with original attribution: the earned C01–C06/refit/useful return/same-Dart recovery (b91cde9), the affected healthy reboard, natural disable, open-water and reload futures (6319184, report 2d327531), and hunter contact/cost. Simulation is untouched, so their behavior is unchanged. Rendered hull visibility now hides rather than disposes remote parked hulls; the matched frames above cover that path.

## Checks on final source 018f8ba

Serial, Node 24.21.0, `NODE_OPTIONS=--max-old-space-size=1024` (`checks/`):

- `npm run typecheck`: pass.
- Clean `tsc -p tsconfig.test.json`: pass.
- `node --test --test-concurrency=1`: **546/546 pass**, 0 fail/skip/cancel, 128.0 s.
- `npm run build`: 27 files hashed. Main `index-3O6wrmWR.js` SHA256 `5949ddbf46c05a99af0cb0383945e772ab55e004dc707493f96333dc1a44b435`, identical to the browser-verified final build. CSS `index-CHzXt-7W.css` is unchanged. The large-chunk warning remains.
- Economies: M1, design, M2 fresh, and M2 `--earned` on the retained completed route (`earned-return-after-Continue.json`, SHA256 `45840e66…`) all exit 0.

There are five new tests:
- residency ordering, LRU, resume-before-evict and fallback;
- prepared/retained output equals cold output across quality and depletion;
- app preparation gating;
- the exact pulse reasons;
- Basin water continuity, with the route and density unchanged.

Rewritten to the new contract: the revisit, parked-hull and traversal tests, which now assert hiding, re-attachment and drawn-geometry stability where they asserted disposal.

**Test-author note.** In NullEngine, Babylon's `addMesh` defers a notification closure (`SetImmediate`) that holds each temporary primitive until the event loop turns. A long synchronous test that builds several full regional arts can exceed 1 GiB, although the heap returns to 18 MB after a yield. The heavy new test yields between constructions. This is not a production leak.

## Browser resources

Both browser-rule files were read before any browser work. T3 preview on factory-worker Linux, each tab a new isolated incognito tab closed through `t3_preview_close`. Owned HTTP server PID 2865456 on 127.0.0.1:5190 was stopped and the port verified released; final `preview_status` shows no tab. No Windows, pointer-lock, shared or peer resource was touched. No profiler was needed.

## Remaining limits and recommendations

- **Not established:** dedicated-GPU pacing, human control feel and recognition, duration/enjoyment, audible mix and screen-reader speech. Timing comes from SwiftShader with a controlled RAF.
- **Unchanged evidence gap:** the healthy active-pursuit footage still faces away. That hull-blocking proof remains the shared production diagnostic; the hunter was not modified.
- **M2-B — close the Basin loop early.** The Basin haul (alloy, fin crust, Creel and carrier plans) has no M2-A sink beyond "Plans retained · construction not available yet". The first M2-B build should spend it on a visible capability, such as the Creel service berth, so preparation → discovery → return → better capability closes. Adding a Basin-funded refit inside M2-A would change settled scope, so I did not.
- **M2-B — hunter envelope.** Revisit the conservative full-animation fleet envelope (Sol R1: 93/162 sampled poses refuse a tiny yaw near a parked Dart) when multi-hull routes arrive.
- **M2-B — retire the carrier fixture menu.** When the earned carrier lands, retire the player-visible "Carrier feasibility fixture" menu entry (concise menus), or gate it as a developer fixture. It is left in place now because evidence and review workflows use it.
- **M2-C / world scale.** Above about five resident regions, add time-sliced region construction and explicit GPU-memory accounting for resident regions. `RESIDENT_REGION_LIMIT` and `prepare()` are the seams.
- **Exit orientation.** Exit places the diver 3.1 m to the Dart's right with the craft's heading, so the craft starts just outside the left of view. The affected-play run then hit `Nothing within reach`. Watch this in human play before changing camera behavior, per root's earlier caution about automatic orientation.
