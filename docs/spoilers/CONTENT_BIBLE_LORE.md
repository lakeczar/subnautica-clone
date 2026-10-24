# Content bible: lore tie-ins

**MAJOR STORY SPOILERS: writers and integration agents only.** This is the companion to [NARRATIVE_CANON](NARRATIVE_CANON.md), which wins on any conflict. Owner-facing files ([docs/content/](../content/BIBLE.md), the proposal data, IDs, labels and player strings) stay twist-free. This file says what each lost site, decode and cue means, and what it must never say.

## Rules every lost site follows

1. **No human-authored entry is dated after disaster day.** Nobody was awake for the seven years and four months. The only post-disaster records are automatic instruments run by the refuge's maintenance controller.
2. **No lost site names the six, counts the population, or mentions suspension, beds or a refuge below.** Those belong to C05, C08, C10, C13 and C15 and their tiers.
3. **No lost site carries Ren's order or the gate's pressure trace.** Those belong to C09 and C12.
4. **Every decode is optional and `story: false`.** A lost site may corroborate a clue or foreshadow one, but never replace it. Missing it costs nothing essential.
5. **Casualty accounting stays exact:** 20 dead in the initial failures, 6 beyond the gate. No lost site adds or implies other deaths.
6. **The cause stays physical and regional:** storm, weakened slope, brine saddle breach, misread warnings and extraction. No collective mind, no infection, no monster.

## Lost sites and decodes

| Lost site / decode | When written, by whom | What it knows | Ties to canon | Reveal tier |
| --- | --- | --- | --- | --- |
| `reef.pumphouse_site` / `reef_pumphouse_log` | Expedition years 1–2; the intake crew | The intake ran clean, fans colonised its mouth, and the crew moved it to the ribs | C02's filter colonies beside the intake; the expedition's early optimism (chronology step 1) | T1, optional |
| `isles.strain_gauges` / `isles_strain_gauge_log` | Two years before to disaster day hour 0; island slope technicians | Strain on the stack's west flank climbing for two years; recalibrations calling it drift; a last request for a review. The logger dies when the slope fails. | The storm-loaded slope collapse that destroyed the long-range mast (step 3); warnings mistaken for faulty instruments. Corroborates C06 and foreshadows C11. | T2 reading, optional |
| `isles.tide_store` / `isles_tide_store_fragment` | Disaster day, about hour 2; the yard shift | Loads staged for departure, then left. The shift note's last line reads "Recalled. Leave the loads." and does not say where to. | C03's unspent supplies. The yard crew went inward to the deep refuge (step 4). This is a fourth, soft foreshadow of purposeful inward movement beside C05; it is not one of the three canonical refuge foreshadows. | T1, optional |
| `canopy.basket_site` / `canopy_basket_log` | A season before the disaster; tether crew | Small fish moving up out of the lower channel; the hunter nicknamed "the singer" | C04's fauna avoiding dense lower water: an independent, offhand corroboration | T1, optional |
| `canopy.root_specimen_store` / `canopy_roots_store_archive` | Expedition years 5–8; laboratory technician | Root colonies concentrating dense water and leaving crystal crusts, with growth rates | The canon's ecological chain: native filter communities move and concentrate dense brines. It is chemistry and ecology, never intelligence (no collective mind). The salt-sweat hollow's lattice is the physical proof. | T2 reading, optional |
| `basin.pump_heads_site` / `basin_pumphead_log` | Two years before the disaster to its eve; extraction crew | Rising quotas, sediment "settling oddly", and a declined request to slow the west rim pumps | Extraction along the basin's supporting sediment ridge (step 2). Corroborates C11's extraction surveys **without** settling Mara's share of responsibility. | T2, optional |
| `basin.instrument_vault` / `basin_vault_archive` | Expedition years 7–9; instrument staff | Calibration records showing the Basin array within tolerance, and brine profiles from the extraction ridge filed without comment | Quietly proves the "faulty" readings were real: the misread-warnings thread, as physical record | T2, optional |
| `rift.borehole_site` / `rift_borehole_log` | Expedition years 6–9; core drilling crew | Vent heat piped into a field hut; a tube sketched east "to the cold" | Ordinary industry; the seam rumour. The fin crate "labelled for shipment south" echoes the materials station's crated service rings bound for the district (S5 placement). | T1, optional |
| `divide.mixing_site` / `divide_mixing_log` | Two years before to disaster day; Divide sensor crew | Dense-water spikes flagged, then sensors replaced as faulty; sails changing lanes | Misread warnings (canon "Writer's truth", step 2). Sails shifting lanes is the ecological cue the crew ignored. | T2, optional |
| `meridian.allotments_site` / `meridian_allotment_log` | Up to the disaster's eve; district residents | A rota, a complaint about night lamps, a crop marked ready and never collected | Everyday life in the settlement (step 1); the uncollected crop is disaster day. **Lore-owner option, default off:** Ren's name appears once in the rota. That only shows Ren lived here, which C07's tool seal already establishes. Never use any of the six's names. | T1, optional |
| `hub.beacon_house` / `hub_beacon_archive` | Expedition years 1–9; navigation staff | The basin beacon plan, and which beacons failed first | The saddle-side beacons failed first on disaster day: the breach's geography, readable only in hindsight | T1, optional |

