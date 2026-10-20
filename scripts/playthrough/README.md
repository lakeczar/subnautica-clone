# P1: automated campaign playthrough (handoff)

Opus 5.5 high · branch `t3/6639fa97` on root `a09968b` · no gameplay module edited. Spoiler-free.

## What it is
A bot plays the real simulation. Held controls (`move`, `look`) go through `stepGame` one fixed step at a time, and key presses and panel buttons go through `executeCommand`, exactly as `app.ts` does. Nothing writes game state.

The single exception is the labelled **travel helper** (`travel.ts`). It steers along a route with real look/move steps. Routes come from four places:
- **S2's swept routes and B1's routes**, re-checked with the game's `sweptHullClearance` for the hull flying them.
- **Surface A\*** over open water.
- **Interior A\*** over the carrier's own interior solids.
- **Short authored legs** for the pod ramp and the workshop apron.

Read-only queries (targeting, clearance) choose where to stand. A refusal or a trap is reported as **blocked** with the position, power and hull, never worked around. Missing content is **pending C3** only if its key is on the versioned expected-pending list in `pending.ts` (S2/S5/S9 content not yet composed). Any other missing capability, such as a removed recipe or a route that no longer reaches, is **blocked**. A story host that isn't placed is **deferred** (recorded, run stays pending, phase still plays) on the same terms. The run also fails if a listed key is already present, so the list must be pruned at integration.

At every phase end the harness saves through the real `SaveRepository`, reloads with a fresh repository, requires an identical state hash, and continues from the reloaded state.

## Run
- `npm run playthrough` runs all five scenarios, in about 3.3 min. Add `-- --jobs 3` to run the three New Game groups in parallel (about 1.7–2 min here). Other flags: `--scenario creel,carrier,creel-loss,reverse,no-optional` and `--json out.json` for the full timeline. No Babylon is loaded.
- **Exit codes:** 0 means nothing is blocked, every check holds and the expected-pending list is current; pending is expected today. 1 means a blocker, a failed check, a stale list, or any `--jobs` child that crashed, was killed, timed out (`--child-timeout`, default 1800 s) or did not return every requested scenario exactly once.
- **Fast tier:** `tests/playthrough.test.ts` plays New Game through the reef with exact reloads. It also covers the refusal contract, keyed content checks, abnormal child outcomes, a removed recipe blocking, the list being current, S5's works sites and hull ratings.

## Scenarios and status
| Scenario | Root `a09968b` | C3 in progress `3c9a181` (export in `/work/tmp`) |
| --- | --- | --- |
| **creel** (Creel with service stops) | 8 live phases pass, then the Rift is pending C3 | Also passes the **Rift**: station restored, ceramic, core, 450 m suit and Creel. Then the Divide is pending |
| **carrier** (Hearthline with Mantle), branched from creel@refits | Rift pending | Rift and **Hearthline** (keel and fit-out at the yard) pass. carrier-deep is pending |
| **creel-loss** (adverse), from creel@basin-frames | Passes: the 240 m Creel is disabled at 257 m in the fracture; exit, ascent on suit air (oxygen minimum 49%); Bobbin tow from the staging bench; patch, reserve cell, home, service; refits continue | The same, plus the Rift |
| **reverse** (adverse) | Passes; C03 before C02, C06 before C05 | The same |
| **no-optional** (adverse) | Passes; no optional log read | The same |

**Live timeline (root, creel):** 29.6 min of play, 8 saves all equal, 0 refusals, 0 incapacities, 0 hazard notices.

| Phase | Min | Lowest O2 / food / power / hull | Found |
| --- | ---: | --- | --- |
| opening | 0.0 | 100 / 100 / — / — | C01 |
| reef (pod repair, tools, 150 m suit, buoy, cells, Bobbin) | 2.6 | 90 / 100 / — / — | pod_checklist, C02, reef note |
| isles (workshop, Dart) | 1.1 | 97 / 99 / — / — | C03 |
| canopy (crust, resin, 350 m suit) | 3.8 | 96 / 91 / 85 / 100 | C04, specimen tray |
| basin-survey (Dart) | 5.3 | 91 / 80 / 76 / 100 | C05, C06, keel plate |
| creel (Creel and rack) | 2.7 | 93 / 75 / — / — | |
| basin-frames (6 frames, salvage) | 8.7 | 100 / 58 / **7** / 100 | |
| refits (Creel and Dart to 350, outer-crown mooring) | 5.4 | 91 / 56 / 92 / 100 | |

