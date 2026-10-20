# World evolution plan (coordinator, 2026-10-20)

**Source:** the owner asked for caves, cliffs and underground areas, richer landmarks, creatures and resources, and a more cohesive, hub-centred map. This plan draws on three Sol 6.1 high research reports:
- [layout and progression](../research/WORLD-LAYOUT-PROGRESSION.md)
- [caves and underground](../research/CAVES-UNDERGROUND.md)
- [landmarks, creatures and resources](../research/LANDMARKS-CREATURES-RESOURCES.md)

**What exists today:** the ground is a single heightfield. Steep cliffs exist: the Rift trench, the Divide ridge, Meridian's terraces, the escarpment and the island cliffs. Caves, overhangs and underground spaces do not. Everything below starts after C3 lands, because C3 is composing the one physical world into the runtime, and caves build on that.

## Iteration 1: now, within the current 2.0 × 1.8 km footprint

### W1: caves and underground areas (one Opus owner)
- **Approach:** authored **cave replacement volumes**. The heightfield stays outdoors. Each cave replaces a small terrain footprint with thick box rock solids (reusing the existing continuous sweeps), plus baked cave-shell meshes in the existing layer-0 terrain recipes. No world-wide voxels and no runtime CSG.
- **Shared prerequisites:**
  - a single terrain-query adapter, so `moveCapsule`, clearance, line of sight, support, hull floor and moves, and `step.ts` all respect ceilings;
  - validators (access, drape, rescue) that understand roofs;
  - room and portal graphs for wildlife and tows;
  - cave darkness and a lamp cone in the cel shader.
- **Phases:**
  1. **Contract plus one diver loop:** the Fanvault loop at the Reef.
  2. **One streamed, recoverable craft cave:** the Dish-lee vault in the Basin, covering tow and save/reload inside.
  3. **The remaining four:**
     - Splitstack undercroft (Isles);
     - Lantern-root hall (Canopy);
     - Cool-seam gallery (Rift → Divide shortcut);
     - Terrace window gallery (Meridian).
  4. **Integrated review.**
- **Clearance targets:** small-craft mouths 10–12 m wide by 5–6 m high; work-sub halls 12–16 m by 7–9 m. Hearthline stays outside.
- **Guardrails:**
  - every mandatory first access stays on the exterior route, and caves are shortcuts and rewards;
  - two recognizable mouths per loop;
  - a lamp-off retreat test.

### W2: a central hub and connected loops ("Option A")
- **The hub:** extend a **Hearth Reef spur** to a shallow 45–60 m crown near the map centre, just north of the Basin bowl. It holds a restorable charging and staging stop next to the fabrication network. The pod stays northwest as the recovery anchor.
- **Three loops:**
  - hub → Canopy → Basin → hub;
  - hub → Rift → Divide → Basin → hub;
  - Divide → Meridian → eastern Canopy escarpment → Basin. This one stays deep and is never a pressure bypass.
- **Interleaving:**
  - a cool Rift finger toward the Basin's west rim, with stock still at 250–320 m;
  - an upper Divide ridge visible from a 150–220 m Basin terrace;
  - a deep opening toward Meridian visible under the eastern Canopy.
- **Two routes for each major crossing:** a broad carrier lane plus a small-craft flank.
- **A lure chain:** the mast, then the twin ribs, then the fallen dishes pointing to the chimney, then the gateworks silhouette, then the root arch on the deep return.
- **Travel budgets:** follow the layout research. The deep worksite stays served by the 240/300/390/520 m stop chain, not by returning to the hub.

### W3: a density pass for landmarks, creatures and resources
- **Cheap first:**
  - 2–3 anchors and 8–12 discovery clusters per region, counting what exists;
  - resident groups around sources, with 3–6 creature types per region, usually at most one threat type and at least two benign or cue types;
  - two side rewards per region, attached to existing geometry;
  - return views.

  Merge nearby markers into destinations instead of multiplying scatter.
- **Expensive later**, all original: Canopy floaters, shore buttons (Isles), silt combs (Basin and Meridian), and seam pickers (Divide).
- **Rule:** no new mandatory material or recipe tier. Rewards are knowledge, convenience, existing stock, routes or views.

### Known conflicts for C3 (sent)
- S2's chimney pulse is 90 s / 35 s and S4's plume is 75 s / 18 s. Bind the mites, fans, captions and damage to **one** composed field.
- S4's brine cue says "nothing lives below", yet the layer skate lives there. Reword it, for example as "no fans or small life below".

### Ownership and sequencing (cap: 5 Opus builders)
- **After C3:** W1 phase 1, W2 and W3 (cheap) can run in parallel, given careful ownership:
  - **W1** owns the new `src/content/regions/caves.ts`, the terrain-query adapter in `sim/world.ts` and `step.ts`, the cave bake path, and the shader's darkness and lamp.
  - **W2** owns `src/content/regions/terrain.ts`, `layout.ts`, `passages.ts`, `access.ts` and `rescue.ts`. That means a re-bake.
  - **W3** owns `sites.ts` and `structures.ts` dressing, the ecology anchors, and the scatter and vista composition.
- **Order:** W2's terrain changes land before W1 places caves 2–6. Cave 1, the Reef Fanvault, doesn't depend on the hub.
- **Gates:** each one passes the lean gate (one fresh Sol 6.1 xhigh review), and `npm run playthrough` must stay green on both strategies.

## Iteration 2: noted for later ("Option B")
- **Size:** a larger interleaved basin, about **3.2 × 2.8 km**, still reaching 780 m.
- **Layout:**
  - the pod and main anchorage near the centre, with the three islands in an arc around home;
  - Canopy patches to the north and east, and the Basin curving around the south and west of the centre;
  - the Rift cutting in from the southwest, and the Divide bending east;
  - Meridian under the southeast arc, with approaches from several neighbours.
- **Bands:**
  - inner, 0–450 m from home;
  - middle, 350–850 m;
  - outer, 700–1,300 m;
  - plus a deep layer underneath.
- **Optional new sub-biomes:** Glass Shoals, Chime Escarpment and Ash Apron.
- **When to decide:** after a complete campaign and fresh-player playtests. If the world feels small, first check whether landmarks reveal too much or routes lack decisions before adding kilometres. It needs an owner decision, because it changes world scale and the seven-region scope.
