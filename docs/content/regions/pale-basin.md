# Pale Basin

Content bible, region file. Area `silt_basin`. Data: [`src/content/proposals/basin.ts`](../../../src/content/proposals/basin.ts) (typed, not wired). Index: [BIBLE](../BIBLE.md).

Coordinates are metres (x east, y up with water at 0, z north). ⟂ marks a point that needs new terrain or cave rock first, so it is not checked against today's floor. Everything else is checked against `worldFloor` by `tests/content-proposals.test.ts`.

## 1. Identity

- **Mood:** deliberate salvage. Wide, grey and quiet, with moving silt that rewards patience. Human remains of work are everywhere: dishes, frames, a dormitory, pump heads.
- **Palette:** shell-grey sediment and petrol frames, with restrained amber on dish rims. Bright ridge crests stand above darker silt, and the vaults are black with wakeglow trails.
- **Sound:** a slow hiss of sinking grains, metal ticking as frames settle, the plume lane's low roar. The sounding marker on the pale floor gives one faint beep, on a schedule.
- **First view:** past the lower Canopy crowns, three fallen survey dishes mark the Basin's edge (C04 lead), their rims catching what light reaches. Later the ridge vaults' square doorway appears under the wreck ridge, silt streaming off its lintel.

## 2. Landmarks

**Anchors (3)**

| ID | Status | At (x, y, z) | Merges with | What you see | Why you go |
| --- | --- | --- | --- | --- | --- |
| `basin.dish_field_anchor` | existing | 505, -262, -568 | site `basin.dish_field`, site `basin.dish_centre` | Three fallen survey dishes on a low ridge: one face-up, one tilted, one half-buried. | The Basin's bearing from every approach; the lee pocket is its quiet preparation spot. |
| `basin.ridge_anchor` | existing | 782, -247.8, -520 | site `basin.wreck_ridge`, vista `wreck.hull` | Tagged maintenance wreckage strung along a stable ridge, a broken hull and boom on its south end. | Bulk alloy and frames, and the ridge vaults beneath it. |
| `basin.pale_floor_anchor` | extend | 620, -381.5, -760 | site `basin.pale_floor`, site `basin.deep_marker` | The deepest bowl, bright rippled sediment under sinking-grain curtains; an automatic sounding marker still blinks, still logging. | The Basin's deep end and its most unsettling small detail. |

**Discovery clusters (8; 11 with the anchors)**

| ID | Status | At (x, y, z) | Merges with | What you see | Why you go |
| --- | --- | --- | --- | --- | --- |
| `basin.first_shelf` | existing | 178, -166, -218 | place `basin_dormitory`, story site `basin_service_rack` | A flooded dormitory below the first fallen dish; bundles face inward. | C05 and the service rack's Creel and carrier plans. |
| `basin.boundary_station` | existing | 216, -172, -240 | place `basin_boundary_station` | The station beside the southern dish; fractured slope, clear ridge fins above the silt. | C06 and its lead to the Rift. |
| `basin.keel_plate` | existing | 172, -199.3, -256 | tech record `basin_keel_plate`, source `basin_frame_terrace` | A pressure-ring plate on the fallen dish keel beside stacked tagged frames. | Dart refit plans and frames for every 350 m refit. |
| `basin.anchorage_terrace` | existing | 360, -240, -430 | site `basin.anchorage` | A broad terrace outside every plume lane, sized for the carrier. | The carrier's Basin home; the hub crown looms to the south. |
| `basin.comb_meadow` | new | 650, -295, -470 | site `basin.dish_field` | A field of silt combs standing in rows above the silt line, scavengers working between them. | Teaches 'combs mean stable ground'; spores for the planter. |
| `basin.tipped_housing` | new | 600, -291.8, -655 | site `basin.dish_south` | A dish's instrument housing that tumbled off the ridge and split, frames spilling out. | A frame patch outside the first shelf, and a cache. |
| `basin.vault_mouth` | new | 830, -291.2, -462 | `basin_ridge_vaults.north_mouth` | A square doorway under the ridge's north end, framed in old concrete, silt streaming off its lintel. | The main way into the ridge vaults. |
| `basin.pump_heads` | new | 240, -260.2, -760 | `basin_west_rim_cut` | A grid of capped pump heads on the west rim, pipes running into the sediment, one cabinet still sealed. | The region's lost site, the west rim cut and the Rift approach. |

