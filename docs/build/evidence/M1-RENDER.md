# M1-RENDER — panes, optical depth and Dart pilot view

Bounded author handoff, 2026-10-17. **Provisional; M1 remains unaccepted.** Root owns assembly, exact contract reconciliation, fresh separate non-author Astra xhigh/Sol max batch reviews and the subsequent integrated M1 review. The later recovery correction is separate and is not included in this source or evidence.

## Frozen source and ownership

- Worktree `/home/worker/.t3/worktrees/subnautica-clone/t3-8eacd486`, branch `t3/siltwake-m1-render`; exact clean parent **`2ce5e14ca1e2a86c06cc3a9a35718e6300794b99`**.
- Source commit **`6ea44ceaed40ef8b6ee8b8f4a2c3a26e6ccb578c`**, `fix(render): open fog-aware panes and align Dart cockpit`.
- Only source paths changed: `src/render/{renderer,materials,atmosphere,expedition,landmarks}.ts`. This evidence file is the only additional repository edit. No simulation, physical geometry/descriptors, air/seal authority, registry/source/provenance, save/state/input, dependency, public renderer lifecycle, UI or audio changes.
- Read AGENTS/STATUS before PLAN/CONTRACTS, revised input/specification pointers, assigned brief, assembly and final CORE/VISUAL handoffs. Inspected the actual opaque-window, deep Canopy edge and absent-cockpit captures. Root approved the render-only seams and semantic yaw correction; no additional path was assigned or edited.
- Source was frozen before evidence packaging. No peer source was copied; no recovery changes, children, push, PR, parent mutation or independent acceptance.

## Concrete render changes and exact seams for root

Explicit glass is separated from the opaque `ArtBatch` colour shader. Opaque instrument faces retain their existing colours/material role. Pod side/rear, carrier bridge/side/bay and Dart canopy panes have named meshes and a shared fog-aware material. Rendered walls are segmented around apertures; physical walls and seals remain complete. Bay extraction removes the structural wall, **full steelLight backing and the shade's .355 m upper overlap**. Mullions, gaskets, signs and the pod regulator continue to occlude normally. Berth labels move .022 m outward to eliminate coplanar backing interference.

The only changed factory call sites are in `renderer.ts`. Exact exports:

```ts
createCelMaterial(scene: Scene): ShaderMaterial; // unchanged
createGlassMaterial(scene: Scene): ShaderMaterial;
createLandmarks(scene: Scene, cel: ShaderMaterial, glass: ShaderMaterial): void;
createExpeditionArt(scene: Scene, cel: ShaderMaterial, glass: ShaderMaterial): {
  update(state: GameState | null): void;
}; // update/result contract unchanged

createObservationPane(
  scene: Scene, glass: ShaderMaterial, name: string,
  points: readonly Point[], parent?: Mesh,
): void;
wallWithOpening(
  b: ArtBatch, center: Point, size: Point,
  opening: { center: Point; width: number; height: number; normal: "x" | "z" },
  color: string,
): void;
updateOpticalUniforms(
  materials: readonly ShaderMaterial[], camera: Vector3, state: GameState | null,
): void;
export const DART_SEAT = { x: .12, y: 1.36, z: .45 } as const;
```

`materials.ts` also exports shared `opticalShader: string` and `opticalUniforms: string[]`. Uniform names are `cameraPosition`, `fogColor`, `waterFogColor`, `fogDensity`, `carrierPosition`, `carrierYaw`, `carrierPresent`, `carrierAirMin`, `carrierAirMax`. `createAtmosphere(scene)` still returns `{ water, sky }`; `ArtBatch`, `GameRenderer`, `createRenderer(canvas, availabilityChanged)`, session/update/state/input contracts are unchanged.

The scene owns `siltwake.observation-glass`; hull/pane disposal does not dispose a material used by others. Each named pane has `.above`/`.below` meshes clipped at **world Y=0**. Before-render sorting places the opposite-side half at alphaIndex−1, water0, camera-side half1; ordinary distance sorting applies within each half. Glass alpha is `.075 + fresnel*.27`, Fresnel power4. World opaque/glass/water all use rendering group1, preserving opaque depth tests; glass/water blend without writing depth. The glass observer is removed when its material is disposed.

