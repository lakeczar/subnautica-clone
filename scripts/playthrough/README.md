# P1: automated campaign playthrough (handoff)

Opus 5.5 high · branch `t3/6639fa97` on root `a09968b` · no gameplay module edited. Spoiler-free.

## What it is
A bot plays the real simulation. Held controls (`move`, `look`) go through `stepGame` one fixed step at a time, and key presses and panel buttons go through `executeCommand`, exactly as `app.ts` does. Nothing writes game state.

The single exception is the labelled **travel helper** (`travel.ts`). It steers along a route with real look/move steps. Routes come from four places:
- **S2's swept routes and B1's routes**, re-checked with the game's `sweptHullClearance` for the hull flying them.
- **Surface A\*** over open water.
- **Interior A\*** over the carrier's own interior solids.
- **Short authored legs** for the pod ramp and the workshop apron.

Read-only queries (targeting, clearance) choose where to stand. A refusal or a trap is reported as **blocked** with the position, power and hull, never worked around. Missing content is **pending C3** only if its key is on the versioned expected-pending list in `pending.ts`. That list holds absent IDs (S9 recipes and sources, S5 hosts and sites) plus one condition, `bounds:b1-simulation`: the simulation still runs B1's bounds and the point lies inside S1's world frame. An ID that exists but can't be used (a site or route outside the composed bounds or S1's frame, a recipe S9 marks unplaced) gets a `broken:` or `refused:` key that is never listable, and blocks. So does any unlisted missing capability, such as a removed recipe. An optional module counts as absent only when its own file is missing; any error inside an existing module propagates. A story host that isn't placed is **deferred** (recorded, run stays pending, phase still plays) on the same terms. The run also fails if a listed key is already present, so the list must be pruned at integration.

**Effects are verified, not assumed** (`effects.ts`, `outcomes.ts`). After every accepted command the driver checks its effect on the real state, and any mismatch blocks:
Inventory effects are conservation checks over the whole ledger (container, kind, fitting and provenance → quantity): exactly the requested quantities move, from the requested place, to the required place, and nothing else changes.
- **Crafts:** the exact cost leaves, only from the bench's own containers (or the rescue stock pays). The output is present and lands where the game's rule puts it, in the right container and fitting: a hull newly at the refit rating, an in-place suit refit, a new hull, the item, a restored facility, the pod-buffer repair, or a newly recorded construction stage.
- **Transfers:** the requested stack loses N and the destination gains N; a whole stack keeps its ID.
- **Bulk stores:** every selected stack arrives in full.
- **Other commands:** each has its own rule and requires an unchanged inventory unless it moves something: E on any target (pickups, readings, boarding, panels), service, reserve cells, mounts, recovery, tool arms, eating, exit, every carrier action, and the proposed works and resolution commands.
- **Unknown kinds:** a command kind without a rule fails closed.

Each phase also checks its purpose before its milestone counts, for example the Creel and Dart at 350 m and the mooring restored after the refits phase.

At every phase end the harness saves through the real `SaveRepository`, reloads with a fresh repository, requires an identical state hash, and continues from the reloaded state.

## Run
- `npm run playthrough` runs all five scenarios, in about 3.3 min. Add `-- --jobs 3` to run the three New Game groups in parallel (about 1.7–2 min here). Other flags: `--scenario creel,carrier,creel-loss,reverse,no-optional` and `--json out.json` for the full timeline. No Babylon is loaded.
- **Exit codes:** 0 means nothing is blocked, every check holds and the expected-pending list is current; pending is expected today. 1 means a blocker, a failed check, a stale or malformed list, or any `--jobs` child that exited nonzero (even after writing a complete result), was killed, timed out (`--child-timeout`, default 1800 s) or did not return every requested scenario exactly once.
- **Fast tier:** `tests/playthrough.test.ts` plays New Game through the reef with exact reloads. It also covers the refusal contract, keyed content checks, abnormal child outcomes, a removed recipe blocking, the list being current, S5's works sites and hull ratings.
- **SAVE-1 added three short library scenarios** (below): `low-air`, `tour` and `over-geared`, so a plain `npm run playthrough` now plays eight. On siltwake-alickers at `0a464bc`, `--jobs 3` takes about 14 min: the New Game Creel group (`creel` and its five branches) runs in one child and is the critical path. A branch alone with `--from-library` takes seconds to a minute.

