# M1-VISUAL — provisional richer-cel leaf batch

This bounded implementation is ready for coordinator assembly and independent review. **It does not accept M1 or the presentation milestone.** Root has explicitly deferred transparent apertures, water/sky optical depth and the Dart pilot frame to a bounded render-integration assignment. No material/camera API or simulation change is included here.

## Source and ownership

Sol 6.1 at max, original graphics specialist; no children. Checkout `/home/worker/.t3/worktrees/subnautica-clone/t3-8f450693`, branch `t3/siltwake-visual-assets`. The checkout was clean at full parent `411fb1d355b85dcd876f4bc337e93c3fc2cfadba` before implementation.

| Commit | Scope |
| --- | --- |
| `dd8f0f33d575f522cb2ef25e751dc0182e9f3511` | Refuge, source ecology, workshop, Dart fittings, Canopy and carrier leaf art |
| `6c533ca78eb9bf110ee11ab2509fafd1e8d7b00f` | Existing Dart guide shoes raised 7.5 cm to meet the unchanged keel envelope; final source |

Only `src/render/{ecology,environment,expedition,geometry,landmarks,palette}.ts` and this evidence file are authored. Existing exports, content IDs, provenance, interaction positions, terrain, collision solids, air volumes, `DART_BUILD_POSE`, `CARRIER_LAYOUT`, `carrierStructure` and `BERTH_ENVELOPES` are preserved. No parent checkout mutation, dispatch, push, PR or merge.

Final production bundle: `index-CE4zmRGj.js`, SHA256 `8bf9f379421e38f3a6f2d095b06e9d43a95f950a424b397c74f47dd9f9a5d47a`. Captures below were refreshed against this bundle after the keel correction. Earlier `index-ChqB-lBM.js` captures and control runs belong to `dd8f0f3`; they remain explicitly separate in `pre-keel-manifest.json` and `input-evidence.json`.

## Authored changes and provenance

All geometry remains editable, deterministic, repo-native Babylon construction. Read the richer-cel source at `20711d1`, especially `.scratch/siltwake/art-prototype/assets/{vehicles,environment,ecology}.js`, and its preserved `/tmp/siltwake-m1-01/art-reference/{scout,reef,life,island}.webp` captures. This batch adapts that original palette, faceted loft and pressure-fitting language; it adds no imported mesh, raster texture, external illustration or viewer.

- Pod: a thinner restraint and buckle, reachable regulator gauge/lever, localized scored metal and wires, pressure-frame cheeks, warm low fittings, storage/crafting detail and a continuous ramp/deck guide.
- Reef: open membrane lips/cross-veins, readable grazers and faceted exposed glass, persistent abraded ledges/catch margins/salvage frames, open edible cups and source-associated Canopy holdfasts. Existing shed/current/grazer/school motion is retained. Decorative hosts persist when registered collectible stock disappears.
- Workshop/shore: terrain-following ramp edges, a framed bench, plausible ledger and tool scale, locker slats and canopy ribs. World signs say LOADING LEDGER / FIELD OBSERVATIONS rather than internal clue IDs; recorded IDs and text authority are unchanged.
- Dart: canopy gaskets, access grip, service fitting and drive bezel. The pre-existing skid geometry initially failed a numerical envelope check at Y=−.075; its final bottom is zero within Float32 precision. No hull expansion.
- Canopy: the exact z=−122.4 air-front datum, pressure hood, legible record bench/instrument wall and flush cover bedding. The hunter gains gill/cheek/sensory details and separately animated fins whose display uses the existing idle/warn/investigate/pursue state. No new species behavior or scan claim.
- Carrier: shell art reads authoritative rooms/solids, with flush panel rhythm, framed observation areas, separate berth identity, state-derived DRY / ISOLATED or TRANSFER / KEEP CLEAR signs, passage inlays, lower helm, bridge and aft vestibule cues. Old decorative crates and a solid vestibule step were removed from walking space. Full wall/hatch/gate geometry still comes from `carrierStructure`.

`ArtBatch.ring()` and `panel()` are additive original helpers; the existing ArtBatch contract is unchanged. Labels use explicit two-sided UVs to avoid mirrored return approaches. Carrier sign disposal now releases their own dynamic textures/materials on shell rebuild.

