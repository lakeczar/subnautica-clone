# Meridian District

Content bible, region file. Area `deep_district`. Data: [`src/content/proposals/meridian.ts`](../../../src/content/proposals/meridian.ts) (typed, not wired). Index: [BIBLE](../BIBLE.md).

Coordinates are metres (x east, y up with water at 0, z north). ⟂ marks a point that needs new terrain or cave rock first, so it is not checked against today's floor. Everything else is checked against `worldFloor` by `tests/content-proposals.test.ts`.

## 1. Identity

- **Mood:** a deep settlement where people lived: neighbourhoods, gardens and rotas, not only machinery. Tense and dark, with small kept lights.
- **Palette:** shell mechanical planes and petrol voids, with a limited rhythm of amber service lights. Biological mint (cable tenders, combs) stays below the navigation lights.
- **Sound:** pressure creaks, the choir's hum swelling and falling, and a faint electrical whine where cables still carry current.
- **First view:** from the staging shelf edge, the terraces in arcs, the spire's lit crown, and the works far below.

## 2. Landmarks

**Anchors (3)**

| ID | Status | At (x, y, z) | Merges with | What you see | Why you go |
| --- | --- | --- | --- | --- | --- |
| `meridian.spire_anchor` | existing | 1215, -535, -1319 | site `meridian.spire` | A lit crown clearing the terrace edge, the district's only steady light. | The bearing on every Meridian sortie. |
| `meridian.gallery_mouths` | existing | 1298, -597, -1135 | site `meridian.gallery_north`, site `meridian.gallery_south` | Two service gallery mouths: a stepped apron to the north, an offset gantry to the south. | The district's doors, and the choir's home. |
| `meridian.works_facade` | existing | 1400, -770, -1530 | site `meridian.deep_works`, vista `works.gantry` | The works facade and gantry at the bottom terrace, framed from above. | Where the investigation ends. |

**Discovery clusters (9; 12 with the anchors)**

| ID | Status | At (x, y, z) | Merges with | What you see | Why you go |
| --- | --- | --- | --- | --- | --- |
| `meridian.staging` | existing | 1080, -520, -1160 | site `meridian.staging_shelf`, site `meridian.staging_office`, site `meridian_service_cache` | A broad shelf with carrier fittings, an office with an air lock, a sealed maintenance cage. | The last stop, on both routes. |
| `meridian.overlook` | new | 1130, -521, -1180 | site `meridian.staging_shelf` | The terraces all at once: arcs of dark buildings stepping down, the spire light, the works far below. | The district's first view; the place to plan a sortie. |
| `meridian.gallery_south_mouth` | existing | 1000, -597, -1406 | site `meridian.gallery_south` | The offset-gantry mouth. | The second way down. |
| `meridian.archive_steps` | existing | 1279, -679, -1396 | site `meridian.archive_terrace` | A square archive building on the third terrace. | Records and a quiet terrace between galleries. |
| `meridian.cut_strata` | existing | 1170, -604, -1396 | site `meridian_cut_ceramic` | Pale ceramic strata in a terrace cut, old work lamps still burning. | Repair ceramic close to the work. |
| `meridian.escarpment_post` | existing | 1346, -502.3, -880 | site `meridian.escarpment_survey`, vista `escarp.ring` | A survey post and a broken ring on the outer escarpment. | The start of the deep return toward the Canopy. |
| `meridian.escarpment_end` | existing | 1364, -505, -1000 | site `meridian.escarpment_foot` | The escarpment ledge meeting the district's north edge. | The return route's district end. |
| `meridian.allotments` | new | 1150, -600, -1250 | site `meridian.spire` | Rows of planter troughs on the second terrace, gone wild with staple cups, a rota board on a post. | The district's lost site, and food at depth. |
| `meridian.cable_run` | new | 1330, -703.4, -1470 | site `meridian.archive_terrace` | A bundle of cables down the terrace wall, beaded with pulsing cable tenders. | A living trail toward the lower works; alloy from the fallen trays. |

## 3. Caves

**Cave style:** Cut voids: square foundation galleries and cable culverts where the settlement's builders cut into natural terrace rock, half masonry and half stone. Dead lamp brackets every few metres; living cable tenders trace the lines that still carry power.