The shared optical shader measures below-water ray length and subtracts the **union** of actual air intervals once. Carrier air uses `CARRIER_LAYOUT`, local min(−6.3,4,−12) → max(6.3,8.4,12), transformed with the upright carrier. Flooded lock below deck is not dry. Canopy min(111.4,−118.1,−129.6) → max(120.6,−114.5,−122.4) copies **only the geometric box in `src/sim/inventory.ts::inCanopyAir`**; the simulation predicate remains the authority, including its controlled-vehicle condition. The source comment records this render-only dependency for later consolidation. No air is granted by rendering. A dry camera removes only the intersected air interval, leaving exterior wet attenuation intact; overlapping lab/carrier intervals are not double-subtracted.

Depth fog blends `#226e7e`→`#10384e` by `1-exp(-depth*.018)`; existing east-of-X65 density .017 / otherwise .027 remains. Light dry haze uses .18 of dry ray length. Sky, cel, water and glass share these optics and sky/sun direction. The Y0 water patch follows camera X/Z at **2048×2048 m**, beyond the unchanged **450 m** far plane; its finite edge cannot enter the frustum. Water is discarded only within the carrier's actual upper dry interval, avoiding a surface overlay through dry bridge windows.

The controlled Dart retains its exterior, glazing and a modest hull-local cockpit: dashboard, controls and seat, with a clear central view. Cockpit fittings show only while controlled. `expedition.update` precedes camera placement, and the camera seat is transformed by the **actual hull `computeWorldMatrix(true)`**. Saved player pose, look/steering direction and collision origins are unchanged. `camera.minZ=.07` remains. Mesh rotation is `(pitch, -semanticYaw, 0)` for independent Dart; attached craft, carrier shell and berth presentation stay upright with `-yaw`. Launch-block art uses the same sign. Authored panel/label yaws are not globally negated. The hunter's narrow local−Z nose now faces the intended player/distraction target, or home on disengagement; only display orientation changes.

## Exact production and artifact bundle

Final `npm run check`: strict typecheck, **132/132 tests**, production build passed; `git diff --check` passed. The final rebuild reproduced the exact JS/CSS used by final browser evidence. Existing Vite large-chunk warning remains; no new render/shader failure was observed in the executed cases.

| Artifact | Exact identity |
| --- | --- |
| Final JS | `index-npWp_sUj.js`, 1,278,056 bytes; SHA256 **`b9dc6eeaf0ce0672e3950ae9899de2889075e09f4c798ca9d01e23bd3699d6bb`** |
| Final CSS | `index-DONjl4IF.css`, 13,862 bytes; SHA256 **`14756146fd5523913bc59b8079703e86ae867d0250079c88ed57e6198ab0a797`** |
| Exact parent JS | `index-C6wLfM8I.js`; SHA256 **`ffcdc6a2e861403619a7b3bb104c486541681c287dbd9d943f8cb999f7b547d4`** |
| Archive | [/tmp/siltwake-m1-render-artifacts.tar.gz](/tmp/siltwake-m1-render-artifacts.tar.gz), **28,613,453 bytes**; SHA256 **`81d8030fa27c801f2f35784b8abfae04e5ebf60a76f3bd9916bc9575179e6f4c`** |

Artifact root [/tmp/siltwake-m1-render](/tmp/siltwake-m1-render) contains `README.md`, exact source/patch, baseline/final production builds, provenance, actual PNGs/recordings, logs and reproduction diagnostics. `manifest.json`/`SHA256SUMS` describe204 payload files; the archive has206 file entries including those two manifests. Every payload's local bytes/hash and archived bytes were verified; the two manifests were also compared byte-for-byte. This committed evidence stays outside the archive to avoid a self-hash cycle.

## Actual production comparisons and motion

All appearance stages are labelled **ART STAGING / APPEARANCE ONLY**. Validated staged saves use the production camera/rendering on isolated storage; they are not earned preparation or expedition proof.12 stable pairs load identical poses/ticks, immediately blur after Continue, then settle40 paused redraws. Non-Dart eye height is settled; Dart intentionally changes actual camera to the approved seat. `before-stable-manifest.json`, `after-manifest.json`, `stages.json` and the supplemental manifest retain exact observations.19 valid main final views plus an upward supplement cover pod inside/outside, carrier fore/aft/side/outside/surface, shallow/deep Dart, reef, island, waterline and lab in/out.

