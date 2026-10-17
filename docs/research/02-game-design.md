# Game scope and design research

Research date: 2026-10-17. Scope: product design for an original, polished, complete small game. This is a proposed specification, not an implementation or a claim that an autonomous build will achieve it. HTTP/API research only; no browser used.

## Evidence and limits

**Fact — Subnautica's documented loop.** The developer/publisher's [Steam description](https://store.steampowered.com/app/264710/Subnautica/) explicitly connects oxygen management, collecting resources, crafting equipment, going farther/deeper for rarer resources, underwater habitats as storage/oxygen infrastructure, wildlife avoidance/distraction, and uncovering a mystery while seeking escape. Its listed biomes include shallows, kelp forests, caves and deep trenches. This is first-party product copy, sufficient to establish advertised mechanics; it does not independently establish balance, quality, or implementation details.

**Fact — Zombies, limited verification.** Activision's [Black Ops 6 product page](https://www.callofduty.com/blackops6/zombies) explicitly describes round-based Zombies, taking down undead hordes, two maps at launch, and later Directed Mode. The retrieved page does not describe its full resource economy. Several plausible official guide/deep-dive URLs returned 404 or timed out during this bounded investigation. Do not cite those failed requests as evidence for mechanics.

**Interpretation, not a newly verified historical claim.** A useful wave-survival design model is fight → earn → buy weapons/access → face harder encounters → choose survival or extraction. Treat that as the proposed comparison model here. The directly verified COD facts are round-based horde combat, maps and modes; prices, exact enemy behavior, weapon counts and specific progression systems are deliberately not asserted.

**Fact — “fishslop” has public candidates, but the intended reference remains ambiguous.** [GitHub's repository search API](https://api.github.com/search/repositories?q=fishslop) returned seven repositories during this session, including different fishing/aquarium projects. The primary-source [DingGengJia/fishslop README](https://github.com/DingGengJia/fishslop/blob/main/README.md) describes a third-person submarine aquarium: feed fish, collect coins, buy residents and upgrades, reach a milestone, save locally. It explicitly identifies a peaceful one-biome scope with no enemies or multiplayer. Its extensive performance/validation statements are author-reported, not independently reproduced here.

**Fact — a related author's attribution, not established benchmark provenance.** [jimrandomh/ultimate-fishslop's README](https://github.com/jimrandomh/ultimate-fishslop/blob/main/README.md) calls its aquarium stage inspired by “Theo Browne's fishslop benchmark,” then describes a larger staged narrative. That proves what this author says about inspiration; it does not authenticate the original benchmark, its canonical prompt, scores, model comparisons, or which project the user meant. No gameplay inspection or benchmark execution was performed. Do not invent a provenance chain or claim any candidate is definitively the user's reference.

## Lessons to carry into the prompt

**Design judgment.** Borrow relationships between systems, not recognizable expression. The useful Subnautica relationship is that a discovery creates a reason to craft, a craft expands safe reach, and expanded reach reveals another discovery. Oxygen makes distance consequential; distinctive landmarks make navigation learnable. A scene containing swimming, fish, and a crafting menu does not establish that relationship.

**Design judgment.** The corresponding wave-survival relationship is that combat earns a meaningful choice, that choice changes the next encounter, and escalating encounters eventually test mastery. A gun and an enemy spawner alone are similarly insufficient.

**Design judgment.** The public aquarium candidate illustrates an intentionally peaceful economy with an explicit milestone and persistence. That is a coherent game shape on its own. It is not evidence that “fishslop” requires survival horror, or evidence about what any model can build. Its lesson is to require a complete loop, readable feedback, and an endpoint appropriate to the chosen genre.

## Three original settings

All names are working titles; availability/trademark searches have not been performed.

| Proposed setting | Preserved strengths | Cost and risk |
| --- | --- | --- |
| **Siltwake: The Last Relay** — maintenance diver restores a geothermal listening observatory beneath an alien ice shelf; repaired air relays turn dangerous routes into safe corridors | Oxygen, discovery, depth, natural wildlife, restorative infrastructure, an observable environmental finale | Strongest fit; modular station pieces and stylized procedural life; no ocean surface simulation or vehicle physics required |
| **Cloudlung** — technician crosses floating biological gardens inside a gas giant research envelope, rationing breathable gas and anchoring refuges | Alien scale, air pressure, resource upgrades, striking silhouettes | Movement/camera can read as flight rather than diving; atmospheric navigation and gravity rules require extra teaching |
| **The Drowned Orchard** — botanist enters flooded vertical gardens of an abandoned reservoir city to restart its seed archive | Recognizable architecture, ecological mystery, oxygen pockets, upward/downward routes | More architectural collision and interiors; risk of cramped dark corridors obscuring the ecosystem fantasy |

**Recommendation: Siltwake.** An ice ceiling keeps oxygen pressure relevant without copying a crash landing or escape-from-alien-planet story. The player's purpose is repair and ecological observation. Deployable refuge infrastructure visibly changes route planning. The climax is restarting an acoustic guide network so a luminous migration can cross a restored thermal corridor; the player then reaches the observatory's ascent capsule. No infection cure, ancient alien enforcement weapon, borrowed vehicle silhouette, renamed franchise creature, or copied HUD is needed.

## Bounded campaign contract

**Recommendation — mandatory target:** one first-person, single-player 3D campaign, 30–40 minutes for a new player, with a reasonable 25–45 minute acceptance band. Experienced route knowledge may make it shorter; do not enforce duration with timers, repeated harvesting, or mandatory waiting. Produce an intentional fixed critical-path layout with seeded decorative variation. One connected playable volume approximately 400 × 400 × 140 game meters is an initial tuning envelope, not a size achievement. Shrink it if traversal is empty.

**Mandatory beginning:** player starts inside a damaged but breathable service bell, with an air hose audibly failing outside. Within 90 seconds, teach movement, ascent/descent, interact, oxygen refill, and a visible nearby landmark. First pickup and first crafted item occur within 3 minutes. First successful outward-and-return dive occurs within 5 minutes. Opening objective: restore the bell's local power and recover a technician's relay chart. Starting shelter never becomes unusable.

| Phase / target time | Mandatory objective and player action | Reward / next reason to explore |
| --- | --- | --- |
| 0–5 min: Bell apron | Collect common metal and membrane fiber within easy return distance; fabricate the seal kit; restore relay chart | Oxygen tutorial, repair feedback, two surveyed route headings |
| 5–12 min: Lantern terraces | Scan a harmless organism and a relay socket; craft tank extension; gather conductive nodules | Longer oxygen budget, first field relay repair, permanent refill point |
| 12–22 min: Silt forest | Follow relay signal into low visibility; use propulsion and nonlethal decoy around an active predator; recover the thermal coupling | Second air relay, new safer return route, pressure-liner recipe and final corridor location |
| 22–31 min: Furnace rift | Upgrade pressure liner; cross timed thermal plumes; use survey pulse to find a safe approach; recover acoustic lens | All components for guide-network restart; explicit return route and preparation checklist |
| 31–38 min: Crown chamber | Install coupling and lens at the central observatory; traverse three short activation stations during a changing current pattern | Thermal lights propagate through the map; giant migrators arrive; newly opened return current leads to ascent capsule |
| Final 1–2 min | Player pilots their own final swim through the migration, enters capsule, confirms departure | Distinct ending, completion time/discoveries, credits, continue-exploring and new-game choices |

**Recommendation — narrative economy:** 6 short discoverable technician records, at most 40–70 words each, 3 optional discovery vignettes, one concise objective journal. Reveal that the facility's noise disrupted migration and that its final repair retunes rather than amplifies the network. No mandatory dialogue walls, voice acting dependency, cinematic production pipeline, or branching plot. Every mandatory story fact also appears in readable journal text.

## Mandatory content floor

Counts are acceptance floors only when each item changes play. Do not inflate counts with recolors or repeated text.

| Content | Minimum meaningful implementation |
| --- | --- |
| Biomes | 3: Lantern Terraces (open cyan shallows, broad sightlines, benign schools); Silt Forest (amber suspended sediment, vertical hanging growth, predator concealment); Furnace Rift (violet/ember rocks, readable thermal plumes, fractured station machinery) |
| Landmarks | 6: service bell, hanging root arch, first relay gantry, collapsed listening dish, split thermal chimney, central observatory/crown. Each has a distinct silhouette visible before arrival |
| Creature archetypes | 6: small schooling glints; ribbon filter-feeders responding to currents; pulse-bell drifters with readable contact sting; territorial clamp hunter with an original three-fin radial body, shell-grip jaws and telegraphed chase; scavenging shell crawlers near deposits; massive passive sail migrator reserved for glimpses/finale. Name/anatomy review rejects franchise analogues |
| Behavioral depth | At least one school response to diver proximity; one hazard with windup and cooldown; predator patrol → investigation → warning → chase → disengage; decoy redirects investigation; one ambient species responds to restored relays |
| Resources | 6 visually distinguishable materials with biome distribution: scrap alloy, membrane fiber, silica beads, conductive nodules, ceramic flakes, thermal crystal. Critical coupling and acoustic lens are separate unique quest parts |
| Crafting | 8 useful recipes: mandatory seal kit, tank extension, swim impeller, pressure liner, survey pulse module, decoy cartridge; optional med patch and marker beacon. Relay repair uses materials at fixed sockets; journal always shows requirements/source hints |
| Equipment | Baseline scanner/lamp, four permanent functional upgrades (tank, impeller, liner, survey pulse), consumable decoy. Scanner teaches ecology and recipes; it is not a screenshot-only collection mechanic |
| Shelter/infrastructure | Starting service bell, two repairable air relays with shared storage access or deliberately simple local storage; refill and save at each. No modular base building required |
| Optional exploration | 3 compact side sites, each with its own geometry and reward: extra material cache, ecology record, or alternative route; no mandatory optional completion to finish |

**Recommendation — resource and movement rules:** no hunger/thirst meter in this campaign; oxygen, health and depth pressure supply enough survival pressure. Each upgrade has one legible effect. Tank starts around 75–90 seconds, extends to 130–150; refill stations and route distances must be tuned against measured real travel times. Normal safe route round trips consume at most 65–70% of available oxygen at intended equipment level. Sprint/impeller improves speed with a clear limited charge/cooldown, not a second crafting-dependent battery treadmill. Flashlight and baseline scanner never strand the player by becoming permanently unusable.

## Failure, persistence and softlock safeguards

**Mandatory:** oxygen warning has numeric seconds, a distinct audio cue and a directional home/relay marker. Pressure danger warns before the damaging zone, shows the required liner, and permits prompt retreat. Predators telegraph contact, have a bounded pursuit radius and cannot camp a shelter exit. No unavoidable jump-scare death.

**Mandatory:** death returns to the most recent safe shelter with full oxygen, restored baseline health, all equipment, recipes, journal progress, relay repairs and quest parts retained. Ordinary carried materials drop into one recoverable buoy; a new death merges or safely relocates the previous buoy rather than deleting critical progress. Respawn grants brief predator disengagement. Death should normally cost under 3 minutes of travel, never require starting over.

**Mandatory:** unique parts cannot be discarded, consumed by unrelated recipes, or trapped by a full inventory. Fixed quest resource placements exceed minimum requirements with at least a 2× budget; common materials replenish at known safe deposits or a cost-free recovery cache. Recipes cannot spend quest parts. Inventory always supports dropping ordinary resources. No resource-spawn roll determines whether the campaign is completable.

**Mandatory:** repair transactions, crafting and quest transitions validate prerequisites, apply atomically and save coherently. Restart after each major objective must leave a valid route forward. Sockets visually indicate repaired status. A “return to shelter” recovery action in pause rescues collision entrapment with an explicit lost-carried-material consequence, retaining quest parts and upgrades.

**Mandatory:** versioned local save, continue/new game, explicit overwrite confirmation, autosave at shelter/objective completion and safe periodic intervals. Save captures inventory, recipes, equipment, relay state, collected unique items, objective flags, discoveries and play time. On load, resume paused at the latest safe shelter so an underwater tab reload cannot cause instant drowning. Show save success/failure and disclose browser-local storage; if unavailable, say so before meaningful play and permit export/import where practical. Corrupt/unsupported save produces a recoverable menu, not a blank scene. Never silently delete a working save.

## Presentation and interaction acceptance

**Mandatory visual standard:** one coherent stylized art direction with designed silhouettes, consistent material scale, fog/lighting palettes per biome, animated vegetation and creatures, restrained caustics/particles, a physical foreground tool/hand or deliberately designed diegetic instrument, and visible environmental change after repair. No giant debug text, stock primitive swarm, stretched texture placeholders, copied commercial asset, or unreadable darkness. Geometry-only procedural assets are acceptable if authored silhouettes and materials look intentional.

**Mandatory interface:** title/continue/new game, loading feedback, controls, pause, settings, inventory/crafting, journal, contextual interaction prompts, death/recovery and ending screens. HUD prioritizes oxygen, health, depth, active tool and current objective without filling the center. Locked recipe shows missing quantities and where to search. Interactions show success/failure feedback. All menus operate by ordinary pointer and keyboard, pause simulation, and cannot leak movement clicks. Escape releases captured input. Lost focus pauses. Adjustable sensitivity, invert-Y, audio levels, subtitle/text scaling, reduced camera bob/shake, and adequate contrast are small high-value settings. Do not rely on color alone for threats, objectives, or pickup identity.

**Mandatory audio:** audible underwater bed, biome layers, spatial creature/relay cues where supported, propulsion/swim feedback, pickup/craft/repair confirmation, low-oxygen escalation, damage and a distinct finale swell. Start audio after a user gesture; mute and volume persist. No music dependency to understand critical information. Avoid constant alarm fatigue and unbounded overlapping sounds.

**Mandatory controls:** clearly explained six-axis swimming through forward/back/strafe and rise/dive; smooth bounded acceleration; stable horizon by default; responsive mouse look; collisions prevent passing through meaningful terrain. No mandatory controller or mobile support. Test alternate keyboard movement option if cheap; do not sacrifice the complete desktop loop for device breadth.

**Recommendation — measured performance contract:** coordinator states test host, viewport and quality preset; target stable 60 fps at 1280×720 on that host, p95 frame interval under 25 ms after warmup, with a low quality fallback aiming for at least 30 fps. These are proposed gates, not universal hardware guarantees. Measure an actual inhabited forest/predator scene and finale, not only an empty start room. No sustained multi-second traversal stalls, missing resource fetches, uncaught runtime errors or memory growth across repeated deaths/reloads.

## Definition of complete

**Mandatory evidence:** a fresh-save manual campaign completion through normal controls, with timing and a concise path log; a second save/resume run in the middle phase; deliberate oxygen death and successful recovery; attempted inventory overflow; depleted-resource recovery; and replay of the final objective from a saved pre-finale state. Automated tests cover quest-state reachability, recipe/quest-item invariants, save validation/migration, oxygen/death behavior and repair transactions. Rendering screenshots prove presentation, not objective completion. Debug teleport/forced victory is useful for subsystem QA but cannot substitute for the recorded normal completion.

**Mandatory player understanding:** a fresh player can identify the current objective, next destination, needed materials, safe oxygen source, and why a new upgrade matters from the game itself. If independent playtesting is unavailable, explicitly report that limitation; developer familiarity is not evidence of onboarding quality.

**Mandatory final outcome:** all three biomes are traversed, at least two tools change a route/encounter, the two relay repairs create useful safety infrastructure, a readable threat is overcome with player action, death is recoverable, progress survives reload, and the final migration/return produces an unmistakable ending. No “TODO final boss,” “future crafting system,” inactive menu button, or ending triggered by unrelated elapsed time.

## Cut order and stretch scope

**Recommendation — cut first:** extra side sites beyond three; extra recipe variants; day/night simulation; collectible breadth; decorative station rooms; third predator; elaborate cinematics; vehicle/submarine; modular base building; weapon combat; procedural infinite world; multiplayer; cloud/account saves; mobile/controller support. Vehicle and full base building are stretch only after completion and recovery gates pass, and should normally remain excluded for a one-shot build.

**Never cut to meet the schedule:** the complete objective chain, third biome's distinct traversal challenge, one credible predator, oxygen return planning, functional crafting consequences, death/recovery, persistence, ending, readable UI, working audio or honest verification. If the mandatory contract is too large, shrink world dimensions and decorative breadth before deleting system relationships. A tighter 25-minute complete campaign is preferable to a promised 45-minute unfinished map.

## Reusable genre benchmark

**Recommendation — benchmark coherent play, not asset count.** Freeze the prompt, permitted tools/assets, wall-clock budget, agent/model configuration and hardware; keep logs of interventions. Score the shipped artifact after normal-control play. Do not infer model superiority from a single uncontrolled run or benchmark against an unidentified “fishslop.”

| Axis / weight | Underwater campaign gate | Wave-survival alternative gate |
| --- | --- | --- |
| Complete loop / 25 | Explore → gather → craft → reach → repair → finale | Fight → earn → choose upgrade/access → harder wave → extraction |
| Agency and systemic consequences / 20 | Tools change route safety; relays change return planning; decoy affects enemy | At least 3 functionally different weapons, 2 competing spending choices, and arena access change tactics |
| Content and pacing / 15 | 3 distinct biomes, authored escalation, 25–45 minute endpoint | One well-designed arena with 3 unlockable connected zones, 3 enemy roles, 10 tuned waves and a final extraction; approximately 15–25 minute complete run |
| Usability and presentation / 15 | Legible oxygen/navigation, cohesive art/audio, tutorial integrated in first dive | Legible hits/damage/reloads, enemy windups, between-wave shopping, cohesive art/audio |
| Robustness and recovery / 15 | Saves, recoverable death, no unique-item/resource softlock | Pause/save at wave boundaries, restart, reliable spawning/pathing, no stuck final enemy or unwinnable purchase state |
| Evidence and delivery / 10 | Fresh-play ending plus resume/death/performance evidence | Fresh-play extraction plus loss/restart/resume/performance evidence |

**Recommendation — hard pass/fail before weighted scoring:** must launch from documented commands; have functional normal controls; have a reachable victory and loss/recovery path; preserve progress according to its stated contract; contain no placeholder essential system; and provide truthful evidence. A nonfunctional build cannot win through screenshots. Use 0–4 anchored ratings per weighted axis (absent, broken, functional, coherent, polished), report scores alongside observed failures and exact hardware. Thresholds and scoring anchors must be chosen before comparing submissions.

**Recommendation — generalization:** for tactics, require a complete small mission chain with meaningful opposing responses; for management, require an economic loop with an achievable goal and loss/recovery; for platforming, require an authored course with skill progression, checkpoints and an ending. Keep genre-specific contracts separate. None of these scopes promises AAA campaign breadth, original orchestral scoring, photorealism, multiplayer production, or thousands of bespoke assets.
