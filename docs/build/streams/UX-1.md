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
- **Presentation recomputes the corridor status once a second** while under way. The world sweep costs about 4 ms in the composed world, and the hint search about 1–2 ms more. Commands always check exactly.
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
| `npm test` (fast) | **Pass:** 128 files in 65 s, 295 s CPU (at `7443ce0`). `ux1-carrier-stations` has 14 tests and takes about 1.2 s. |
| `npm run build` | OK. The bundle-size warning is root's. |
| Heavy: `ux1-carrier-corridor.heavy` (v2 `quick`) | **Pass.** 1,920 poses: 10 per mooring (as moored, low, and on a 25 m ring) × 24 headings. 713 are obstructed, every one with advice identical to the launch command's refusal. All 425 turn hints actually clear the corridor; 288 obstructed poses get a "rise" hint. |
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

**Not done:**
- **RTX 4070 check:** the second worker has no playwright-core, its Chrome wrapper takes `--use-angle=gl` rather than `gl-egl`, and its shared checkout installs only the repo's own dependencies. The drivers here would need a committed, self-installing variant.
- **Pre-existing 404s:** both root's dist and mine 404 three terrain tiles (`t_4_12`, `t_5_12`, `t_5_11`).

## Known limits
- The corridor sits low in the window view, at the bottom edge from the helm, because it is about 41° down. Looking down with the head look shows it whole.
- A/D give no lateral slide at the helm (see the design choices).
- The console's Leave the helm button needs station keeping first, as before. X does both.
