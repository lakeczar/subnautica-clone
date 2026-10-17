# Economy candidate — provisional, 2026-10-17

This is a proposal for coordinator inspection and later integration into the single production content registry. It is **not accepted gameplay balance or a second runtime registry**. Author: Sol 6.1 max, economy assignment from baseline `a3e400b` on `feat/siltwake-foundation`. Only this report, [the quantities draft](economy-candidate.json), and [the Node checker](check-economy.mjs) belong to this batch. Independent non-author Astra xhigh/Sol max review remains pending.

The proposal preserves the seven region IDs, eight material IDs, six hulls and existing pressure envelopes. Proposed source/blueprint/recipe IDs are descriptive snake_case; the foundation has not established competing IDs. No new material family, currency, predator trophy or optional journal gates progress. Story facilities were accounted for without reproducing major spoilers.

## Quantities and first access

In this report, vectors mean **A/G/M/C/R/P/T/B**: `structural_alloy`, `silica_glass`, `flex_membrane`, `conductive_crust`, `buoyant_resin`, `pressure_ceramic`, `thermal_core`, `brine_lattice`. A material unit occupies **2/1/1/1/1/2/2/2 cargo units (CU)** respectively. CU measures packed stowage space; assembled parts can pack differently from loose supplies. All exact recipe costs, output sizes, source IDs and dependencies live in the JSON.

| Family | Guaranteed first stock and recognizable patches | Later first stock | Total public first stock |
| --- | --- | --- | ---: |
| A | Reef maintenance scraps: 8 each at 12/28 m; island workshop/headland scraps: 18 each at 0/20 m | Basin loose salvage: 8 each at 160/175 m; two tagged frame patches: 24 each at 160/175 m | 116 |
| G | Reef exposed ridges: 8 each at 8/22 m; wave-washed island ledges: 10 each at 10/25 m | — | 36 |
| M | Downstream reef ribbon catches: 12 each at 10/25 m | Clear Canopy margins: 20 each at 100/135 m | 64 |
| C | Exposed Canopy grounding fins: 14 each at 90/130 m | Basin survey-frame fins: 10 each at 170/180 m | 48 |
| R | Sheltered island drift coves: 6 each at 10/20 m | Cured Canopy lee nodules: 12 each at 100/140 m | 36 |
| P | Cooled Rift chimney lips: 16 each at 260/280 m | Warm seam: 12 at 360 m, separately heat gated | 44 |
| T | Inactive Rift shoulders: 12 each at 290/315 m | Warm seam: 12 at 370 m, separately heat gated | 36 |
| B | Flushed Divide ledges above dense water: 10 each at 365/385 m | Protected fissure: 12 at 440 m, separately brine gated | 32 |

These are **33 distinct patches**, not 33 uniform loot piles. Two appropriate patches support each first material access. The budget checks use visible first stock only: no finite reserve extraction, renewal, warm seams or protected fissure contributes to either main strategy. Reef alloy alone is insufficient for the full opening plus a Creel; island preparation has a practical purpose.

Hand bundles contain A4/G2/M4/C2/R2/P2/T2/B2 units. A final smaller exposed bundle can finish a patch. A tagged frame is **8 A / 16 CU**, handled with the reusable salvage buoy/collar; it is not hand-picked loose alloy. Two frames from different Basin patches provide the carrier's required 16 tagged A. Other alloy remains usable loose stock. Frames never become a ninth material.

| Step | Reach with predecessor equipment | Proposed spend/result |
| --- | --- | --- |
| Opening | Starter 60 m; dry islands and shallow reef | Public preparation package **10/8/11/0/0/0/0/0**, plus first hull. Package repairs pod/workshop, retains essential tools, equips suit 150, makes one buoy and two reserve cells. Bobbin is funded separately from protected stock. |
| First reinforcement | Suit 150 plus Dart 180 or Creel 240; Canopy sources ≤140 m | Suit 350: **2/0/2/2/1/0/0/0**. Creel 350: **3/1/2/3/2/0/0/0**. Optional Dart 350: **3/0/2/2/2/0/0/0**. |
| Carrier alternative | Suit 350 plus either early hull reaches Basin frames/knowledge ≤175 m | Hearthline 400 uses the early five materials, two tagged frames and complementary island/Basin knowledge. No Creel, ceramic, core, lattice or Dart 350 requirement. |
| Rift | Creel 350 or Hearthline 400, with suit 350; cool stock ≤315 m | Suit 450: **1/0/2/0/0/3/1/0**. Creel 450 adds **2/0/2/1/0/4/2/0**; service head adds **2/0/1/2/0/1/1/0**. Carrier route needs the personal refit but can retain hull 400. |
| Divide | Creel 450 or Hearthline 400, with suit 450; flushed stock ≤385 m | Suit 800: **1/0/2/0/0/2/1/3**, plus personal service seals **1/0/2/0/0/1/1/1**. Creel 800 adds **2/0/2/0/0/4/2/4**; alternative builds Mantle. |
| First deep investigation, then final return | Suit 800 plus service Creel 800 or Mantle 800 | Restore the external District service stop during the investigation; its repair list is already known at the Divide. Final machinery supplies are learned locally, then brought in one prepared return load. |

