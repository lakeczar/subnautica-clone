# Ridge vaults (`basin_ridge_vaults`)

Cave biome, mid, **main path**. Data: [`src/content/proposals/caveBiomes.ts`](../../../src/content/proposals/caveBiomes.ts). Index: [BIBLE](../BIBLE.md). Built on the LC large-cave technology; LC owns the final shape.

The main-path mid cave biome under the wreck ridge. It is half natural seam and half extraction works, with square doorways, soft floors and still black water. Wakeglow drift makes your own wake glow for a minute, so the way back is always lit. The restorable pump hall is the Basin's service stop, and the sealed instrument vault holds the region's archive decode.

## Placement and size

- **Domain:** x 760..960, z -705..-455, y -345..-262 (about 250 m on its longest side, 262–345 m deep).
- **Design tier:** `reinforced`.
- **Near:** site `basin.wreck_ridge`, site `basin_wreck_frames_north`, site `basin.wreck_tagboard`.
- **Staging:** Carrier: Basin anchorage (240 m), Creel or Dart sortie of about 450 m. Independent: the restored pump hall is the region's stop.

## Zones

| ID | Zone | Centre (x, y, z) | Depth m | Light | Life | Resources | Note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `basin_ridge_vaults.north_gallery` | North gallery | 800, -280, -470 | 268–292 | A grey glow from the north mouth, then nothing. | Wakeglow drift: your own wake lights the way back. | Crust on unsilted grounding fins. | Half-natural, half-cut: the extraction works followed a sediment-cemented seam. |
| `basin_ridge_vaults.pump_hall` | Pump hall | 790, -290, -540 | 276–306 | Dark until restored; then the stop's work lamps. | Scavengers den in the frame racks. | Two fired ceramic liners (a taste). | Restorable service stop with a frame press (strips tagged frames on site). |
| `basin_ridge_vaults.instrument_vault` | Instrument vault | 805, -300, -600 | 288–312 | Black; one sealed door with a tag light still blinking. | None inside; wakeglow in the corridor. | Vault archive (decodable). | The sealed instrument vault: the archive decode reveals the Rift approach. |
| `basin_ridge_vaults.settling_tanks` | Settling tanks | 830, -315, -650 | 300–330 | Faint: the south mouth's silt glow. | Silt combs on the tank rims. | Bulk loose alloy in the tank racks. | Shelter from the plume lane that passes just south. |
| `basin_ridge_vaults.east_sluice` | East sluice | 880, -325, -570 | 312–338 | Blue-black open water through a sluice gate. | Scavengers at the gate. | None. | Exit onto the east flank above the pale floor. |

## Entrances

| ID | Entrance | Role | At (x, y, z) | Admits | Note |
| --- | --- | --- | --- | --- | --- |
| `basin_ridge_vaults.north_mouth` | North mouth | front | 830, -291.2, -462 | medium | Beside the bulk frames; a Creel can reach the pump hall. |
| `basin_ridge_vaults.sluice_mouth` | Sluice mouth | exit | 950, -334.5, -560 | small | East flank, toward the pale floor. |
| `basin_ridge_vaults.burrow_entry` | Burrow entry | back | 800, -296, -690 | diver | Through the scavenger burrow warren into the settling tanks. |

Back-entrance small caves: `basin_burrow_warren`.

## Residents

- `wakeglow_drift` Wakeglow drift: Faint drifting plankton in still vault water. Anything moving through leaves a glowing wake that fades over about 60 s: your own trail back out.
- `basin_scavengers` Basin scavengers: Feed beside stable ridges; back into burrows before a sediment surge. An empty lane is a plume lane.
- `silt_combs` Silt combs: Sessile forked fans with rigid comb plates, placed only above the silt line: a stable-ground marker.

## Resources

- Pressure ceramic ×2 (a taste)
- Vault crust
- Loose tank-rack alloy

Every material here also has an exterior source; see the adverse-case ledger in the [BIBLE](../BIBLE.md#adverse-case-skip-every-optional-cave-and-lost-site).

## Rewards

- Pump hall stop: frame press, charging, rest
- Vault archive decode: advanced outpost plan, Rift station and cool-flank reveals
- Plume shelter on the south side

## Role on the route

The ridge's frames and alloy are main-path stock on both routes; the vaults are their sheltered side. Restoring the pump hall saves the frame haul to the islands, and the vault archive maps the Rift approach. Frames still strip at the workshop and C06's lead still names the Rift, so neither is the only way on.

## Builder notes

- **Main-path reading:** frames and alloy on the ridge are main-path stock on both routes, and the vaults are their sheltered side. The frame press and the archive shorten the route. Frames still strip at the workshop, and C06's lead still names the Rift.
- **Creel access:** the north mouth and pump hall must take the medium profile (Creel) with a turning bay; side vaults are diver-only.
- **Plume shelter:** the settling tanks are the cave's answer to the plume lane outside. Keep the lane's clock and the shelter's mouth readable together.
- **Rescue:** a Creel lost in the pump hall needs a tow route out the north mouth (EXPEDITION_INTEGRATION rescue staging).

