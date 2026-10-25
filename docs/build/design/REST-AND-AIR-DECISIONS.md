# Rest stations, air and dry rooms: decisions (owner, 2026-10-24)

This came from a live discussion between Alek (the owner) and an Opus 5.5 game designer. It's spoiler-free on purpose: late places are described only by what kind of place and challenge they are, never by story.
- **Inputs:** `BRIEF.md`, `round1/feel.md`, `docs/build/GAME-DIRECTION.md`, `src/content/stops.ts`, `src/content/bases.ts`, `src/sim/survival.ts`, `src/sim/recovery.ts`, and ENV-1 (`origin/t3/env-1-interiors`, §3.6).
- **Visuals shown to the owner:** `air-map.html` (first proposal) and `air-map-v2.html` (agreed shape).

## Where we started (code today)
- **Rest:** being inside a refuge with food in you heals you. The crown's bunk heals 3× faster. Resting at a rest base makes it where you wake. There's no sleep, no time skip and no fatigue. Autosave runs every 30 s and isn't tied to rest.
- **Rest bases:** the pod, the workshop, the crown, the Rift station, the Divide dock and the district staging office (which works from New Game), plus a registered Creel cabin. GAME-DIRECTION says "the pod or the crown", so the code is broader than the direction.
- **Air at the stops:** an invisible 4 m sphere at the work pose. It gives air, healing and rest in open water, so you wake *swimming* at −262 m. Nothing in the world shows it. It was a stand-in for a room.
- **Moorings:** each region got one charging mooring as its arrival point (and as a rescue tow endpoint). Three sit 50–125 m from a big stop: the Rift cool-flank mooring is about 50 m from the Rift station, the Basin anchorage about 120 m from the crown, and the Divide lee mooring about 125 m from the Divide dock.

## Decisions

1. **No free air points.** Stops stop being "bunny-hop" refuges. The 4 m air spheres are retired everywhere: at the crown, the Rift station, the Divide dock and the district staging office.
2. **Power is air.** Everyday air is what you bring:
   - the surface;
   - your cockpit, which breathes while the craft has charge;
   - the air line from a parked, powered craft (27 m basic, 60 m hull line), which draws on the craft's battery;
   - the registered Creel cabin;
   - the carrier.

   Service points (moorings, small posts, player outposts) give **power only**: charge, repair, and lockers, sockets and fabrication where they have them. They give **no air and no rest**.