Each recipe is paid before its granted protection is applied. Reachability checks require both personal exit protection and a suitable hull beyond starter shallow travel. Pressure, personal environment seals and hull environment protection are separate. The first ceramic/core/lattice sources require neither the heat nor chemical protection they help produce. Creel's deep treatment is for sheltered crossings and local service; Mantle remains the better sustained-work craft. The checker's environment flags cannot establish actual exposure duration or damage rates.

## Hulls, modules and useful carrying work

| Hull | Base cost vector | Raw stock CU | Pressure initial → max | Cargo CU / purpose |
| --- | --- | ---: | --- | --- |
| Dart | 6/3/2/0/0/0/0/0 | 17 | 180 → 350 | 32; fast crowns, reef passages and local scouting |
| Creel | 10/4/4/0/0/0/0/0 | 28 | 240 → 800 | Bare 64; cargo rack 96; cabin 40; service head **52** |
| Hush | 6/4/2/3/2/0/0/0 | 23 | 220 → 450 | 24; quiet fin/sound-sensitive survey; 450 refit costs 2/0/2/1/0/3/1/0 |
| Spindle | 8/2/3/2/4/0/0/0 | 27 | Surface | 96; solar charging and island supplies; solar equipment included in base |
| Mantle | 12/4/6/4/3/6/4/5 | 71 | 800 | **52**; protected work, station keeping and heavy service interface included |
| Hearthline | 32/8/10/12/12/0/0/0 | **106** | 400 → 550 | 256 plus the existing two-compact **or** one-medium berth rule |

The carrier is 49% larger than Mantle in raw-stock CU and over six Dart hulls by that measure. That is a workload proxy: source travel, handling and complementary knowledge determine actual acquisition effort. It does not prove midcampaign timing. Its three component loads can be workshop/island **40 CU**, Canopy **34 CU**, and Basin frames **32 CU**. With 16 CU of provisions each fits Dart+buoy's combined 56 CU. Cargo-Creel has a two-load arithmetic lower bound, while the three different source contexts and knowledge still require investigation. Do not enforce five identical alloy trips to match an effort ratio.

Diver stowage is 16 CU; the single reusable buoy carries 24 CU. Bundled first-hull stock plus an 8-CU preparation allowance fits their combined 40 CU: Dart 32 CU, Creel 40 CU. Thus Creel costs more collection/handling than Dart without requiring a repetitive initial ferry chain. The buoy is first craftable with a 14-CU packet of shallow bundles. Its packed form is 2 CU; deployed cargo belongs to its own container and cannot be counted in the hold simultaneously.

Creel's starting rack is included in its base price; a replacement rack recipe is 2 A + 1 M. Cabin costs **2/2/3/1/2/0/0/0**, and exchanges its single major mount with rack/head at supported docks. Store unused modules intact. Cabin and service head cannot operate together. Leave the 14-CU packed cabin at a dock for the final service trip. Final machinery assemblies need a compatible secured service pallet/interface, which Dart and Hush lack even if their numerical space appears sufficient. This compatibility must be visible before fabrication.

All other small craft have two equipment sockets. A reserve-power pack competes with survey/cargo/thermal equipment; reserve cells in the budget are the same two rechargeable cells reused across expeditions. Hull bases include their normal battery. Refits are incremental costs on the existing hull/suit, never a second hull purchase. Every portable module's packed CU is recorded; fitted/worn parts and fixed facilities do not consume ordinary cargo. A thermal work set adds separate hull and personal heat protection; it does not follow from pressure rating. Hearthline's optional 550 refit costs **4/0/4/2/0/4/2/3** and does not itself add environmental tolerance.

Carrier cargo does not expand its berths. Dart/Hush/folded Spindle are compact; Creel/Mantle are medium. A carrier carrying Mantle leaves compact craft at supported docks. Proposed carrier moorings remain Canopy 160 m, Basin 240 m, cool Rift 300 m, Divide lee 390 m, optional District shelf 520 m. These are separate from the service-stop sites below.

| Service stop | Repair vector | Raw cargo CU | Delivery |
| --- | --- | ---: | --- |
| Canopy 120 m | 2/1/2/1/1/0/0/0 | 9 | Independent Creel route |
| Rift cool flank 280 m | 2/0/2/1/0/1/1/0 | 11 | Independent Creel route |
| Divide lee 380 m | 2/0/2/1/0/1/0/1 | 11 | Independent Creel route |
| District exterior service gallery 650 m | 2/0/2/1/0/1/1/1 | 13 | Both routes, on first deep investigation |

