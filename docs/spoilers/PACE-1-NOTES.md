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

**The problem today:** L14 is offered at C07, so C14 can be read before the district. Its line "one repair specialist cleared to wake" then pre-empts part of C13's reveal.

**Decision** (lore owner, 2026-10-24): **L14 moves from C07 to `district_controller`.** The canon's "feel perceptive" is meant for players who guess early, not for a corroborating record handed over early. Returning to the pod after the reveal is also a strong optional beat before the ending.

**How PACE-1 stage 2 implements it (F10):**
- **The lead:** L14's `offeredBy` becomes `district_controller`.
- **The plan:** `bp_pod_buffer` moves from C07's grants to `district_controller`'s. Left at C07, the recipe list would still point home early.
- **The lead's text still reads right:** "The cradle at the Divide was made for this pod. Its spare buffer should fit." The player saw the cradle at C07, so it's legible in hindsight.
- **Saves:** hint keys and open leads need no rule. The plan needs one narrow `LEGACY_GRANTS` row (`bp_pod_buffer` from C07) for saves that earned it before the move. It uses the same mechanism and rules as LS-1's planter-plan row. The coordinator composes it with the next schema step.

**The bot's read order:**
- **Stage 1** (no content change yet, so the lead is still at C07):
  - Creel: C14 on the forced return after the district records, so after C13.
  - Carrier: C14 on the yard visit, so before the district, as today's lead allows.
- **Stage 2, both routes:** C14 on the optional return between the works and the ending, so after C13 and the controller. The Creel goes home; the carrier sends the Mantle.

## F4: evidence for core and lattice (revision 1)

This follows the owner's rule that late-game needs are inferred from evidence, not handed over. The earlier proposal had the Rift ledger grant the power plan; it is withdrawn. Both materials now get physical evidence where they're found, and no record names a recipe or a quantity.

- **Lattice, at the Divide upper service dock (C07's site).**
  - **What's there:** a staging air housing from the expedition's deep-service stores, opened, with lilac lattice seal rings and two empty seal seats, under a weathered works tag.
  - **Canon fit:** the canon puts the deep-service route and the launch rail at this dock, so the housing is the expedition's own service hardware for gate maintenance. It was not prepared for the present repair; nobody left it for Ren.
  - **The tag:** a cryptic stencil, for example "AIR STAGING · RESEAL BEFORE DESCENT". It must not name the refuge, the beds or the six.
- **Core, at the Rift materials station.**
  - **What's there:** core cradles on the station's rack, two of them tagged for "works staging power", stand empty. The materials station supplied the works.
  - **Canon fit:** the canon's present repair has the player "bring independent temporary power/air". The plan arrives at C07, and the empty cradles are the earlier hint.
- **Optional rare line.**
  - **What it is:** a decoded line, for example in LS-1's mixing-line crew notes ("the air couplings sit dry; the brine ate the old seals; we wait on lilac"). Only by agreement with LS-1 and the lore owner.
  - **What it can't do:** explain the gate's history.
- **Story fit:** approved by the lore owner (2026-10-24). The housing is the expedition's own service hardware, not left for the player. The stencil stays cryptic. The optional line is LS-1's to write and place; it covers ecology and machinery only, never the gate's history, and is dropped if LS-1's notes have no room.
- **Lint:** the stencil ("AIR STAGING · RESEAL BEFORE DESCENT"), the cradle tag ("works staging power") and the proposed optional line all pass `LS-1-LORE.md`'s lint list, checked case-insensitive on whole words and on substrings. Stage 2's player-text test reads the same list.

F2's habitat sources and F3's ceramic liners: canon fit approved by the lore owner (2026-10-24).

## F3: the hall and food bay recipes

**The change:** resin is replaced by pressure ceramic in `restore_upper_hall` and `restore_food_module`.

**Canon fit:** the hall is the canon's "upper living area" and the food bay its "restored food-production module". Pressure-ceramic liners suit a 600 m hall, and resin (a Canopy float-bladder product) has no deep habitat.

**Text:** no story text changes.

## Player-text lint for PACE-1 additions

New player text consists of:
- the three habitat scan lines;
- the office bench's label;
- the two F4 fixtures' scan lines and tags, and any optional decoded line.

It follows `LS-1-LORE.md`'s lint list. It describes ecology and machinery only and never names occupants, beds, sleepers, waking, the six, or an order given at the gate. The recorder's new beat IDs (`works:*`, `resolution:complete`) carry no text.