| View / saved base | Actual evidence | Observed result |
| --- | --- | --- |
| Canopy (129,−112,−105), yaw.34/pitch.04 | [matched comparison](/tmp/siltwake-m1-render/hunter-comparison.png), [before](/tmp/siltwake-m1-render/captures/before-stable/hunter.png), [after](/tmp/siltwake-m1-render/captures/after/hunter.png) | Actual final camera(129,−111.349,−105); bright overhead edge gone, hunter/resources remain visible. |
| Carrier passage local(0,4,−7.2), yawπ/pitch.02 | [matched comparison](/tmp/siltwake-m1-render/bay-comparison.png), [after](/tmp/siltwake-m1-render/captures/after/carrierBay.png), [aft](/tmp/siltwake-m1-render/captures/after/carrierAft.png) | Stored craft visible through real apertures; upper backing removed, signs/mullions opaque. |
| Dart base(20,−1.6,−19), yawπ/pitch0 | [matched comparison](/tmp/siltwake-m1-render/dart-comparison.png), [deep](/tmp/siltwake-m1-render/captures/after/dartDeep.png) | Recognizable canopy, controls and hull; forward navigation remains visible. |
| Pod / carrier / lab | [pod inside](/tmp/siltwake-m1-render/captures/after/podSide.png), [outside](/tmp/siltwake-m1-render/captures/after/podOutside.png), [dry surface bridge](/tmp/siltwake-m1-render/captures/after/carrierSurface.png), [lab outward](/tmp/siltwake-m1-render/captures/after/labOut.png) | Both-side pane sightlines, regulator/frame occlusion; dry interiors do not clear the deep exterior. |
| Deep / waterline motion | [Canopy pan](/tmp/siltwake-m1-render/motion/staged-canopy-pan.mp4), [clean upward still](/tmp/siltwake-m1-render/captures/after/hunterUp.png), [multiple panes across waterline](/tmp/siltwake-m1-render/motion/staged-carrier-waterline.mp4), [Light still](/tmp/siltwake-m1-render/replay/light-waterline-panes.png) | Bounded ordinary arrows/vertical inputs from labelled stages; no bright sky/plane edge, opaque occluders remain visible through water/glass ordering. |

Earlier `captures/before/` advanced briefly and are excluded from exact stable-pair claims. **Two reverse-berth stage attempts were correctly relocated to the helm by the save decoder**; `captures/excluded-normalized/bayReverse*.png` are explicitly excluded and do not show an inside-berth camera. No save/physical bypass was introduced. Both-direction aperture rays cover that geometry boundary; actual outside/inside pod/carrier views and fore/aft passage views provide the reachable visual inspection. An actual view from inside a sealed berth remains unexecuted.

## Focused numeric/WebGL diagnostics

These are separate from actual pixels and ordinary replay. Temporary diagnostics remain in the archive, with no new repository helper/test paths or dependencies.

- Real generators under Babylon NullEngine/stub text canvas: **72** compact/medium aperture rays, both directions at centre/top strips, pass through all backings; **6** opaque-frame rays remain blocked.24 shell/configuration/lock rebuilds retain94 meshes/28 materials/24 textures/2 before-render observers; shared glass survives hull removal and scene disposal empties meshes. This does not validate shader pixels/text rasterization.
- **35** actual Dart yaw/pitch cases, including non-cardinal headings and±1.35 limits: forward maximum error **2.215805824768103e−8**, seat inside actual canopy, minimum roof-ray clearance **.2728251635 m**. `dart-world-bounds.json` records world AABBs and2,514 transformed vertices checked per pose. Local combined bounds min(−2.5,≈0,−3.6), max(2.5,1.9810425,2.69999995) fit the frozen berth envelope at1μm tolerance. Pitched visual world bounds can extend beyond the upright collider; physics is unchanged.
- At retained carrier yaw **6.108185307179584**,7 actual carrier/shell/berth world points agree with simulation `localToWorld` within **3.4905006071e−6 m**; carrier/attached craft remain upright despite saved carrier pitch−.05.4 hunter target-facing cases verify local−Z nose alignment. `geometry-audit.log`/`audit.ts` record assertions.
- Actual WebGL2 compiles production optical GLSL on a separate OffscreenCanvas:10 cases cover wet100m, air0, waterline90, lab-inside0/lab-to-sea6.4/through-lab22.8, carrier-inside0/carrier-to-sea8, flooded-lock4 and overlapping-air-union6. All pass .4m8-bit readback tolerance. `optical-results.json`'s late `renderer:null` is read after deliberate disposal of that diagnostic context, not a game failure.
- One paused production redraw intercepted actual shader-classified GL draws/clears, then restored native methods. `gl-trace-after.json` and `gl-trace-below-waterline.json` show opaque depth testing/writes on, glass/water testing on/writes off/blending on, **far glass → water → near glass**, GL error0. No depth clear occurs between opaque/water/glass. The existing normal group1 depth/stencil clear remains **before all opaque geometry**, after the non-depth-writing sky; this is not a claim of zero frame clears.

