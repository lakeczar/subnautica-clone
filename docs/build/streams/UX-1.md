# UX-1: the Hearthline is a ship you command

Opus 5.5 high. Branch `t3/ux-1-carrier-stations`, from root `fb51c50`, with root merged up to `7070084`: SCHED-1, TT-1, the second worker and docs, none of it in `src`. Spoiler-free. Answers M2 audit finding #2 ([audit](../reviews/M2-OPUS-EXPERIENCE-AUDIT.md)).

## What changed for the player
- **Stations, not a panel.** Aboard, you aim at a fixture and press E, as in the Creel cabin:
  - the **helm** on the bridge takes the helm;
  - the bridge **lock console** and the vestibule **berth panel** open the Hearthline console;
  - the **stores** lockers open cargo;
  - the **vestibule hatch** (once you stand on the yellow floor) lets you out.
  - Outside, the **hatch on the starboard side** boards the Hearthline while it holds station.
  - V opens the same console from anywhere aboard or at the hatch.
- **The helm is on the bridge.** The view stands behind the bridge console and looks out of the bow and side windows. Before, the eye sat at the keel datum inside the lock bay.
- **Looking around doesn't steer.**
  - Mouse and arrows move a head look (clamped to ±109°, up 34°, down 49°). A/D are the rudder: about 18°/s, easing in over 0.6 s. W/S are ahead and astern; Space/C rise and dive. The hull stays level.
  - Taking the helm no longer swings the carrier to wherever you happened to face.
  - Throttle or rudder while holding station takes the helm back.
  - When you leave, your walking view carries on from where the head look was.
