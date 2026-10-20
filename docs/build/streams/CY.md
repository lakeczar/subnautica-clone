# CY: currents, natural cycles and the cycles lab

Opus 5.5 high · branch `feat/cy-currents-cycles` from `feat/siltwake-first-expedition` at `e40759d` · new files only. This is rules, content, a lab and tests, ready to compose. Nothing here is wired into the game.

## What exists
| Area | Files | What it does |
| --- | --- | --- |
| Cycles | `src/sim/cycles/cycle.ts` | `CycleDef`: phases (held level or linear ramp), offset, warnings. `cycleLevel`, `sampleCycle(At)`, `secondsUntil`, `windows` (worst wait, shortest window, tick-exact), `cycleProblems`, `fromHazardCycle` (S4's shape). A pure function of `tick / 60`, so nothing is saved. |
| Journal record | `src/sim/cycles/observe.ts` | `CycleObservation`, `observeCycle`, `journalEntry`, `validObservation`. |
| Currents | `src/sim/currents/{types,flow,motion}.ts` | Box (yawable) and capsule-tube volumes with direction, strength, inside edge, lees and a cycle. `createCurrentField().sample(p, tick)` and `.peak(p)`. `respondToFlow(flow, actor, drive, hold, powered)` returns the drift to add to the drive, plus extra drain, effort, headwind and the hold result. |
| Turbine stub | `src/sim/currents/turbine.ts` | `turbineRate`, `turbineNet` |
| Sandbox | `src/sim/currents/sandbox.ts` | The lab's Babylon-free stepper and the reference integration. Its movement mirrors step.ts; drift goes in the same sweep. |
| Content | `src/content/currents/{actors,cycles,lab}.ts` | Actor table (today's numbers, SYS-1 at composition), the five cycles, lab geometry, the four candidates with direct and alternative routes. |
| Lab | `tools/cycles-lab.{html,ts,tsconfig.json}` | Free swim and all six hulls; toggles for hold, turbine, streaks, ×4 time, plan view and phase jumps; readouts for flow, drift, effort, drain, phases, warnings, gates and the journal. |

## The motion rules (`motion.ts`)
1. **Exposure:** drift = flow × (1 − authority). Authority uses S4's and SYS-1's `current` scale (0–0.95), so trim vanes and profiles plug straight in.
2. **No riding, in the flow's frame:**
   - downstream you move at the faster of your drive's downstream part and the drift, never their sum;
   - upstream the whole drift subtracts (headwind);
   - across it your drive is untouched and you are pushed downstream, so you crab.

   My first rule projected out drift along the heading; it carried a diagonal diver downstream at 5.8 m/s and pushed a diver pressed on rock backwards along the face. It was replaced, and a 2,800-sample property test pins the new rule.
3. **Holding** (only while stopped):
   - station keeping cancels up to `cruise` of drift;
   - the grapple cancels up to 4 m/s, at a quarter of the thruster cost;
   - the mooring anchor holds 1.5 m/s for free (SYS-1's numbers);
   - an unpowered hull or the diver holds nothing.
4. **Cost:** extra drain = cruise drain × 2 × effort, where effort is the drift worked against divided by `cruise`. The diver has no battery, so a current costs them time and position, **never health**.

## Integration plan (for the coordinator; I edited none of these files)
- **`moveCapsule` and `moveHull`: no change.** Drift enters as part of the delta they already sweep. The worst case is 11 m/s of boost plus 8 m/s of flow, about 0.32 m per step, which is 2 hull slices.
- **`step.ts`, diver branch (swimming only):**
  - after `vx, vy, vz` are clamped, take `r = respondToFlow(field.sample(old, s.tick).flow, diver, {vx, vy, vz}, "none")`;
  - sweep `(vx + r.drift.x, …)`, with `slices` from the summed magnitude;
  - keep `s.player.velocity` as the drive only, so drift never accumulates;
  - the `-0.5` surface cap applies to the sum.
- **`step.ts`, vehicle branch:**
  - after the velocity response, pick the hold: `grapple` if SYS-1's line is attached, `anchor` if anchored, `station` if powered with no thrust input, else `none`;
  - sweep `(v.velocity + r.drift) × DT` through the existing `moveHull`.
  - **Three changes are needed:**
    - **(a) Impact damage** keeps `previousSpeed` from the drive. A current pressing a hull onto rock is never an impact; this is tested.
    - **(b) Contact damping.** Replace `v.velocity.x *= 0.5; v.velocity.z *= 0.5` on contact with the face-only damping in `sandbox.ts`. Otherwise a hull held onto a face by a current loses half its drive every step and crawls at about 0.5 m/s.
    - **(c) Drain.** Classify "moving" by drive speed, not by displacement `d > 0.003`, so drifting isn't billed as cruising, and add `r.extraDrain`.
  - Berthed hulls skip all of this. Thrust and ascent samples (P1) should use the drive-only request.
- **C3 `ecologyLink.ts`:** delete its separate post-move drift sweep when this lands, or the drift doubles. Feed S4's `divide_downwelling` in as a current volume instead. My edge lies inside the shape and S4's outside, so grow the box by its 6 m edge. Then zero that field's `flow`.
- **S4 hazard clocks:** `CHIMNEY_PULSE` and `SEDIMENT_SURGE` equal S4's `cycleLevel`, `secondsUntilActive` and `secondsUntilRise` at every tick over 3 periods, tested against S4's verbatim code from `854fdf1`. Proposal: `HazardFieldDefinition.cycle` becomes a cycle ID. S2's `hazard.rift.chimney_pulse.cycle` (90/35) is a stale, unwired proposal; S4's 75 s/18 s runs. Drop S2's field.
- **SYS-1:**
  - `craftProfile` maps to `CurrentActor` (`current`, `speed.cruise`, `drain`);
  - `grappleStep` stays the position constraint after the sweep, re-swept as in the sandbox;
  - `anchoredDrift` and `driftScale` are superseded by hold `anchor` and `exposure`.
- **SYS-2, the journal:**
  - save `knowledge.cycles: Record<cycleId, CycleObservation>`, checked by `validObservation`. That is the only new persisted state;
  - call `observeCycle(def, record, tick, inView)` each step for cycles in view, where content supplies the site and range or a line-of-sight test;
  - `cycle-seen` and `cycle-measured` events feed the log; `journalEntry` is the tab row;
  - timings show only once watched from start to end, and never as a guess.
- **Content rules** (enforced in the lab's tests; apply them to world volumes):
  - where a volume meets rock, extend it 2 m into the rock. My first gully left a still boundary layer that divers crept along at full surge; this is now tested;
  - each gated passage has an always-open alternative, a readable warning, at most 60 s closed and a window at least 1.5× the crossing time;
  - currents never run along a useful route, so placement adds no riding;
  - a powerless diver reaches still water within 25 s from anywhere inside.

## The four candidates, assessed (the owner and an experience review decide)
Times are for a diver at 3.4 m/s. "Mean wait" assumes arriving at a random moment.

| | Decision it creates | Wait | Alternative | Call |
| --- | --- | --- | --- | --- |
| **a. Vent pulse** (chimney, migrated unchanged) | Dash between pulses, take the cool way, or wear protection. It also times work at the plume-side seam. | Closed 24 of 75 s, worst 24 s, mean 3.8 s; the mites warn 7 s ahead | +22 s round the cool shoulder | **Keep.** It's mostly open and short, and the cue is readable, so watching the mites and timing a dash feels like play. Its real value is a timing beat at a rich resource, not a gate. |
| **b. Slackening current** (gully spill) | Wait for the lull, swim round, or force it in a craft. At surge no diver gets across, even crabbing at sprint, but crosses the 18 s lull in 6.6–10 s. The Dart crabs across at surge (0.76% against 0.53% of charge); the Creel and Hush need boost. | Worst 41 s, mean 14 s | +41 s round the far end | **Keep, sparingly.** Being swept down the gully is the most vivid thing in the lab, and the first lull crossing is a satisfying beat. Repeated on a commute it becomes a chore, because the alternative takes about as long as the worst wait. Use one or two per region, off routine routes, where there's something to do while it runs. Hull drain changes little on a short crossing, so this is mainly a diver obstacle. |
| **c. Lantern bloom** (big harvest for a while) | Come back during the bloom, or pick the ordinary bed (3 picks always, up to 15 in bloom) | Worst 170 s, mean 60 s; breaks the one-minute rule if anyone waits | Ordinary bed, +7 s | **Cut as a clock.** The reward is more of a material you can get elsewhere, so the only real decision is whether to hover for 3 minutes, which is dead time. A short period would make it a free farm. Rework as renewal or cultivation (SYS-2), or as a one-off "found in bloom" state per visit. |
| **d. Migration** (warden's pocket) | Wait for the warden to feed, take the poorer bed (1 unit per pick against 2), or trespass and get shooed | Worst 53 s, mean 15 s; clicks warn 8 s before it returns | +8.5 s to the open bed | **Keep, as creature behaviour.** Watching an animal leave is a living-world moment, not a gauge, and it teaches cue reading the way S4's animals do. The stand-in is toothless; it needs a real S4 agent with S4's warning rules to judge properly. |

## The current turbine (stub)
- **What it charges:** 0.06 × flow, as a percent of a stock battery per second, saturating at 1.5 m/s. That is 1.8–5.4% per minute gross. A Creel held on its grapple nets +0.7 to +3.9% per minute: +50% takes 13–73 minutes parked.
- **Its catches:**
  - it only works stopped and held (grapple or anchor), in at least 0.4 m/s;
  - it is loud (0.2);
  - it stops at 80% (my limit, so it is never a perpetual generator);
  - winch power eats the gain in strong flow.
- **Verdict: cut it for small craft.** Its only mode is parking and waiting to charge, which is the "idle charging bar" GAME-DIRECTION rules out. It also turns currents, which are meant as obstacles, into places to park. It duplicates solar, thermal, bio-cells and outposts. The only defensible variant is a Hearthline mooring-anchor perk that trickles while the carrier is anchored anyway and the player works elsewhere: background, not waiting.

## Adverse case
A diver with no craft and 20% air (36 s), pinned onto a cliff by an always-on 6.5 m/s race 2 m inside its edge:
- **Pinned:** they stay on the face, never inside it, and take no harm.
- **Sideways:** swimming out leaves the flow in under 2 s, and they surface with air to spare.
- **Into the lee:** from the middle of the race, they reach the notch lee and rest in still water.
- **Anywhere:** a grid of 40+ start points over every lab current, at surge, each reaches still water within 25 s.

In the browser with ordinary key input: pinned at x 19.66 with health 100, then out in 0.67 s of sim time.

![Pinned on the cliff](cy/adverse-pinned.png) ![Gully at surge, plan view](cy/gully-surge-plan.png) ![Vent venting](cy/vent-venting.png)

## Checks
- **`npm test`:** 814/814. That includes 33 new tests in `tests/cycles.test.ts` and `tests/currents.test.ts`, about 7 s.
- **Mutations:** 8 of 8 caught. They were:
  - drift moved without the sweep;
  - riding allowed;
  - station keeping made free;
  - the chimney shifted 0.5 s;
  - drift counted as an impact;
  - a partly seen phase counted as measured;
  - lees ignored;
  - the diver allowed to hold station.
- **Covered:**
  - flow and cycle maths;
  - tick-exact S4 equality;
  - save and reload: JSON mid-run for the sandbox and for observations;
  - no tunnelling for all 7 actors at cruise and boost in 8 m/s flow against a 0.3 m wall, plus hulls boosting along rock in a cross-flow;
  - station keeping cost for every hull, the grapple cheaper, the anchor free;
  - every gate has a swimmable, ungated alternative, really closes when closed and really opens when open;
  - turbine rules.
- **Lab:** `npx tsc -p tools/cycles-lab.tsconfig.json` is clean. It ran under Vite on port 5214 in the shared software-rendered preview: crossing in the lull and swept at surge by keyboard, the adverse escape, and the journal filling in.
- **Not run:** the heavy tier (nothing here reaches Babylon outside the lab) and GPU (not needed).

## Known limits
- **Placement:** no world volumes are placed; CB or the coordinator authors them under the rules above.
- **Sampling:** flow is sampled at the actor's centre, which is coarse for the 17 m Hearthline.
- **Lab stand-ins:** the warden, the heat gauge (S4 owns exposure and harm) and the grapple (SYS-1's rule) are simplified.
- **Presentation:** no current presentation in the game renderer or audio yet; the lab's streaks are placeholders.
- **Diver cost:** the diver pays only time. Extra oxygen use while fighting a current is a possible later knob (survival.ts).
- **Tuning:** every number is a proposal, and no human has played it.