Creel can bring Divide+District repairs plus 16 CU reserves in **40/52 CU**. Mantle brings District repairs plus reserves in **29/52 CU**. Restoring the external service stop precedes the final return; its 13 CU is not silently omitted from that return's payload. Local air/charging and a basic bench remain separate from the independent supplies required by the final machinery. Supported island fabrication also remains available to the carrier-independent path.

| Final return load, both strategies | CU |
| --- | ---: |
| Independent service air/power assembly | 12 |
| Pressure/bypass repair assembly | 8 |
| Interior-service repair assembly | 12 |
| Reusable Bobbin/collar/full tether/canister kit | 6 |
| Two charged reserve cells | 4 |
| Two meals | 2 |
| Ordinary repair spares | 4 |
| **Total / service Creel or Mantle capacity** | **48 / 52** |

Suit 800, personal heat/brine service seals and essential tools are **equipped, zero cargo CU**. Their recipe costs are in every path budget. The final assembly ingredients total **7/3/7/5/1/4/2/3**; field spares add **2/0/1/0/0/0/0/0**. Four CU remain for discretionary finds. This modest margin, pallet clearance, actual handling and underwater exits need playtests; 48/52 is not ideal balance established by arithmetic.

## Replenishment and failure rules

Public first stock and each patch's additional finite reserve are saved separately. At a marked host, a **20-second active expose/sort action** transfers up to two units from its displayed reserve to exposed stock. Reserve cannot reset with time, sleeping, leaving/re-entering or save/reload. Geological advanced stock is finite. This gives an immediate, understandable restock action without waiting or rapid unlimited advanced production. Main-path arithmetic never uses these reserves. Biological membrane/resin renewal beyond the finite candidate reserve is unnecessary for this proof.

The pod's **finite protected maintenance allocation is 16 A + 1 G + 10 M**, explicitly earmarked for Bobbin and repair patches. It cannot pay for hulls, general modules, final machinery or optional furnishings. Bobbin consumes 2 A + 1 G + 3 M once. Each tier budgets a failed local rescue with an additional **2 A + 1 M** patch, charged conservatively without later refund. Five failures plus the kit leave **4 A + 2 M**, enough for two further field patches. One failed attempt cannot exhaust recovery stock.

Baseline recovery uses the retained reusable kit, pod-rechargeable power and authored local tether/tow routes. Tow/in-place salvage consumes no new frame material: failed attachment reels Bobbin to its starter-accessible staging point; collars/canisters remain recoverable. Ordinary cargo can drop into a persistent identified cache, capped at 8 CU; it is temporarily unavailable, not a destroyed story/advanced item. Advanced frames, mounted refits and critical cargo return intact in pressure canisters. **Recovery salvage returns 100% of invested frame materials, including Mantle's ceramic/core/lattice, plus intact modules.** Rebuild from salvage needs no second advanced hull or endangered-region purchase. Optional dismantling must preview the same recovery guarantee for critical parts; no dismantling loop may multiply stock.

If no usable kit remains, or maintenance stock cannot pay one field patch, an explicit recovery-only shallow draw at the reef scrap/ribbon/glass habitats supplies a **bound kit or bound patch** through 20 seconds of active sorting. It never emits freely spendable raw stock; only the two recovery recipes accept it. Issuing another kit while one is usable is ineligible. Binding persists through repairs, salvage and dismantling: only the original public investment returns as freely spendable raw material; protected repair material returns to maintenance. This renewable shallow exception supports repeated failures without an infinite advanced-material route. Its world presentation and anti-siphon rules need implementation; it is not extra free public inventory in the budget proof. Material-free tow remains available when field-patch stock is empty.

Food is separate from the eight materials. Four shallow food patches guarantee 32 prepared meals; each tested campaign spends 20 normal plus five recovery meals and touches no protected emergency rations (four). A guaranteed two-meal gather/cook action at reef schools or island crops takes a candidate 20 active seconds, with no tool, advanced ingredient, respawn clock or spoilage. Recovery preserves enough feeding grace to reach them. Thirty–forty-five minutes per meal is a tuning assumption, not a tested meter. There is no thirst or population-scale meal requirement.

## Actual checks and limits

Run from any working directory with Node built-ins only:

```sh
node /home/worker/.t3/projects/subnautica-clone/docs/build/design/check-economy.mjs
```