## Save library (SAVE-1)
After each root merge, the coordinator runs `scripts/saves-export.sh` on root. It plays every scenario and publishes **every save the bot made** (each milestone, plus the mid-phase captures) to an immutable directory per commit, `/work/tmp/siltwake-saves/<sha>/` (or `$SILTWAKE_SAVES`), with a `manifest.json` and an `index.json` beside it. Everything is earned through real commands. The export publishes nothing unless every scenario completes, every save reloads to its hash and every kind holds its facts.

**Pinned to one SHA.** The wrapper captures HEAD once. It refuses a dirty tree, then builds that commit with `scripts/saves-build-at.sh SHA DIR`: a `git archive` compiled in a directory of its own and marked with `.siltwake-source-commit`. Both the second worker and the factory fallback run the export from such a build. `run.js --export --commit SHA` refuses code without the marker, or marked with another commit, so a worktree's `.test-build` can never export under a SHA. A partial export (some scenarios) may only go to a private `--library-root`.

**Publication** takes the root's lock: a kernel `flock(1)` on `.publish.lock`, a file that is never removed. The lock is held by a child process and dropped by the kernel when its owner dies, so no writer ever deletes another's lock. `.publish.lock.owner` names the last holder, for messages only. Under the lock, publication collects orphaned staging, renames the verified staging directory into place read-only and rebuilds the index. A repeated or concurrent identical export reports `identical`, after checking that the existing directory itself verifies. A different one is an error.

**Staging** is `<root>/.staging-<sha12>-XXXXXX/<sha>`: hidden, and named by its commit so any build's verifier accepts it. Its owner holds a `flock` lease on `.lease` beside it for its whole life. An orphan, whose lease is free, is collected by the next publish or `saves.js index`. A live exporter's staging is never collected, however old.

**Kinds** (`saves.js kinds` prints them; `kinds.ts` defines them). Every save is also its own kind, `scenario@label`, for example `creel@refits`.

| Group | Kinds | Where from |
| --- | --- | --- |
| Milestones | `pod-start`, `dart`, `creel-basin-frames`, `creel-350`, `rift-450`, `creel-800`, `carrier-fitout`, `pre-ending`, `pre-ending-carrier` | Phase ends of `creel` and `carrier` |
| Adverse | `low-air` (oxygen ≤ 20%, on suit air), `hull-damaged` (running, hull ≤ 50%), `craft-lost` (disabled at depth, the diver surfaced), `battery-depleted` (charge 0, helm dead, emergency air) | `low-air`, `creel-loss` captures, `tour` |
| Gear | `canopy-min-gear` (180 m Dart, 150 m suit), `canopy-over-geared` (800 m Creel and suit) | First entry into the Canopy in `creel` and `over-geared` |
| Tour | `tour-ready`: the 350 m Dart with the core cell bank and drive controller, full, two charged reserve cells aboard | `tour` |

