# COL-1: one collision model (stage A: the static collider)

Opus 5.5 high. Branch `t3/col-1-static-collider` from root `fe27757`; stage A head: see the commit that adds this page. The decision that created this stream is R1 of the [compromise verdict](../audits/COMPROMISE-VERDICT-OPUS.md) (on `research/compromise-audit`), on Sol's findings ART-01/02/03/07, CAV-02/03/20 and TST-05. **New modules only:** `src/world/collision/*` and `tests/col1-*`. No edit to `world.ts`, `app.ts`, `step.ts`, LC's files, or any cave or creature file.

## R5 response (Sol R5 on `09e8586`: [report](../reviews/COL-1A-SOL-XHIGH-R5.md), on `review/col-1a-r5`)
**Orientation is now by construction, never by probing** (R5-1, P3-A, P3-B). The probe vote is gone from `src` entirely.
- **Producers declare orientation** (`Orientation { facing, source }` on an `OrientedMesh`):
  - **Kit shells:** `KIT_SHELL_ORIENTATION`, in `caveShapes.ts`. `surfaceNets` winds each triangle so its normal's crossing-axis component points from the solid voxel to the water voxel, which is outward. `relax`, the floor snap and `clipMeshToRect` move positions or keep polygon order, and never reorder indices. COL-1 states this beside the code it cites, because it may not edit `caveGeometry.ts`.
  - **LC chunks:** `LC_ORIENTATION` ("rock at v0 means the surface faces +axis").
  - **Closed prisms:** wound away from their convex centroid by `facetMesh`.
- **Certification per connected component** (`certifyOrientation`, `orientedShapes`):
  - coherence within each component (`orientationProblems`) is the hard check;
  - every triangle must carry a provenance facing;
  - provenance that differs inside one coherent component is refused;
  - differently oriented components bake as separate shapes.

  No majority, count or vote rule exists.
- **Probing is a test-only cross-check:** `probeComponents` in `tests/col1-support.ts`, per component, at 5, 10, 20 and 40 cm. A wrongly wound component is contrary at every scale; a single tilted triangle can be contrary close in and agree further out.
- **`kitShellShapes(def)` is fine-only** (P3-B). The coarse shell makes no rock-bound promise and isn't a collision LOD.

**P3-C turned up a real defect, now fixed at the root.** The collar lattice shared its vertices, so lifting one cell's corners raised its neighbours too. On the hub collars, whose floors have cliffs and steps, the heightfield stood **0.1–2.5 m above the old column tops in thousands of columns**: 2,244 of 4,640 at Apron hollow. The colonnade and every earlier fixture were smooth, so nothing caught it.