Metadata proposal for root's eventual asset manifest: retain existing semantic batch names `refuge.pod`, `ecology.filters.<source ID>`, `ecology.grazer.<source ID>.<n>`, `source.<source ID>`, `facilities.context`, `ecology.sound-hunter` and `carrier.physical-compartments`; add `ecology.holdfast.<source ID>` and `ecology.hunter-warning-fin.<side>` as art roles. Resource hosts read existing source IDs; no second registry was created. Static facilities use world coordinates; vehicles, carrier shell and warning-fin pivots remain hull/parent-local. Palette slots live in `palette.ts`; dynamic signs use system sans-serif text on generated textures.

## Production view comparisons

Before: parent `411fb1d` / `index-DHJHjWQr.js`. Final: `6c533ca` / `index-CE4zmRGj.js`. Cameras are the actual production game camera; there is no renderer/camera injection.

**Every comparison below is labelled ART STAGING / APPEARANCE ONLY.** `stage.mjs` clones a fresh completed-opening state, the earlier earned Dart save, or the supported carrier fixture, then changes the player camera pose and feedback. The validated envelopes are loaded through this worker's private local journal and actual Continue. A bounded blur pauses the scene; the pause overlay is hidden and the HUD retained for stills. These are art comparisons, not ordinary campaign proof. Simulation time advances briefly after Continue, so animated poses/health may differ slightly between pairs.

Carrier coordinates in the table are local; the fixture is at world (65,−24,12), yaw 0.

| View | Player base / yaw / pitch (radians) | Before | Final | Observed |
| --- | --- | --- | --- | --- |
| Pod exit | (0,.18,22.5); yaw 0 / pitch −.05 | [before](/tmp/siltwake-m1-visual/captures/before/pod.png) | [final](/tmp/siltwake-m1-visual/captures/final/pod.png) | Pressure frame and deck guide; opening stays clear. |
| Pod return | (0,.18,11); yaw π / .06 | [before](/tmp/siltwake-m1-visual/captures/before/podReturn.png) | [final](/tmp/siltwake-m1-visual/captures/final/podReturn.png) | Entrance cheeks, HOME / AIR and approach line. |
| Reef catch | (−9,−7.2,7); yaw 5.643 / −.36 | [before](/tmp/siltwake-m1-visual/captures/before/reef.png) | [final](/tmp/siltwake-m1-visual/captures/final/reef.png) | Veined fans, lee margins and directional shed. |
| Workshop | (10,1.2,−31.5); yaw 0 / 0 | [before](/tmp/siltwake-m1-visual/captures/before/workshop.png) | [final](/tmp/siltwake-m1-visual/captures/final/workshop.png) | Bench scale, ledger, locker and ramp skin. |
| Dart comparison | (25,−.7,−17); yaw 5.483 / −.12 | [before](/tmp/siltwake-m1-visual/captures/before/dart.png) | [final](/tmp/siltwake-m1-visual/captures/final/dart.png) | Retained poor cradle-wall angle; use added quarter view. |
| Lab approach | (116,−117.4,−116); yaw 0 / 0 | [before](/tmp/siltwake-m1-visual/captures/before/labApproach.png) | [final](/tmp/siltwake-m1-visual/captures/final/labApproach.png) | Exact air threshold, hood and panels. |
| Lab record | (116,−118,−124); yaw 0 / .04 | [before](/tmp/siltwake-m1-visual/captures/before/lab.png) | [final](/tmp/siltwake-m1-visual/captures/final/lab.png) | Bench and FIELD OBSERVATIONS remain visible. |
| Canopy / hunter | (129,−112,−105); yaw .34 / .04 | [before](/tmp/siltwake-m1-visual/captures/before/hunter.png) | [final](/tmp/siltwake-m1-visual/captures/final/hunter.png) | Hunter silhouette; overhead water-plane defect persists. |
| Carrier bridge | local (0,4,−6); yaw 0 / .04 | [before](/tmp/siltwake-m1-visual/captures/before/carrierFore.png) | [final](/tmp/siltwake-m1-visual/captures/final/carrierFore.png) | Lower helm, window framing and bridge identity. |
| Carrier passage fore | local (0,4,−6); yaw π / .04 | [before](/tmp/siltwake-m1-visual/captures/before/carrierPassage.png) | [final](/tmp/siltwake-m1-visual/captures/final/carrierPassage.png) | Berth identity and clear central lane. |
| Carrier passage aft | local (0,4,8.6); yaw 0 / .02 | [before](/tmp/siltwake-m1-visual/captures/before/carrierAft.png) | [final](/tmp/siltwake-m1-visual/captures/final/carrierAft.png) | Correctly oriented signs from the opposite approach. |

