# Siltwake

An original alien-ocean exploration adventure in construction. This branch contains **FND-01**, an early playable foundation: a refuge pod, reef ribs, a walkable island shore, swimming/walking, menus, graphics settings and guarded local saves.

The agreed campaign remains the approximately ten-hour main-story target, seven habitats, mystery, habitat-specific resources, food without thirst, six craft and inhabited carrier, and recoverable expeditions. Those systems are **not implemented in this foundation**. The [revised build input](prompts/BUILD_GAME_REVISED.md) and [current checkpoint](docs/build/STATUS.md) own the continuing scope.

## Run locally

Use Node **22.12+** (author checks: Node 24.21.0 / npm 11.19.0). All runtime code and art are bundled; there are no remote assets, fonts or live API calls.

```bash
npm ci
npm run dev
```

Open `http://localhost:5173`. A current desktop browser with **WebGL 2** is required. The menu reports a readable failure if WebGL 2 cannot open. Required package versions are pinned in `package.json` and `package-lock.json`.

```bash
npm run typecheck
npm test
npm run build
npm run preview
```

Preview serves the actual `dist/` at `http://localhost:4173`. `npm run check` runs typecheck, the simulation/persistence/session tests and production build. A different isolated test origin can use `npm run preview -- --port 5184 --strictPort`. The relative Vite base supports serving the static artifact from a subdirectory. Use HTTPS for hosting, or HTTP on localhost for local play: safe local writing requires the browser's Web Locks API, which needs a secure context. Required runtime assets work offline after delivery; browser permissions still control local saving.

## Explore

| Input | Action |
| --- | --- |
| W A S D | Move / swim; swimming forward follows the view |
| Drag left mouse, or arrow keys | Look |
| Space | Swim up / jump on land |
| C | Dive |
| Shift | Move faster |
| R | Toggle forward cruise; W/S or pause cancels it |
| Esc | Pause / resume; release optional mouse lock |
| F5 | Save locally |

Walk forward from the pod deck, down the **amber-edged submerged ramp**, to enter the sea. Return using the same ramp. The split island lies north; its south shore supports swimming-to-walking transitions. Blue basalt ribs lie west of the direct island route. The foundation area is bounded and marked by small edge buoys.

Click **Controls & settings** for rendering quality, mouse sensitivity, invert look and optional **Resume with locked mouse**. Mouse lock is only requested by that explicit button. Rich renders at the viewport's CSS-pixel size; Light renders at two-thirds of each CSS dimension. Focus loss, a background tab, menus and a lost graphics context pause simulation and clear all held controls/cruise. Resume is explicit after interruptions. The pod is currently an exterior/deck; its facilities arrive in the first expedition.

## Keep progress

**New expedition**, **Continue**, **Save locally**, **Export save** and **Import save** are in the menu. Autosave runs every 30 seconds of active simulation, after a session has a writable slot. Replacing an existing expedition or importing valid progress shows a replacement confirmation. Export before replacing a session you want to retain.

When storage refuses a write, or safe cross-tab locking is unavailable, New Game and validated import offer **Use without local saving**. This second explicit choice enters an exportable session with automatic saving disabled. Cancelling keeps your current expedition. Local records remain unchanged after a refused write; the menu and HUD warn when autosave is off. Export before closing the page. You can explicitly retry **Save locally** later. A failed manual/autosave retains the active expedition and disables automatic retries. Validation failures, protected-record refusals and stale-tab conflicts retain their distinct safeguards and do not offer this replacement shortcut. Pending file reads/writes deduplicate conflicting actions; **Cancel operation** or Escape cancels waiting work.

The key `siltwake.save.journal.v1` contains a single atomic localStorage journal with **current** and **previous valid** saves. Browser Web Locks serialize the observed-record comparison and journal replacement under the same per-origin lock, `siltwake.save.journal.v1.writer`. A storage quota/permission failure leaves that record unchanged. A stale tab cannot overwrite a changed slot. All writing tabs must use this compatible writer protocol; close older builds before playing. Unsupported locking permits read/export and explicit unsaved play, with no racing-write fallback. An invalid import never enters the session or storage. A corrupt/unsupported local current can offer its previous valid generation, with autosaves blocked until an explicit repair. Repair preserves the unreadable raw record inside the journal. The save-safety menu can export the previous save and raw journal; a raw journal export is a safeguard, **not** an ordinary importable save file.

Schema **1**, content **`foundation.1`**, reads only that exact schema/content pair. There are no legacy migrations. Unknown, newer and older schema/content versions are rejected without truncating or rewriting them. Later feature batches must add an explicit reviewed migration from v1; reserved empty extension collections may not acquire new fields silently. Import size is capped at 1 MiB. Browser storage is site/origin-specific and can be cleared by browser settings; exported JSON is the portable copy.

## Production boundaries

- `src/content/registry.ts`: the single stable region/material/hull authority and original-asset metadata. The roster does not mean those regions or vehicles are active.
- `src/sim/`: plain serializable state, typed validated commands/events, 60 Hz update, bounded fixed clock and shared terrain/solid queries. No Babylon or DOM imports.
- `src/save/`: envelope validation and asynchronous serialized storage adapter with backup, protected recovery, cancellation and stale-tab checks.
- `src/render/`: editable original procedural art and shaders, including a shared analytic terrain surface and pod/rib collider layout.
- `src/runtime/`: one create/update/present/dispose app owner, input adapter, and a renderer-free expedition/session operation boundary. `src/ui/` presents state and routes actions through that owner.

Coordinates are **right-handed metres**, Y up, water at Y=0. Yaw=0 faces -Z; positive yaw turns toward +X, positive pitch looks up. Player position is the upright capsule's base in the `world` frame. The camera adds an eye height. World solids use conservative swept capsule proxies and sliding; the terrain/ramp use shared surface queries. Tiny decorative foliage and stones are non-solid. Vehicle, carrier berth and interior collisions remain later gated work.

The cel palette, basalt ribs, pressure-shell pod and ridged reef ribbons adapt the design language of the repository's original refined art study at **`20711d1`**. Production generators are original typed implementations; the throwaway viewer and its water-at-10 coordinate system are not imported. No copied commercial art, downloaded assets or generated raster stand-ins are used.

Historical author checks are recorded in [FND-01 evidence](docs/build/evidence/FND-01.md); persistence corrections, current checks and browser artifacts are in [FND-01 round-one correction evidence](docs/build/evidence/FND-01-R1-FIX.md). The foundation is provisional until the coordinator's inspection and separate non-author Astra xhigh and Sol 6.1 max reviews. Dedicated-GPU performance, human duration/enjoyment and the later campaign gates remain unverified.