Executed on 2026-10-17, exit 0. The check validates 7 regions, 8 materials, 6 hulls, 33 patch habitats/depths, a predecessor DAG and a fixed-point first-access graph covering **39 recipes**. Each of eight quantity scenarios pays one optional purchase per tier when selected, spends a recovery patch at every tier, and checks all public/protected ledger totals. Optional purchases are markers; cabin or Hush; thermal work set; survey array or carrier 550; extra locker. Purchases occur before upgrades wherever their own prerequisites allow.

| Strategy / first hull | Optional purchases | Public cost A/G/M/C/R/P/T/B | Safe first-shelf P/T/B remaining |
| --- | ---: | --- | --- |
| Creel / Dart | 0 | 57/20/48/17/5/22/12/13 | 10/12/7 |
| Creel / Dart | 5 | 64/25/56/21/8/25/15/14 | 7/9/6 |
| Creel / Creel | 0 | 51/17/46/17/5/22/12/13 | 10/12/7 |
| Creel / Creel | 5 | 58/22/54/21/8/25/15/14 | 7/9/6 |
| Carrier / Dart | 0 | 76/26/47/24/17/17/10/13 | 15/14/7 |
| Carrier / Dart | 5 | 90/32/58/30/20/23/14/16 | 9/10/4 |
| Carrier / Creel | 0 | 80/27/49/24/17/17/10/13 | 15/14/7 |
| Carrier / Creel | 5 | 94/33/60/30/20/23/14/16 | 9/10/4 |

Protected spend is an additional **12/1/8/0/0/0/0/0** in every row. Remaining shelf stock includes unspent material already collected in bundles. The carrier stress case leaves three glass, four membrane and four safe-shelf lattice units; buying all optional hulls is not the tested promise. Minimum Creel finishes with Creel alone; minimum carrier finishes with its initial Dart or Creel, Hearthline and Mantle. Neither needs every specialist. Six additional independent purchase branches quantitatively exercise all 39 recipes, including Dart/Hush refits, Spindle and replacement rack; they are not combined into a compulsory shopping list.

Each run also performs **20 numeric fleet-disable → salvage-wallet → rebuild-debit transactions**. With every hull rating set to zero, only shallow kit-source access is checked; salvage then restores invested frame/module material from escrow and pays reconstruction entirely from that wallet, with no public/protected stock draw. A bounded ordinary cargo drop/cache/return conserves material separately. This verifies transaction arithmetic and the proposed recovery rules, **not physical towing, actual game commands or a rendered salvage sequence**. Six rejection fixtures catch a recipe cycle, self-gated ceramic, insufficient lattice, advanced-frame loss, maintenance siphoning and an undersized final hold.

Assumed hand/frame actions are 3/10 seconds. The modeled bundled collection takes **71–106 actions / 213–346 active seconds**, excluding route finding, wildlife, approaches and transfer handling. Hull cruise/endurance candidates are Dart 8 m/s × 900 s, Creel 4 × 1200, Hush 6 × 1000, Spindle 7 × 1800, Mantle 3 × 900, Hearthline 3 × 1500. These are nominal tuneable inputs, not measured range, battery drain or return-margin proof. At 600 m, ordinary nominal legs are 75–200 seconds; the slow craft already exceed the 45–120-second route hypothesis, so shorten legs/open useful staging rather than extending empty transit. Collection and haul counts must not manufacture ten hours.

## Integration decisions and remaining evidence

No required pressure envelope or material-family conflict was found. Two implementation seams need explicit ownership: an external District stop must be restored on the first deep investigation, and carrier-only fabrication must never become the sole way to build final supplies. The 52-CU service holds are candidate values raised from the initial 48-CU estimate to retain four CU of slack.

Coordinator decisions before adoption: approve the 52-CU hold/48-CU load and service-pallet restriction; approve the visible recovery-only shallow renewal exception and its bound-output semantics; locate the external 650 m stop so its comfort cannot bypass the final machinery's independent air/power requirement; reconcile the carrier's 106-CU workload with actual midcampaign acquisition timing. These are integration choices, not new owner-preference questions.

Next, migrate approved quantities and IDs into the sole production registry, retain depletion/reserve/protected/escrow/container identity in saved state, and turn the relevant checks into simulation transaction tests. Keep this draft as evidence or retire it after migration, rather than importing it as a parallel registry. Freeze the integrated candidate and obtain the required independent Astra xhigh and Sol 6.1 max reviews.

Still unverified: ordinary-input first visits and final returns with **at least 25% oxygen/power remaining**; charging and food pacing; habitat visibility and retreat cues; all-advanced-hulls-disabled physical rescue staging, complete tether corridors and blocked-hatch salvage; collision, real cargo packing, cabin/head swaps, dry docking, repeated failures and save/load; each hull's useful mission; carrier acquisition timing; fresh-player route learning, ten-hour duration and enjoyment. Tables prove none of those runtime or human results.