## Retained earned CORE replay, not fresh preparation

Original source **`6b4f229a83a9903a07125a8646df9b943510e1cd`**, session **`3fd3e4bf-fc31-49e3-b55e-bba0b10407a2`**, created `2026-10-17T19:16:53.046Z`. Original bundle `index-BT_noHFY.js`, SHA256 `97f8273e8f98e645ce3abd9b4fdedc10562921fe8434fe01b6b5efa52e239a94`. Inputs were copied **byte-for-byte and verified against originals** in `/tmp/siltwake-m1-core/`, imported through actual Import/confirmation UI, then driven with bounded production keyboard/UI controls. No state/camera/simulation injection in these replays. Exact metadata/hashes/use classification live in `earned-inputs/provenance.json`.

| Unmodified input | SHA256 |
| --- | --- |
| `dart-built.json` | `9d255ac97926fa7a7b2af8ba7c4d1445f5f5b65d606503de1e7bf87aec616079` |
| `departure-clear-cradle.json` | `10ae09ff59e9cad0242d5fc5d3e39a564f2b817cd2a51c51efc675d901fec83e` |
| `canopy-board-handle.json` | `44ce574be2a36bb91ad4c0be95683ed578c3fafe082d7442f0bb7c424b8813f7` |
| `canopy-lab-before-air.json` | `134e621d9d2dec0ee369c32681518a79584affe2424e2d3bcebcd84e013d921f` |
| `depth-exit-before.json` | `23632673756c02953e111915220ceb608991c1464eecd32d681ef442879530e4` |
| `normal-return-saved.json` | `ad9231e5fd54d3654aa4613a28e0b30c7947ab1f9e9103956eb69a50be4b6171` |

`c04-earned.json` and `depth-exit-safe.json` were copied/hashed but not replayed. This batch does not repeat crafting, gathering, the complete Canopy route, earned recovery or a final combined outing.

1. Actual workshop approach first tried a direct side path and stopped on the retained cradle rail at X15.06; out-of-range E did not board. That attempt/clip remains excluded from boarding proof. Going around the north rail end reached handle(22.122,−1.265,−20.929), then **E boarded Dart at(20,−1.6,−22)**. Ordinary controls departed **+Z to(19.447,−1.6,−13.153)**, fully clear before turning east to(48.496,−1.6,−9.087), then descended in open water; hull100%. [handle](/tmp/siltwake-m1-render/motion/earned-cradle-handle.mp4), [departure](/tmp/siltwake-m1-render/motion/earned-north-east-departure.mp4).
2. Ordinary arrows reached±1.35 pitch at yaw4.458185; actual canopy/controls remained visible. Shallow E exit succeeded at(52.526,−6.518,−12.099). [pitch motion](/tmp/siltwake-m1-render/motion/earned-pitch-limits.mp4), [up](/tmp/siltwake-m1-render/replay/pitch-up-paused-view.png), [down](/tmp/siltwake-m1-render/replay/pitch-down-paused-view.png). **The `save` field in `pitch-limits-log.json` is a stale earlier journal generation at tick11778, not the HUD's final12549 pose**; use its actual samples/images and the independent matrix audit for the pitch claim. Later shallow-exit and other replay envelopes are separately attributed.
3. Import154m checkpoint: E visibly refused, explaining personal150m versus hull180m and exit exposure153m; Space3s rose to137m, then E succeeded. [refusal/exit](/tmp/siltwake-m1-render/motion/earned-depth-refusal-exit.mp4). Earlier accumulated helper actions precede the import boundary in that log; it is not a continuous campaign trace.
4. Import actual Canopy handle, E board, quiet pilot from(90.307,−85.707,−92.431) to(90.055,−88.340,−102.518); crowns/resources visible through the cockpit. **Hull81% is inherited CORE damage from its documented shallow-shelf misstep**, not damage from this replay. [Canopy pilot](/tmp/siltwake-m1-render/motion/earned-canopy-pilot.mp4).
5. Import pre-air checkpoint, ordinary swim across existing lab threshold to(116.041,−116.856,−123.544), settle at floorY−118: oxygen~78→100, walking, wet exterior retained. [threshold](/tmp/siltwake-m1-render/motion/earned-lab-threshold.mp4).
6. Import earned normal return; actual page reload/Continue interrupted by blur preserves **the entire input state at tick21068**, independently compared in `return-reload-audit.json`. No fresh return is claimed.
7. Import unmodified departure-clear for ordinary Space/C waterline crossing and+1.35 surface pitch: hull100%, actual camera(19.865,−1.041,−8.130), frame/navigation visible. [surface pitch](/tmp/siltwake-m1-render/motion/earned-dart-surface-pitch.mp4), [still](/tmp/siltwake-m1-render/replay/dart-surface-pitch.png). Earlier `earned-dart-waterline.mp4` retains an old ART STAGING DOM badge from the preceding page; underlying input/import/actions are unmodified earned replay. The later surface-pitch clip removes the residue.

