# Splitstack Undercroft (`isles_undercroft`)

Cave biome, early, **main path**. Data: [`src/content/proposals/caveBiomes.ts`](../../../src/content/proposals/caveBiomes.ts). Index: [BIBLE](../BIBLE.md). Built on the LC large-cave technology; LC owns the final shape.

The first cave biome, under the split stack. It is shallow (4–34 m), gentle and threat-free. It teaches three things in order: darkness under rock, the lamp (on to see a room, off to see the way out), and exits (the cleft window's daylight). Wave-cut basalt galleries with flat wet floors and light from the side. The yard dredged and squared its south end, so the cave's human part is a store room off the yard sump.

## Placement and size

- **Domain:** x 335..485, z -30..115, y -40..-4 (about 150 m on its longest side, 4–40 m deep).
- **Design tier:** `early`.
- **Near:** site `isles.stack_yard`, site `isles.stack_cleft`, site `isles.stack_mast`.
- **Staging:** Carrier route: the Hearthline builds and berths in the yard lee; small craft park at the yard mouth. Independent: a basic outpost on the yard apron (solar).

## Zones

| ID | Zone | Centre (x, y, z) | Depth m | Light | Life | Resources | Note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `isles_undercroft.yard_sump` | Yard sump | 438, -22, 30 | 14–32 | Daylight from the yard mouth fading to dusk past two dead work lamps. | Reef school sheltering in the mouth; tide clappers on the cut walls. | Salve fronds where runoff pools. | Human-worked: the yard dredged and squared this sump. The tide store opens off its east side. |
| `isles_undercroft.lamp_hall` | Lamp hall | 432, -16, 90 | 10–24 | Fully dark under the island. The lesson: lamp on to see the room, lamp off to see the cleft window's glow. | Clapper runs along the walls; nothing that bites. | Old vent laminae and one core node (frontier samples). | A cold vent throat in the floor explains why the stack is split: it was a chimney once. |
| `isles_undercroft.cleft_window` | Cleft window | 455, -8, 96 | 4–14 | A bright slot of daylight from the split. | Grazers on the window sill. | None. | The 'exits' lesson: the obvious daylight is a way out. Diver-only slot onto the small-craft cleft. |
| `isles_undercroft.clapper_throat` | Clapper throat | 395, -14, 82 | 8–20 | Dim green light sideways from the west flank. | The densest clapper colony: their rippling clap precedes each surge. | Glass scoured loose on the floor. | Surge cycle candidate (isles.tidal_surge). A side pocket gives shelter. |
| `isles_undercroft.scar_mouth` | Scar mouth | 360, -26, 68 | 18–34 | Open blue water over the slump scar. | Reef school; grazers on new basalt. | Footing debris on the scar below. | Joins the scar crawl, the back entrance, and looks down the scar to the gauge line. |

## Entrances

| ID | Entrance | Role | At (x, y, z) | Admits | Note |
| --- | --- | --- | --- | --- | --- |
| `isles_undercroft.yard_mouth` | Yard mouth | front | 424, -33.2, -12 | small | Beside the carrier berth, outside its envelope; a Dart or Spindle can nose into the sump's first 20 m. |
| `isles_undercroft.cleft_exit` | Cleft window exit | exit | 464, -7.6, 95 | diver | Opens into the split itself. |
| `isles_undercroft.scar_entry` | Scar mouth | back | 352, -32.8, 66 | diver | Reached from open water or through the scar crawl. |

Back-entrance small caves: `isles_scar_crawl`.

## Residents

- `tide_clapper` Tide clappers: Hinged wall shells in tidal undercuts. They clap shut in a rippling run about 6 s before each surge, a sound you hear before you see the surge.
- `reef_school` Reef school: Loops around rib openings and arches, pausing in shade. Reused as small clear-ridge groups in the Basin.
- `ledge_grazer` Ledge grazer: Scrapes wave-exposed ledges; fresh scars expose clear glass nodules. Watching one teaches where glass is.

## Resources

- Pressure ceramic ×3 and thermal core ×1 (frontier samples)
- Salve frond cuttings
- Loose surge-scoured glass

Every material here also has an exterior source; see the adverse-case ledger in the [BIBLE](../BIBLE.md#adverse-case-skip-every-optional-cave-and-lost-site).

## Rewards

- Yard tide store: the first decodable (fragment, 3 min): air-line reel plan, two map hints
- Cleft window shortcut
- A lamp lesson in a room with no threat

## Role on the route

Leads from the workshop ledger and the decoder rack point here. The tide store holds the first decodable, so every player learns decoding on the cave where they learned the lamp. The yard mouth is beside the carrier berth both routes visit for the yard's spares.

## Builder notes

- **Main-path reading:** leads route the player here early, and both routes visit the yard. The cave never holds the only copy of anything required. The tide store's decode is a convenience plan plus map hints.
- **Surge cycle:** prototype `isles.tidal_surge` with a gentle push; keep the lamp hall reachable without the throat.
- **Lamp-off retreat:** from the lamp hall, the cleft window's glow and the clappers' wall runs must both lead out (W1-pre test pattern).
- **Carrier envelope:** the yard mouth stays outside the berth; the cleft window must not narrow the small-craft cleft.