## 3. Caves

**Cave style:** Silt-buried vaults: half-natural, half-cut chambers in sediment-cemented rock, their floors soft and their doorways square. Still water, grey glow at the mouths, and wakeglow drift that lights your own trail back.

**Cave resident:** `wakeglow_drift` (Wakeglow drift). Faint drifting plankton in still vault water. Anything moving through leaves a glowing wake that fades over about 60 s: your own trail back out.

Basin caves are silt-buried vaults: half natural, half cut, with square doorways, soft floors and still water. Wakeglow drift is the region's cave rule: your own wake glows behind you for a minute, so the way back is lit. The **ridge-south** network (the burrow warren) is the vaults' back entrance, and the **west-rim** network joins the rim pipes to the rim cut toward the Rift.

**Small caves (5)**: diver-only, 10–25 m of water.

| ID | Mouth (x, y, z) | Footprint | Depth m | Network | Layout | Contents | Links |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `basin_culvert_north` | 410, -268.9, -495 | 398..422 × -507..-483 | 262–274 | — | A buried 20 m intake culvert near the north dish; square, silted floor, grounding fins on its walls. | Crust on unsilted culvert fins | — |
| `basin_burrow_warren` | 800, -296, -690 | 788..812 × -702..-678 | 290–304 | ridge_south | Scavenger burrows widened into a 20 m crawl; it breaks into the ridge vaults' settling tanks. | Scavenger den (they back away) | `basin_ridge_vaults.burrow_entry` **back entrance → `basin_ridge_vaults`** |
| `basin_buried_hut` | 560, -381.7, -770 | 548..572 × -782..-758 | 376–382 | — | A survey hut swallowed to its roofline; the door is a slot you swim down into a 10 m room. | A survey lens spare (survey range +30% for one station) | — |
| `basin_fracture_pocket` | 300, -212.4, -365 | 288..312 × -377..-353 | 206–218 | — | A 14 m pocket opened by the same slope fractures the boundary station recorded. | Fresh fracture faces to scan | — |
| `basin_rim_pipes` | 274, -270.3, -830 | 262..286 × -842..-818 | 262–274 | west_rim | Two broken pipe sections half-buried in the rim, joined by a crawl to the rim cut. | Pipe-wall crust | `basin_west_rim_cut` |

**Medium caves (2)**: 30–80 m, a loop with two or more exits; the main hall takes the craft listed.

| ID | Mouth (x, y, z) | Footprint | Depth m | Hall admits | Layout | Contents |
| --- | --- | --- | --- | --- | --- | --- |
| `basin_dish_lee_vault` | 540, -299, -640 | 510..570 × -680..-630 | 290–340 | medium | 50 m: an eroded cliff mouth below the south dish into a broad chamber a Creel can park in, with a diver-only alcove and a second mouth on the pale-floor slope. | Silt shelter and salvage workspace; The dish rim seen from inside the mouth |
| `basin_west_rim_cut` | 230, -261.1, -810 | 200..260 × -850..-790 | 255–300 | small | 60 m extraction cut: a square-walled trench roofed over by slumped sediment, two chambers, opening west toward the Rift's cool shelf. | Cut walls showing the worked layers; A sheltered approach to the Rift |

**Cave biome:** the [Ridge vaults](../caves/basin-vault-complex.md) (`basin_ridge_vaults`), main path, under the wreck ridge. They hold the pump hall stop with its frame press, and the instrument vault's archive.

## 4. Creatures

