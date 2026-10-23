# Compromise verdict (Opus 5.5)

2026-10-23. The design decision on Sol's [compromise audit](COMPROMISE-AUDIT-SOL.md) (`4e81ac9`, 107 findings). I read the audit in full, along with STATUS, DIRECTION, GAME-DIRECTION, the end of STREAMS, the perf decision, CW-1's paused handoff (`f55254f`), CR-1 (`02e0ec6`), LC, A1, DISH-1, C4 and S1, and I checked the collision and simulation code the findings cite. I ran one light measurement, listed at the end. No production code was changed, and no spoiler files were read.

## Verdict

**Did builders sacrifice quality to fit constraints? Yes, but in a narrow and fixable pattern, not across the board.** Most of the 107 findings are declared, sensible trade-offs, or flaws already fixed at the root. Builders made several genuinely good root repairs:
- baked terrain (S2);
- the triangle collider for big caves (LC);
- baked, streamed caves (CW-1);
- the shared light solve (W2/CA-1);
- test tiering that kept every assertion (TT-1).

The real sacrifices sit in three places:

1. **Art was bent to fit the physics.** In about ten places, landmarks, dishes and caves were reshaped, broken or moved. Nearly all of it traces to one flaw: **the game's physics only knows boxes aligned to the world's axes.** A rounded arch, a slanted hull plate or a curved bowl has to become thousands of boxes or change shape. The great wreck's bow lost its skin, the dish bowls float you 1 m above the porcelain, and 125,852 of CA-1's 152,548 collision boxes are just the seam between cave and seabed.
2. **Memory is about to be "solved" by cutting.** Nothing has been cut yet, but the four-cave-biome plan would force cuts. The 256 MiB world budget is a default nobody derived from real hardware, the accounting misses several big owners, and each cave biome's "fixed" data is treated as resident across the whole world. Fix those three things and all four biomes fit, at full size, with room for more.
3. **Evidence was skipped exactly where the player lives.**
   - The scale test DIRECTION required *before* mass content (more than four regions, dense vegetation, three hulls and the carrier, with measured memory) never ran, and 58 caves were authored without it.
   - CW-1's no-pause traversal covers 1 of 8 segments.
   - Loading from a cold browser cache has never been measured.

**One more item that I don't count as a trade-off: unfinished scope.** C4 left nine signature upgrades as catalogue entries that do nothing, plus the host upgrades, and a deployed outpost is invisible in the water. That isn't a constraint compromise, but it must be built before the owner's playtest. Otherwise the playtest judges a game in which half of each craft's identity is missing.

**The per-tick state copy is real, but it costs the bots, not the player.** I measured 76–88 µs per copy on saved late-game states, about 0.5% of a 60 Hz frame. Fix it as planned for test and soak throughput, but it isn't why anything looks or plays worse.

### The five root problems, and the change that removes each

