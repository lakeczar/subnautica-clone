# Central hub spur

Content bible, region file. Area `hub_spur`. Data: [`src/content/proposals/hub.ts`](../../../src/content/proposals/hub.ts) (typed, not wired). Index: [BIBLE](../BIBLE.md).

Coordinates are metres (x east, y up with water at 0, z north). ⟂ marks a point that needs new terrain or cave rock first, so it is not checked against today's floor. Everything else is checked against `worldFloor` by `tests/content-proposals.test.ts`.

## 1. Identity

- **Mood:** a crossroads. The hub is warm, shallow and lit, with the whole Basin falling away beneath it. It is a place you pass through often and stop at gladly.
- **Palette:** Hearth Reef's jade and shell on the pinnacle tops, giving way to the Basin's grey-petrol flanks. The station's warm lamps and the solar mast's white are the brightest things at the map centre.
- **Sound:** reef sounds on the crown; below, the Basin's hush and the rays' wingbeats like slow breathing.
- **First view:** from the Canopy's south edge or the Rift head, a pinnacle rises out of the Basin with a ring of huge rays circling it and a beacon house on top.

## 2. Landmarks

This is WORLD-EVOLUTION's W2 Option A hub: a spur of reef-capped pinnacles from the shallow south apron to a crown near the map centre. The crown at (330, 48 m, -560) puts the Basin anchorage, the dish field and the Rift head each within about 150 m. **It needs new W2 terrain: a pinnacle rising about 240 m from the Basin floor.** If that proves too costly, the fallback is to put the crown station on the existing south apron (20 m deep, 330 m south of the pod). That keeps the services but loses the central junction.

**Anchors (1)**

| ID | Status | At (x, y, z) | Merges with | What you see | Why you go |
| --- | --- | --- | --- | --- | --- |
| `hub.crown` | new | 330, -48, -560 ⟂ | site `basin.anchorage`, site `rift.head`, site `basin.dish_field` | A reef-capped pinnacle rising out of the Basin to 48 m, a ring of crown rays circling it, a beacon house on its summit. | The shared junction: Canopy, Basin, Rift and the Divide approach are each one short leg away; seen from the Canopy edge and the Rift head. |

**Discovery clusters (5; 6 with the anchors)**

| ID | Status | At (x, y, z) | Merges with | What you see | Why you go |
| --- | --- | --- | --- | --- | --- |
| `hub.apron` | extend | -20, -18.9, -320 | place `home_pod` | The flat shallow apron south of the pod, where the spur begins as a line of reef heads. | The spur's root, and the fallback hub site. |
| `hub.step_one` | new | 80, -40, -400 ⟂ | site `basin.west_gate` | A reef pinnacle topped with fans, an arch through its shoulder. | A diver's stepping stone with the Basin's first shelf in view below. |
| `hub.step_two` | new | 190, -45, -470 ⟂ | site `rift.head` | A second pinnacle, its north face cracked open and glowing faintly with glimmers. | The last hop before the crown; the Rift head opens to the south. |
| `hub.crown_station` | new | 326, -50, -552 ⟂ | `hub.crown` | A small restorable stop on the crown's lee, solar mast above it, mooring rings for small craft. | Charging, rest and the beacon array: the logistics centre that keeps home relevant. |
| `hub.rim_balcony` | new | 350, -120, -520 ⟂ | site `basin.anchorage` | A ledge on the crown's north flank looking down on the carrier anchorage and across to the dishes. | Where the carrier and the hub meet. |

## 3. Caves

**Cave style:** Hearth Reef's limestone arches, carried out on the spur: short arches through each pinnacle and one tall shaft through the crown.

**Cave resident:** `vault_glimmer` (Vault glimmers). Pin-sized glowing shrimp in mats on limestone ceilings. Mats lean toward the moving water of the nearest mouth, so a lamp-off diver can read the way out.

Three small arch caves on the spur and one medium shaft through the crown. The shaft is the fastest safe way from the hub down to Basin depth.

**Small caves (3)**: diver-only; every water extent 25 m or less. Footprint is the replacement rock the cave owns; water is length × width × height of what it carves.

| ID | Mouth (x, y, z) | Footprint | Water m | Depth m | Exits | Network | Layout | Contents | Links |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `hub_apron_hollow` | -20, -26.3, -348 | -32..-8 × -360..-340 | 14 × 8 × 10 | 22–32 | apron mouth | — | A 14 m hollow at the apron's south lip, the first arch of the spur. | Glimmer ceiling | — |
| `hub_step_arch` | 80, -40, -400 ⟂ | 68..92 × -412..-388 | 16 × 5 × 12 | 36–48 | north mouth, south mouth | — | A 16 m arch tunnel through the first step's shoulder. | Shelter on the spur crossing | `hub_glimmer_crack` |
| `hub_glimmer_crack` | 190, -50, -470 ⟂ | 178..202 × -482..-458 | 18 × 3 × 16 | 44–60 | north mouth, crown-side mouth | — | An 18 m crack through the second step, ceiling thick with glimmers. | Glimmer mats leaning toward the crown side | `hub_step_arch` |

**Medium caves (1)**: water 30–80 m, 2–5 named chambers, a through-loop from one exit to another; the main hall takes the craft listed.

