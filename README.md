# Siltwake

An original ocean survival adventure in strict TypeScript, Vite and Babylon.js. This branch implements the **first linked expedition**: a playable pod opening, Hearth Reef and Splitspine investigations, source-specific gathering and fabrication, the Dart scout, an upper-Canopy encounter, local recovery and persistent saves. The remaining campaign is under construction; this is not the complete game or an M1 acceptance claim.

Use Node ≥22.12.0:

```sh
npm ci
npm run dev -- --port 5188 --strictPort
npm run check
npm run preview -- --port 5188 --strictPort
node scripts/check-m1-economy.mjs
```

`check` runs strict typechecking, rules/composition tests and a production build. Run it before the economy checker, which reads the compiled production registry and compares the adopted recipe costs to the proposal. Dependencies are pinned. Runtime assets, geometry and procedural Web Audio are local; no model API or external asset service is required. WebGL 2 and a current desktop browser are required. HTTPS or localhost enables Web Locks for safe local saving.

WASD moves; arrows or mouse drag look. Space/C rises/dives, Shift accelerates, Z moves quietly, R toggles forward cruise. E interacts or exits a craft, Q scans, B deploys/packs the salvage buoy, F eats, G emits a defensive distraction. Tab/I opens the hold, K fabrication, J the notebook, H a voluntary regional hint. Escape pauses; F5 saves. Pointer lock is optional from the menu. All blocking menus and external interruptions freeze the simulation; returning focus never resumes automatically.

Inspect physical records to retain observations, provenance, hypotheses and preparation leads. The reef ribs and split island ridge offer two investigation orders. Repairing the pod improves fabrication while its air, healing and refuge stay dependable. The workshop becomes a real second refuge, locker, charger and hull bench. Source bundles first use the 16 CU diver hold, then a nearby deployed 24 CU buoy. Fabrication also uses its local locker. Full holds, unknown plans, missing prerequisites, wrong locations and obstructed construction refuse without consuming materials.

Dart has a 180 m hull, a 32 CU hold, acceleration and steering, power, damage and a visible canopy access. The diver starts at 60 m and can fit a 150 m suit; the hull does not protect an exposed diver. Its conservative upper-Canopy route uses the open crowns. Quiet movement, the tall rib and a directional distraction can turn away the territorial sound hunter. Meals have no decay timer or thirst requirement. Shallow staples require no tool. An emergency refuge portion supports an empty-food restart.

Incapacity retains knowledge and essential equipment, leaves at most 8 CU ordinary cargo in identified caches and preserves disabled vessels. Bobbin/collar is built from bound maintenance allocation. Reach the shallow rescue bench east of Splitspine or approach the hull locally: deploy the tethered tool, confirm attachment, tow through the surveyed upper flank, apply a bound patch and supply a reserve cell. Salvage requires an empty hold and returns the complete public frame investment once; maintenance patches return to maintenance. Repeated recovery has a recovery-only shallow sorting fallback. Full deep recovery topology remains later work.

The main menu has a separate **seeded carrier feasibility fixture**. Export your expedition first; a confirmed fixture start replaces Continue. V opens its controls. It tests stationary walkable interiors, explicit carrier-local berths, dry Spindle transport, blocked launches, capture/launch persistence and empty supported-dock reconfiguration. Move to the aft yellow vestibule before leaving the interior. Spindle deploys only at the surface. The fixture is not earned campaign progression; the workshop’s incomplete large berth is a future opportunity. Walking underway is not enabled.

Saves use **schema 2 / `expedition.2`** in the accepted atomic current/previous local journal and cross-tab writer lock. Strictly validated schema 1 / `foundation.1` saves migrate once. Safe old poses/vitals remain; changed geometry relocates unsafe poses to the pod with feedback. The first successful write preserves the original generation as backup. Unknown, future or malformed data is refused without replacing progress. Export portable saves before clearing browser storage. If safe local writing fails, explicitly choose an exportable session without autosave. Pending writes and imports remain cancellable.

Geometry, materials and audio source are original and editable under `src/render`, `src/content` and `src/audio`. The richer cel shapes adapt the original study at `20711d1`; its disposable viewer is not a runtime dependency. Assets use right-handed metres, Y up and water Y=0. Simulation airway, pressure and hull references are independent of camera interpolation. The roster preserves all seven regions, eight materials and six hull roles; only actual M1 interactions are seeded.

Author evidence, contract proposals, actual check results and remaining limits are in `docs/build/evidence/M1-01.md`. Existing and current Linux SwiftShader captures do not establish dedicated-GPU performance. Full campaign, ten-hour pacing, human enjoyment and independent acceptance remain open.