Additional final angles: [regulator](/home/worker/.t3/userdata/browser-artifacts/browser-screenshot-localhost-mvcsq9bh-36622488.png), [glass and grazers](/home/worker/.t3/userdata/browser-artifacts/browser-screenshot-localhost-mvcsqghh-b6866f43.png), [Dart quarter](/home/worker/.t3/userdata/browser-artifacts/browser-screenshot-localhost-mvcsql81-746dd6d2.png), [Dart bow](/home/worker/.t3/userdata/browser-artifacts/browser-screenshot-localhost-mvcsqnm6-371ce11a.png), [carrier wide](/home/worker/.t3/userdata/browser-artifacts/browser-screenshot-localhost-mvcsrjby-4cb459e9.png). The Dart comparison angle is partially blocked by the existing cradle; this limitation is preserved, with the additional views supplying usable art inspection.

Final motion:
- [Reef shed/grazers](/home/worker/.t3/userdata/attachments/thread-delegated-task-command-3amcp-3a77db24d4-f446-41f1-a361-c1d3f090551d-3adel-93f9fc9b-f857-4fe6-bfdd-27aeacb2f6ad-mp4.mp4), tick 42→409, same staged base; current/shed movement remains readable.
- [Hunter idle fins](/home/worker/.t3/userdata/attachments/thread-delegated-task-command-3amcp-3a77db24d4-f446-41f1-a361-c1d3f090551d-3adel-bd0d3f81-41ef-4f55-8dfb-358f7266539f-mp4.mp4), tick 13832→14213.
- [Hunter warning response](/home/worker/.t3/userdata/attachments/thread-delegated-task-command-3amcp-3a77db24d4-f446-41f1-a361-c1d3f090551d-3adel-09a331dd-7c6a-47b1-b187-32f0ceea65c6-mp4.mp4), staged camera followed by bounded Shift+S input. The ordinary input triggered the existing low paired call and visible warning; [capture](/home/worker/.t3/userdata/browser-artifacts/browser-screenshot-localhost-mvcswcic-f8bcbbaf.png). This proves the authored state-driven display from a staged setup, not an earned Canopy route.

## Ordinary inputs and bounded clearance checks

Final-source fresh expedition: New expedition, four E actions, then bounded W/S keyboard events through `PlayerInput`. No save/state injection established this fresh opening/pod smoke. [Opening capture](/home/worker/.t3/userdata/browser-artifacts/browser-screenshot-localhost-mvcssv12-4b0149d1.png), [opening recording](/home/worker/.t3/userdata/attachments/thread-delegated-task-command-3amcp-3a77db24d4-f446-41f1-a361-c1d3f090551d-3adel-b8030389-a5f1-4c34-ad02-6d5db35e3ac8-mp4.mp4), [deck movement recording](/home/worker/.t3/userdata/attachments/thread-delegated-task-command-3amcp-3a77db24d4-f446-41f1-a361-c1d3f090551d-3adel-4ec92ebc-6019-4c42-b974-fd98310944ec-mp4.mp4). The first fixed-duration movement remained on the deck. A subsequent bounded input run crossed to base (0,−.769,2.435), swimming, and reversed along the same ramp to (0,.18,20.478), walking in the pod: [water](/home/worker/.t3/userdata/browser-artifacts/browser-screenshot-localhost-mvcsucpg-346c54e7.png), [return](/home/worker/.t3/userdata/browser-artifacts/browser-screenshot-localhost-mvcsujjk-a1e67e3b.png). `final-ordinary.json` records actual telemetry and input bounds; `final-refuge-return.json` preserves the earned final-source save. The water/return screenshots and telemetry are separate from the earlier deck-only recording.

A targeted imported replay used the **unmodified** `/tmp/siltwake-m1-01/normal-dart-built.json` (SHA256 `089e77302bc0f49ada5788c3d69835934e65db7365a9ce1a0730195644f99dd2`). Its origin is the earlier author reef-first route / `index-DUS1lGxc.js`, before `5fd6338`; the prior handoff does not identify a more exact immutable source for that save. The final-state art stages derived from it are modified and remain labelled staging, independently of this unmodified import.