| ID | Mouth (x, y, z) | Footprint | Water m | Depth m | Hall admits | Chambers | Loop | Exits | Layout | Contents |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `hub_crown_shaft` | 330, -48, -560 ⟂ | 300..360 × -590..-530 | 40 × 30 × 72 | 48–120 | small | crown bowl, spiral shaft, diver chimney, flank chamber | crown mouth → crown bowl → spiral shaft → flank chamber → flank mouth | crown mouth, flank mouth | Through the crown: the crown mouth into a crown bowl, a Dart-wide spiral shaft (with a parallel diver chimney) down to a flank chamber, and a flank mouth at 120 m over the anchorage. | The fastest safe way from the hub to Basin depth |

## 4. Creatures

| Species | Role | Status | Cave-dweller | Where | Noise | Light |
| --- | --- | --- | --- | --- | --- | --- |
| `reef_school` Reef school | benign | existing | no | Around every pinnacle | Tightens and turns away from a boosting craft. | Gathers loosely at the edge of a lamp cone at night. |
| `ledge_grazer` Ledge grazer | cue | existing | no | Crown summit ledges | Drifts off a ledge when a craft boosts within 10 m; returns after it passes. | Indifferent. |
| `crown_rays` Crown rays | benign | new | no | A wide ring around the crown | Widen the ring around a loud craft. | Undersides catch lamps from far off. |
| `vault_glimmer` Vault glimmers | cue | new | yes | Spur caves. Shared with the reef. | None. | Dim to nothing inside a lamp cone; brighten again 3 s after it leaves. Teaches the lamp switch. |

Reef species continue onto the spur. Crown rays are a living landmark: big, slow and benign, visible from far away (atmosphere priority 4).

## 5. Resources

- **Required here:** none. The hub is convenience and logistics. Glass, cups and a little crust make it self-sufficient for a short stop.
- **Cave-favoured:** crust on the shaft's grounding fins.

| ID | Kind | Item | At (x, y, z) | Stock / bundle / reserve | Renews | Cave | How you read it |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `hub_crown_glass` | exterior | `silica_glass` | 334, -50, -566 ⟂ | 8 / 2 / 8 | no | — | Grazers scrape the crown's summit ledges. |
| `hub_crown_cups` | exterior | `meal` | 322, -52, -548 ⟂ | 8 / 2 / 0 | no | — | Cups in the crown's lee. |
| `hub_shaft_crust` | cave favoured | `conductive_crust` | 330, -110, -560 ⟂ | 6 / 2 / 0 | no | `hub_crown_shaft` | Fins grounded in the shaft wall below the reef cap. |

## 6. Side rewards and lost site

| ID | Kind | At (x, y, z) | Reward |
| --- | --- | --- | --- |
| `hub.station_service` | service | 326, -50, -552 ⟂ | Restored: charging, rest, a locker, and the beacon array that switches decoded landmark beacons on as a set. |
| `hub.shaft_window` | view | 350, -120, -520 ⟂ | The shaft's lower mouth frames the anchorage, the dishes and, on a clear day, the Rift glow. |

**Lost site `hub.beacon_house`: Beacon house** at 335, -48, -565 ⟂. A cylindrical beacon house on the crown summit, its lamp dead, a chart cabinet sealed. It is found without decoding; its records stay unreadable until decoded.

- Decode `hub_beacon_archive` (archive): unlocks `hub_chart_cabinet`.
  - Plans: `bp_beacon_array`.
  - Map reveals: Dish field (landmark, site `basin.dish_field`, 120 m); Lantern crowns (landmark, site `canopy.east_crowns`, 120 m); Split chimney (landmark, site `rift.split_chimney`, 120 m); Gateworks (landmark, site `divide.gateworks`, 120 m); Signal spire (landmark, site `meridian.spire`, 120 m).
  - Logs: The expedition's beacon plan for the whole basin, one light per landmark. A maintenance list of which beacons failed first, and where.

The beacon house's archive turns five regional landmarks into switchable beacons, and its plan makes the station switch them on as a set. That is GAME-DIRECTION's 'decoded landmarks become beacons', given a home at the centre.

## 7. Cycle candidates

| ID | Cycle | Period / active s | What it is for | Alternative | Verdict | Honest note |
| --- | --- | --- | --- | --- | --- | --- |
| `hub.ray_pass` | Ray pass | 180 / 20 | The crown rays' ring passes low over the station. | Nothing waits on it. | likely cut | Spectacle, not a cycle. Keep the rays; drop the clock. |

## 8. Pacing check

Skilled first-time play: **about 20 minutes on the main path, 40 with the optional content here**, summed over every visit.

| Minute | Something new | Kind |
| --- | --- | --- |
| 0 | South apron and the first steps | area |
| 10 | The crown and its rays | discovery |
| 18 | Restore the crown station | tool |
| 28 | Crown shaft down to Basin depth | area |
| 36 | Beacon chart archive decoded | discovery |

A short area by intent: about 20 minutes of main path (arrive, restore the station) and 40 with the shaft and the archive. It earns its keep by shortening every later leg rather than by holding content.

## Builder notes

- W2 owns terrain, layout, passages, access and rescue. Everything here marked ⟂ waits for W2.
- Carrier lanes must pass between the pinnacles at depth: the spur is stepping stones, never a wall across the Basin's west lobe.
- The spur's root on the apron sits in the legacy preserve's blend zone. W2 must keep the opening's terrain bit-for-bit inside the preserve.