Per-leg minima, gathered and spent counts, the hazard log and every save hash are in the `--json` output.

## Blocking and pending, exactly
- **Root:** every later phase is pending. Missing are S9's recipes and sources, simulation bounds beyond B1's, and S5's story hosts; each phase lists its own items.
- **C3 `3c9a181`:** everything waits on **S5's story hosts** (C07–C15 and the records), none placed yet. As a result:
  - `bp_deep_service` has no reachable source (only C07 or the Rift ledger grant it), so the Divide stop, Creel 800, suit 800 and Mantle all wait.
  - Meridian, works and ending have no hosts.

## Findings
1. **Root.** A full Basin frame haul returns the Creel at **7% power**: 10 arm lifts at 4% each plus the return loop. EXPEDITION_INTEGRATION's target is ≥25%.
2. **Root, `sim/carrier.ts`.** The exterior vestibule is 13.8 m from the keel, but every carrier command first requires ≤15 m from the keel. So **39%** of the advertised 5 m vestibule entry radius is refused with "Approach the carrier interface locally".
3. **Root.** In the compact Hearthline, the only bow-to-stern walkway is the 0.84 m strip between the berth-room walls. With the 0.34 m walking radius, a centre line must be held near x 0.0–0.1 for about 8 m; lanes at −0.1 and 0.2 stop.
4. **C3, early.** The yard mooring (470, −12, −6) lies inside the Hearthline build envelope (17 m around 470, −14, −12). A supply Creel moored there makes the fit-out refuse with an unexplained "Construction clearance is blocked". The harness moors 16 m off and records a note.
5. **C3, early,** seen with a probe-only plan unlock that is never reported as a result. Yard to Divide lee is 1.5 km of carrier route, and costs **58%** of the Hearthline's charge one way. S2 lists "charge" at its moorings, but the lee mooring refuses service, so the carrier strands after the two lattice ledges.

## When C3 lands
Prune `pending.ts` of the keys the run names as stale, then run `npm run playthrough -- --jobs 3`. Phases turn green as their declared IDs appear:
- `content.ts` reads `content/campaign` and C3's `content/stops` (work and mooring poses) when they exist.
- Story hosts are detected through `storyHost()`/`STORY_SITES.existing`.

**Proposed test hooks** for C3 to adopt (or tell me the real shape):
- works as `{ type: "works", action }`, from the gate panel and the hall work faces;
- the controller as `{ type: "resolution", action: "begin" | "complete", roster? }`;
- the upper-hall work face as the interaction `works:meridian_upper_hall`. S5 puts `restore_hall` and `restore_food` there and every other works action at the gate hall (`gate_panel`); the harness reads these sites from S5's `worksAction`.

**Works logistics:** the assemblies (12 CU) and the hall and food stock (30 CU) ride in one trip in the Creel rack (96 CU), or in two Mantle trips (32 CU) reloaded from the carrier stores. The diver never carries more than 16 CU. Every sortie refuses a hull rated below its site, and each strategy picks its own deep hull (Creel 800, or the Mantle from the carrier).

The harness probes both and reports "not wired" until they exist.

**Assumptions** (marked ASSUME in `later.ts`):
- a berthed Mantle's hold is reachable from the carrier interior;
- a craft moored at a works face lends its hold to the works' `canPay`, as S9's stops do;
- a new Mantle is captured from the carrier interface;
- stop benches open with K at the work pose.

## Limits
- This is a bot. It is faster and more precise than a person, and says nothing about pacing, comprehension or fun. It never fights; it avoids the hunter by moving quietly near its territory.
- The later phases are written but unexercised past the Rift and the Hearthline, except under the probe-only unlock (Divide passes). Expect a tuning pass once the hosts and the works commands exist.
