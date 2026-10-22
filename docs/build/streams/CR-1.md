# CR-1: creatures as resources, natural threat windows

Opus 5.5 high. Branch `t3/natural-threat-windows`, stacked on C4 (`t3/integrate-world-systems` at `e80803b`, which already contains root `4bf9208`). The fish trap plugs into SYS-2's socket hosts, and those are only live on C4's branch. Integrate after C4.

**Status: interface note (early, for CB-2).** These IDs are stable. Positions and numbers follow in the final handoff.

## IDs for lore matching (CB-2)
**Items** (`ITEMS`, none of them `MATERIALS`; the bible's eight materials stay eight):

| ID | Label | What it is |
| --- | --- | --- |
| `small_fish` | Small fish | A raw catch, by hand or net, from a fish ground or a trap. You cook it, or release one as bait. |
| `roe_cluster` | Roe cluster | Rich raw food from a spawning ground. It cooks into more portions than fish. |
| `planter_feed` | Shell-and-cast feed | Planter fertiliser from shed shells, scavenger casts and fall bone. |
| `hand_net` | Hand net | A carried tool that catches two fish per catch instead of one. |
| `mod_fish_trap` | Fish trap module | A SYS-2 socket module (`trap`) that catches slowly in the background, with a cap. |

**Deterrent kind:** `bait`, a released small fish. The threats feed on it.

**Grounds** (`SOURCES` IDs; each regrows to a cap on its own timer, never a wait):

| ID | Region | Item | Resident or story |
| --- | --- | --- | --- |
| `reef_fish_ribs` | Hearth Reef | `small_fish` | the reef school around the twin ribs |
| `isles_fish_split` | Splitspine Isles | `small_fish` | the reef school in the sheltered split channel |
| `basin_fish_ridge` | Pale Basin | `small_fish` | a small group over a clear ridge |
| `reef_roe_nursery` | Hearth Reef | `roe_cluster` | the reef school's spawning ground on the nursery flats |
| `isles_roe_cove` | Splitspine Isles | `roe_cluster` | the spawning ground in the south cove |
| `canopy_roe_crowns` | Lantern Canopy | `roe_cluster` | the lantern school's spawning ground in the east crowns, at the hunter's feeding ground (risk and reward) |
| `reef_shed_moults` | Hearth Reef | `flex_membrane` | moult skins shed by ledge grazers |
| `isles_shed_shells` | Splitspine Isles | `planter_feed` | shells shed by tide clappers and shore buttons |
| `canopy_weaver_resin` | Lantern Canopy | `buoyant_resin` | resin weavers' nest rim in a root hollow |
| `rift_mite_grit` | Ember Rift | `conductive_crust` | mineral grit the ember mites leave on a cool ledge below the lip |
| `basin_scavenger_casts` | Pale Basin | `planter_feed` | casts at the scavengers' burrow warren |

**Protected, never harvested** (scan only): `divide_skate_eggcases`, the layer skates' egg cases on the Divide floor. Threats, rare residents and story animals are never sources.

**Carcass falls** (static landmarks with scavengers; their salvage is ordinary `SOURCES`):

| Fall ID | Region | Salvage source IDs |
| --- | --- | --- |
| `fall_basin_west` | Pale Basin | `fall_basin_west_hide` (`flex_membrane`), `fall_basin_west_bone` (`planter_feed`) |
| `fall_basin_east` | Pale Basin | `fall_basin_east_hide` (`flex_membrane`) |
| `fall_divide_lee` | Mirror Divide | `fall_divide_lee_crust` (`conductive_crust`), `fall_divide_lee_bone` (`planter_feed`) |

**Natural threat windows** (cycle IDs, logged in the journal's cycles tab on first sight):

| Cycle ID | Threat | Window |
| --- | --- | --- |
| `cycle.canopy.hunter_feeding` | Canopy sound hunter | It leaves its home crowns to feed on the lantern school's east shoals, then returns. |
| `cycle.rift.stalker_feeding` | Glare stalker | While the split chimney vents, both stalkers feed in the plume's rising wash. |
| `cycle.divide.skate_rest` | Layer skate | In crest slack water, with no food falling, the skates settle to the floor and rest. |
| `cycle.meridian.choir_rest` | Hollow choir | The bells close to rest and barely hear. |