3. **Big stops are earned, and each one ends in a dry room.** The set is:
   - the **crown station**;
   - the **Rift materials station**;
   - the **Divide upper service dock**;
   - **one district big stop** (moved by the map session, 2026-10-25: deep, on a lower terrace at the district's far end, around (1330, −1470); the coordinator and lore owner pick the building; see MAP-LAYOUT-DECISIONS.md).

   Each follows the same arc:
   1. **Arrive:** dark, flooded and dead. You breathe from your own parked craft.
   2. **Read the place:** what broke and what it needs.
   3. **Earn it:** the place's **own unique scenario** (hands-on puzzle, building, a material inferred from clues; the mix depends on the place).
   4. **It comes alive:** lights come on room by room, power returns and **one room drains**.
   5. **Sanctuary:** you stand, breathe, rest and wake there. Charging, repairs and fabrication open.
4. **Each big stop is its own place:**
   - its own architecture and building features;
   - the environment and creatures around it;
   - what the now-powered facility was for and who the group was;
   - logs and environmental storytelling about what happened there. This follows ENV-1's "the room tells you before the log does".
5. **Rest and wake happen only at:**
   - the homes (the pod, the workshop);
   - active dry rooms at restored big stops;
   - the registered Creel cabin, as today.

   You wake at the last one of these you rested at, while it still works; otherwise at the pod. **The district staging office stops being a rest and wake point.** The Canopy lab was shown as an early rest and wake point; see Open.
6. **Power points are sparse and sit at the start of long journeys.** There are few of them, placed where a long, hard leg begins. **None sits near a big stop:** before restoration you arrive on what you brought, and after it the stop powers you itself. The moorings that duplicate big stops are removed or relocated. **Exact placement is decided in the owner's map-layout session.**
7. **Difficulty rises through pressure and combining, never through grind.** The owner's levers:
   - fewer resources;
   - places where you can't surface to refill;
   - craft that can't fit, or that sit at the edge of their maximum depth, so you leave them and explore exposed;
   - places farther from the start that are deeper and take longer to explore and to find things in;
   - nothing in a straight line.

   The 15–20 minute "something new" rule stays the guard against "farther" becoming "emptier".
8. **Knocked out mid-restoration:** steps you've completed **stay completed**. You wake at your last rest point and return to continue. Failing costs the trip back and the dropped cargo, never redoing finished work.
9. **Spoilers:** owner-facing discussion and summaries of the late game stay general: what kind of place and what kind of challenge, never the story.

## The owner's words (verbatim where it matters)
- "I don't think we should have rest stations as bunny hopping points to just be readily available. I do like the dry room ideas, but should be for major places."
- "air may be at places where we finally arrive, solve, conquer to get to some major area and the player is rewarded with not having to worry about resources for moment and their in some unique environment (like reaching the aquarium, the building in the Primary Containment Facility)"
- "In the later game I think we'd need to solve complicated puzzles or resource building or something to reward use with stops for power (that give use lungs because the vehicles that are enclosed produce oxygen right?)"
- "I think dry rooms are cool (when selectively used and unlock the power and other stuff) and maybe special major stops can have cool and unique building features and logs / lore telling a sotry of what happened there, the environement and creatures around it, the purpose of the now powered facility and the group, etc."
- On restoration challenges: "depends on the scenario, maybe can have some unique scenarios in each place"
- On spoilers: "want late game to be spoiler free" … "make it general, hopefully it's a satisfying and cool experience of what it is, what you'll have to do in situations and its creative. I can still discuss some things like i want to be more challenging as the game progresses"
- On moorings: "I think the service stations are too close to the big stop … Also they should probably be set sparingly right before a long journey." The designer read this as "stations close to big stops are redundant". The owner confirmed the rule (rare, at the start of long journeys, never next to a big stop) with "Yes".
- On difficulty: "less resources, you can't come up for air to refill and sometimes vehicles can't fit or are at the edge of going below their max depth so you have to get out to explore it (exposing yourself). Also away from the starting areas and places should be farther, deeper and will take a bit longer to explore and find things. Nothing should be in a straight arrow"
- On completed restoration steps staying done: "Yes."

## Still open
1. **The owner's map-layout grilling session** (the owner raised it): power-point placement, organic and non-uniform sections, and routes that are never a straight shot. Decision 6's spots wait for it.
2. **Each big stop's scenario** is designed per place, with the owner, spoiler-free in owner-facing material.
3. **The Canopy lab as a rest and wake point.** It's already dry and needs no restoration. Both visuals showed it as an early rest and wake point and the owner didn't object, but it wasn't asked directly. Confirm.
4. **The carrier as a wake point.** Today only a registered Creel cabin is a mobile wake point; the carrier's cabin heals but isn't a wake point. The designer had loosely said "the Creel cabin and the carrier stay as wake points". Decide.
5. **The district big stop's exact place and position.** Superseded by the map session (2026-10-25): deep, on a lower terrace, around (1330, −1470). ENV-1 had the upper hall row. ENV-1 said the staging office stays the district's rest base, which is now reversed.
6. **The designer's feel conditions** (recommended, not owner-decided):
   - quick repeat entry: surface straight up through a floor well near the mooring, with the two-door lock on the first entry and the deeper rooms;
   - a sensory change when you leave the water, which every dry room ships with: the sound changes, water runs off the lens, footsteps, a room tone, a window onto the water;
   - **a dry room is never unsafe:** no threat enters, and eeriness stays in what you see and read.
7. **Rescue tow endpoints** once moorings move (see below).

## What changes

### ENV-1 (`docs/build/streams/ENV-1.md`)
- **§6 owner question 1 is answered: yes.** Dry rooms go at the crown, the Rift station, the Divide dock and the district big stop. Stages 3a and 7 stand.
- **§3.6 row table:**
  - the **district row gets `restBase` and `wake`** (it becomes the district's rest and wake point);
  - **the staging office loses air and rest**;
  - the Canopy lab's `always` row gains `restBase` and `wake` if open item 3 is confirmed;
  - the content test that refuses rows on other hosts stays.
- **§3.6 stops:** `WorkingStop.air` is no longer a boolean bubble on any stop. Air comes only from rooms. The "old sphere" check (check 2) applies to **every** stop, not only the Rift.
- **§2.4 and §3.4 air proof:** the first-access proof must hold **without the nearby charging mooring**, since it's removed or relocated. It runs on the craft's own charge, its air line and a timed return with reserve. Power budget becomes part of the proof.
- **Restoration becomes a scenario, not a recipe line** (§2.4 "Restoring it changes it"). Decision 8 needs completed steps to persist. This touches design call 8 ("no new saved state"). Prefer modelling steps as staged facility facts, as the crown already does, so activation stays derived. The coordinator assigns the scenario design.
- **Tone, the tell/turn/keepsake approach and the dressing rules** are unchanged. Owner-facing descriptions of the late interiors stay general.

### GAME-DIRECTION (`docs/build/GAME-DIRECTION.md`)
- **"Waking up":** "the pod or the crown" becomes "the last of: a home (pod, workshop), a restored big stop's dry room, or the registered Creel cabin, that you rested at, while it works; otherwise the pod". Add the Canopy lab if open item 3 is confirmed.
- **"Restored service stops":** rename them **big stops**. They're earned through a unique per-place scenario; the payoff is a dry room plus power and services; each has its own architecture, surroundings, purpose and story. **No stop gives free air.** "Power is air."
- **Power sources and outposts:** charging moorings are sparse, at the start of long hard legs, never near a big stop. Outposts give power only (no air and no rest), as today.
- **New pacing bullet, "difficulty ramp":** the owner's levers in decision 7, with the 15–20 minute rule as the guard.
- **"Backtracking":** "Hubs and service points … stay easy to reach" becomes "homes and *restored* big stops stay easy to reach at a dock". Service points are sparse by design.
- **"Waiting",** "late-game needs inferred from evidence" and the tone grading are unchanged. Restoration scenarios follow them.

### Stops and survival code (for whichever stream the coordinator assigns)
- **`src/content/stops.ts`:**
  - retire `air: true` bubbles on `crown_station`, `rift_station`, `divide_dock` and `meridian_office`; air comes via `AirRoom` rows (ENV-1 3a);
  - `meridian_office` becomes service only;
  - rewrite the "Air and rest · …" `offers` strings.
- **`src/content/bases.ts`:**
  - remove `meridian_office`;
  - add the district big stop;
  - roomed bases read `wake` from their `AirRoom` row;
  - add `canopy_lab` if confirmed.
- **`src/sim/recovery.ts`:** wake chooses walking or swimming from the room, not from `y >= 0` (ENV-1 already plans this).
- **Restoration recipes** (`restore_rift_station`, `restore_divide_stop`, the crown stages): wrap them in per-place scenarios with persisted step completion (decision 8).
- **Moorings** (`src/content/regions/sites.ts`, `SERVICE_MOORINGS` in `stops.ts`):
  - remove or relocate `rift.cool_mooring`, `basin.anchorage` and `divide.lee_mooring`, and review `meridian.staging_shelf`, per the map session;
  - **rescue tows** currently must end at a repair mooring (`src/content/regions/access.ts` validators, recovery routes). Retarget them to the nearest restored big stop or home.
- **Site labels:** `isles.headland_shelter` and `basin.dish_shelter` carry the role `refuge` but grant no air. Relabel them or leave them, so the word "refuge" means a real rest point.