Early helpers logged targets/durations and sampled HUD, not every steering edge. Later `control-traced.js` records generated key edges for Canopy/lab/fixture/waterline segments. HUD can lag a few ticks; final replay envelopes match their associated final samples except the explicit stale pitch field. No claim of a continuous full-route trace, fresh preparation or final combined evidence.

## Targeted CARRIER fixture and affected lifecycle

Retained evidence-only CARRIER commit **`f7af235cbf761ec658d7638c7c5fef93c248588e`**, original source exact parent2ce5e14, session `02a306aa-930e-4cfb-b7c1-42b7d6e71892`. `fixture-inputs/` contains unmodified medium-configured/captured/launch-lock saves and original23-save index; all three hashes match that index. **Seeded fixture replay only**, not earned campaign or a repeated F0–F3 matrix.

Actual UI Leave helm and Take helm → Engage station keeping → Leave helm, then ordinary pan shows captured Creel through the medium window at carrier yaw6.108185; shell, seals, passage and stored craft align. [bridge](/tmp/siltwake-m1-render/replay/fixture-medium-bridge.png), [berth](/tmp/siltwake-m1-render/replay/fixture-medium-berth.png), [pan](/tmp/siltwake-m1-render/motion/fixture-medium-berth-pan.mp4). Resume the retained launch-lock case for1s: completion `berth_7`, shell rebuilt/closed, shared material retained; [lock render](/tmp/siltwake-m1-render/motion/fixture-launch-lock-render.mp4). No mobile-refuge registration or physical acceptance is claimed.

Rich1280×800 / Light853×533; resize1024×768 produces Light682×512 / Rich1024×768, then restore viewport. Actual `WEBGL_lose_context` marks unavailable with the paused explanation; restored/ready after~347ms stays in menu. Focus+W does not resume: whole saved state remains identical at **tick6693**. Deliberate Escape/pan advances to6801 with reconstructed panes visible. [loss/restoration](/tmp/siltwake-m1-render/motion/context-loss-restore.mp4), [restored panes](/tmp/siltwake-m1-render/replay/fixture-restored-panes.png), [pan](/tmp/siltwake-m1-render/motion/fixture-restored-pan.mp4). `lifecycle.json` records exact buffer/state comparisons. Actual request/console inspection found no shader/render errors or failed inspected requests, only expected context-loss/restoration warnings and startup logs.

## Host, cleanup and remaining scope

Read `/work/repos/fleet/BROWSER_RULES.md` and `docs/BROWSER_RULES.md` before browser work. T3 `preview_status`/owned incognito preview, verified **factory-worker Linux x64**, Chromium154, WebGL2 ANGLE Vulkan **SwiftShader Subzero**, muted host. No Windows automation or real desktop cursor capture. Free-port checks preceded owned preview launches on5191; peer5193/5194 resources were not touched. This is software rendering, not consumer-GPU performance or audible-mix evidence.

All recordings stopped normally. Only owned tab `tab_1y_0430977b-1ed3-45f2-ac72-3683f9fe8942` closed through T3 lifecycle; own-thread preview list is empty. Only owned preview session9605 stopped by Ctrl-C, exit130; `ss` verifies **no5191 listener**. Earlier owned sessions22134/26660 were also stopped normally. Historical tab14, human/shared/peer tabs, browser hosts and servers preserved. No process-name killing or browser-host shutdown. `cleanup.json` records the observations.

No new render failure remained in the executed bounded checks. Excluded side approach, inaccessible reverse-berth camera, stale pitch journal field, inherited hull damage and badge residue remain explicitly visible in the evidence. Fresh combined P0–P5/F0–F3, recovery-correction assembly, complete final-source expedition, consumer-GPU/audible checks, human enjoyment/duration, paired non-author batch review and integrated M1 acceptance remain unexecuted here and with root. This handoff does not grant independent acceptance.