The targeted replay ran on `dd8f0f3`, approached the existing workshop locker/collision, walked around the bench/locker toward the cradle, swam to the Dart and boarded using E. [Approach](/home/worker/.t3/userdata/browser-artifacts/browser-screenshot-localhost-mvcsmd93-7ce117dc.png), [pilot](/home/worker/.t3/userdata/browser-artifacts/browser-screenshot-localhost-mvcsn17q-51ce0b57.png), [bounded pilot recording](/home/worker/.t3/userdata/attachments/thread-delegated-task-command-3amcp-3a77db24d4-f446-41f1-a361-c1d3f090551d-3adel-9c227a15-6462-4b16-9382-ec7c819a18f6-mp4.mp4). Forward control moved the older Dart pose from z=−24 to approximately −26.483 before stopping on the shore approach. **No successful launch or current build-pose clearance is claimed.** This is a known limitation of that older imported pose, already identified as needing recheck in M1-01, and is outside this leaf art batch. The final-source [staged pilot defect capture](/home/worker/.t3/userdata/browser-artifacts/browser-screenshot-localhost-mvcsv4ss-09860025.png) confirms the same missing cockpit after the skid-only correction.

A separate **seeded fixture / art clearance check** used the production controller to walk the central carrier passage from local (0,4,−6) to (0,4,7.6), with X=0 and Y=4 throughout. [Capture](/home/worker/.t3/userdata/browser-artifacts/browser-screenshot-localhost-mvcsvon5-1e1aa708.png), [recording](/home/worker/.t3/userdata/attachments/thread-delegated-task-command-3amcp-3a77db24d4-f446-41f1-a361-c1d3f090551d-3adel-25d35276-8215-4c19-9c9a-e3cb317b0d33-mp4.mp4). It crossed the full compartment length with no decorative obstruction. This is not the carrier transaction/recovery matrix. Lab threshold/record and workshop views were visually inspected; no earned final-source full route to those sites is claimed here.

## Checks and limits

- `npm ci` completed. The existing low dependency advisory was not altered.
- Final `npm run check`: strict typecheck, **117/117 tests**, production build passed. `git diff --check` passed. The existing >500 kB chunk warning remains. Log: `/tmp/siltwake-m1-visual/final-check.log`.
- Temporary `audit.ts` bundles the actual leaf generators into a Babylon NullEngine diagnostic. It checks all position/normal/color values are finite, Dart bounds fit the unchanged berth envelope (1 μm tolerance for merged Float32 arithmetic), and 24 shell rebuilds across compact/medium and sealed/lock states keep counts stable at 104 meshes / 25 materials / 24 textures. Scene disposal completed. Dart min (−2.5,≈0,−3.6), max (2.5,1.981043,2.7). Its canvas text metrics are stubbed: it does not test text rasterization, shader pixels, physical transfer or GPU behavior. `geometry-disposal.log` records the passing result; `geometry-before-correction.log` preserves the real −.075 m failure.
- Production snapshots after the final run reported no console errors/warnings or failed requests in the inspected bounded diagnostics. The actual WebGL2 canvas reported available/ready. Initial static counters were 90 meshes / 152953 vertices; these counters do not track later dynamic additions.
- Linux host `factory-worker`; browser processes verified on that isolated host. Chromium 154.0.8037.92, ANGLE Vulkan SwiftShader Subzero, Rich at 1280×800 CSS and render pixels, DPR 2. Host exposes 6 vCPUs of an i5-12400 and about 12 GB RAM. The browser is launched with muted audio and software rendering. No consumer-GPU performance, audible-mix or human-enjoyment claim.

## Exact deferred render-integration handoff

Root has already assigned these three seams for a later bounded pass after CORE/VISUAL assembly. No material/camera API edits are made here; do not infer transparency from `P.glass` color, which is also used for opaque instrument/equipment faces. `ArtBatch.finish()` merges colored parts, and the shared cel shader forces alpha=1.

### Explicit candidate panes and opaque backing

