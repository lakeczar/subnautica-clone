# PACE-1: canon notes (spoilers)

**MAJOR STORY SPOILERS: writers and integration agents only.** This companion to `docs/build/streams/PACE-1.md` holds the canon reasoning behind its late-game fixes. It reads against `NARRATIVE_CANON.md` and `LS-1-LORE.md`.

## The finale the canon describes, and what the build does

**What the canon says** (*Ending and implementation limits*): the finale "recombines established skills". It names five:
- reading animal and current cues to cross a disturbed channel;
- bringing an appropriate vessel;
- collecting known habitat-specific repair stock;
- staging independent air and power;
- operating the hydraulic bypass before reopening the human route.

**What the build does:** it implements staging and the bypass (the gate panel's procedure), and nothing else. The repair stock is hauled from home, about 3.5 km back, which is the opposite of "habitat-specific".

**What PACE-1 changes:**
- **F2** makes "collect known habitat-specific repair stock" literal. The district's own habitats supply it, read by the rules the player learned at home:
  - **Membrane:** filter colonies at the settlement's seawater intakes, the same rule C02 teaches. They're the native filter communities the canon puts at the heart of the disaster.
  - **Glass:** it collects where the outflow scours, through the turbines the flooding diverted.
  - **Crust:** it grows on the supply pylon's grounding fins.
- **F8**, if CY allows, is the "disturbed channel": the outflow current, crossed by reading the glimmers.
- **Act V's wording fits.** The canon's "Prepare habitation, route power and air" plays as a district expedition rather than a haul.

## The pod record (C14) and order

**Its role:** C14 resolves elapsed time and the memory loss, and "coordinates final preparations". Its critical fact, F18, is also supported by `district_controller` ("Day 2,678", "repair specialist dispatched", "regulator fault logged on ascent"). So C14 is a corroborating source, and the ending loses no critical fact without it.

**When it can be read:**
- **Already possible early:** its lead, L14, is offered at C07, so reading C14 before the district is possible today.
- **What early reading costs:** C14's line "one repair specialist cleared to wake" pre-empts part of C13's reveal when read before C10 and C13.
- **The canon accepts out-of-order reading:** "present a recovered record immediately even out of order"; "a player who guesses early should feel perceptive".

**What the plan's bot does** (the bot route is a sensible player, not a prescription):
- **Stage 1, Creel:** C14 on the forced return after the district records, so after C13.
- **Carrier, both stages:** C14 on the yard visit after the Divide, so before the district.
- **Stage 2, Creel:** C14 on the chosen home visit between the Divide and the district, so before the district.

**The lore owner's call, not PACE-1's:** keep L14 at C07, or move its offer to a district record (C13 or `district_controller`) so the lead points home after the reveal. Pacing works either way. If the lead moves, PACE-1's stage 2 bot reads C14 between the works and the ending. That is one optional return of about 27 min, with beats at both ends.

## F4: the power plan at the Rift ledger

**The change:** `rift_station_ledger` already grants `bp_deep_service` and `bp_rift_pressure`. Adding `bp_service_power` lets the materials station's ledger list the works' portable power assembly, built from the core the station supplied.

**Canon fit:** the present-day repair has the player "bring independent temporary power/air", and the plan arriving two regions early is preparation in Act III's sense ("Preparation and return routes become meaningful").

**What it doesn't touch:** no fact changes, and the ledger text needs no mention of the refuge, the beds or the six. If a ledger line is added, it names only "the district works' staging power".

## F3: the hall and food bay recipes

**The change:** resin is replaced by pressure ceramic in `restore_upper_hall` and `restore_food_module`.

**Canon fit:** the hall is the canon's "upper living area" and the food bay its "restored food-production module". Pressure-ceramic liners suit a 600 m hall, and resin (a Canopy float-bladder product) has no deep habitat.

**Text:** no story text changes.

## Player-text lint for PACE-1 additions

New player text consists of:
- the three habitat scan lines;
- the office bench's label;
- any ledger line for F4.

It follows `LS-1-LORE.md`'s lint list. It describes ecology and machinery only and never names occupants, beds, sleepers, waking, the six, or an order given at the gate. The recorder's new beat IDs (`works:*`, `resolution:complete`) carry no text.