| # | Root problem | Root change | What it removes |
| --- | --- | --- | --- |
| 1 | **Box-only collision.** `Solid` is `{min, max}` and actors are world-aligned boxes. | **One collision model:** each shape uses the primitive that fits it. Baked triangle meshes in a compact BVH for authored surfaces (LC's collider, generalised), a heightfield query for terrain and cave collars, and boxes only for things that really are boxes. Then yaw-aligned craft proxies. | Bent landmarks, broken dishes, the 1 m bowl float, box counts in the 100k range, slow module loads, the √2 passage widening. |
| 2 | **Building at runtime what could be baked; whole-world residency.** | **Bake everything, load by proximity, decode in workers.** Content-addressed per-cluster packs, deployed builds that never generate live, and a main thread that only uploads, in bounded slices. | Multi-second cave builds, sync stalls, monolithic packs, stale-bake mixes, eager fauna, legacy region owners. |
| 3 | **An un-derived budget, an incomplete ledger, global "fixed" costs.** | **A device envelope and one complete ledger.** Fixed data is proximity-scoped and kept compressed until it's needed. | The 44 MiB squeeze, hidden staging and caches, CPU copies kept "just in case". |
| 4 | **Paths are authored first and frozen, so content gives way.** Routes, rescue tethers, park columns and creature habitat clamps. | **Paths are solved against the composed world** and move when art arrives. Creatures get migration lanes between habitats. | Fallen tripods and rim breaks, tethers through cave rock, skates swapped 340 m away, caves shoved off corridors. |
| 5 | **Evidence measures the harness, not the player.** Warm caches, job deadlines, segmented runs, SwiftShader, diagnostic teleports. | **Goal-based jobs, a save library, and a standing player-truth gate:** cold cache, native input, 3090 at 1080p, continuous runs with per-frame attribution. | Most of the 19 C findings, as one gate instead of 19 tickets. |

### What we fix
- **Now, inside active streams:**
  - **CW-1** finishes all 8 traversal segments before it merges, makes its last-resort synchronous build loud, and rejects stale bake packs.
  - **CR-1** makes the skate's rest visible, hides the skate swap from view, and proves each threat window with a continuous approach.
- **New streams:**
  - **COL-1:** one collision model, then restore the bent art.
  - **WK-1:** already planned; widened to "bake v2" with the complete ledger.
  - **MEM-1:** the skipped scale test, run by Sol.
  - **LC-2:** biome residency, before the second cave biome.
  - **SIG-1:** the missing signature upgrades and visible outposts.
  - **NAV-1:** derived paths and creature lanes.
- **Before the owner's playtest:** a short player-truth gate (PT-0).

### What we keep
- the kit's 2 m rock grain;
- the bounded AI and audio caps;
- the fixed-step clock;
- the pre-release save policy;
- the owner's cave bends and airlocks;
- the moved cave placements;
- the kiln's depth;
- straight works pipes;
- the hybrid terrain authority until the bigger map is re-evaluated;
- coarse cave walls sitting slightly behind collision;
- test tiering.

These are genuine trade-offs that a player won't feel, or that the owner already chose.

### The plan in one paragraph
Keep the owner's queue (OP-1, cave biomes, lost sites, atmosphere, playtest), with three changes:
- **COL-1 starts now** in new modules and lands before lost sites, so the next wave of built structures isn't bent again.
- **The second, third and fourth cave biomes wait for LC-2**, which needs WK-1's workers. The first biome (Canopy) fits today and can go after CW-1.
- **SIG-1 and the PT-0 gate go in before the playtest.**

The full order, dependencies and slots are under *Plan*.

### Decisions for the owner
1. **Minimum hardware for memory.** I recommend the 3090 desktop as the "steady 60 fps" target, and the 4070 laptop (8 GB VRAM) as the memory floor, so the budget is derived rather than guessed.
2. **Dish and wreck restoration** (taste calls below). I recommend:
   - standing feed tripods on the great and north dishes, with the south dish's left fallen;
   - one deliberate breach in the great dish's rim instead of three cut segments;
   - the wreck's bow restored.

   The 1 m bowl tolerance you approved goes away for free with COL-1.
3. **Reordering.** Agree to:
   - COL-1 before lost sites;
   - LC-2 before biomes 2–4;
   - SIG-1 before the playtest.
4. **Optional early playtest.** A short playtest of the opening hours right after OP-1 would calibrate the bot-to-human factor weeks earlier. The full playtest stays at the end. I lean yes.

## 1. The root problems in detail

### R1. One collision model (COL-1)
**The flaw.** In the simulation, `Solid` is `{ id, min, max }` (`src/sim/world.ts:39`), and the narrow phase expands a solid by the actor's box (`world.ts:282`). Every curved or slanted surface therefore becomes many boxes, or changes shape:
- **A1:** 5,195 boxes, with rounded tubes turned into world-axis prisms, a bow without its skin, and pipes forced straight.
- **DISH-1:** 4,855 boxes for three dishes whose bowls are 144 triangles each. That costs 0.3 s of module load, 25–90× slower sweeps for a tight bowl, and a 1 m float.
- **CA-1:** 152,548 boxes, of which 125,852 are collar columns.

**The decisive fact.** The root fix is cheaper than Sol's "L" estimate, because its core already exists and works. LC built a triangle collider with box-against-triangle sweeps, and a `CaveCollider` composer that already mixes box and triangle owners (`src/world/caves/large/compose.ts`). LC measured it against boxes:
- queries are 10× faster (Creel 56 → 4.8 µs);
- sliding is far better (a requested 58 m slide advances 38.8 m, not 11.6 m);
- the cost was memory, about 12× for cave rock.

For **authored structures** the memory trade-off reverses: a dish bowl is 144 triangles, against the thousands of boxes that approximate it.

**The change, in stages, by one Opus owner:**
- **A, now, in new modules.** Generalise LC's collider into a `StaticCollider` for any baked shape:
  - a compact format (`Uint16` local indices, positions shared with the art, small BVH nodes; LC estimated this roughly halves its cost);
  - a heightfield query for collars and terrain seams;
  - structure shapes baked from the same source as their art;
  - a rule never to index large shapes with a uniform fine grid, after TST-05's 56M-entry cliff.

  It ships with an oracle that compares new and old queries on existing scenes.
- **B, after CW-1 merges.** Move vistas, dishes, structures and cave collars onto it; add depenetration when a save loads (ART-07); retire the box sets.
- **C, the restoration, owned by the same builder to prove the fix.** Restore A1's bow and round sections, and the dish feeds and rim, per the taste calls below.
- **D.** Yaw-aligned craft proxies, so diagonal passages no longer need √2 extra width (CAV-02, LC's 12 m lane).

**Scale.** Resident collision then scales with what is near the player, not with the number of boxes an artist's shape happens to need. Lost sites, crown interiors, cave biome set pieces and future landmarks all get exact collision from their art.

**Interim rule for every builder until stage B lands:** don't reshape art to fit boxes. Keep the intended art, collide it with a conservative box cover that blocks no route, and file the gap as COL-1 debt in the handoff.

### R2. Bake, load by proximity, decode in workers (WK-1, already planned, widened)
**The flaw.** Several systems still build or keep the whole world eagerly on the main thread:
- `gameWorld()` builds one eager composite (CAV-03);
- one monolithic `collision.bin` is decoded and retained (STR-09);
- light fields are kept by count (CAV-22);
- every fauna group is built at layer creation (CRE-07);
- legacy region owners prepare synchronously (STR-01);
- the terrain fallback generates live and never retries (TER-01, TER-08);
- an unsliced `Infinity` finish is the last resort (STR-10);
- packs aren't bound to the build (STR-13).

CW-1 already turned the biggest of these, cave generation, into baked, streamed and sliced data. That's the right design, and WK-1 should finish it rather than start something new.

**The change.** WK-1 owns:
- a worker pool for decode, meshing, scatter and collision preparation, plus a save worker (WK-1's existing scope);
- **bake v2:**
  - per-cluster and per-chunk packs with per-unit input keys;
  - content-addressed URLs bound to the bundle;
  - an upload-size cap on parts, enforced at bake time;
  - one builder seam (TER-06);
- **deployed builds fail closed.** Live generation exists only in Node, for tests and the bake oracle, and in `?dev`;
- **the complete memory ledger from R3.**

**Scale.** Resident cost is set by the neighbourhood; download and disk size are set by the world. More caves, biomes or lost sites add bake bytes, not resident memory or startup time.

### R3. A real budget model (MEM-1 measures; WK-1 and LC-2 implement)
See section 4. In short, three changes:
- derive the envelope from a minimum device;
- count every owner in one ledger;
- make "fixed" per-biome data proximity-scoped and compressed while it isn't in use.

### R4. Paths are solved, not frozen (NAV-1)
**The flaw.** Routes, rescue tethers and park columns are hand-authored splines and poses, frozen before later art arrives, so whoever arrives second loses:
- DISH-1 cut its own art for them (ART-02);
- CW-1 found three tethers diving through cave rock and re-bent them by hand;
- CA-2 shoved caves 69 m and 16 m off corridors (CAV-04);
- creatures are clamped to habitat volumes with no way between them, so CR-1 faked a migration with a second pair of skates (CRE-04, CRE-01);
- hunter passes can't plan around occluding crowns (CRE-03).

**The change.** Authored paths keep their *intent* (waypoints, pacing, views). A bake step solves the exact line against the composed collision, with minimal detours, and flags any detour beyond a set deviation. Creature habitats become a graph with authored transit lanes, so one simulated animal can migrate. The policy reverses: **art doesn't give way to a path; the path moves.**

**Scale.** Every new cave, landmark or lost site would otherwise trigger another round of hand re-bending, and GAME-DIRECTION's planned migrations need lanes anyway.

### R5. A player-truth gate (SCHED-2, SAVE-1, PT-0)
**The flaw.** Under the old single lock, evidence was shaped by what fit:
- 20–30 minute deadlines split runs (TST-14);
- warm build caches stood in for the player's cold load (TST-01, TST-03);
- SwiftShader and synthetic input stood in for the 3090 (TST-09);
- diagnostic teleports stood in for discovery (CRE-08, CAV-17);
- one of eight segments stood in for the whole traversal (STR-11).

**The change.**
- **Already decided:** SCHED-1 (the queue), SCHED-2 (goals, stall detection and soak runs) and SAVE-1 (shared saves).
- **Added:**
  - **PT-0**, a short, fixed player-truth gate run on the playtest build (section 3);
  - a **cold-load metric** kept as a permanent check in MEM-1's harness.

**Scale.** One gate that grows with the world, instead of one evidence ticket per stream.

### Not a top root: the per-tick state copy (SIM-1, as planned)
`structuredClone` runs on every `stepGame` and `executeCommand` (`src/sim/step.ts:548,567`). It costs **76–88 µs per tick** on 11–14 KB saved states (my measurement), about 5 ms of CPU per second at 60 Hz. That isn't a frame problem today. TT-1's "70%" is of simulation *test* time, and that's where it bites: bots, soaks and the save library.

**The design I'd ask SIM-1 for:**
- `stepGame` mutates in place;
- exception atomicity comes from a low-cadence checkpoint (about once a second) plus a loud failure in development, instead of a copy every tick;
- `executeCommand` (rare, from menus) may keep its clone.

**Fold in:**
- SIM-02's ID indexes and the event-driven recorder;
- SIM-05's protection of feedback notes.

## 2. Content bent to fit: taste calls

The test for each: what would the owner notice in the playtest, and does the fix make the world better, or just different?

| Content | Bent how, and why | What a player notices | Call |
| --- | --- | --- | --- |
| **Basin dish field** (DISH-1) | Every feed tripod lies fallen; three rim segments are cut where a route crosses; centre panels are missing under work poses. Cause: tethers and park columns run straight down over the bowls. | From 300 m, a dish only reads as an antenna because of its standing feed horn. Three bowls ruined in the same way read as the game clearing a path, not as history. Variety reads as story; uniform damage reads as a system. | **Restore.** Standing feeds on the great and north dishes; the south dish stays fallen as the field's storytelling beat. One deliberate collapse with a debris slope on the great dish's rim, which the route uses, instead of three neat cuts. Park poses move to the rim's lee, and tethers thread between the tripod legs (COL-1 gives thin legs exact collision). Panels return. COL-1 stage C. |
| **Dish bowls float you up to 1 m** (ART-03, owner-approved) | The tolerance was chosen because hugging a curved bowl with boxes costs 10–12k boxes. | Lying in the bowl, the diver hovers. | **Superseded.** Collide the bowl as its 144 triangles: close to zero tolerance, cheaper than today. COL-1 stage B. |
| **A1 vistas** (west hull wreck, arch, ring, works) | Tubes became rounded-rectangle prisms square to the world axes; the bow lost its leaning ribs and diagonal skin; three pipes were straightened. | The **bow is the wreck's silhouette**: big landmarks looming in the murk are atmosphere priority 4, and a ribs-only bow reads as scaffolding. Rounded-rectangle tubes read as extrusions up close, though not at distance. Straight pipes in an industrial works read as normal. | **Restore** the bow (leaning ribs and skin) and the round arch and ring sections. **Keep** the straight pipes. COL-1 stage C. |
| **Layer skates' laying visit** (CR-1) | Two roster skates sink away while two laying skates appear 340 m off, never in one view, because the simulation can't path across the crest. | Nothing, unless the player follows them, or sees the laying pair pop in. | **Keep for the playtest**, provided the swap is never seen. The laying pair rises from the brine edge below the shelf and leaves the same way (CR-1, small). **The root fix** is one identity on a migration lane, in NAV-1. |
| **Skate rest hidden by opaque brine** (CR-1) | The sinking can't be seen through the mirror; a patrol ripple fails at grazing angles; the rest reads only from ribbons and a caption. | The owner's rule is "timing and observation" for every threat. This one is observed by reading text. | **Fix before the playtest** (CR-1). Make the top 2–3 m of the brine interface translucent with a refractive shimmer, so settling silhouettes show, and the sinking skates stir a silt and brine plume that rolls across the mirror. |
| **First hunter pass hidden by Canopy crowns** (ENC-1) | The warning silhouette can be blocked; a UI edge cue covers the unseen lunge. | The first hunter encounter is a set piece, and a cue on the screen's edge is a poor substitute for seeing the animal. | **Fix before the playtest:** choose the pass line from candidates with a clear sight line to the player's view. CR-1 if it fits, otherwise early in NAV-1. |
| **West sea cave dry shelf** (CA-1) | It became a shingle bank 1.5 m underwater, because waterline walking wasn't validated. | A dry air pocket inside a sea cave is a memorable beat that was lost quietly. | **Restore after OP-1.** The island opening has to prove shore walking anyway; then a small CA-1 follow-up raises the shelf. |
| **Blowhole second exit** (CA-1) | Light and air only, because nothing climbs. | Nothing: there's no climbing in the game. | **Keep.** Adding climbing would be a new mechanic, not a repair. |
| **Storm arch as three blocks** (CA-1) | The single outline sprawled under the kit's batter. | Possibly a blocky arch. | **Look at it in the atmosphere pass**, and remake it as one arch if it reads as blocks. |
| **Kiln raised 300 → 273–291 m** (CA-3) | To halve its voxel envelope. | Nothing. | **Keep.** |
| **Caves moved 69 m and 16 m** (CA-2) | Plan-only ownership blocked overflight; CW-1 fixed the rule. | Nothing. | **Keep** the placements. |
| **Cistern "loop" became a turn** (CA-3) | Axis-aligned craft legs plus a real flank limit. | A tighter hall than sketched. | **Keep.** Revisit only if the playtest finds the craft passages boxy after COL-1 stage D. |
| **Flattened cave-mouth aprons** (CA-2 shelves, CAV-05) | Shelves stop edge rock sinking on slopes. | Slightly artificial flat aprons at some mouths. | **Atmosphere pass:** apply CW-1's `edgeRock` to CA-1 and CA-2, and drop each shelf where edge rock holds. |
| **Landmarks vanish past ~450 m** (ATM-1/POI-1) | The fog and emissive model, plus scope. | The owner's "seeing far" rule is broken without the far layer. | **Fix** with CW-1's far layer plus beacon visibility in the atmosphere pass. |
| **Invisible outposts, inert signature upgrades** (C4) | Staged scope, not a constraint. | Deploying an outpost and seeing nothing; craft without identities. | **Build: SIG-1, before the playtest.** |

## 3. Evidence that must be re-run before the owner's first playtest (PT-0)

These run once, on the playtest build, through the queue, with no time caps. Sol runs them, the coordinator inspects them, and anything that fails goes back to the owning stream.

1. **No-pause traversal: all 8 CW-1 segments at 1920×1080 on the 3090**, with the real exterior and per-frame attribution:
   - no frame over about 33 ms caused by streaming;
   - zero holds;
   - zero last-resort synchronous builds.

   CW-1 must reach 8 of 8 before it merges; PT-0 repeats it on the final build with the cave biomes placed.
2. **Cold load.** A fresh browser profile and an empty HTTP cache, served like a deployment:
   - time from page to playable;
   - the first five minutes' frame trace;
   - one region return trip;
   - a save reloaded inside a cave, with admission finishing within the load screen.
3. **Full-world memory soak.** About two hours covering all regions and the placed cave biome:
   - renderer and GPU-process RSS, plus the post-GC heap, by ledger category;
   - no growth across region returns;
   - inside the envelope;
   - realtime audio CPU sampled (ART-11);
   - the timeline event rate (SIM-05).
4. **Autosave frame time,** the worst case at a late save (SAV-04). A synchronous save hitch counts as a pause.
5. **Crown-station mast and far-layer views** from about 400 m and 1 km (TST-08, ART-06).
6. **Threat windows:** one native, continuous approach per window, with no diagnostic placement (CRE-08). Includes the skate rest cue and the first hunter pass.
7. **Both routes in `npm run playthrough`** on the build, plus a natural battery depletion from SAVE-1's adverse set (TST-23).

**Not needed before the playtest:**
- UI readability, interpolation stiffness and the audio mix. The owner's playtest *is* that evidence.
- Old SwiftShader-era checks; PT-0 replaces them.
- Exhaustive keyboard runs of every retreat.

## 4. Memory and loading budget for the full game

**Is LC's model right? No, in three ways.** Its per-biome measurements are fine. The model around them is not.

1. **The 256 MiB is not derived.** `src/world/residency.ts:62` sets 256 MiB CPU and 256 MiB GPU as a default; S1 itself says its earlier 160 MiB was "unvalidated against S2/S3-scale art". The only browser measurement on record is C2's renderer RSS of about 282 MiB for the whole game at that revision. Treating 256 MiB as the ceiling bends design to a number that came from no hardware.
2. **The ledger is incomplete.** These owners sit outside it:
   - construction staging, about 2× the recipe (STR-02);
   - the decoded terrain LRU of 48 MiB plus in-flight decodes (TER-07);
   - the geometry cache of up to 32 MiB (STR-14);
   - Babylon's CPU copies of shown art, about the same size as the GPU copy (STR-06);
   - CW-1's whole-world collision pack (STR-09);
   - simulation-side cave composites;
   - fauna (CRE-07).

   So the budget is simultaneously too small where it binds and too narrow in what it counts. Raising the number alone would make it blind; shrinking content would make it wrong.
3. **"Fixed" per-biome data is treated as global.** The four biomes are kilometres apart. A player is near at most one, sometimes two. "All four resident" (212 MiB) is a state the game never needs.

**The model I'm deciding on:**
- **The envelope comes from a minimum device**, MEM-1 measuring both machines. Working assumption until measured: on the 4070 laptop floor, renderer RSS of about 1.5 GiB or less and GPU memory of about 3 GiB or less. The world arbiter then gets a share of that (starting near 768 MiB CPU and 1.5 GiB GPU), not 256 MiB. MEM-1 replaces these numbers with measured ones; GC pause time, not raw bytes, may set the CPU limit.
- **One ledger.** Every owner registers with the arbiter, in these categories:

  | Category | Contents |
  | --- | --- |
  | **Core** | simulation state and world, the far layer, coarse world, UI and audio |
  | **Streamed** | fine terrain, kit cave clusters, biome art, structures and fauna |
  | **Biome fixed** | only for biomes within reach |
  | **Transient** | decode, staging and upload, bounded by the worker queue |
  | **Caches** | evictable under pressure |

  MEM-1's soak calibrates the ledger against real RSS, so the gap between "counted" and "real" is known.
- **Proximity-scoped, compressed fixed data (LC-2).** A biome's collider and bake load from about 400 m from a mouth (the same horizon as cave prefetch), stay compressed until a chunk is needed, decode in WK-1's workers, and use COL-1's compact collider format.

  | Per biome | Today | After LC-2 (estimate) |
  | --- | --- | --- |
  | Collider | 19 MiB | about 10 MiB |
  | Decompressed bake | 13 MB resident | only chunks near the player |
  | Coarse safety | 3.6 MiB | 3.6 MiB |
  | Lamp windows | 4 MiB | 4 MiB |
  | **Fixed total** | **about 39 MiB** | **about 18–20 MiB** |

  With one biome admitted plus one prefetching, the worst case including one biome's fine art is about 60–70 MiB, against 212 MiB with all four resident. Four 300 m biomes at 1.2× the surface still fit, and so would a fifth.
- **Drop the "just in case" CPU copies** (STR-06). Once art is baked, recovering from a lost GPU context means refetching through the streamer, which removes roughly one copy of the largest consumer. WK-1 does this, with a context-loss test.

**Loading.**
- **Startup and returns.** Loading time is set by the neighbourhood, not the world: per-cluster packs mean the first load downloads only what is near (STR-09), and region returns reuse the same path (STR-01 retires the synchronous legacy prepare).
- **Measurement.** PT-0 measures cold load, and MEM-1's harness keeps it as a standing metric so a warm test cache can never stand in for it again.

**Result:** the full world, with all four biomes at full size, lost sites and more creatures, fits without cutting content. Resident memory grows with what's near the player, not with world size.

## 5. Plan

At most 5 Opus builders at once (Opus 5.5 high). Each stream gets one Sol 6.1 xhigh review plus coordinator inspection; Sol work doesn't use a slot. Ownership must stay disjoint while streams run in parallel.

### Folded into active streams (now)
- **CW-1:**
  - all 8 traversal segments at 1920×1080 before it merges, with the TBD sections filled, including `collision.bin` size and `--verify`;
  - count and log every unsliced `Infinity` finish, and fail the gate if one fires in ordinary travel; the safety net stays (STR-10);
  - reject a pack whose source hash isn't the bundle's (STR-13);
  - mast and far-layer shots, plus cave light at a network seam (TST-08, CAV-07), during the traversal.
- **CR-1:**
  - the visible skate rest (CRE-05);
  - an out-of-view laying swap (CRE-04, interim);
  - one native continuous approach per window (CRE-08);
  - the hunter pass line with a clear sight line (CRE-03), if it fits; otherwise early in NAV-1.
- **UX-1:** unchanged.
- **SCHED-1 cut-over (coordinator):** verify cgroup delegation (TST-07) and complete the checklist (TST-17).

### New and planned streams, in priority order for each free slot

| Pri | Stream | Outcome | Includes (findings) | Depends on | Slot |
| --- | --- | --- | --- | --- | --- |
| 1 | **COL-1 stage A** | A compact static collider for any baked shape, plus a heightfield collar query, with an oracle against today's queries | ART-03, TST-05; the format for LC-2 | none; new modules | **Opus, now** (free slot 4) |
| 2 | **SCHED-2 → SAVE-1** (as decided) | Goal-based jobs, stall detection, soaks, GPU lease for every driver, changed-tree rejection, local capture segmenting; then the shared save library | TST-10, 14, 15, 16, 19, 22; TST-21, SAV-03, TST-23 | SCHED-1 cut-over | **Opus, now** (free slot 5), same author in sequence |
| 3 | **OP-1** (owner queue) | The starting-island opening, plus validated waterline walking | CAV-08 prerequisite | CW-1 merged | CW-1's slot |
| 4 | **MEM-1** (Sol) | The skipped DIRECTION scale test, combined with the planned 3090 Dart profile for WK-1: RSS, heap and GPU by owner; draw and buffer counts; cold load; the envelope proposal on the 3090, and on the 4070 when it arrives | STR-12, TST-01, TST-03, CAV-18, STR-05, TER-03, ART-04, CRE-07 (evidence) | CW-1 merged, SCHED-1 cut over | Sol, no slot |
| 5 | **WK-1** (widened) | Worker pool and save worker; bake v2 (per-cluster packs, content addressing, per-unit keys, part cap, one builder seam); deployed builds fail closed; the complete ledger; no CPU copies for baked art; legacy owners onto the chunk path if MEM-1 ranks them | CAV-15, CAV-22, TER-01, 04, 06, 07, 08, STR-01, 02, 03, 04, 06, 09, 14, SAV-04, ART-13 | CW-1 merged, MEM-1 profile | CR-1's slot |
| 6 | **COL-1 stages B–D** | World queries on the unified model; vistas, dishes and collars migrated; depenetration on load; **art restored** (bow, round sections, dish feeds and breach); yaw-aligned craft proxies | CAV-02, CAV-03, ART-01, 02, 03, 07, CAV-20 | CW-1 merged; touches `world.ts`, not `step.ts` | continues in slot 4 |
| 7 | **BIO-1: Canopy root caves** (owner queue) | Lantern Rootways placed in the world with LC as it is (one biome fits) | n/a | CW-1 merged | UX-1's slot |
| 8 | **SIM-1** | `stepGame` in place with checkpoint atomicity; ID indexes; event-driven recorder; feedback notes never dropped, timeline rotation | SIM-01, 02, 05 | CR-1 and SCHED-1 merged | SCHED-2/SAVE-1's slot when free |
| 9 | **SIG-1** | The nine unwired signature upgrades plus the module host upgrades; deployed outposts and the fish trap visible in the world; a cargo filter; the HUB-2-01 negative control | ART-09, UI-01, TST-11 | UX-1 merged; agree the `step.ts` boundary with SIM-1 | OP-1's slot |
| 10 | **LC-2** | Proximity-scoped, compressed biome fixed data; compact collider; byte-valued cluster budgets | CAV-11, CAV-12, STR-08 | COL-1 A, WK-1 pool, MEM-1 envelope | WK-1's slot, same author |
| 11 | **BIO-2/3/4** (Isles tidal, Basin vault, Rift–Divide seam) | Content on LC-2. Two may run in parallel with disjoint regions. | n/a | LC-2 | freed slots |
| 12 | **NAV-1** | Solved routes, tethers and park poses with a deviation report; creature habitat graph and migration lanes; swept creature movement; visibility-aware threat approaches | CRE-01, 03 (if not in CR-1), 04, CAV-04 policy, ART-02 paths | COL-1 B | COL-1's slot |
| 13 | **Lost sites** (owner queue) | Authored on the unified collider. Design and story work may start earlier; geometry waits for COL-1 B. | n/a | COL-1 B | freed slot |
| 14 | **ATM-2: atmosphere pass** (owner queue) | Plus several active cave light volumes, beacon and far-layer visibility, LOD dither if seen, cave-mouth edge rock, a look at the storm arch, a light-leak check | CAV-05, 06, 07, ART-05, 06, STR-07 | BIO streams placed | freed slot |
| 15 | **PT-0** (Sol and coordinator) | Section 3 | n/a | All of the above that reach the playtest build | Sol |
| 16 | **Owner's first playtest** | n/a | ART-11, ART-12, UI-03, SIM-04 | PT-0 | n/a |

**Reordering against the owner's queue, and why:**
- **COL-1 before lost sites.** Lost sites and crown-style interiors are the next large set of built structures. On today's box model they would be bent again, as A1's were. COL-1 A starts now in new files and blocks nothing.
- **LC-2 before biomes 2–4.** The first biome fits today; four don't, without cuts. LC-2 makes them fit at full size.
- **SIG-1 before the playtest.** The playtest's job is to judge pacing and feel at 10 hours or more, and that's meaningless with half of each craft's identity inert.
- **Unchanged:** OP-1 stays first after CW-1, and the atmosphere pass and playtest stay last.

**Illustrative waves** (each is five slots):

| Wave | Slots |
| --- | --- |
| Now | CW-1, CR-1, UX-1, COL-1 A, SCHED-2 |
| After CW-1, CR-1 and UX-1 merge | OP-1, WK-1, COL-1 B–D, BIO-1, SAVE-1 → SIM-1 |
| Then | SIG-1, LC-2, NAV-1, BIO-1 continuing, SIM-1 |
| Then | BIO-2, BIO-3, BIO-4, lost sites, then the atmosphere pass |
| Finally | PT-0, then the playtest |

The coordinator adjusts as streams finish. When a slot frees, take the highest-priority stream whose dependencies are met.

**Briefing rule for every stream from now on** (from the owner's root-fixes rule):
- a compromise is filed in the handoff with its root fix and cost, never as a quiet "limit";
- art isn't reshaped to fit collision or paths;
- evidence that couldn't be obtained is listed as missing, not replaced by a proxy.

## 6. Side by side: Sol's classification against my call

**Legend for my call:**
- **Now:** an active stream, or the cut-over.
- **Stream name:** folded into that stream's brief.
- **Accept:** a genuine trade-off.
- **Evidence:** measure first, then decide.
- **Done:** repaired; keep the regression test.

**≠** marks a disagreement with Sol's class or priority; its reason is in bold.

### Caves
| ID | Sol | Opus call | Note |
| --- | --- | --- | --- |
| CAV-01 | A | Accept | 2 m rock grain, applied consistently to art and collision |
| CAV-02 | B | COL-1 D (craft proxies); keep CA-3 content | The cistern flank is also a real spatial limit |
| CAV-03 | B | CW-1 (done) + COL-1 B (collars → heightfield) | Collars are 83% of CA-1's boxes |
| CAV-04 | B | Done in CW-1; keep placements | Policy goes to NAV-1 |
| CAV-05 | B | ATM-2 | Edge rock for CA-1/CA-2 mouths; drop the shelves |
| CAV-06 | B **≠ A** | Accept; check in ATM-2 | **A declared tolerance with a working authoring rule and no observed leak; it becomes B only if a leak is seen** |
| CAV-07 | D | Evidence (CW-1 seam shots) → ATM-2 | Kit caves only; LC lights per vertex |
| CAV-08 | B | Restore the shelf after OP-1; keep the blowhole | |
| CAV-09 | A | Accept | |
| CAV-10 | B | **≠ Accept** | **The dense lattice only bites kit caves, and every large space uses LC. A 20 m depth shift is invisible. The arch is looked at in ATM-2.** |
| CAV-11 | D | LC-2 before biome 2 | Section 4 |
| CAV-12 | A | Accept; compact format in COL-1/LC-2 | |
| CAV-13 | A | Accept | |
| CAV-14 | A | Accept; adverse rescue in PT-0 | |
| CAV-15 | A | Accept; decode moves to WK-1 | |
| CAV-16 | B | Done in CW-1 | Verified at CW-1 finish |
| CAV-17 | C | SAVE-1 adverse saves + PT-0 | |
| CAV-18 | C | PT-0 (1080p, real exterior) | |
| CAV-19 | B | Done | |
| CAV-20 | A | Accept | Exact support comes free with COL-1 |
| CAV-21 | A | Accept | The owner's design |
| CAV-22 | B | CW-1 (done mostly) + WK-1 byte cache; PT-0 cold switch | |

### Terrain
| ID | Sol | Opus call | Note |
| --- | --- | --- | --- |
| TER-01 | B | WK-1: deployed builds fail closed | |
| TER-02 | A | Accept | |
| TER-03 | D | Evidence (MEM-1) → WK-1 if ranked | |
| TER-04 | D | WK-1 bake v2 | Coupled to the per-cluster packs |
| TER-05 | B | Done | |
| TER-06 | B | WK-1 | Moving builders to workers forces one seam |
| TER-07 | D | WK-1 ledger | |
| TER-08 | B | WK-1 (small) | |
| TER-09 | D | **≠ Accept until the bigger-map evaluation** | **Unifying now would churn accepted contact and save regressions for no player gain; the right moment is the Option B re-evaluation** |

### Streaming
| ID | Sol | Opus call | Note |
| --- | --- | --- | --- |
| STR-01 | B | WK-1, sized by MEM-1 | |
| STR-02 | B | WK-1 ledger | |
| STR-03 | D | WK-1 | |
| STR-04 | D | WK-1: the bake enforces the part cap | |
| STR-05 | D | Evidence (MEM-1) | |
| STR-06 | A **≠ D** | WK-1: no CPU copies for baked art; context-loss test | **It doubles the largest consumer for a rare event; once art is baked, recovery is a refetch** |
| STR-07 | A | Accept; ATM-2 dither if seen | |
| STR-08 | D | LC-2 / WK-1 byte budget | |
| STR-09 | D | WK-1 per-cluster packs | |
| STR-10 | B | Now (CW-1): count and log; the gate fails if it fires | Keep the safety net |
| STR-11 | C | Now (CW-1): 8/8 before merge | The top pre-playtest item |
| STR-12 | C | MEM-1 (Sol), first | **≠ priority: this was DIRECTION's priority 2, skipped while 58 caves were authored** |
| STR-13 | D | Now (CW-1) + WK-1 content addressing | **≠ priority: the owner plays from a deployment, where stale caches are real** |
| STR-14 | D | WK-1 ledger | |

### Simulation
| ID | Sol | Opus call | Note |
| --- | --- | --- | --- |
| SIM-01 | B | SIM-1 (in place plus checkpoint) | Measured 76–88 µs per tick; mostly bot throughput |
| SIM-02 | D | SIM-1 | |
| SIM-03 | A | Accept | |
| SIM-04 | A | Accept; the owner judges in the playtest | |
| SIM-05 | D | SIM-1, **before the playtest** | **≠ priority: the playtest is exactly the long session the cap wasn't sized for, and dropping the owner's notes would waste it** |
| SIM-06 | A | Accept | |
| SIM-07 | A | Accept | No day/night in the direction; revisit if a cycle adds one |
| SIM-08 | A | Accept | |
| SIM-09 | A | Accept | |

### Creatures
| ID | Sol | Opus call | Note |
| --- | --- | --- | --- |
| CRE-01 | B | NAV-1 | |
| CRE-02 | A | Accept | |
| CRE-03 | B | Before the playtest: CR-1, or early NAV-1 | **≠ priority: the first hunter encounter is a set piece** |
| CRE-04 | B | CR-1 interim (swap out of view), NAV-1 root | |
| CRE-05 | B | Now (CR-1), visible rest cue | The threat window must be observable |
| CRE-06 | A | Accept | |
| CRE-07 | D | Evidence (MEM-1) → chunk-owned fauna in NAV-1 or the creature density pass | |
| CRE-08 | C | Now (CR-1) + PT-0 | |

### Art and content
| ID | Sol | Opus call | Note |
| --- | --- | --- | --- |
| ART-01 | B | COL-1 B/C: restore the bow and round sections; keep the pipes | |
| ART-02 | B | COL-1 C + moved paths: standing feeds on two dishes, one breach | |
| ART-03 | A | **≠ Superseded by COL-1** | **The owner's 1 m choice was made against a box-only model; triangles make it exact and cheaper** |
| ART-04 | D | Accept; evidence via MEM-1 | |
| ART-05 | A | Accept; ATM-2 | |
| ART-06 | B | ATM-2 + CW-1 far layer | The owner's rule |
| ART-07 | B | COL-1 B (depenetration on load) | |
| ART-08 | A | Accept | |
| ART-09 | A | **≠ Unfinished scope: SIG-1 before the playtest** | **GAME-DIRECTION requires these; it isn't a trade-off** |
| ART-10 | A | Accept | |
| ART-11 | C | PT-0 audio CPU; the owner's playtest is the listening pass | |
| ART-12 | C | The owner's playtest | The goal, not a gap |
| ART-13 | A | Accept; part contract in WK-1 | |

### Saves
| ID | Sol | Opus call | Note |
| --- | --- | --- | --- |
| SAV-01 | A | Accept | |
| SAV-02 | A | Accept | |
| SAV-03 | D | Evidence (SAVE-1 end-game sizes) | |
| SAV-04 | D | Evidence (PT-0 autosave frame) → WK-1 save worker | **≠ priority: a sync autosave hitch is an ordinary-play pause** |
| SAV-05 | A | Accept | |
| SAV-06 | B | Done | |

### Tests and infrastructure
| ID | Sol | Opus call | Note |
| --- | --- | --- | --- |
| TST-01 | C | PT-0 + MEM-1 standing cold-load metric | |
| TST-02 | A | Accept | |
| TST-03 | C | As TST-01 | |
| TST-04 | A | Accept | |
| TST-05 | D | COL-1 design rule: no uniform fine grid | |
| TST-06 | C | Accept as scoped | MEM-1 measures the real thing |
| TST-07 | C | Now (SCHED-1 cut-over) | |
| TST-08 | C | Now (CW-1 traversal shots) + PT-0 | |
| TST-09 | C | Covered by PT-0 | Don't rerun old checks |
| TST-10 | C | SCHED-2 | |
| TST-11 | C | SIG-1 (small) | |
| TST-12 | B | Done | |
| TST-13 | B | Done | |
| TST-14 | B | SCHED-2 | |
| TST-15 | D | SCHED-2 | |
| TST-16 | C | SCHED-2 | |
| TST-17 | C | Now (SCHED-1 cut-over) | |
| TST-18 | D | Evidence after cut-over; SAVE-1 covers the biggest repeat | |
| TST-19 | D | SCHED-2 | |
| TST-20 | B | Accept in the repo (ID reconciliation); the app fix is outside it | |
| TST-21 | D | SAVE-1 | |
| TST-22 | D | SCHED-2 | |
| TST-23 | C | SAVE-1 adverse set; PT-0 if absent | |

### UI
| ID | Sol | Opus call | Note |
| --- | --- | --- | --- |
| UI-01 | D | SIG-1 | SIG-1 adds the items that make the list long |
| UI-02 | A | Accept | |
| UI-03 | C | Accept; the owner judges in the playtest | |

**Totals.**
- **Disagreements on class (4):**
  - CAV-06, B to A;
  - STR-06, A to D;
  - ART-03, A, superseded;
  - ART-09, A, unfinished scope.
- **Disagreements on call or priority (7):** CAV-10, TER-09, STR-12, STR-13, SIM-05, CRE-03 and SAV-04.
- **Everything else agrees** with Sol's class. The calls group under the five roots:
  - about 19 findings fold into WK-1 (some conditional on MEM-1);
  - 9 into COL-1;
  - about 11 into SCHED-2 or SAVE-1;
  - most of the remaining evidence findings into MEM-1 or PT-0.

## Light check run
`/work/tmp/opus-verdict/clone.mjs`, Node, after 2,000 warm-up copies. It averages 20,000 `structuredClone` calls of the game state found in a save:

| Save | State size (JSON) | Per clone |
| --- | --- | --- |
| `/work/tmp/cw1/saves/seg5.json` | 14,379 bytes | 88.4 µs |
| `tests/fixtures/earned-c06.json` | 11,395 bytes | 76.2 µs |

The in-memory state may hold slightly more than a save. This is a host measurement on a shared VM, not a browser profile; it is used only to size SIM-01's player impact.