## Cues and set dressing with a hidden meaning

| Proposal | What the player sees | What it means | Constraint |
| --- | --- | --- | --- |
| `basin.pale_floor_anchor`: the sounding marker "still logging" | An automatic marker beeping on a schedule | Part of the refuge controller's exterior measurement network. Repeated measurements established the safe upper-water route that triggered the pod's dispatch (step 6). | Its sample counter may read about 2,680 daily samples (about 7.3 years) for a perceptive player to work out. Never show a date or a dispatch flag: C14 resolves elapsed time and dispatch. |
| `cable_tender` chains in Meridian's cut voids | Animals gathering only on lines that still carry current | The controller and refuge machinery still draw power; the chains lead toward the gate hall, the service window and the works | They may cluster on the service window's feed. They never pass through the machinery boundary or reveal the inner hall. |
| `rift_divide_seam.brine_galleries`: the steady artificial current | Water flowing through the galleries from the gateworks | The surviving turbine diversion's outflow (step 4; C12's turbines "still turning in the diverted flow") | Shows deliberate machinery still running. It must not say what the machinery protects. |
| `rift_divide_seam.cold_junction`: gallery drainage record | A drainage schematic routing outflow to the turbine hall | A second, exterior lead to C12 (recovery redundancy) | A schematic only. No pressure trace, no voices, no order. |
| `isles.slump_scar` | A raw bite out of the stack's west flank | The disaster's first physical failure, directly below the torn mast | Environmental evidence only. Mast repair stays the epilogue's rescue-communication thread. |

## What stays the lore owner's

- **Meridian's deep interiors** (upper hall, transfer hall, annex, gate hall, service window, inner hall) stay with the story structure. The bible's Meridian caves are exterior cut voids that never enter them.
- **The cast pass** names the voices in the logs. Until then, logs are signed by role.
- **New lost sites** added later follow the six rules above and get a row here, not in owner-facing files.

## Creature lore (CB-2)

The field guide and found notes ([FIELD-GUIDE](../content/FIELD-GUIDE.md)) are deliberately story-light. These are the only canon touches; every rule above still holds (nothing dated after disaster day, no counts, no gate, no suspension).

| Note / entry | Who and when | Canon touch | Constraint |
| --- | --- | --- | --- |
| `note_trapper_tally` (tide store, after decode) | Tavi Orr, Season 8 | Tavi kept trap pots with the yard spares: a maintenance diver's ordinary side job, and a human beat before the player meets Tavi's later notes. | Signed "T. Orr" only. Never mention a partner, the six or the gate. |
| `note_reef_season`, `note_basin_tray` | Mara Sen, Season 2 and D−210 | Mara's field method (timing animals) continues her existing voice: "I time this" echoes her tray note about the fans. | Ecology only. No extraction, brine or prediction content: those belong to C06, C11 and her journals. |
| `note_allotment_margin` | Allotment rota, D−3 | The last ordinary days in the district, like the uncollected crop. | No names from the six; no mention of the refuge or of transfers. |
| `note_office_board`, `note_dock_board`, `note_station_margin`, `note_lab_feeding_card` | Shift boards, D−96 to D−12 | People lived and worked alongside the threats and knew their rhythms; the windows are old crew knowledge, not new magic. | Practical only. |
| `pale_drifter` falls | Never seen alive | Ordinary deaths of an open-water animal; the newest Basin fall is "this season" in the pump crew's note, i.e. before the disaster, so years-old by the campaign. The present-day state (scavengers still on it, hide still hanging) is plausible for a giant fall in cold deep water. | Never tie a fall to the disaster or to the extraction. |
| Threat windows | Field guide and boards | Behaviour of animals, unchanged by the disaster. | No threat is described as changed, angered or caused by people. |
| `cable_tender` | Field guide | "Live lines" stay the cue from the bible: the district still draws power. | As before: never through the machinery boundary. |
