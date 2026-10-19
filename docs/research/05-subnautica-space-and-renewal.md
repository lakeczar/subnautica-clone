# Subnautica: ocean scale, expeditions and resource renewal

Research: **2026-10-19 UTC**. Scope: **original Subnautica**, Steam app **264710**, not *Below Zero* or *Subnautica 2*. Historical developer statements establish intent; current community documentation supplies measurements and some item-specific rules. No shipped-game code or current game session was inspected. This is research and advice, not a Siltwake implementation audit or specification change.

**Answer:** Subnautica combines a fixed, authored world several kilometers across with deep, connected cave routes. Its advertised loop explicitly exchanges farther/deeper exploration for rare materials and better equipment. **Ordinary inorganic resources are not intended to replenish merely because the player leaves and returns.** Growth, fish respawn, captive breeding, animal outputs and a specific resource-producing machine are separate mechanisms. [S1], [S2], [S5], [S12]

## Scale and spacing

| Question | Supported answer | Precision limit |
| --- | --- | --- |
| Horizontal playable crater | Community documentation describes an irregular **3.3–4.3 km diameter**, commonly summarized as approximately **4 × 4 km**. | A bounding envelope, not 16 km² of uniformly accessible seabed. No directly inspected developer survey establishes an exact release-map area. [S7] |
| Why some sources say 2 km | The wiki transcribes the PDA's **“2km x 2km volcanic crater”** description, and explicitly distinguishes that from the larger actual map. | In-world description and measured playable geometry should not be silently substituted for one another. The transcription was read; the game asset was not. [S7], [S8] |
| Depth | Main natural-biome progression reaches roughly **1.5 km below sea level**; the community lists the deepest natural biome at **1,280–1,470 m**. | This is a biome range, not a surveyed deepest interior point. Void travel/reset limits and a vehicle's 1,700 m rating are different quantities. [S8], [S9], [S17] |
| Layout | Obraxis, explicitly marked **developer**, states: **“The game is not procedurally generated. It has been hand-crafted.”** (2018-01-06). | This establishes authored geography, not identical placement of every loose pickup in every save. [S2] |
| Biome spacing | Distinct habitats connect both horizontally and vertically. The community documents four entrances to the deep Lost River from different outer biomes. | No primary source found defines one regular inter-biome spacing or one optimal expedition distance. Route shape, visibility and available returns matter alongside straight-line meters. [S10] |

The useful comparison is therefore a compact, layered **region** of an ocean planet, rather than an ocean-sized simulation. Its effective exploration space includes cave entrances, vertical changes, dangerous approaches and return routes inside the horizontal envelope.

## Why another expedition earns its equipment

**Primary evidence:** Unknown Worlds' current [store description][S1] says to craft diving gear, habitats and submersibles, then **“Venture deeper and further … to find rarer resources, allowing you to craft more advanced items.”** Bases store resources, park vehicles and replenish oxygen. This directly supports prepare → explore → gather → return → upgrade → push outward; that sequence is a synthesis of the described mechanics, not a quoted formal rule.

Charlie Cleveland's **2015-02-24** design essay explains the geography behind it: recognizable resource contexts help players remember where to go; deeper areas need special rewards for greater light/oxygen/creature danger; earlier areas should remain useful as players descend. It also rejects excessive single-use intermediates as **“extra busy work and no choices.”** These are historical design principles, not a current rule that every material occurs in exactly one biome. [S3]

Equipment changes the expedition's task as well as its depth. The **2015-09-10 Seamoth update** recommends food, sonar, defense and an extended battery for caves, versus defense and empty cargo compartments for hostile resource collection. [S4] A concrete current **community-documented** example is kyanite in the deep volcanic zone, used in advanced vehicle modules: upgrading the Cyclops MK2 module into MK3 uses kyanite and raises safe depth from **1,300 to 1,700 m**. [S11], [S17] This illustrates material → capability → another route, without asserting that increasing depth alone creates interesting play.

## Normal respawn versus actual renewal

**Explicit developer answer, including the question's scope:** On **2019-02-02 UTC**, a player asked Charlie whether **“inorganic resources (such as resource outcrops, quartz, metal fragments etc)”** are *supposed* to respawn. Flayra replied: **“Nope - they don't respawn.”** Both the parent question and developer reply were retrieved through Reddit's own public embeds. This is the developer's statement, not a fan's recollection. [S5]

It agrees with a directly inspected **2016-01-26** Steam reply, with the author marked **developer**: **“We currently don't have plans to respawn the mineral resources.”** That reply instead proposes larger mineable quantities requiring drilling. [S6] Neither source supplies a mineral replacement interval, and a large deposit is not automatically a renewable deposit.