**Cave resident:** `cable_tender` (Cable tenders). Soft coiling animals that gather on old cables and pulse slowly. They gather only where a line still carries current, so their chains trace live lines through dark voids.

Meridian's cave style, chosen by the lore owner: **cut voids**. These are foundation galleries and cable culverts where builders met natural rock. Cable tenders gather only on lines that still carry current, so their chains trace live power through the dark. That is an honest, implementable cue that also deepens the district's central question. Meridian's story interiors stay with the story structure; nothing here enters them.

**Small caves (5)**: diver-only, 10–25 m of water.

| ID | Mouth (x, y, z) | Footprint | Depth m | Network | Layout | Contents | Links |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `meridian_footing_void` | 1050, -520, -1225 | 1038..1062 × -1237..-1213 | 518–530 | — | A 15 m foundation gallery under the shelf edge, square and dry-walled, with a service alcove. | Service alcove (cache) | — |
| `meridian_culvert_north` | 1240, -600, -1180 | 1228..1252 × -1192..-1168 | 596–606 | north_terrace | A 20 m cable culvert under the first terrace, tenders strung along one live line. | Crusted cable trays | — |
| `meridian_spire_footing` | 1190, -600.1, -1350 | 1178..1202 × -1362..-1338 | 596–610 | — | A 14 m void under the spire's base, the spire's feed cables running through. | The spire's live feed, traced by tenders | — |
| `meridian_escarp_pocket` | 1330, -505.5, -930 | 1318..1342 × -942..-918 | 500–512 | — | A 12 m natural pocket in the escarpment, a survey bolt line in its wall. | A rest pocket on the return ledge | — |
| `meridian_terrace_crack` | 1100, -600, -1460 | 1088..1112 × -1472..-1448 | 596–640 | — | A 16 m crack where the second terrace wall split, a diver's shortcut down toward the third. | Shortcut between terraces | — |

**Medium caves (2)**: 30–80 m, a loop with two or more exits; the main hall takes the craft listed.

| ID | Mouth (x, y, z) | Footprint | Depth m | Hall admits | Layout | Contents |
| --- | --- | --- | --- | --- | --- | --- |
| `meridian_window_gallery` | 1010, -520, -1290 | 980..1040 × -1320..-1260 | 520–610 | small | 60 m lateral cliff gallery in the first terrace wall: a wide window facing up the clear lane, one descending room, a lower mouth on the second terrace. | Ceramic in the cut walls; A protected work pocket with a view |
| `meridian_escarp_culvert` | 1370, -509.6, -960 | 1350..1400 × -985..-940 | 500–560 | small | 50 m: a drainage culvert cut through the escarpment's foot, two chambers, an upper mouth onto the return ledge. | The exterior return ledge revealed |

## 4. Creatures

| Species | Role | Status | Cave-dweller | Where | Noise | Light |
| --- | --- | --- | --- | --- | --- | --- |
| `hollow_choir` Hollow choir | threat | existing | no | North gallery and its terrace (existing territory) | Primary sense. | Weak secondary sense. |
| `basin_scavengers` Basin scavengers | cue | existing | no | Stable exterior service ledges; no surge here | Retreat from loud machinery. | Indifferent. |
| `silt_combs` Silt combs | cue | research | no | Clear exposed terrace cuts | None. | None. |
| `cable_tender` Cable tenders | cue | new | yes | Every cut void and the cable run. Cave resident; traces live lines. | Uncoil and drift a metre off at loud machinery. | Pulse faster under a lamp. |

The hollow choir stays the one threat (a sessile colony). Scavengers and combs keep peaceful life outside its reach, as the research asked.

## 5. Resources

- **Required here:** none new (canon and integration contract). Terrace-cut ceramic and the staging cache remain the finite repair stock.
- **New exterior patches:** wild allotment cups (food at depth) and fallen cable-tray alloy.
- **Cave-favoured:** crust on live cable trays and ceramic in the window gallery's cut walls.
- **Seeds:** staple cup cuttings from the allotments. The settlement grew the same food you do.

