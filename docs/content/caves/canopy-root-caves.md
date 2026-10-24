# Lantern Rootways (`canopy_rootways`)

Cave biome, mid, **optional**. Data: [`src/content/proposals/caveBiomes.ts`](../../../src/content/proposals/caveBiomes.ts). Index: [BIBLE](../BIBLE.md). Built on the LC large-cave technology; LC owns the final shape.

An optional mid-game cave biome inside the east Canopy's holdfasts. It is ribbed and alive: roots as thick as the pod, glowing root tips, resin weavers on every ceiling, and a knot-eel warren that warns twice before it nips. It is the LC large-cave technology proof, so its zones are chosen to exercise that technology: a small-craft mouth and turning bay, one big hall, diver-only side galleries, a den, a deep cold hollow, and a long climbing back stair.

## Placement and size

- **Domain:** x 880..1100, z -300..-70, y -230..-35 (about 230 m on its longest side, 35–230 m deep).
- **Design tier:** `reinforced`.
- **Near:** site `canopy.east_mooring`, site `canopy.east_crowns`, site `canopy.escarpment_head`.
- **Staging:** Carrier: east mooring bowl. Independent: a standard outpost on the crown floor beside the mouth; or dive the back stair from a craft parked in the south cove.

## Zones

| ID | Zone | Centre (x, y, z) | Depth m | Light | Life | Resources | Note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `canopy_rootways.crown_mouth` | Crown mouth | 905, -160, -180 | 150–170 | Amber crown light filtering down through a ring of holdfasts. | Lantern school at the mouth; floaters above. | Crust on the outer root fins. | Small craft enter here; turning bay before the nave. |
| `canopy_rootways.nave` | Root nave | 960, -180, -180 | 165–200 | Dark, ribbed by roots as thick as the pod; glowing root tips mark the walls. | Resin weavers everywhere overhead. | Weaver-nest resin (renewable). | The big hall: the LC proof's centrepiece. |
| `canopy_rootways.weaver_galleries` | Weaver galleries | 1010, -170, -130 | 158–185 | Dim: nest clusters glow faintly. | Weaver colonies; rootglow buds on the floor. | Rootglow seed (specimen sampling), nest resin. | Diver-only side galleries climbing toward the back stair. |
| `canopy_rootways.knot_warren` | Knot warren | 1040, -190, -200 | 178–200 | Black; knot holes ringed with pale growth. | Knot eel dens with clear rattling warnings. | The root specimen store sits beyond the warren. | The cave's den: always a lamp-held way past and a second passage round. |
| `canopy_rootways.salt_sweat` | Salt-sweat hollow | 1060, -210, -250 | 200–222 | A cold violet sheen off crystal crusts. | Almost none: fans closed, roots pale. | One brine lattice crystal (a taste) where root colonies sweat out dense water. | An early, readable glimpse of how the Divide's crystal forms. |

## Entrances

| ID | Entrance | Role | At (x, y, z) | Admits | Note |
| --- | --- | --- | --- | --- | --- |
| `canopy_rootways.front_mouth` | Crown mouth | front | 900, -151, -176 | small | On the east crown floor, 280 m from the east mooring. |
| `canopy_rootways.back_stair` | Back stair | back | 1012, -50, -85 ⟂ | diver | From the headland root stair (Isles) down a root-lined crack: a 45 → 170 m descent for a suited diver. |
| `canopy_rootways.deep_exit` | Escarpment exit | exit | 1080, -215.4, -290 | small | Opens south-east toward the escarpment head and the deep return. |

Back-entrance small caves: `isles_headland_root`.

## Residents

- `resin_weaver` Resin weavers: Spindly crabs that pack shed resin into ceiling nests in root hollows. Abandoned nests are cured resin; collecting them harms nothing.
- `knot_eel` Knot eels: Den animal in root-knot holes. Rattles its fin spines from 8 m, flares from 5 m, nips only a diver who stays within 3 m for 4 s. Never leaves its hole; never blocks the only way out.
- `canopy_school` Lantern school: Holds in clear upper water; scatters at loud machinery. A broken school means the hunter can hear you too.

## Resources

- Renewable weaver-nest resin
- Root-fin crust
- Brine lattice ×1 (a taste)
- Rootglow seed (exclusive)

Every material here also has an exterior source; see the adverse-case ledger in the [BIBLE](../BIBLE.md#adverse-case-skip-every-optional-cave-and-lost-site).

## Rewards

- Shaded lamp filter plan (exclusive): makes the Rift's glare stalker far easier
- Rootglow: the better power crop (exclusive)
- Root specimen store archive: decoder cooling plan and two deep-Canopy reveals

## Role on the route

None: optional by design. The lead is a sighting (the glowing root tips at the headland stair and the crown mouth's holdfast ring), plus the gauge-log hint.

## Builder notes

- **Exclusive rewards:** the shaded lamp filter plan (via the specimen store's archive) and rootglow seed. Both are worth the trip, and nothing required depends on them.
- **Den fairness:** knot eels never sit on the only passage; holding a lamp on a hole for 3 s makes the eel withdraw.
- **Back stair:** a 125 m vertical climb for a suited diver. Rest pockets every 30 m, and the root tips glow brighter toward the top.
- LC owns the final shape; keep the three entrances and the five zones' roles.

