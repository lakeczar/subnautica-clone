# Opening and starting island: design (owner grill, in progress since 2026-10-22)

**Status:** settled decisions so far. Built as the **opening pass** after CW-1 and HUB-2 land, before the owner's first playtest. Research is in progress: `docs/research/STARTING-ISLAND-DESIGN.md` (art-direction options, exploration patterns).

## Settled
- **Distance:** the island moves **150–250 m** from the pod. The swim there is the first small expedition, and the area is a real place to learn the mechanics.
- **Time:** a skilled first-timer spends about **45–75 minutes** here before taking the Dart further out. All of it is discovery, with no padding.
- **Shape:** mountains are fine. The island must be **explorable and dense with detail**, not a peak plus a workshop.
- **Places:**
  - a beach landing;
  - a ridge trail to a **lookout** that can see the hub beacon;
  - an **abandoned field station** with the scientist's journal;
  - tide pools, a shallow lagoon, and sea caves (one dark, one with an air pocket);
  - a spring (scenery only, since there's no thirst);
  - the workshop in a sheltered cove;
  - on the reef between pod and island: a wreck, kelp, and small life to scan and catch.
- **Learning by discovery chains.** A record leads to a recipe, which needs resources, which lead to a tool that reveals a new need, which points to a place. For example, a survival manual or a scientist's journal describes a discovery, which leads to a lamp, which lets you reach a resource that a diary says lies in a cave. **Lead without hand-holding. Areas are not streamlined or obviously ordered.**
- **Hints:** the journal tracks **leads written as open questions** in the characters' words. There are no waypoints. The HUD objective shows the last lead you picked as a reminder only. General HUD direction is revisited in playtesting.
- **Return reasons:**
  1. a **sealed hatch** whose code comes from a **decode**;
  2. a **deeper flooded passage** under the island, reached with the 150 m suit.
- **Thread structure (A + C, owner 2026-10-22):** three overlapping threads (a survival manual, a scientist's field journal, a wreck and its crew's records), each with different outputs.
  - **Leaving:** you need the core thread plus **any one** of the other two. Each gives a different route to what the Dart needs.
  - **Unfinished threads** stay open leads, and later regions refer back to them, pulling the player home naturally.
- **Garden (owner 2026-10-22):** **not** on the starting island. The abandoned overgrown plot is a **mid-game** discovery, farther out. You take cuttings and seeds there, find the planter recipe, build your first planter at a base, and from then on grow food at home, with upgrades later. The starting island feeds you through gathering, fishing and cooking.
- **Art direction (owner 2026-10-22): A · Lifted Reef.** A raised coral-limestone (makatea) island: pale undercut domes over a black waterline notch, sinkholes, sea caves, a spring and a blue shaft. Plus saffron lichen on the windward crowns, terraces only inside the hidden garden, and one morning-mist moment. Full design, palette and blockout: `docs/research/STARTING-ISLAND-DESIGN.md` and `docs/research/starting-island/`.
- **Placement:** the island centre is at about world (−205, 0, −5), 205 m west-south-west of the pod. About 200 × 180 m of land, summit 55 m. The blockout has places, loops, shortcuts and sightlines.
- **The three threads (accepted):**
  - **Lamp** (survival manual in the reef wreck): glow sacs and glass, then the lamp, then the dark sea cave's cell cache.
  - **Scientist** (field station journal): spring, the air-pocket cave and the hidden garden, then repairing the station mast.
  - **Tide** (workshop log): a cutter, then clearing the fouled tide wheel, then the net and the trap.
- **The gate is visible, not a counter.** The workshop's feed board has two empty sockets and three labelled cables; any two powered threads let the workshop build the Dart. The third powers a charging cradle as a bonus.
- **The detail checklist:** keep all 33 items for the blockout; the owner cuts from screenshots.
- **The 150 m suit** moves later, after the Dart, from the Canopy expedition. That keeps the island's deep passage (the Under-Stair) a return reason.
- **Garden clarification:** the island's sinkhole is a **hidden overgrown garden to explore** (a place and a view, with a few seeds). The **mid-game plot** is where you learn the planter and grow your own food.
- **Mid-game timing (owner 2026-10-24):** the first planter arrives about **2.5–4 h** in (LS-1 places the plot on the hub spur). Past 4 h, a **notably better cultivation upgrade** follows, so home-grown supply keeps improving.
- **Coded doors (owner 2026-10-24):** a door locked by a decoded code opens by **clicking its keypad and typing the code on the keyboard**, not automatically. The decoded code is kept in the journal, so nothing has to be memorised.
- **Door puzzles (owner, 2026-10-24): more puzzles.** Most coded doors involve some deduction, e.g. part of the code in the environment at the door, or a log that points at something you've seen. The main path always stays solvable from logs; the first door teaches the mechanic with a straight code.
- **Routine places sit at the waterline.** The pod and the workshop cove (keyhole cove, workshop at +2 m on the slipway, craft dock and charging cradle) are reached by swimming or craft with no climbing. Up-hill places (station, lookout, garden) are discovery destinations, not daily stops.
  - **This is not a "no backtracking" rule** (owner 2026-10-22). It only means hubs and services stay easy to reach. **Purposeful backtracking is wanted:** a secret on the mountaintop or a locked spot that needs a key item or resource you only get or understand later. The player should get the "hmm, what does this mean?… Aha, I know where to go" moment, from what they've seen or read in logs. Gates must be legible in hindsight, not arbitrary. **Use only a few, spaced out, never back-to-back.** The principle: place key elements that make players wonder what to use there, and let the leads reveal it.
- **Dependencies:**
  - HUB-2 adds a surface mast or buoy light above the crown, in the far layer.
  - The Under-Stair (about 200 m, down to 140 m) uses the large-cave technology.
  - The decoder is available before the hatch matters.
  - The current workshop at (10, −36) and its ramp move to the cove.