| Source or category | What renews, and what must remain distinct | Evidence |
| --- | --- | --- |
| Ordinary inorganic pickups, outcrops, loose quartz and metal fragments/salvage | Treat ordinary stock as depletable; leaving an area is not a documented normal refill operation. This does not exclude the specific producers below. | Direct developer intent, 2016 and post-release 2019. [S5], [S6] |
| Small wild fish | Intended to respawn after being killed/eaten by the player or other creatures. **Do not generalize this to every predator or leviathan.** No reliable universal cooldown was established. | On **2016-07-01**, developer Squeal Like a Pig explicitly corrects Obraxis' earlier contrary answer in the same thread: small-fish respawn **“has been designed and coded to work that way.”** [S12] |
| Captive breeding | Suitable species reproduce in Alien Containment when compatible adults and enough space remain. This is controlled reproduction, not wild mineral replacement; not every creature is breedable. | Farming update establishes containment; current details and transcribed in-game breeding guidance are community fallback. [S13], [S14] |
| Plants | Growbeds/planters multiply supported plants from seeds, spores or specimens. This can renew **crafting ingredients**, not just food. Fruiting plants can regrow their harvest: Creepvine seed clusters regenerate on a surviving plant. Removing/destroying the whole plant is different; do not assume every wild plant or coral regrows. | Official farming introduction plus community Seeds/Creepvine rules. [S13], [S15], [S24] |
| Sea Treaders | Movement generates temporary shale outcrops, yielding **gold, lithium or diamond**; feces can fuel a bioreactor. These are newly generated outputs of a living source, not every mined shale node respawning. | Official **2016-06-01 Power Nap** update describes rocks/manure; it uses the old term **basalt**. Current shale identity/output list is community documentation. [S16], [S18] |
| Stalkers and Gasopods | Stalkers can repeatedly shed **teeth** while handling metal; Gasopods release collectible **gas pods**. Moving existing scrap does not establish production of new scrap or titanium. | Primary creature-loot/design and Gasopod update; precise tooth behavior is community fallback. [S3], [S16], [S19] |
| Production machines | Powered filtration produces **water and salt**. A particular late-game **ion-cube generator** recreates its deposit; this exception is local to that machine. | Community descriptions and transcribed databank information; no direct current code check. Locations/story purpose omitted. [S20], [S23] |
| Reefback barnacles | Documented drops are **copper and silver**. The retrieved source does **not** establish replenishment of harvested barnacles. Do not budget them as guaranteed infinite minerals. | Community fallback only. [S21] |

**Loading and intervention are separate evidence classes.** The small-fish developer clarification also reports streaming bugs where creatures disappear after departure and fail to return. That is a loading fault, distinct from intended population renewal. [S12] A pickup appearing after an update, reload, cache reset, console use or mod does not by itself prove normal replenishment. This investigation did not diagnose any particular reported mineral reappearance, verify a replacement-elsewhere algorithm, or establish item-by-item timing on the latest build. No universal leave-and-return mineral timer was found.

## Source quality and remaining uncertainty

| Claim | Best evidence inspected | Confidence / boundary |
| --- | --- | --- |
| Authored world and expedition rationale | Developer-marked Steam reply, Cleveland's essay, official store/update texts | Strong for intended design; historical recipe values were not adopted. |
| Normal inorganic non-respawn | 2019 Flayra answer **with its parent question**, corroborated by 2016 developer reply | Strong for intended original-game behavior; not an exhaustive current-platform bug audit. |
| Small-fish respawn | Direct developer correction, 2016 | Strong for intended behavior; exact rates and current species roster unverified. |
| Exact scale, deep-route ranges, present recipes | Current Subnautica Wiki, explicitly a **community secondary source** | Useful fallback, not developer-certified measurements or a reproduced survey. |
| Specific renewable outputs | Official farming/Power Nap updates plus community item pages | Mechanisms supported; current item-specific details rely partly on secondary documentation. |

All cited material was read via **HTTP/API**, without a browser. The original Unknown Worlds forum size discussion timed out; Fandom and several ordinary Reddit/API requests were blocked or empty. Search snippets were leads, not factual authority. Reddit's public embed endpoint supplied the actual 2019 question/reply. Official Steam announcement bodies were obtained from Valve's [news API][S22], preserving publisher attribution and dates. Sources from *Below Zero* and *Subnautica 2* were excluded from the conclusions.

## Implications for Siltwake — recommendations, not specification changes