| Species | Role | Status | Cave-dweller | Where | Noise | Light |
| --- | --- | --- | --- | --- | --- | --- |
| `basin_scavengers` Basin scavengers | cue | existing | no | Wreck ridge, comb meadow, the burrow warren | Retreat from loud machinery. | Indifferent. |
| `reef_school` Reef school | benign | existing | no | Small groups over clear ridges only | Tightens and turns away from a boosting craft. | Gathers loosely at the edge of a lamp cone at night. |
| `silt_combs` Silt combs | cue | research | no | Comb meadow and the vault tank rims | None. | None. |
| `wakeglow_drift` Wakeglow drift | cue | new | yes | Still water in every vault and culvert. Cave resident; lights your own trail. | Craft wakes glow brighter and wider. | Invisible in a lamp cone; the trail reads best lamp-off. |

No threat, on purpose. The research warned against filling the Basin's gaps with another hunter; the silt is the hazard. Silt combs (research-named) give it sessile life that marks stable ground.

## 5. Resources

- **Required here, outside caves:** loose survey salvage (alloy) and survey fins (crust) on the first shelf, three tagged-frame stacks, and S2's ridge panels, bulk frames and dish fins.
- **New exterior patches:** a fourth tagged-frame spill at the tipped housing, so frames are not only on the first shelf, and pump-head alloy on the west rim.
- **Rare early samples:** four fired ceramic liners and one heater core in the vaults' pump hall. These are human salvage, a plausible early taste of Rift materials.
- **Cave-favoured:** heavy crust on vault and culvert fins, and loose rack alloy in the settling tanks.
- **Seeds:** pale crust spores in the comb meadow (SYS-2's Basin seed, second patch; specimen sampling).

| ID | Kind | Item | At (x, y, z) | Stock / bundle / reserve | Renews | Cave | How you read it |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `basin_vault_liner_ceramic` | frontier sample | `pressure_ceramic` | 790, -292, -545 ⟂ | 4 / 1 / 0 | no | `basin_ridge_vaults` | Pale fired liners stacked by the pumps: the same ceramic the Rift's lips carry. |
| `basin_vault_heater_core` | frontier sample | `thermal_core` | 788, -292, -535 ⟂ | 1 / 1 / 0 | no | `basin_ridge_vaults` | One salvageable heater core in a dead pump. |
| `basin_vault_fin_crust` | cave favoured | `conductive_crust` | 800, -282, -470 ⟂ | 12 / 2 / 0 | no | `basin_ridge_vaults` | Fins stand clear of silt in still water: heavy crust. |
| `basin_tank_rack_alloy` | cave favoured | `structural_alloy` | 830, -318, -650 ⟂ | 16 / 4 / 0 | no | `basin_ridge_vaults` | Loose rack panels inside the settling tanks. |
| `basin_culvert_crust` | cave favoured | `conductive_crust` | 410, -270, -498 ⟂ | 8 / 2 / 0 | no | `basin_culvert_north` | Fins on the culvert walls stay clean of silt. |
| `basin_meadow_spores` | seed | `seed_pale_spore` | 650, -295, -470 | 3 / 1 / 0 | no | — | Soft spore mats on comb bases; they tear unless sampled gently. |
| `basin_housing_frames` | exterior | `tagged_frame` | 600, -291.8, -655 | 2 / 1 / 0 | no | — | Tagged frames spilled from the split housing; a fourth frame patch away from the first shelf. |
| `basin_pump_head_alloy` | exterior | `structural_alloy` | 240, -260.2, -760 | 12 / 4 / 6 | no | — | Tagged cap plates lifted off the pump heads. |

## 6. Side rewards and lost site

| ID | Kind | At (x, y, z) | Reward |
| --- | --- | --- | --- |
| `basin.pump_hall_stop` | service | 790, -290, -540 ⟂ | Restored: charging, rest, and a frame press that strips tagged frames on site, so frames never need hauling to the islands. |
| `basin.housing_cache` | cache | 600, -291.8, -655 | Two reserve cells and a sealed sample case of crust. |
| `basin.plume_shelter` | shortcut | 800, -296, -690 | A back way through the vaults that keeps a diver out of the plume lane on the ridge's south end. |

**Lost site `basin.pump_heads_site`: Pump-head field** at 240, -260.2, -760. A sealed field cabinet on the central pump head. It is found without decoding; its records stay unreadable until decoded.

- Decode `basin_pumphead_log` (log): unlocks `basin_pumphead_cabinet`.
  - Plans: `bp_chart_fix`.
  - Map reveals: West rim cut (site, `basin_west_rim_cut`, 60 m); Materials station (stop, site `rift.materials_station`, 60 m).
  - Logs: Two seasons of extraction quotas, each higher than the last. Pump pressure logs with notes about the sediment 'settling oddly'. A crew request to slow the west rim pumps, marked as declined.

**Lost site `basin.instrument_vault`: Sealed instrument vault** at 805, -300, -600 ⟂, inside `basin_ridge_vaults`. A sealed vault door in the ridge vaults with a tag light still blinking. It is found without decoding; its records stay unreadable until decoded.

- Decode `basin_vault_archive` (archive): unlocks `basin_vault_terminal`, `basin_vault_profiles`.
  - Plans: `bp_outpost_advanced`.
  - Map reveals: Cool flank mooring (stop, site `rift.cool_mooring`, 60 m); Inactive shoulder (site, site `rift_core_shoulder_north`, 60 m).
  - Logs: Instrument calibration records for the whole Basin array. A set of brine profiles from the extraction ridge, filed without comment.

Canon fit: the pump-head field is the extraction along the Basin's ridge, physical and logged. It corroborates the field-shelter records without replacing them. The instrument vault holds calibration and brine profiles filed without comment. Details are in the [spoiler appendix](../../spoilers/CONTENT_BIBLE_LORE.md).

## 7. Cycle candidates

| ID | Cycle | Period / active s | What it is for | Alternative | Verdict | Honest note |
| --- | --- | --- | --- | --- | --- | --- |
| `basin.sediment_lane` | Plume lane surge | 100 / 16 | Existing (C3 basin_sediment_lane): the lane floor lifts in a grey wall; scavengers retreat first. | Cross outside the lane, or wait in the settling-tank shelter. | existing | Keep. The vaults give it a better reason: shelter in the dark while the surge passes outside. |

## 8. Pacing check

Skilled first-time play: **about 85 minutes on the main path, 125 with the optional content here**, summed over every visit.

| Minute | Something new | Kind |
| --- | --- | --- |
| 0 | First shelf: the dormitory's inward bundles (C05) | story |
| 12 | Boundary station sediment record (C06) | story |
| 22 | Keel plate and the first tagged frames | tool |
| 34 | Anchorage terrace and the dish field | area |
| 46 | Dish-lee vault: shelter in the silt | area |
| 56 | Wreck ridge, scavengers and the plume lane | discovery |
| 66 | Ridge vaults: wakeglow trails in the dark | area |
| 76 | Restore the pump hall stop | tool |
| 86 | Instrument vault archive decoded | discovery |
| 96 | Pale floor and the sounding marker | area |
| 106 | Pump-head field lost site | discovery |
| 116 | West rim cut toward the Rift | area |

The Basin is the longest early-mid region: about 85 minutes on the main path and 125 with optional content. The first shelf is the Act II centre; the far Basin opens with the 350 m refits. Restoring the pump hall is the pacing win, because frames stop needing a round trip to the islands.

## Builder notes

- The vault domain lies under the ridge's existing sources, sites and vistas. LC must keep at least 6 m of rock under them (the test checks the zones' depths against today's floor).
- The plume lane (C3 `basin_sediment_lane`) passes just south of the vaults; keep it bound to one composed field.
- The frame press makes `strip_frame` available at a second site. That is a registry recipe-site change for the coordinator, not a new recipe.