- **Leaving the helm is X.** X holds station and leaves, once the carrier makes under 0.6 m/s. Under way it says how fast you are going and to ease off. The notice is now true: "You leave the helm. The Hearthline holds station." Before, it repeated the previous message.
- **A readable lock corridor.**
  - The corridor (the craft's envelope from the gate to the launch point) is drawn in the world: mint when clear, amber when obstructed. It shows at the helm and beside the lock consoles. For a pilot bringing a craft home, it shows as a blue guide within 60 m of the lock mouth.
  - The helm readout gives heading, way, depth, water under the keel and the corridor's state.
  - **A refusal says what to do.** For example: "The lock corridor under the bow is obstructed. Turn about 35° to port for clear water, then launch the Dart." If no heading clears it: "Rise about 4 m", or "Take the Hearthline into open water". An obstructing craft is named as such.
  - A recovery attempt from too far says how far: "The Mantle is 24 m from the lock mouth under the Hearthline's bow. Bring it within 13 m."
- **The console is player-facing.**
  - It shows: status (under way or holding station, heading, depth, a repair dock, the lock); where you are (helm, rooms or hatch actions); the corridor line; each berth with its craft (power, hull, hold) and Launch; craft near the lock mouth with Recover; and the berth refit at a repair dock.
  - Disabled buttons show the exact refusal. Under way with an obstructed corridor, Launch shows the corridor fix first, since you have to fix that first anyway.
  - **Developer tools are behind `?dev` only:** the raw identities, the test obstruction and the incapacity drill. The panel title, the nav button ("Hearthline", shown once the fleet has a carrier) and every message are player copy.
- **The controls screen lists** the helm keys and "V Hearthline berths and lock" without `?dev`.
- **A lock cycle says how it ended:** "Mantle launched under the bow", "Mantle recovered. Clamps locked; the berth is dry.", or why it stopped. Before, the result was stored but never shown.
- **The drawn corridor** is a faint volume with lines, so it reads through the bridge floor; its material compiles at load.
- **Head look resets on a load** or new expedition, so the helm starts level.
- **Sound:** two new cues, "Helm console wakes" (taking the helm) and "Thrusters settle to a hold" (station keeping aboard). The existing lock-flooding and clamp cues still play.

## Rules kept
Carrier physics, saves (no schema change), the transfer, berth, recovery and station-keeping rules, and both fleet routes are unchanged. Every station and console button issues the existing `carrier` commands. Two command-level changes:
1. `helm` now aligns the player's view yaw to the carrier's heading, level. Before, the next step turned the hull to the old view, which is the audit's swing. `helm` while already at the helm only releases station keeping.
2. `exit` at the Hearthline's helm runs station-keep then leave-helm, refused above 0.6 m/s. `exitBlock`'s pure query is unchanged.

The transfer check now reports *what* blocked it (`transferBlock`: test, structure, terrain, craft). The accept/refuse decision is the same; only the message changed.

## Design choices to review
- **The audit's "stern" is the bow.** The lock gate opens forward and down under the bridge. The launch point is 17 m ahead of the keel datum and 3 m below it. The copy says "under the bow".
- **A/D turn the carrier; there's no lateral slide at the helm.** The sim's slide still exists (the bot doesn't use it). A big ship turning on a rudder felt right; the slide read as a developer control.
- **The corridor is a projection,** drawn over the scene in its own rendering group. From the helm it sits below the window line (the launch point is about 41° down), so it shows through the bridge floor. It reads as a helm overlay rather than a physical object.
- **The rudder and head look are presentation-side** (`src/runtime/helm.ts`), not sim state. The sim still steers by the player's yaw, so the bot and saves see no change. The bot can still swing the carrier with a look command; players can't.
- **Presentation recomputes the corridor status at most once a second** while under way, and **time-slices it** (R1): each HUD or render call advances the search by about 3 ms. Commands and the console check exactly. Details are in the R1 section.
- **Rule question, not changed:** an obstructed corridor at a mooring is common, because the corridor needs roughly 8 m of clear water under the bow 17 m out. Now that the hint says which way to turn, I think the rule is fine as it is.

## Files
New:
- `src/sim/carrierStations.ts`: stations, aim world, helm exit, corridor status and memo;
- `src/runtime/helm.ts`;
- `src/render/corridorView.ts` (Babylon-free) and `src/render/fleet/corridor.ts`;
- `src/ui/carrierPanel.ts`, `src/ui/helmHud.ts`, `src/ui/developer.ts`;
- `tests/ux1-carrier-stations.test.ts` and `tests/ux1-carrier-corridor.heavy.test.ts`.

Small additive edits:
- `carrier.ts`: copy, `transferBlock`, `corridorRemedy`, `carrierInReach`, the helm yaw;
- `progression.ts`, `targeting.ts`, `step.ts`, `types.ts`: interaction hooks;
- `camera.ts` and `renderer.ts`: the helm eye and the corridor;
- `app.ts`: 4 lines;
- `panels.ts`: delegates the carrier panel;
- `hud.ts`, `view.ts`, the CSS and audio cues.

Four existing tests had a message regex updated: `carrier`, `command-snapshot`, `s3-carrier-transfer` and `os2-refinements`. The last one now sets the carrier under way, since X while holding station now succeeds.

## Checks
All runs are on factory-worker unless marked otherwise. `src` is unchanged since `61a430a` except where noted.

| Check | Result |
| --- | --- |
| `npm test` (fast) | **Pass:** 129 files in 53 s, 279 s CPU (at `95077ca`). `ux1-carrier-stations` has 18 tests; `ux1-helm-session` has 1 (the real app). |
| `npm run build` | OK. The bundle-size warning is root's. |
| Heavy: `ux1-carrier-corridor.heavy` (v2 `quick`) | **Pass** (R1 version). 1,920 poses: 10 per mooring (as moored, low, and on a 25 m ring) × 24 headings. 713 are obstructed, every one with advice identical to the launch command's refusal. All **425 turn and 288 rise hints, applied, give a completely clear transfer.** The slowest search took 36.6 ms. |
| Economy scripts | `check-campaign`, `m2-a`, `m2-b1`, `progression-curve` and `upgrade-economy` pass. `check-m1-economy` fails on root's `restore_crown_*` roster pin (HUB-2's recipes; CR-1 flagged it too). UX-1 touches no content. |
| Playthrough `creel,carrier --jobs 2` (v1 lock) | **Both complete** (at `727e511`, `src` identical to `deda216`): no blockers, 16 saves matched, 0 incapacities. The carrier route passed rift, hearthline, carrier-deep (Mantle captured), deep-records, meridian, works and the ending. |
| Playthrough `creel-loss,reverse,no-optional --jobs 3` (v2 `playthrough`) | **All complete** (at `deda216`): no blockers, every reload matched. |
| Playthrough, all five, on the second worker (`alickers-job`) | **All five complete** (tested `b6093f7`, which includes the lock-outcome notice): creel 199 min of play, carrier 361, creel-loss 209, reverse 204, no-optional 199. No blockers. |
| `src` after the playthroughs | `a76a708` adds one sim change, the lock-outcome notice (covered by a fast test). Then `635239d`/`61a430a` change presentation only (render, the runtime helm and the console); the playthrough loads none of those. |

## 3090 evidence (ordinary keys and the game's own panel clicks)
- **How it was run:** task-owned headless Chrome on the 3090 (ANGLE GL-EGL), 1280×800, closed and verified after each run. Saves were derived headless with the harness's own phases and moves (`ux1/derive.mjs`, `ux1/derive2.mjs`) from the carrier route's `carrier-deep` milestone:
  - **S1:** the diver at the Hearthline's starboard hatch at the stack-yard mooring;
  - **S2:** at the helm, low over a slope 30 m north, heading 150°, corridor obstructed.
- **Drivers:** `ux1/before.mjs` and `ux1/play.mjs`. Results are in `ux1/gpu-before.json` and `ux1/gpu-after.json`.

**Before** (root `b33fea8`, v2 `gpu`):
- [V panel](ux1/before-v-panel.webp): "SEEDED FEASIBILITY", `dart_24`, "Toggle fixture obstruction".
- [Helm view](ux1/before-helm-view.webp) looks into the lock bay.
- Taking the helm swung the carrier from 180° to 321°. A 0.9 s look to the left turned it to 242° ([shot](ux1/before-look-left-swings-carrier.webp)).
- Launch: "Transfer corridor obstructed…" with no direction ([shot](ux1/before-launch-attempt.webp)).
- Leave helm repeated "Station keeping engaged…" ([shot](ux1/before-leave-helm-message.webp)).

**After** (`61a430a`, v2 `exclusive`):
1. [At the hatch](ux1/02-board-prompt-at-hatch.webp): "E Hearthline vestibule hatch · Board", then E boards: "Aboard the Hearthline. The bridge and helm are forward."
2. Walked forward through the passage; [aimed at the helm](ux1/04-helm-prompt-on-the-bridge.webp) ("E Helm · Take the helm"), then E. The heading stayed 180° (no swing). [Window view](ux1/05-helm-window-view.webp), with the readout and the helm's keys.
3. [Head look to port](ux1/06-head-look-to-port-hull-unturned.webp): the view turns, the bearing stays 180°.
4. [Under way](ux1/07-under-way-window-view.webp): W plus 3.5 s of starboard rudder took the heading to 244° at 1.3 m/s. "X Ease off to leave the helm."
5. **Refused launch:** [the readout](ux1/08-corridor-obstructed-hint.webp) and the amber corridor say "The lock corridor under the bow is obstructed. Turn about 30° to port for clear water, then launch the Mantle." The [console](ux1/09-console-launch-refused-with-reason.webp) shows the same reason beside the disabled Launch.
6. **Turned about 30° to port** with A (to 116°): ["Lock corridor clear"](ux1/10-corridor-clear-after-turn.webp), mint corridor. Hold station, then Launch: "Lock cycling: the Mantle moves down to the gate", then "[Launch lock flooding]", then "Mantle launched under the bow."
7. **Recover:** the console offered "Mantle · 0 m from the lock mouth". Recover gave "Mantle recovered. Clamps locked; the berth is dry." and "[Berth clamps lock]" ([shot](ux1/13-mantle-recovered.webp)). The Creel, 50 m away, shows "Bring it within 13 m."
8. **X leaves the helm:** "You leave the helm. The Hearthline holds station." ([shot](ux1/14-left-the-helm.webp)).

**Frame time on the bridge** (3090, exclusive, 1280×800; rAF gaps):

| Segment | Frames | fps | p50 | p95 | p99 | max |
| --- | --- | --- | --- | --- | --- | --- |
| At the helm, holding (5 s) | 301 | 60 | 16.7 | 16.7 | 16.8 | 16.8 |
| Under way, turning (10 s) | 601 | 60 | 16.7 | 16.8 | 16.8 | 16.8 |
| On foot on the bridge (3 s) | 181 | 60 | 16.7 | 16.7 | 16.8 | 16.8 |

The previous run showed one 66.6 ms frame when the corridor ghost first appeared (its material compiling). `61a430a` pre-compiles it, and the maximum is now 16.8 ms. Root's helm sat at the same 60 fps (p95 16.8).

**Adverse cases seen:**
- At the yard, the launch was refused because the parked Creel sits in the corridor: "Another craft obstructs the lock corridor under the bow. Move it clear, then launch."
- Recover from 50 m is refused with the distance.

**Pre-existing 404s:** both root's dist and mine 404 three terrain tiles (`t_4_12`, `t_5_12`, `t_5_11`). This is unrelated to UX-1.

## Known limits
- The corridor sits low in the window view, at the bottom edge from the helm, because it is about 41° down. Looking down with the head look shows it whole.
- A/D give no lateral slide at the helm (see the design choices).
- The console's Leave the helm button needs station keeping first, as before. X does both.

## R1 responses (Sol xhigh, `review/ux-1-r1` `6902017`)
Fixes are at `bbe125b`, `95077ca` and `e48fb40` (pushed); root `7070084` is merged.

**R1 (P2), Hold kept the rudder: fixed** in `src/runtime/helm.ts`.
- While station keeping is engaged, the rudder is zeroed: no retained easing reaches the hull. During a lock cycle, A/D do nothing at all and don't release the hold. Head look still works.
- Throttle, rudder or depth input still releases a hold outside a lock cycle, as before.
- **Regressions** (`ux1-carrier-stations`):
  - full rudder for 60 steps, then Hold, Launch and 40 idle steps: the heading is exactly unchanged and the launch completes;
  - alternating A/D through the whole lock cycle: the heading is exactly unchanged, there's no helm release, the head look moves and the launch completes.
- **Mutation check:** restoring the old always-easing rudder fails both tests.

**R2 (P2), a same-tick import inherited steering: fixed.**
- `SiltwakeApp.entered()` now calls `helm.clear()` and `forgetCorridorView()` before the first update or present. Pause and resume don't touch either. The tick-jump check remains a backstop.
- **Regression:** `tests/ux1-helm-session.test.ts` runs the real app, session and codec:
  1. full rudder and a head look for one second;
  2. export the current state and import it at the same tick;
  3. the first paused render is level `{0, 0}`;
  4. after resuming, 40 frames leave the hull's yaw exactly where the save had it.
- **Mutation check:** removing the `helm.clear()` call fails it.
- **Harness changes:** the app test harness gained a scriptable input stub and records the head look the renderer receives. Both are additive.

**C1 (P3), stale console advice: fixed.**
- The console now uses `launchCorridorNow`, an exact query whose result the HUD and the drawn corridor share. Session entry drops the cache.
- **Regression:** the cache refresh is tested on both sides of the one-second boundary, and a paused, stale cache is corrected by the console's exact query.
- **Mutation check:** raising the 60-tick threshold to 600,000 fails it.

**The other mutation gaps the review found are now covered.**
- **Take-helm alignment:** a new test takes the helm while facing the stores (90° off the heading). After one step the hull and view hold the carrier's heading. Removing the alignment fails it.
- **Heavy sweep:** it now applies each turn and rise hint and requires a completely clear transfer (`transferBlock === null`), not just clear terrain. All 713 obstructed poses pass.

### Compromise rule: the corridor query (root fix applied)
- **Measured worst case** (factory-worker, `worst.mjs` on the composed world):
  - one transfer check: 4–7 ms;
  - transfer check plus hint search, low over blocked ground: up to 18 ms in the probes;
  - slowest hint search in the 1,920-pose sweep: 36.6 ms.
  - Synchronous once a second under way, that would drop frames when sailing low over blocked ground.
- **Root fix:**
  - `corridorRemedySearch` and `launchCorridorSearch` are generators that yield after each sweep.
  - `launchCorridorView` advances the current search by about 3 ms per call (`CORRIDOR_FRAME_BUDGET_MS`). It returns the last complete status, tagged with the key and tick of the state the search was given.
  - A change of berths or craft starts a new search at once; motion restarts it at most once a second.
  - Commands and the console run the exact search in one go.
- **The answer doesn't change:** a fast test feeds it one step per call and gets exactly `launchCorridor`'s answer. The R1 fixes' regressions and the heavy sweep pass.
- **What remains:**
  - The first transfer check of a search is still one synchronous step, at about 4–7 ms in the measured worst cases.
  - Splitting `sweptHullClearance` itself per segment would bring that under 2 ms. Estimated at half a day, plus a check that the result matches the unsplit sweep.
  - It isn't needed at today's numbers: the 3090 and 4070 bridge runs below, including turning over the blocked slope with the search running, show no frame over 16.8 ms.

### Compromise rule: the RTX 4070 check (done)
- `docs/build/streams/ux1/drive.mjs` is the committed portable driver: no simulation imports, with world targets in `ux1/saves/targets.json` beside the two derived saves. `ux1/run-gpu.sh` runs it:
  - on factory-worker, with Chrome 1248 and ANGLE GL-EGL;
  - on the second worker through `scripts/alickers-job.sh`, with `/usr/local/bin/siltwake-chrome`, ANGLE GL and a one-time `playwright-core@1.64.1` install outside the checkout.
  - It drops Playwright's SwiftShader fallback flag, which a GPU run must not use.

**Fresh runs at `e48fb40`** (same sequence, ordinary keys plus console clicks):

| Segment | RTX 3090, exclusive (`ux1/gpu-final.json`) | RTX 4070 Laptop (alickers, shared desktop host; indicative) |
| --- | --- | --- |
| At the helm, holding (5 s) | 60 fps · p95 16.8 · max 16.8 | 60 fps · p95 16.8 · max 16.8 |
| Under way, turning (10 s) | 60 fps · p95 16.7 · max 16.8 | 60 fps · p95 16.8 · max 16.8 |
| Turning over the blocked slope, search running (3.4 s) | 60 fps · p95 16.7 · max 16.8 | 60 fps · p95 16.7 · max 16.8 |
| On foot on the bridge (3 s) | 60 fps · p95 16.8 · max 16.8 | 60 fps · p95 16.8 · max 16.8 |

- **Renderers:** "ANGLE (NVIDIA … RTX 3090 … OpenGL ES 3.2)" and "ANGLE (Microsoft, D3D12 (NVIDIA GeForce RTX 4070 Laptop GPU), OpenGL 4.6)".
- **Both runs, in order:**
  1. boarded;
  2. took the helm (heading 180° kept);
  3. head look;
  4. steered;
  5. a refused launch with "Turn about 30° to port…";
  6. turned to 116° ("Lock corridor clear");
  7. launched the Mantle ("Mantle launched under the bow."), then recovered it ("Mantle recovered. Clamps locked…");
  8. X left the helm.
- **4070 screenshots:** [helm](ux1/4070-05-helm-window-view.webp), [obstructed](ux1/4070-08-corridor-obstructed-hint.webp), [clear](ux1/4070-10-corridor-clear-after-turn.webp). Data is in `ux1/gpu-4070.json`.
- **Resolution:** both runs are at 1280×800, as the earlier evidence was. A 1080p measurement wasn't part of this round.