| Batch / source | Candidate geometry | Opaque backing to account for |
| --- | --- | --- |
| `refuge.pod`, `landmarks.ts:44` | Side pane centers (±2.91,2.1,22), box size (.06,1.05,2.7); rear center (0,2.1,23.91), size (3.8,1.3,.09) | Full side walls centered (±3.25,1.7,21.6), size (.65,3.5,5.4); full rear wall centered (0,1.9,24.1), size (6.9,3.8,.3). The port regulator plate at (−2.82,1.65,21.05), size (1.65,1.85), is intentional opaque equipment over part of the old side glazing; retain service readability when choosing apertures. |
| Vehicle mesh `<hearthline ID>`, `expedition.ts:88` | Side pane centers (±5.93,6.5,0), size (.05,2.4,16); bridge center (0,6.6,−11.8), size (8,2.7,.06), all carrier-local | Full side wall boxes (±6.3,6.3,0), size (.6,4.5,25); full bridge wall (0,6.4,−12), size (12.6,5,.3). Existing ribs/mullions/reflection strips remain opaque frame/detail. |
| `carrier.physical-compartments`, `expedition.ts:30` | Each room fore/aft pane: center (cx, minY+1.85, z+2 mm outward), width roomWidth−1.04, height 1.21; front datum z=minZ−wall−.002 or maxZ+wall+.002. Compact: port cx=−3.225, width4.51; starboard cx=3.275, width4.41; datum z=−2.882 / 4.882. Medium cx=−2.95, width5.06; datum z=−3.782 / 5.782. All pane center Y=5.85. | Entire `carrierStructure()` fore/aft wall; **the full steelLight plate** immediately behind the pane, size (roomWidth−.8,1.45), must become an actual open bezel. The upper shade plate (center minY+3.15, height2.1) also overlaps the upper .355 m of the aperture. Replacing only glass pixels would still leave these opaque plates. |
| Dart vehicle mesh, `expedition.ts:168` | Forward canopy quad (−.64,.8,−1.5), (.74,.8,−1.5), (1,1.95,.1), (−.65,1.95,.1); side triangles at :175–176; aft/roof quad at :232. Hull-local. | Side triangles use explicit hex colors as well as P.glass elsewhere; the P.reflection quad is currently an opaque overlay. Hull loft/deck below the canopy stays opaque. Instruments using P.glass are not window candidates. |

Pane extraction should create explicit pane meshes/materials and real visual openings within these frames, while keeping collision seals and existing air rules. The room panes look into independently sealed craft bays; they do not create doors. Carrier/pod exterior panes require holes in the **rendered** backing wall while preserving its physics. Preserve underwater optical attenuation in the exterior visible from a dry window.

### Canopy water/sky defect

Exact player base **(129,−112,−105), yaw .34 / pitch .04**. [Parent defect capture](/home/worker/.t3/userdata/browser-artifacts/browser-screenshot-localhost-mvcs06lh-9e92abc4.png); [final defect capture](/home/worker/.t3/userdata/browser-artifacts/browser-screenshot-localhost-mvcsr924-71ff0d52.png). The large hard-edged overhead water plane / bright surface is visible at roughly 112 m depth. `atmosphere.ts:27` uses a finite 680 m water mesh, and sky/water lack optical-depth attenuation; the cel fog alone cannot fix their pixels. Root corroborated this source seam. Preserve deep-water attenuation outside dry apertures when integrating pane/atmosphere changes.

### Dart first-person limitation

`expedition.ts` update disables an entire controlled non-carrier vehicle; `renderer.ts:134` follows the simulation pose plus generic `eyeHeight()` and its world yaw/pitch. Piloting therefore has no seat, canopy frame or hull-local approach reference. Current Dart eye height is 1.05 m; its canopy reaches about 1.95 m. The final staged pilot capture above shows the open-water presentation. Follow-up direction is a coherent hull-local seat/forward first-person frame with readable approach. It needs no free-look/input mode, simulation pose change, wholesale hidden-craft presentation or hull expansion.

## Remaining scope and resource closure

Transparent apertures, depth-correct water/sky, the pilot frame, normal final-source Dart launch/Canopy/return/reload, recovery and full carrier F0–F3 coverage, representative GPU/audio and human play evidence remain unexecuted or unresolved as described. Browser medium reconfiguration and gate-state/lock transfer were not replayed here; the NullEngine rebuild diagnostic is not that evidence. There is no dedicated final aft-vestibule closeup or closeup of every Canopy resource host; their source detail is not independently accepted by these views. No new campaign hull/world scope was produced.

Both browser rule files were read before browser work. Port5191 was free before starting this worker's preview; own incognito tab `tab_1s_0430977b-1ed3-45f2-ac72-3683f9fe8942` was closed using the T3 lifecycle tool. Own preview session32520 was stopped with Ctrl-C (exit130), and `ss` confirmed no listener on 5191. All recordings stopped. No shared/human tabs, historical tab14, peer servers or browser hosts were closed.

Durable local handoff: `/tmp/siltwake-m1-visual/` with before/final manifests, staging envelopes/generator, raw captures, recordings, ordinary-input traces, save provenance, diagnostics and check/audit logs. Archive: `/tmp/siltwake-m1-visual-artifacts.tar.gz`. Prior M1/A0 handoffs, archives, reference art and earned originals remain untouched. Fresh non-author Astra xhigh plus Sol max batch review and separate integrated M1 review are still required after root assembly.
