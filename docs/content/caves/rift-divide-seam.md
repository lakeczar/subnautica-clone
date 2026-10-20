# The seam (`rift_divide_seam`)

Cave biome, late, **main path**. Data: [`src/content/proposals/caveBiomes.ts`](../../../src/content/proposals/caveBiomes.ts). Index: [BIBLE](../BIBLE.md). Built on the LC large-cave technology; LC owns the final shape.

The main-path late cave biome between the Ember Rift and the Mirror Divide. Hot lava tubes at the Rift end give way through a cold junction to brine galleries under the Divide's west ridge. A steady artificial current runs through the galleries from the direction of the gateworks: the player carries that question on to the turbine hall.

## Placement and size

- **Domain:** x 170..420, z -1370..-1150, y -540..-350 (about 250 m on its longest side, 350–540 m deep).
- **Design tier:** `service`.
- **Near:** site `rift.flank_gate`, site `divide_lattice_ledge_west`, story site `divide_turbine_hall`.
- **Staging:** Carrier: cool flank mooring (300 m) or Divide lee mooring (390 m). Independent: an advanced outpost with a thermal tap on the Rift mouth shelf.

## Zones

| ID | Zone | Centre (x, y, z) | Depth m | Light | Life | Resources | Note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `rift_divide_seam.kiln_tubes` | Kiln tubes | 205, -385, -1185 | 372–398 | Orange glow seeping through cracked tube walls. | Kiln crawlers file into cracks before each heat breath. | Kiln-tube ceramic lining (rich). | Tier-1 thermal exchanger charges at a tube vent here. |
| `rift_divide_seam.breath_gallery` | Breath gallery | 245, -395, -1220 | 382–410 | Pulsing glow with each heat breath. | Crawlers; nothing hunts here (too narrow for the stalker). | None. | Heat-breath cycle candidate: wait under a minute in the side niche, or take the cold bypass. |
| `rift_divide_seam.cold_junction` | Cold junction | 290, -410, -1240 | 395–425 | Dark; the rock changes from black glass to pale rime. | Brine skimmers begin. | Pale rime on the walls (visual only; too thin to work). | Hot meets cold: a gallery record here points to the turbine hall. |
| `rift_divide_seam.brine_galleries` | Brine galleries | 360, -465, -1300 | 450–480 | Mirror sheens on trapped pools; a steady artificial current runs through. | Brine skimmers over every pool. | Pool-rim lattice (rich, at 450 m and deeper). | The current flows from the gateworks: a question the player carries to the turbine hall. |
| `rift_divide_seam.mirror_sump` | Mirror sump | 405, -505, -1345 | 490–520 | A brine surface below, lit from the saddle. | Skimmers; the skate's water lies beyond the exit. | None. | Optional exit into the saddle: needs brine protection. |

## Entrances

| ID | Entrance | Role | At (x, y, z) | Admits | Note |
| --- | --- | --- | --- | --- | --- |
| `rift_divide_seam.rift_mouth` | Rift mouth | front | 180, -361.8, -1165 | small | Beside the flank gate on the Rift's cooled flank. |
| `rift_divide_seam.divide_mouth` | Ledge mouth | exit | 330, -357.1, -1225 | small | Under the Divide's west flushed ledge. |
| `rift_divide_seam.pocket_drop` | Pocket drop | back | 395, -380, -1255 ⟂ | diver | From the mirror pocket small cave down a crack into the brine galleries. |
| `rift_divide_seam.brine_exit` | Saddle exit | exit | 410, -526.9, -1355 | small | Below the brine interface; brine protection only. |

Back-entrance small caves: `divide_mirror_pocket`.

## Residents

- `kiln_crawler` Kiln crawlers: Pale isopods on warm tube walls. They file into cracks just before a tube's heat breath and come out as it fades.
- `brine_skimmer` Brine skimmers: Flat fish that skate just above trapped brine pools inside pockets. Where they skim, dense water lies below, so the pool's edge is visible even without its shimmer.
- `filter_ribbon` Filter-ribbon colony: Sessile. Leans into the current and sheds ribbons that collect downstream; closes in dense or silty water.

## Resources

- Rich kiln-tube ceramic
- Rich pool-rim lattice in the brine galleries (465 m, beyond the 450 m frontier)

Every material here also has an exterior source; see the adverse-case ledger in the [BIBLE](../BIBLE.md#adverse-case-skip-every-optional-cave-and-lost-site).

## Rewards

- Sheltered Rift → Divide passage for small craft
- First exchanger field charge
- Gallery drainage record: a second lead to the turbine hall

## Role on the route

The intended small-craft route from the Rift's cool flank to the Divide's west ledges with the 450 m configuration. The exterior flank ledge and the Basin's broad route stay open, and the turbine hall keeps its own exterior lead.

## Builder notes

- **Main-path reading:** the intended small-craft crossing for the 450 m configuration. The exterior flank ledge and the Basin's broad route remain, and the turbine hall keeps its exterior lead.
- **Heat breath:** prototype `rift.kiln_breath` here with the cold bypass in place; cut the wait if it feels like a toll.
- **Thermal exchanger:** the kiln tubes' vent is a charging point for tier 1. The thermal shroud protects against ambient heat only, never plume cores or breaths at their peak.
- **Brine exit:** optional, below the interface, brine protection only.