**Provenance**, per save in the manifest: scenario, label, phase, branch point (`from`), tick and minutes of play, accepted commands since New Game (a branch counts its parent's), bytes, journal bytes, state hash, the file's SHA-256 and a few readable facts (region, vitals, craft). The manifest also records the commit, schema and content versions, the machine, each scenario's outcome, the size summary (SAV-03) and measurements (the tour range).

**Using it.** Build first (`npx tsc -p scripts/playthrough/tsconfig.json`), from a checkout at the commit you are testing:
- **CLI:** `node .test-build/scripts/playthrough/saves.js pick tour-ready` prints the path of the newest compatible save; what it chose goes to stderr. `--commit REF`, `--exact` (that commit only), `--json`. Also `list`, `kinds`, `verify [REF]`, `import DIR`, `index`, and `--root DIR` everywhere.
- **Code** (tests, GPU drivers): `const { librarySave } = await import(B + "scripts/playthrough/library.js")`; `librarySave("dart")` returns `{ path, text, state, entry, manifest, compatibility, distance, migrated, describe }`. Import `path` through the menu (`#import-file`) as the drivers do, or seed localStorage with `journalRecord(text)`. A worked consumer: [`enc1/derive.mjs`](../../docs/build/streams/enc1/derive.mjs) starts from `dart` instead of replaying three phases.
- **Branch scenarios** (TST-21): `npm run playthrough -- --scenario carrier --from-library` starts `carrier` from the library's `creel@refits` instead of replaying the Creel run; every branch whose parent is not requested does the same, and each becomes its own `--jobs` group.

**Compatibility.** A save suits a commit when its library commit is that commit or an ancestor, its schema and content versions are this build's (or schema 5 / expedition.6, which `bridge5.ts` converts), and this build's own `decodeSave` accepts it. The nearest such commit wins (`same-commit`, else `same-version` or `bridged`). The recorded hash must match the saved state before any migration; `migrated` means this build's decoder actually changed it (the schema 5 bridge, additive content).

Anything else is **refused** (exit 3) with every candidate's reason:
- another branch's commit;
- another schema;
- a missing or damaged file;
- a recorded hash that doesn't match;
- an envelope without a state;
- a kind no export has.

If the nearest compatible save fails to load, that is refused too, and the refusal names the older compatible candidates as not tried. An older one is never used in its place. An export whose manifest can't be read stays a candidate: if it's at least as near as the best readable one, it could hide a nearer save, so the pick is refused. A farther one is named under "passed over".

**The second worker.** `scripts/saves-export.sh` runs the export on siltwake-alickers (`alickers-job.sh`, into its own `/work/tmp/siltwake-saves/<sha>`, so jobs there find it too), copies the directory back over ssh and imports it. The import checks every file against the manifest, copies it into hidden staging in the root and decodes every save there with a build of that commit. That is this code if it was built from it, else a fresh `saves-build-at.sh` build called through its own exported `verifyCommitDir(dir, true)`, which every export since the first has had, so older exports verify with their own decoder and kind facts. Only then does it publish; a failure leaves no directory and no index entry. `saves.js verify REF` decodes with a build of REF in the same way. Exit 75 or 255 falls back to factory-worker's queue (`--class playthrough --snapshot`); `--here` goes straight there. When SCHED-2b's remote lane lands, its `remote_export` becomes `heavy-check --machine any --artifact <dir>`.

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

**Works logistics** (`cargo.ts`): the two assemblies are tracked by item ID from crafting to consumption, with the hall and food stock tracked by count. Every move first checks that the game reports both containers locally accessible, so no remote transfer is ever attempted.
- **Creel route:** everything rides in the Creel rack (96 CU), loaded at the workshop bench.
- **Carrier route:** the Creel ferries the cargo to the carrier at the yard, a diver load at a time through the vestibule into the stores. At the shelf, each Mantle trip (32 CU: two trips) is loaded after its launch from the stores, out through the vestibule to the Mantle's side.

The diver never carries more than 16 CU. Every sortie refuses a hull rated below its site, and each strategy picks its own deep hull (Creel 800, or the Mantle from the carrier).

The harness probes both and reports "not wired" until they exist.

**Assumptions** (marked ASSUME in `later.ts`):
- a craft moored at a works face lends its hold to the works' `canPay`, as S9's stops do;
- a new Mantle is captured from the carrier interface;
- stop benches open with K at the work pose.

## Limits
- This is a bot. It is faster and more precise than a person, and says nothing about pacing, comprehension or fun. It never fights; it avoids the hunter by moving quietly near its territory.
- The later phases are written but unexercised past the Rift and the Hearthline, except under the probe-only unlock (Divide passes). Expect a tuning pass once the hosts and the works commands exist.