**The heightfield is now per cell.** Each cell owns its four corners:
- **A smooth cell** is lifted by its own sag at most (at most `CREASE`, 2 cm, measured on a 5 × 5 quarter-cell grid that contains the old columns' nine points), so it never stands above its old column top.
- **A cell that creases more** (a cliff, a step, a ridge) is baked **flat at its column top** (25-point maximum plus 2 cm).
- **Steps between cells are walls,** in the same oriented volume as the hole and edge walls.
- **The residual is measured independently,** on an 8 × 8 grid that shares no point with the construction grid.
- **`collarHeightfield` chooses a validated resolution:** the first of 0.5 m and 0.25 m whose residual is at most 10 mm. If none passes, it throws, naming every residual.

On the real collars:

| Collar | Cell | Flat cells | Heightfield above an old column top |
| --- | --- | --- | --- |
| Colonnade (three caves) | 0.5 m | 0 | never |
| Fanvault | 0.5 m | 12 | never |
| Apron hollow | 0.5 m | 1,846 | 25 columns, at most 3.2 mm |
| Step arch | 0.5 m | 3,380 | 41 columns, at most 13.7 mm |
| Glimmer crack | 0.25 m | 12,058 | 38 columns, at most 13.1 mm |
| Crown shaft | 0.25 m | 11,699 | 125 columns, at most 21.9 mm |

**Every exceedance is the old column's own shortfall.** In each of those columns the floor itself rises above the column's nine sample points (the old column stood below the floor) by the same amount, to within one Float32 ulp of round-up. Shared vertices gave up to 2.5 m.

**Art sweep** (`tests/col1-art.heavy.test.ts`): every kit cave in all three registries, each with its own builder:
- `caveDef` for the 23 in `AUTHORED_CAVE_SOURCES`;
- `groupDef` for the 12 Canopy and Basin groups;
- `buildCave` for the 20 deep caves.

That's 55 fine shells in 56 components. The cross-check finds 9 isolated contrary probes in 22,150, none more than 3 per component. The three shells the vote refused (`basin_dish_lee_vault`, `divide_lintel_galleries`, `meridian_terrace_crack`) and both hub controls bake. Also in the sweep: all 30 vista, POI and dish sets; all 90 Canopy chunks (55 art meshes in 74 components); and **the Apron hollow's whole oracle scene**. Through LC's composer, its heightfield and shell variants have no spurious block or stop, no newly illegal end and no newly blocked protected pose; the heightfield variant blocks nothing the columns allow.

**Tests:** `tests/col1-r5.test.ts`, with each mutation failing its test:
- **P3-A:** two disjoint boxes, one reversed, and a 2 cm reversed cube beside a box. Per-component provenance certifies both; support and recovery come out right (0.154 m); conflicting or missing provenance is refused; the cross-check flags a wrong claim.
- **P3-C:** validated cell choice. A ridge 0.5 m can't bound bakes at 0.25 m; a sliver neither can bound is refused with both residuals; a cliff bakes flat.
- **Per-cell heightfield:** never above a column top; on the floor at the nine points; step walls stop sweeps below a cliff top and pass above it; sight agrees with an **independent** dense walk under each cell's own plane.
- **The cliff collar** never blocks a pose the old 0.5 m columns allow.
- **Mutations:** creases lifted instead of flattened; walls only at holes; conflicting provenance accepted; the first cell taken unvalidated.

**API changes:**
- `meshFacing`, `insideOf` and `FACING_PROBES` are removed.
- Added: `Orientation`, `OrientedMesh`, `meshComponents`, `certifyOrientation`, `orientedShapes` (bake), and `KIT_SHELL_ORIENTATION` with `kitShellShapes(def)` (fine only, no floor argument).
- `StaticHeightfield.corners` (four per cell) replaces `heights`; `createHeightfield` still takes shared samples, `createCellHeightfield` takes corners, and `flatCells` is added.
- `collarHeightfield`'s last argument is now a list of cell sizes.
- `StaticCollider.samples` now counts heightfield cells.

**Compromises:**
- **Collar bake cost.** Collars that need 0.25 m cells take 9–14 s to bake (Glimmer crack and Crown shaft, measured locally, not exclusive). That's bake-time work; **root fix:** bake collars offline in WK-1's bake pipeline and load them. **S**.
- **Per-cell storage** is four Float32 per cell, against the shared lattice's one.
  - **Measured on the colonnade:** the heightfield variant is now **832 KiB** (356 KiB with shared vertices), about half the column boxes' 1.53 MiB. The shell variant is 1.86 MiB. The memory figures in the pre-R1 tables below are older than this change.
  - **Root fix:** keep the shared lattice and store per-cell corners only for flat cells, since almost every cell agrees with its neighbours. **S**.

CHECKS_R5

## R4 response (Sol R4 on `dfab435`: [report](../reviews/COL-1A-SOL-XHIGH-R4.md), on `review/col-1a-r4`)
**R4-1 is fixed at the root.** Coherence (`orientationProblems`) stays the hard winding guarantee. The vote only decides which way a coherent mesh faces, and now uses the **shape's own authoritative occupancy**:
- **The predicate** returns true, false, or `null` (unknown, outside its domain).
- **A vote is decisive** only when both probes are classified and differ. It retries at 10 and 20 cm, and otherwise abstains.
- **Unanimity is over decisive votes only,** and a mesh with no decisive vote fails, naming it.

**Which occupancy is authoritative**, found by sweeping all the shipped art:
- **Kit-cave shells** vote with the **opened voxel volume** they were meshed from (`caveVolume(def).solid`), in the new `kitShellShapes(def, floor)` (`src/world/collision/caveShapes.ts`), which the oracle now uses.
- **The raw source field is not it.** The review suggested `caveSampler(...).rock`, and with it `hub_apron_hollow` passes. But the sweep then refused `hub_crown_shaft` (96 out, 1 in) at a footprint edge (z = −516). There the field says rock outward at every scale, because the morphological opening removed rock the field still has, while the voxel volume agrees with the outward winding from 10 cm.
- **The rock box cover** is wrong for the same reason: it ends at the footprint.
- **LC chunks** vote with their biome's field (`field.rock`), which LC meshes directly.

| Test | Result |
| --- | --- |
| `hub_apron_hollow`, from `CAVE_SOURCES` (10,728 triangles) | Coherent. It bakes through `kitShellShapes` with facing 1; the box cover (unknown beyond the footprint) also returns 1, because its out-of-domain probes now abstain. |
| **Art sweep,** `tests/col1-art.heavy.test.ts` | All **23** authored kit shells, **30** vista, POI and dish sets (the closed pieces closed and coherent), and all **90** Canopy chunks (55 art meshes oriented out of rock by the field, 41 bands coherent). |
| Voting rules (`tests/col1-r4.test.ts`) | A partly unknown predicate still decides. An all-unknown one fails loudly ("0 out, 0 in, 4 undecided"). A predicate wrong for one face is refused as a disagreement, not outvoted. The flipped-wall fixtures from R3 are still refused. |

**Mutations,** each failing its test: unknown probes counted as outside; a majority vote; kit shells voting with the raw field; null triangles not skipped. The larger-offset retries aren't load-bearing in the shipped art (without them, some votes abstain and every mesh still orients); they only reduce abstentions.

**P3, indexed topology.** Null triangles (a repeated index) have no orientation and are skipped; a closed tetrahedron with one stays closed. The intake precondition is now documented on `orientationProblems`: **conforming indexed topology**, meaning equal positions merged and no edge split on one side only. A T-junction reads as a hole. Edge balance certifies coherent winding of such a mesh; it is not a geometric closedness proof for arbitrary input. Welding and normalising arbitrary meshes is for whichever stream first brings non-conforming art in. No shipped art needs it.

**Stage B (from the review), unchanged and restated:**
- **Stage B owns bounded-rock recovery** for cave biomes. That means an oriented rock-volume guarantee with the cap, collar and domain boundaries, composed endpoint validation, and verified rescue when local recovery fails.
- **Don't mark open chunks `interior: "solid"`,** and don't take the bare skin collider's zero-distance answer as rock recovery.
- **The LC cap and collar walls stay a stage-B acceptance prerequisite.**

**Checks for R4:**
- **Fast tier:** passes 1,344 / 1,344 on factory-worker at `ae09272`; `col1-r4` adds 3 tests at 0.2 s CPU. Typecheck clean.
- **Second worker** (`alickers-job: tested ae09272…`, clean test build), all COL-1 tests, **65 / 65**:
  - the 58 fast tests;
  - `col1-oracle.heavy.test.ts` 4 / 4 (57.5 s, peak 425 MiB);
  - `col1-art.heavy.test.ts` 3 / 3 (11.4 s, peak 512 MiB).

  The factory queue was booked by CW-1's exclusive series. These are functional results; no timing claim changed.

## R3 response (Sol R3 on `e8ce814`: [report](../reviews/COL-1A-SOL-XHIGH-R3.md), on `review/col-1a-r3`)
Both P2s and both P3s are fixed. Every reproduction is a test in `tests/col1-r3.test.ts`, and each fix's mutation fails its test:
- facing alone made one-sided;
- a branch-and-bound search per part;
- candidates enumerated per part;
- no coherence precondition.

| Finding | Root fix | Tests |
| --- | --- | --- |
| **R3-1 (P2)** Recovery treated facing open skin as a closed solid; the diver crossed a plate 6 cm away. | The one-sided rule needs a **closed-solid guarantee**: `interior === "solid"` (plus facing). Open skin (`interior: "none"`) stays two-sided in recovery whatever its facing, so it's a barrier as in ordinary sweeps. **Consequence:** the compact biome's chunks are open skin bounded by LC's cap rule, so recovery treats them two-sided. An explicit "externally bounded rock" guarantee, if cave recovery needs it, belongs with stage B's composed cave recovery, not with `facing`. | The report's plate through the public constructor, in both windings and with facing 1, −1 and 0: the escape sweep meets it, and recovery returns null within 1 m. Control: the rock alone still leaves through its own face (0.944 m). |
| **R3-2 (P2)** Recovery rescanned the whole shape once per containing part: 2.4 s for 2,000 nested parts in one shape. | **One traversal per shape**, triangles routed to the set of containing parts:<br>- face-exit candidates come from one enumeration per shape;<br>- the lower bound (`exitBound`, replacing `partDistance`) uses one pass per shape: branch and bound for a single part, else one accumulating walk keeping every part's own minimum.<br>The bound stays admissible and no-re-entry stays checked; parts, tessellation and the rescue path are untouched. | **Work-count regression,** with a traversal counter. At 1,000 parts in one shape, recovery visits fewer than 40 triangles per triangle; R3's candidate visited about 1,000. It scales linearly: half the parts, about half the work. It gives the same escape and the same 226 tried candidates as separate members. Exclusive remeasurement: *Checks* below. |
| **P3** `meshFacing` accepted mixed winding by majority. | `orientationProblems`: a coherently wound surface uses every undirected edge equally often each way, so a flipped triangle shows as an imbalance of two (surface nets' non-manifold edges, used twice each way, pass). `meshFacing` requires that, plus **unanimous** votes, and names the mesh. `solidPiecesShape` requires each closed piece to be closed and coherent. | The report's flipped wall is refused; the coherent one gives 1. An open prism is refused. All 517 closed vista and dish pieces, and the CA-1 shells, pass. |
| **P3** Recovery with an infinite budget never finished building the ring. | `depenetrate` throws on a non-finite or negative budget, or a non-finite centre. | Infinity, −1 and NaN are refused; a finite budget works. |

**Remaining work in the many-part case:** candidates and the bound are one pass each. The rest is each tried candidate's blocked check, whose parity ray crosses two faces of every stacked part. It is linear in the stacked surfaces, about 23 visits per triangle, and inherent to 2,000 surfaces stacked over one point.

**Checks for R3:**
- **Fast tier:** passes 1,341 / 1,341 at `7b8ad69`; `col1-r3` adds 6 tests at 0.3 s CPU.
- **Heavy oracle:** `col1-oracle.heavy.test.ts` passes **4 / 4** through the queue at `c73f922` (50 s, peak 228 MiB).
- **Typecheck:** clean.
- **Recovery cost, `--class exclusive` at `c73f922`** (`tests/col1-recovery-cost.ts`, [`col1/recovery-cost-r3.jsonl`](col1/recovery-cost-r3.jsonl)). Headless Node, median of three calls, construction excluded, host load at most 3.2. R3's fixture: n nested closed boxes, centre (0.1, 0.2, 0.3), diver, budget 3 m.

| Containing parts (triangles) | One shape (R3) | One shape now | As members now | Per call |
| --- | --- | --- | --- | --- |
| 100 (1,200) | 9.9 ms | 1.7 ms | 2.2 ms | 1 sweep, 207 tried |
| 500 (6,000) | 165.1 ms | 4.7 ms | 7.1 ms | 1 sweep, 226 tried |
| 1,000 (12,000) | 577.2 ms | 11.0 ms | 20.6 ms | 1 sweep, 226 tried |
| 2,000 (24,000) | **2,434.8 ms** | **14.2 ms** | 27.9 ms | 1 sweep, 226 tried |

Every result is the same clear escape (2.034–2.049 m) for both layouts. The sphere cases are unchanged from R2 (6.3 ms at 39,600 triangles).

## R2 response (Sol R2 on `b94430c`: [report](../reviews/COL-1A-SOL-XHIGH-R2.md), on `review/col-1a-r2`)
One root change fixes N1, N2 and most of N4: **recovery validates with oriented, one-sided contacts against closed solids.** A box can enter a closed solid through a face only while moving against that face's outward normal. So a contact with a face counts only then:
- the box may leave whatever holds it, through any number of faces, with no exemptions;
- it meets, as a contact, every face it would *enter*: another solid, or an arm of the same part it left;
- skin and boxes keep their sweep semantics (a start contact may only separate).

The heightfield applies the same rule to every contact, start or later. R1's two-phase exemption and `leaves` are gone. Every reproduction in the report is a test in `tests/col1-r2.test.ts`, and each fix's mutation fails its test:
- the escape sweep made two-sided again;
- R1's whole-way exemption;
- later heightfield contacts not oriented;
- no default bounds;
- no lower bound.

| Finding | Root fix | Tests |
| --- | --- | --- |
| **N1 (P1)** An exemption stayed active after a part was left: recovery crossed a re-entered arm (U and B). | The **oriented escape sweep** (`escapeSweep`), above: no exemption interval exists to outlive a part. | The report's U/B case, as separate members **and** as two labelled parts of one shape: never enters the east arm (checked by an independent sweep against the arm alone), and never returns R1's 1.444 m answer. Controls: without B, the gap at 0.944 m; nested boxes (0.844 m); touching boxes. |
| **N2 (P2)** A buried diver rising met the underside of a heightfield edge and was pushed 1.17 m sideways. | `faceContact` judges **every** contact, not only start contacts, by the face's outward normal: an edge contact can no longer block motion that cannot enter through that face. Top and wall entry stay blocked; slides keep the kernel's normal along edges. | The report's Float32 cell: no contact, ends at (0.45, 3.2, 0.55). Its field: recovery straight up within 2.79 m (R1 returned null). **Monotonic property:** 2,000 rises from random poses, buried or not, on a wavy field with holes, with Float32 samples, all reach the requested end. Entry from clear starts (down and sideways) stays blocked, with no clear start ending inside. |
| **N3 (P2)** R5's original reproduction (no bounds, or X/Z-only) still lost the exterior's Y policy. | `bounds` **defaults to `createWorldQueries`'s whole policy** (`EXTERIOR_BOUNDS`: the S1/S2 envelope and `WORLD_VERTICAL_BOUNDS`). `StaticBounds` needs all six limits, and construction validates them: finite and ordered. An incomplete or inverted policy throws. | R5's reproduction **as written** (no bounds), ordinary and `separateBoxOverlaps`, both through the static path, both equal to the exterior's answer. Rejection of X/Z-only (`WORLD_BOUNDS`), inverted and infinite policies. |
| **N4 (P2)** Recovery on a dense curved solid ran thousands of rejected validations: 6.31 s at 39,600 triangles. | Three changes:<br>1. The oriented sweep accepts the outward face exits R1 rejected while the box still straddled the part.<br>2. **A configuration-space lower bound:** the centre must leave every part holding it, so no candidate nearer than the farthest of those parts' surfaces is tried. That distance comes from a branch-and-bound nearest-triangle search.<br>3. Candidates are ordered by a heap, built once, and only the first few are popped.<br>Tessellation is untouched, and there is no rescue fallback. | The report's 25,280-triangle sphere: a face exit (under the 2.561 m ring exit), in at most 3 sweeps and 50 tried candidates (R1: 11,982 sweeps). Any straddled pose on a sphere leaves freely along its normal, and inward stays blocked. Cost: *Checks*. |

**Checks for R2:**
- **Fast tier:** passes 1,335 / 1,335 at `72d90c8`; `col1-r2` adds 10 tests at 0.9 s CPU.
- **Heavy oracle:** `col1-oracle.heavy.test.ts` passes **4 / 4** through the queue at `038f22b` (57 s, peak 248 MiB). The Canopy's 45 shared LC endpoints are unchanged.
- **Typecheck:** clean.
- **Recovery cost, `--class exclusive` at `038f22b`** (`tests/col1-recovery-cost.ts`, [`col1/recovery-cost-r2.jsonl`](col1/recovery-cost-r2.jsonl)). Headless Node, median of three calls, mesh construction excluded, host load at most 2.1.

| Sphere triangles | From (0.1, 0.2, 0.3) | From the centre | Per call |
| --- | --- | --- | --- |
| 324 | 0.9 ms | 2.6 ms | 1 sweep, 27 tried |
| 6,240 | 2.1 ms | 2.8 ms | 1 sweep, 27–40 tried |
| 25,280 | 5.1 ms | 7.1 ms | 1 sweep, 27–40 tried |
| 39,600 | **6.3 ms** (R1: 6.31 s) | 9.7 ms (R1: 6.31 s) | 1 sweep, 27–40 tried |

Every call returns a clear face exit, 2.03–2.37 m away; the ring exit R1 fell back to is 2.561 m. What remains is linear: one pass over the containing part's faces to list their exits, and one branch-and-bound nearest search.

**Also fixed:** a NaN corner empties its whole cell everywhere. `heightAt`, support and sight now read the cell's own ownership, as overlap and walls already did (the report's qualification, tested).

**API changes:** the R1 additions `sweepExcept` and `leaves` are replaced by `escapeSweep` and `partDistance`; nothing outside COL-1 used them. `StaticBounds.minY`/`maxY` are now required, and `bounds` is optional with the exterior's default.

**Dispositions kept from the review:**
- **LC's endpoint debt is deferred to stage B, but not as a safety allowance.** I ask the coordinator to make the cap and collar walls (or a mesh-following cap) an **explicit stage-B acceptance prerequisite**, and to verify every affected end after that fix.
- **The 1% bound is a regression alarm.** The classifier exempts a new illegal end whenever the old move also ends illegal; it does not prove the ends or the causes are the same.
- **R4's best-effort search stays a named compromise.** The review's perpendicular-slabs case (null at 0.64 m, found at 0.8 m) is that compromise, unchanged.

## R1 response (Sol R1 on `245a006`: [report](../reviews/COL-1A-SOL-XHIGH-R1.md), on `review/col-1a-r1`)
All five findings are fixed at the root, and stage B's API is unchanged: the same calls, with additions only. Every reproduction in the report is now a test in `tests/col1-r1.test.ts`. **Each fix was mutation-checked:** removing it fails its test, as do removing the lift and restoring the old jittered parity.

| Finding | Root fix | Tests |
| --- | --- | --- |
| **R1 (P1)** Recovery from inside a solid skipped the escape sweep and crossed a separate wall. | Recovery validates the **whole** way out. *(R1 did this with a two-phase per-part exemption; R2 replaced that with the oriented escape sweep, see* R2 response*.)* | The report's case through the collider **and the composed world** (wall B as an exterior solid): null within 1 m; with room, out through the far face and never through B; without B, the short way. Also a box caught across a wall it overlaps, which backs out the way it came. |
| **R2 (P1)** Jittered parity counted a shared diagonal twice: a whole box read as water. | `verticalCrossing`, a **watertight half-open rule**. Edge functions use a fixed vertex order (so neighbours see exactly opposite signs), and a point on an edge's line takes the sign at (x + ε, z + ε²). Each vertical line crosses each surface exactly once, through edges, vertices and either winding. It is used everywhere parity is: shapes, parts, split groups, and biome caps (`crossings`). No jitter remains. | Grid edges, vertices, diagonals and the report's point, on outward and reversed windings; every top-face vertex; overlapping parts; a split group's own vertices and seams; crossings exactly 2 under the box. |
| **R3 (P1)** A sweep or sight line entered heightfield solid from a hole or the outside. | **The heightfield is a volume.**<br>- **Walls:** each solid cell edge that meets a hole or the lattice's edge is a vertical wall (two triangles down to the bounds' bottom).<br>- **One-sided:** sweeps meet the top and the walls only from above and from outside. A start contact is judged by the outward face normal, not the kernel's best axis, so a mostly buried box can't sink. Top slides are unchanged, and a buried actor may rise or leave through a wall.<br>- **Sight:** blocked under a solid cell's surface wherever the segment enters it. | The report's hole-to-solid and outside-to-solid cases, ending in and beyond the solid, and its composed case through LC's composer (it stops at X 2.656, as the columns did). Plus buried escape, refused sinking, a smooth glide over a hole's edge, and an independent brute force (every top and wall triangle) for sight. |
| **R4 (P2)** Recovery took the face nearest the centre and gave up when it was over budget. | **The shortest validated candidate.** Candidates are:<br>- every face exit of the containing parts (plane distance plus the box's reach along the face normal, exact for leaving a convex part);<br>- push-outs from every overlapped surface, box and heightfield wall;<br>- the 26-direction ring.<br>All are tried shortest first, and each is validated as in R1 before it is accepted. | The report's two cases: 0.644 m (not null at 0.65) and 0.404 m (not 1.204 m). |
| **R5 (P2)** The static move path dropped the vertical bounds. | A static move keeps the exterior's policy:<br>- ordinary moves clamp X/Z and the datum's Y and report `hitBoundary`;<br>- `separateBoxOverlaps` clips requested travel first and never clamps an end;<br>- invalid input gets the exterior's own answer.<br>`bounds` gains optional `minY`/`maxY`. | The report's case (−800, `hitBoundary`), its `separateBoxOverlaps` form, and up and across X, each equal to the exterior's answer. |

**The lift mutation, now killed.** Omitting the lift fails `col1-r1`'s lift test in two ways:
- **Property:** the collar must be on or above the floor at every cell's nine points.
- **Behaviour:** on a floor whose 0.5 m chords sag 3 cm, drops onto a collar beside the footprint must rest on poses that LC's composer, testing the floor itself, accepts.

**Precision the review asked for:**
- **The collar is not "never below the floor".** It is on or above it at the nine points per cell. Elsewhere the sag is measured at 16 interior points per cell: at most **0.333 mm** on the colonnade collars, matching the review's 0.3331 mm scan.
- **A floor with bumps narrower than a cell is refused, not hidden.** `collarHeightfield` throws above 10 mm. The adverse test is the review's sin² floor, measured at 50 mm.
- **The residual is sampling, not a bound.** Features narrower than an eighth of a cell can still escape it.

**The oracle now asserts what it used to log:**
- the shell's moves have no stop without art on the path;
- the shell blocks no protected route or pose;
- in every scene, no move from a clear start ends illegal in the space the new collider answers for.

The oracle's art reference is the new collider's own geometry for structures, and the same kernels for the shell and biome. It judges geometry fidelity; it is not independent query validation. The review's independent SAT check of all 114 shell poses is the independent part.

**Found by the new endpoint invariant: LC's own endpoint debt.** With every Canopy chunk built, 45 of 8,000 probe moves end in a pose LC's own collider rejects. The compact biome ends there too (identically, or 0.2 m apart after a tie), as designed: LC's semantics, exactly.
- **Cause, in two of three sampled ends:** the box rises within a metre under LC's cap, where no mesh surface lies above it. LC's rule ("the cap is rock") then calls it rock with no boundary to stop it.
- **The third sampled end:** under the band in a collar column.

This is the same class as R3 (an ownership step with no wall), in LC's own ownership, which is outside COL-1's files.
- **For LC-2:** the oracle bounds it (at most 1% of moves; 45 now), lists examples with poses, and fails if it grows.
- **Root fix (LC-2 or stage B, M):** give LC's cap and collar boundaries walls (as `heightfield.ts` now does), or make the cap follow the mesh's roof.
- **The colonnade:** one move in the heightfield variant ends rejected where production also ends rejected (Sol's composed-world debt); the shell variant has none.
- **Also fixed:** the Canopy oracle had built only the 47 chunks on two routes, so probes reaching an unbuilt neighbour read missing surfaces. It now builds all 90.

**For stage B (from the review):**
- **Composer control:** the four "spurious" moves are real skin contacts with retained box-cover corners. Contact starts at a skin of 0.04–3.7 mm, and final positions differ by 2–25 cm. The shell removes them.
- **Endpoint debt:** the review found clear starts whose full moves end in rejected poses in today's composed world (production does the same). That is existing composed-world debt for stage B's composed check; this oracle doesn't approve every differing slide.
- **Register every collision owner with one composer.** `composeStaticWorld` sweeps only its own collider and `solids`. Nesting it under LC's composer, or wrapping a cave-bearing exterior, doesn't bring the other's triangles into the near sweep.
- **Shared bytes are a sum of views,** not a deduplicated allocation. Small per-shape arrays and JS owners aren't in the format count.

## What stage A gives stage B and every builder
One collider for any baked shape, each surface in the primitive that fits it:

| Module | What it is |
| --- | --- |
| `boxTriangle.ts` | LC's 13-axis swept box against a triangle, reading vertices in place, bit-equal to LC's (tested on 20,000 random cases). Adds signed separation (the push-out axis) and **order-independent tie-breaking** (see *Findings*). |
| `shape.ts` | **The compact format.** `Uint16` indices; positions are the art's own Float32 buffer where it can be (`shared`, not counted as owned); BVH nodes of 16 bytes (bounds quantised to `Uint16`, rounded outwards, plus one `Uint32` link). Closed shapes answer interior by vertical-ray parity, per part, with a **watertight half-open crossing rule** (a point on a shared edge or vertex belongs to exactly one triangle; no jitter). |
| `heightfield.ts` | **Seabed as collision** for collars and seams: one Float32 per lattice point, a hole bit per cell, 8 × 8-cell tiles with min/max for culling. **A volume:** solid below every solid cell's surface, with vertical walls where a solid cell meets a hole or the lattice's edge, met one-sided (from above, from outside) by sweeps and sight. **Conservative sampling** lifts each vertex by the largest chord sag its cells show at the old columns' nine points, so the lattice is on or above the floor there; the sag left between them is **measured** (`residual`), and `collarHeightfield` refuses a floor whose residual passes 10 mm. |
| `collider.ts` | `createStaticCollider(id, members)`: shapes, heightfields and true boxes behind a top-level BVH. Queries: `sweep`, `overlaps` (surfaces, interiors, buried), `support`, `segmentClear`, `move` (slides), **`depenetrate`** (ART-07), `contact`, `solidAt`, `crossings`. **No uniform grid anywhere**: cost and size follow primitive counts, never extent (TST-05). |
| `bake.ts` | **Baked from the art's own source:** `artMembers(id, blocks, pieces, skin)` takes a set piece's `VistaBlock`s and `VistaPiece`s (blocks stay boxes, closed prisms become solid parts wound outwards, open pieces become skin); `meshShapes` takes a mesh (over 65,536 vertices it splits in X/Z columns, viewing the art's buffer where it can, with group parity); `collarHeightfield`; `meshFacing`. |
| `world.ts` | The seams for stage B: `staticCaveCollider` (a W1 kit cave as LC's `CaveCollider`, for `composeCaveWorld`) and `composeStaticWorld` (structures over the exterior world; every answer away from the collider is the exterior's, bit for bit, and a static move keeps the exterior's bounds policy). **Only `composeStaticWorld` answers `depenetrate`.** The cave adapters don't: stage B must recover against the fully composed cave world. |
| `biome.ts` | A cave biome in the compact format with LC's exact semantics (`compactBiomeCollider`): for LC-2. |
| `cover.ts` | `coverReport(art, boxes, points)`: how far a box cover stands off its art, and where art pokes out (the interim rule's debt entry). |

### Adopting it now (the interim rule)
Keep the intended art. Collide it as it will be after stage B, and measure the box cover you ship meanwhile:
```ts
const art = createStaticCollider("lost.hall", artMembers("lost.hall", blocks, pieces));
const gap = coverReport(art, coverBoxes, pieces.flatMap(p => p.facets.flatMap(f => f.pts)));
// File as COL-1 debt: gap.artOutside (where art pokes out), gap.standOffMax (where the cover stands off).
```
For a mesh, use `meshShapes(id, { positions, indices }, { interior: "solid", facing: meshFacing(id, mesh, isRock), shared: true })`. Don't bend the art to fit boxes.

## Oracle: today's queries against the static collider
`tests/col1-oracle-support.ts` builds each scene twice, as the game queries it today and on the static collider, and probes both with the same poses, moves, columns and sight lines. Most probes are seeded near the art. **Every disagreement is judged against the art itself**: a pose the new collider blocks must overlap the art, a move it stops short must have art on the old move's path, and a sight line it blocks must cross the art. Scenes:
- **dishes:** DISH-1's three dishes, frame and bowl boxes against their own art;
- **a1:** A1's set pieces (POI-1's sets are the same kit; left to their stream);
- **colonnade:** CA-1's linked Archlet, Bellhole and Wrackhollow, today's `createCaveWorldQueries` against LC's composer with three colliders:
  - `columns`: the same rock boxes and collar columns (the composer control);
  - `heightfield`: the same rock boxes, the collar as a heightfield;
  - `shell`: the fine shell (the art) as rock, plus the heightfield;
- **canopy:** LC's Canopy root caves, LC's chunk colliders against the compact format. Probes go round the squeeze and the craft loop; the tables below are from before R1, when only those 47 of 90 chunks were built (R1 builds all 90).

**Every probe below** is from one `--class exclusive` run at `91b01cb`, before R1 (`col1/oracle.json`; `tests/col1-oracle-report.ts`). R1 changed recovery, parity, heightfield walls and the Canopy fixture; it changed no answer in these tables except the Canopy endpoint counts above. **Speed was not re-measured after R1:** the exclusive lane was booked by CW-1's traversals, and the review ruled performance non-blocking. The cost R1 adds:
- heightfield walls are tested only at solid cells that border a hole or the lattice's edge;
- parity is one more sign test per edge;
- recovery runs only on load. The heavy test asserts on the same probes. Speed is the median of seven interleaved passes over the same inputs, headless Node on factory-worker. The scheduler logged host load up to 7.7 from work outside the queue, so treat differences under about 20% as noise. Old memory is the measured heap of the box sets and their index. New memory is the collider's exact typed-array bytes: its heap delta is below measurement noise at these sizes (A1's came out negative), so it isn't quoted.

| Scene | Before | After | Memory: old (measured heap) → new (format bytes) |
| --- | --- | --- | --- |
| dishes | 4,855 boxes | 3,922 triangles, 27 boxes | 1.89 MiB → 100 KiB |
| a1 | 5,195 boxes | 14,436 triangles, 71 boxes | 2.08 MiB → 348 KiB |
| colonnade.columns | 20,153 boxes | 20,153 boxes | 7.92 MiB → 1.53 MiB |
| colonnade.heightfield | 20,153 boxes | 2,313 boxes, 41,623 samples | 7.97 MiB → 356 KiB |
| colonnade.shell | 20,153 boxes | 83,084 triangles, 41,623 samples | 7.96 MiB → 1.39 MiB + 501 KiB shared with art |
| canopy | LC chunk colliders | 362,861 triangles | 13.82 MiB (LC's format bytes) → 6.04 MiB + 1.82 MiB shared with art (47 chunks) |

| Scene | Poses agree | Freed (stand-off max / mean) | Newly blocked (of them inside the art) | Moves agree / freed / slide differs / spurious | Sight: old-only blocked / new-only | Protected newly blocked |
| --- | --- | --- | --- | --- | --- | --- |
| dishes | 35,418 / 36,000 | 582 (0.53 / 0.13 m) | 0 (0) | 16,660 / 267 / 1071 / 0 of 18,000 | 115 / 0 | 0 of 4 paths, 14 poses |
| a1 | 35,840 / 36,000 | 160 (0.09 / 0.03 m) | 0 (0) | 17,091 / 127 / 779 / 0 of 18,000 | 60 / 0 | 0 of 5 paths, 10 poses |
| colonnade.columns | 16,000 / 16,000 | 0 (0.00 / 0.00 m) | 0 (0) | 7,700 / 0 / 296 / 4 of 8,000 | 1 / 0 | 0 of 8 paths, 2 poses |
| colonnade.heightfield | 15,994 / 16,000 | 6 (0.11 / 0.04 m) | 0 (0) | 7,640 / 5 / 351 / 4 of 8,000 | 1 / 0 | 0 of 8 paths, 2 poses |
| colonnade.shell | 15,804 / 16,000 | 82 (0.18 / 0.06 m) | 114 (114) | 6,824 / 84 / 1070 / 0 of 8,000 | 43 / 7 | 0 of 8 paths, 2 poses |
| canopy | 16,000 / 16,000 | 0 (0.00 / 0.00 m) | 0 (0) | 7,837 / 0 / 163 / 0 of 8,000 | 0 / 0 | 0 of 2 paths, 0 poses |

Speed, µs per query, old → new (same inputs). A frame is one 60 Hz step (diver 0.09 m, medium 0.2 m, Creel 0.11 m); a long move is twenty frames in one call:

| Scene, shape | clearance | move.frame | move.long | support | sight |
| --- | --- | --- | --- | --- | --- |
| dishes, diver (400 poses) | 19.8 → 12.9 | 15.1 → 13.2 | 30.2 → 26.1 | 16.7 → 6.6 | 135.6 → 64.8 |
| dishes, medium (400 poses) | 21.0 → 11.1 | 17.7 → 13.0 | 70.1 → 69.1 | 12.8 → 5.3 | 178.9 → 128.6 |
| a1, diver (400 poses) | 35.1 → 13.7 | 29.8 → 12.8 | 43.0 → 28.1 | 28.0 → 6.7 | 176.7 → 61.3 |
| a1, medium (400 poses) | 33.5 → 13.0 | 27.0 → 17.4 | 73.7 → 117.9 | 18.8 → 5.6 | 183.9 → 108.0 |
| colonnade.columns, diver (400 poses) | 10.1 → 3.2 | 11.9 → 2.5 | 49.5 → 9.0 | 11.3 → 2.6 | 30.4 → 3.3 |
| colonnade.heightfield, diver (400 poses) | 9.4 → 2.4 | 11.4 → 2.6 | 46.6 → 9.9 | 10.7 → 2.5 | 28.3 → 3.3 |
| colonnade.shell, diver (400 poses) | 9.3 → 2.6 | 10.9 → 2.3 | 47.4 → 25.6 | 11.1 → 1.6 | 29.6 → 4.2 |
| canopy, creel (400 poses) | 50.9 → 51.3 | 13.4 → 12.0 | 377.7 → 247.1 | 2.4 → 2.4 | 22.0 → 22.1 |
| canopy, diver (400 poses) | 8.8 → 10.2 | 3.8 → 2.8 | 59.3 → 23.4 | 1.9 → 2.0 | 7.8 → 7.9 |

Bowl float (feet above the highest porcelain under the diver, resting drops):

| Dish | Drops | Old mean / p95 | New mean / p50 / p95 |
| --- | --- | --- | --- |
| basin.dish_north.dish | 127 | 0.51 / 0.94 m | 16 / 4.6 / 6.6 mm |
| basin.dish_centre.dish | 99 | 0.55 / 0.93 m | 5 / 4.6 / 6.2 mm |
| basin.dish_south.dish | 136 | 0.52 / 1.06 m | 44 / 4.7 / 7.7 mm |

Collar float (straddling the footprint edge, resting drops):

| Variant | Old p50 / p95 | New p50 / p95 |
| --- | --- | --- |
| colonnade.heightfield | 6.6 / 20.6 cm | 1.3 / 20.4 cm |
| colonnade.shell | 6.6 / 20.6 cm | 0.5 / 3.7 cm |

The heightfield variant's p95 comes from its rock boxes, not the collar: on the cave side of the seam the reference is the shell, which the boxes stand off.

## Findings stage B should act on
- **No route, tether, park or work pose is newly blocked** in any scene. That covers every route, tether and site pose within 12 m of each scene, plus the colonnade's own routes and staging.
- **The art is more faithful everywhere it differs.**
  - **Dishes:** the old covers stood up to 0.53 m off the art.
  - **A1:** up to 0.09 m.
  - **Bowls:** a diver rested 0.5 m above the porcelain on average (p95 about 1 m); on the bowl's own triangles it rests at the skin.
  - **Old covers let you stand on air:** a diver stood on box tops up to 11–13 m above the next art surface below (slab corners beside tilted members).
- **The shell as cave rock blocks 114 of 16,000 poses that the rock boxes allowed.** Each one is inside the drawn shell: the art stands up to 0.35 m in front of the boxes. It blocks no route.
  - **Stage B's call:** collide kit caves by their shell (exact art) or keep the boxes and only replace collars (`heightfield`, no new blocking at all).
  - **I recommend the shell.** It is the art and it removes the 0.35 m art/collision gap the cave kit documents. Per frame it is as fast as the boxes; its long moves are slower than the box variant's (25.6 against 9.9 µs), though still faster than today's.
- **Ghost contacts on flat meshes (fixed here, and present in LC's composer).** A box resting exactly at the skin, sliding along a flat triangle grid, meets the edges of the coplanar neighbours as walls; picking a tied contact by storage order made it worse. Fixed at the root in this collider:
  - ties prefer a face contact, then the most head-on normal;
  - slides leave each contact 10 µm past the skin.

  A layout test (the same triangles in any order, leaf size or split give the same moves) fails if either fix is removed (mutation checked).
  - **LC's composer.** Its slide loop (`compose.ts`) also rests exactly at the skin and takes whichever tied normal its collider reports, so it has the same exposure. I infer that from the code; it isn't measured separately.
  - **Tie sensitivity, measured on the Canopy:** 22 normal ties in 7,266 sweeps already change 163 of 8,000 moves through it.
  - **Stage B should run cave slides through `slideMove`.**
- **Composer control (identical boxes): today's W1 composite vs LC's composer.** These aren't collider effects:
  - Clearance agrees on 16,000 of 16,000 poses.
  - 4 of 8,000 moves differ. These are real skin contacts with retained box-cover corners: contact starts at a skin of 0.04–3.7 mm, so they miss with no skin and hit at 4 mm. Final positions differ by 2–25 cm (Sol traced all four). The shell variant removes them.
  - Support outside a footprint reads up to 0.28 m lower in LC's composer, which doesn't read collar tops there.

  Stage B picks one composer.
- **The compact biome is LC, bit for bit,** on clearance, support and sight (16,000, 2,603 and 4,000 probes) and on every first contact (20,000 sweeps, identical times). Of 7,266 hits, 22 tie and choose a different normal, by design.
  - **Storage:** it owns **6.04 MiB against LC's 13.82 MiB (44%)** and views 1.82 MiB of the art's positions. Copying those positions would make it 57%.
  - **For LC-2:** the "roughly half" LC estimated is met.
- **Where the speed comes from in caves.** The composer control, with identical boxes, is already 3–5× faster than today's W1 composite: a box hierarchy against an 8 m grid. The heightfield adds the memory (1.53 MiB of boxes become 356 KiB). The shell adds faithfulness and keeps the speed, except on long moves.

## Checks
**After R1, at `1baeda9`:**
- **Fast tier:** passes 1,325 / 1,325 on factory-worker; `col1-r1` adds 11 tests at 1.2 s CPU.
- **Mutations:** each R1 fix's removal, the lift's removal and the old jittered parity all fail `col1-r1` (generated JS, in a scratch export).
- **Heavy oracle:** `col1-oracle.heavy.test.ts` passes **4 / 4** on the second worker (`alickers-job: tested 1baeda9…`, clean test build, 58 s, peak 420 MiB). The five COL-1 fast files pass there too.
- **Build:** `npm run build` OK; typecheck clean.
- **An earlier second-worker attempt is not counted.** Its shared checkout's incremental test build kept a stale `caves.js` from another commit after the switch. Only orphaned files were removed, so the heavy file failed to load. The rerun used `--clean`. Worth a fix in `test-build.mjs` for shared checkouts.

**Before R1, at `91b01cb`:**
- **Fast tier:** `node scripts/test-tier.mjs fast` passes **1,314 / 1,314** at `91b01cb`. The COL-1 fast files are under the 5 s warning: `col1-collider` 3.5 s, `col1-oracle` 2.5 s, `col1-queries` 1.2 s and `col1-cover` 0.4 s of main-thread CPU.
  - **Format:** `Uint16` indices, 16-byte nodes, shared positions; over 65,536 vertices a shape refuses, and a split mesh views the art's buffer.
  - **Hierarchy:** quantised nodes hold every triangle under them; candidates never miss one; swept slab culling equals a sweep over every triangle.
  - **Kernels:** sweep and overlap are LC's, bit for bit (20,000 cases).
  - **Sweeps:** triangles stop exactly where a box obstacle does at 2–62 m/s, and a move never ends inside.
  - **Slides:** along walls and creases; **layout independence**, with mutation checked.
  - **Support:** solids rest on their up faces only; skin is a floor from either side.
  - **Interiors:** a union of overlapping parts, with a parity control; parity across a split group.
  - **Heightfield:** planar exactness; sweeps equal to the same triangles as a shape; buried boxes and holes; DDA sight equal to brute force.
  - **Collar:** never blocks a pose the columns allowed, within 2 cm plus slope of them, and the same through LC's composer.
  - **Depenetration:** sunk, deep, bounded, and the wall adverse case.
  - **`composeStaticWorld`:** the exterior's own answers away from the collider; guards.
  - **Cover check** and its adverse case; **TST-05**: size follows primitives, not a 2 km extent.
  - **Oracle smoke,** plus DISH-1's own rim and bowl checks on the static world.
- **Heavy oracle:** `col1-oracle.heavy.test.ts` passes **4 / 4** through the queue at `91b01cb` (49 s, peak 204 MiB).
- **Whole heavy tier:** on the second worker at `ecf2467`, `npm run test:heavy` passes every file. `col1-oracle` took 61 s at 217 MiB. That run predates only the report's interleaved timing and a depenetration refactor, both covered by the queued run above.
- **Build:** `npm run build` OK at `8451a32` (`tsc --noEmit` clean). No app-graph change: nothing in the game imports `world/collision` yet.
- **Collar lift:** the conservative lift on the colonnade collars is at most **10.7 mm** (Archlet), against the old columns' blanket 2 cm plus nine-sample maximum.

## Adverse cases
- **No escape through a wall.** A diver overlaps a wall in a room 3 cm narrower than itself, and the far side of the wall is open water (the nearest clear pose). `depenetrate` returns null, because the escape sweep would close on the wall. With the room's other wall removed, it backs out by its overlap (`tests/col1-queries.test.ts`).
- **A collar that sags.** On a curved floor, a plain lattice lies under the floor between samples. A box resting on it was called buried by the composer's floor check (found by the composer test). The conservative lift fixes it: the largest lift on the colonnade collars is 10.7 mm, with a measured residual of at most 0.333 mm. The mutation is now killed (see *R1 response*).
- **Inside rock, beside a wall** (R1). Recovery returns null when every way out within the limit crosses another wall, through the collider and the composed world alike.
- **Into the collar from a hole** (R3). A diver in a cave's footprint stops at the collar's rim, through LC's composer.

## Compromises (each with its root fix)
- **Long single-call moves of a large hull among dense triangle art are slower than boxes:** A1, medium hull, 4 m in one call, 73.7 → 117.9 µs; dishes about even. Per-frame moves (what the game makes) are as fast or faster in every scene.
  - **Root fix:** for A1's straight tubes and beams, a capsule or oriented-box primitive: one test where a rounded-rectangle prism is 44 triangles. **M**; it fits stage D's oriented proxies.
- **Canopy diver clearance** is 8.8 → 10.2 µs, about 16%, inside the run's noise band; Creel clearance is even. LC's chunk grid finds a column's colliders directly, while this walks a top-level hierarchy over 94 shapes.
  - **Root fix in LC-2:** fold each chunk's band into a heightfield (one shape per chunk, fewer triangles). **S**.
- **Vista and dish positions aren't shared with the render's buffers.** The collider bakes its own Float32 from the same facets, so the numbers are identical, but the bytes are owned.
  - **Root fix in stage B:** the renderer draws from the collider's merged positions. **S**.
- **The collar lattice samples the physical floor function at 0.5 m**, while the seabed art is an adaptive triangulation of the same function. Collision follows the physical floor (on or above it at nine points per cell, with a measured residual); the drawn seam between the art and the collar isn't measured (see *Missing*).
  - **Root fix in stage B:** sample the collar from the terrain bake's own triangulation in the band, so art and collision are the same triangles, as the shell already is inside the footprint. **S–M**.
- **Recovery is bounded best-effort, not a proof of the nearest pose.** It returns the shortest *validated* candidate among face exits, push-outs and the 26-direction ring. A shorter legal escape off every candidate (a box leaving a non-convex part between faces, or escaping diagonally from a convex corner faster than through either face) isn't found.
  - **Rescue consequence:** within the distance limit, recovery may take a longer legal way out, or return null where an unlisted way exists. The caller then rescues (LC's verified rescue path). It never returns an illegal or wall-crossing pose.
  - **Root fix:** an exact configuration-space search, the Minkowski sum of the parts and the box, which is convex per convex part. **M**.

## Missing evidence
- No browser or GPU run: stage A changes nothing drawn or wired. Stage B's integration carries the ordinary-control run.
- Performance is headless Node query cost (`--class exclusive`, factory-worker), not in-game frame cost.
- Memory is Node heap (old) and exact format bytes (new), not a browser heap. The new collider's heap delta was below measurement noise.
- The Canopy oracle now builds all 90 chunks; probes still go round the two routes' chunks.
- Speed after R1 (see the tables' note).
- **The art/collar visual seam** (see *Compromises*) and save-load integration are stage B's composed check. So are endpoint safety across the composed world (see *R1 response*) and LC's endpoint debt above.

## Stage B, when CW-1 merges
1. Compose structures through `composeStaticWorld` (vistas, dishes, the sites), with `guards: [LEGACY_PRESERVE]`, and drop `VISTA_SOLIDS` and the dish boxes from `SOLIDS`.
2. Kit caves through `staticCaveCollider`, collars as `collarHeightfield`, rock as the shell (or boxes, per the call above), in CW-1's composer. Cave slides through `slideMove`.
3. `depenetrate` on save load before the first tick (ART-07), falling back to the rescue path when it returns null.
4. Retire the collar columns and the box sets; port the dish and vista tests to the static world.