1. **Make geography buy capability.** Each outward/deeper trip should expose a recognizable material, observation or route that changes preparation for the next trip. Retain reasons to return to earlier habitats; do not replace that relationship with empty distance or repeated generic pickups.
2. **Distinguish finite stock from a producer.** If renewable materials are desired, define an observable regional source, its output and persisted depletion/growth state. Avoid treating scene unloading as ecological regeneration. Keep first-access and recovery stock independently reachable; importing randomized critical yields or mandatory waiting is not justified by these sources.
3. **Separate dependable subsistence from expansion.** Farming and breeding can reduce repetitive survival chores while rare materials still motivate exploration. Renewable plant ingredients and ecological mineral outputs demonstrate options, not a requirement to copy Subnautica's species or recipes.
4. **Evaluate routes before multiplying coordinates.** Root supplied the audit context: current bounds **324 × 326 m**, planned envelope **2.0 × 1.8 km**; ordinary material stock/reserves finite, active tending renewable for food/maintenance. Those figures were **not independently re-audited here**. The rectangular envelopes are about **0.106 versus 3.6 km²**, approximately **34×** apart in area, not necessarily traversable content. Measure useful round-trip cargo, decisions, return margins and empty travel when reconciling scale; Subnautica's dimensions do not prescribe Siltwake's target.

These recommendations leave the accepted Siltwake specification and implementation ownership with the coordinator and assigned builders. No gameplay, enjoyment or campaign-duration acceptance is claimed.

## Retrieval and execution receipt

- Exact clean starting HEAD: `8166dc97a7252c1125473d330e03438d24f76039`; separate T3 worktree `/home/worker/.t3/worktrees/subnautica-clone/t3-2f543bdd`, branch `t3/research-subnautica-space-renewal`.
- T3 configuration and original Codex `turn_context` both confirm **gpt-6.1-sol / max**; origin **T3 Code**, session `01a153eb-f5ba-7471-9cc8-a4eb3848fe6c`. Runtime receipts are retained below.
- Supporting artifacts: `/tmp/siltwake-space-research/`. `source-evidence.json` records retrieval URLs/status, selected supporting excerpts and local payload hashes; `retrieval-index.json` includes failed attempts. `runtime-receipt.json`, `t3-configuration.json` and `checkout-receipt.json` preserve execution provenance. Downloaded bodies remain outside the repository.
- Only this report is committed. No browser, server, child agent, peer polling, production edits, push, PR or merge.

[S1]: https://store.steampowered.com/app/264710/Subnautica/
[S2]: https://steamcommunity.com/app/264710/discussions/0/1621724915812995831/?ctp=3#c1621726179572150157
[S3]: https://unknownworlds.com/en/news/new-loot-system-tech-tree-design
[S4]: https://steamcommunity.com/games/264710/announcements/detail/405677533508080906
[S5]: https://embed.reddit.com/r/subnautica/comments/am8zk2/thank_you/efk9kp2/?ref_source=embed&ref=share&embed=true
[S6]: https://steamcommunity.com/app/264710/discussions/0/458606877335655283/#c458607518207234327
[S7]: https://wiki.subnautica.com/sn/The_Crater?oldid=581096
[S8]: https://wiki.subnautica.com/sn/Crater_Edge
[S9]: https://wiki.subnautica.com/sn/Lava_Lakes?oldid=579449
[S10]: https://wiki.subnautica.com/sn/Lost_River
[S11]: https://wiki.subnautica.com/sn/Inactive_Lava_Zone
[S12]: https://steamcommunity.com/app/264710/discussions/0/358416600606309080/?ctp=2#c358416640391694410
[S13]: https://steamcommunity.com/games/264710/announcements/detail/3819571572130894749
[S14]: https://wiki.subnautica.com/sn/Alien_Containment
[S15]: https://wiki.subnautica.com/sn/Seeds
[S16]: https://steamcommunity.com/games/264710/announcements/detail/3819571572130894335
[S17]: https://wiki.subnautica.com/sn/Cyclops_Depth_Module_MK3
[S18]: https://wiki.subnautica.com/sn/Shale_Outcrop?oldid=580126
[S19]: https://wiki.subnautica.com/sn/Stalker_Teeth
[S20]: https://wiki.subnautica.com/sn/Ion_Cube
[S21]: https://wiki.subnautica.com/sn/Reefback_Leviathan
[S22]: https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=264710&count=100&maxlength=0&feeds=steam_community_announcements
[S23]: https://wiki.subnautica.com/sn/Water_Filtration_Machine
[S24]: https://wiki.subnautica.com/sn/Creepvine

Additional inspected context: [2019 parent question](https://embed.reddit.com/r/subnautica/comments/am8zk2/thank_you/efk9bix/?ref_source=embed&ref=share&embed=true), [Creepvine regrowth](https://wiki.subnautica.com/sn/Creepvine), [filtration outputs](https://wiki.subnautica.com/sn/Water_Filtration_Machine), [Sea Treader behavior](https://wiki.subnautica.com/sn/Sea_Treader_Leviathan), [Cyclops MK2 and MK3 ingredient context](https://wiki.subnautica.com/sn/Cyclops_Depth_Module_MK2). The [original developer permalink](https://www.reddit.com/r/subnautica/comments/am8zk2/thank_you/efk9kp2/?context=10000) returned an empty shell; its content was read through Reddit's own embed above.