| ID | Kind | Item | At (x, y, z) | Stock / bundle / reserve | Renews | Cave | How you read it |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `meridian_culvert_crust` | cave favoured | `conductive_crust` | 1240, -602, -1182 ⟂ | 8 / 2 / 0 | no | `meridian_culvert_north` | Crust grows on trays that still ground a live line. |
| `meridian_window_ceramic` | cave favoured | `pressure_ceramic` | 1010, -560, -1290 ⟂ | 10 / 2 / 0 | no | `meridian_window_gallery` | The builders cut through ceramic strata; it shows in the walls. |
| `meridian_allotment_meal` | exterior | `meal` | 1150, -600, -1250 | 8 / 2 / 0 | no | — | Staple cups gone wild in the planter troughs. |
| `meridian_allotment_cuttings` | seed | `seed_staple_cup` | 1152, -600, -1246 | 3 / 1 / 0 | no | — | Runners spilling from the troughs. |
| `meridian_cable_alloy` | exterior | `structural_alloy` | 1330, -703.4, -1470 | 10 / 4 / 6 | no | — | Tagged trays fallen from the terrace wall. |

## 6. Side rewards and lost site

| ID | Kind | At (x, y, z) | Reward |
| --- | --- | --- | --- |
| `meridian.service_alcove` | cache | 1050, -520, -1225 | Two reserve cells and a spare air-line reel in a tidy service alcove, with a view across the terraces. |
| `meridian.return_ledge` | shortcut | 1370, -509.6, -960 | The culvert's upper mouth reveals the exterior return ledge toward the Canopy escarpment. |
| `meridian.terrace_view` | view | 1130, -521, -1180 | The whole district at once, before descending. |

**Lost site `meridian.allotments_site`: Terrace allotments** at 1150, -600, -1250. A rota board with a sealed data tag on the allotment post. It is found without decoding; its records stay unreadable until decoded.

- Decode `meridian_allotment_log` (log): unlocks `meridian_allotment_tag`.
  - Plans: none (maps and logs only).
  - Map reveals: Escarpment culvert (site, `meridian_escarp_culvert`, 60 m); Terrace window gallery (site, `meridian_window_gallery`, 60 m).
  - Logs: A planting rota with names in rotation and small complaints in the margins. A note that the night shift's lamps keep the garden awake. The last entry's crop is listed as 'ready', never collected.

Canon fit: the allotment rota is everyday pre-disaster life. Its last crop was marked ready and never collected. It adds people, not plot. Details are in the [spoiler appendix](../../spoilers/CONTENT_BIBLE_LORE.md).

## 7. Cycle candidates

| ID | Cycle | Period / active s | What it is for | Alternative | Verdict | Honest note |
| --- | --- | --- | --- | --- | --- | --- |
| `meridian.choir_rest` | Choir rest | 50 / 8 | Existing behaviour (S4 refractory): after a pulse the bells close and stay quiet for a while. | Quiet coasting, leaving the reach or an acoustic distraction. | existing | Not a natural cycle to add; listed so nobody adds one on top. |

## 8. Pacing check

Skilled first-time play: **about 100 minutes on the main path, 135 with the optional content here**, summed over every visit.

| Minute | Something new | Kind |
| --- | --- | --- |
| 0 | Staging shelf: the last stop | area |
| 10 | Shelf edge: the district at once | discovery |
| 20 | Upper hall restoration | story |
| 30 | Transfer hall (C08) | story |
| 40 | Medical annex (C10) | story |
| 50 | Terrace allotments lost site | discovery |
| 60 | Past the choir in the north gallery | discovery |
| 70 | Gate hall (C09) | story |
| 82 | Power and air assemblies staged | tool |
| 94 | Escarpment culvert and the return ledge | area |
| 106 | Lower service window (C13) | story |
| 118 | The ending | story |

Meridian holds the investigation's end: about 100 minutes on the main path and 135 with the allotments, culvert and caves. The decodes and assembly staging overlap with side trips, which keeps the wait active rather than idle.

## Builder notes

- Keep every new cave clear of the story sites' interiors and the machinery boundary volume.
- `meridian_footing_void` sits 12 m from a staging-shelf pylon. Check the pylon solids against the mouth.
- Cable tenders must only sit on lines the game treats as powered, or the cue lies.

