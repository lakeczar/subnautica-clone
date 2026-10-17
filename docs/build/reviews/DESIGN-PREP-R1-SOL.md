# DESIGN-PREP — independent Sol review, round 1

**Verdict: ACCEPT for DESIGN-PREP only.** No acceptance-blocking documentation or source-fidelity finding was identified. This verdict accepts the bounded research preparation and future critic procedure. It grants no M1, game-design, gameplay, milestone or release acceptance.

- Candidate: `c0aa5cb386a6b98ff8fa7c95d123d4f50d5bc378` (resolved from `c0aa5cb`; HEAD matched).
- Diff base: `c0bc4fcae7a0238b532bcac9b9dd56b4e5c0494a`.
- Reviewer: **GPT-6.1 Sol (`gpt-6.1-sol`), reasoning effort `max`**, as specified by this task and the injected runtime identity.
- Review date: 2026-10-17.
- Independence: fresh non-author reviewer. I did not read another DESIGN-PREP review, request its conclusions, dispatch children, edit the candidate, commit, push or perform PR work.

## Findings and required corrections

**None.** There are no P0/P1/P2 findings and no required correction before accepting this bounded deliverable. The evidence limitations below remain explicit; this verdict does not convert them into passes.

## Exact scope and inspected authority

I reviewed the documentation delta for `docs/research/04-game-design-review.md`, `docs/build/tasks/DESIGN-CRITIC.md`, and the corresponding additions in `docs/build/PLAN.md`, `docs/DELIVERY_AND_ACCEPTANCE.md` and `prompts/BUILD_GAME_REVISED.md`. Relevant DESIGN-PREP status/task bookkeeping was also inspected. Unrelated M1 documentation and production changes in the base-to-candidate diff are excluded from acceptance.

I read AGENTS.md and build STATUS first, then PLAN/CONTRACTS, the revised prompt, delivery rules, settled-decision map and historical tracker. I read the current EXPEDITION_INTEGRATION, WORLD_PROGRESSION, FLEET_AND_SURVIVAL, STORY_DESIGN and GRAPHICS_PIPELINE specifications. The historical research was consulted for relevant supersession/access context; its short-game design is not an acceptance specification. I did not open `docs/spoilers/NARRATIVE_CANON.md`.

Provenance resolves as supplied:

- Research author commit: `9d449e1b6913f8a9c8465bcdafe39f913d2c8e87`.
- Staged research: `cbc2fc645901dc0e2854b71fb72297f7a7277081`.
- Critic-brief scheduling commit: `a2cb19f1d4cd2d795b82642a2bd357f681d1c293`.
- Final availability/status candidate: `c0aa5cb386a6b98ff8fa7c95d123d4f50d5bc378`.

The research file is identical between its author commit, staged commit and reviewed candidate. Scope-limited `git diff --check` passed. All relative Markdown link paths in the five main deliverable files exist. The practical matrix contains exactly R1–R15.

## Primary-source verification

I independently retrieved all ten credited primary texts using HTTP. HTML and Steam JSON were inspected directly; both PDFs were parsed in memory with pypdf. No browser or game runtime was launched. The consequential cited claims below agree with the retrieved material.

| Source / candidate location | Independently checked evidence and result |
| --- | --- |
| **S1**, `docs/research/04-game-design-review.md:23` | The Unknown Worlds article returned HTTP 200 with its substantive text and displayed date 02.24.15. Its explicit problems include unclear resource locations/abstract names, duplicate recipes, inventory juggling for Cyclops construction, and single-use intermediates adding busywork without choices. Its revisions associate loot with source contexts, preserve old-area relevance, remove intermediates, condense titanium and introduce branching advanced components. Valve's publisher feed entry `515997419769156446`, “New Loot System,” identifies the original author as Charlie (Flayra), matching the attribution. **Supported.** |
| **S2**, `docs/research/04-game-design-review.md:27` | Steam feed entry `405677533508080906`, “Seamoth Update Released!”, is dated **2015-09-10 UTC** and signed Hugh with the Hugh Jeremy link. It explicitly discusses nonlethal defense, significant battery drain, sonar/storage and different loadouts for cave exploration versus hostile-resource collection. **Supported.** |
| **S3**, `docs/research/04-game-design-review.md:31` | Feed entry `3819571572130893407`, “Silent Running Update,” author Hugh, **2017-04-28 UTC**. “Rig for Silent Running” links operating modes to speed/light/noise and attack likelihood; “Sonar Contact” distinguishes active terrain and passive threat sonar; defense includes decoys/shields; “Abandon Ship” explicitly permits salvage of upgrade modules/equipment from the wreck. **Supported.** The report correctly avoids treating this as proof of Siltwake's stronger repeated/deep recovery requirements. |
| **S4**, `docs/research/04-game-design-review.md:35` | Feed entry `1980870483552153883`, “Voice of the Deep Update,” author Hugh, **2017-06-21 UTC**. Its “Silent Running 2.0” section explicitly reports feedback, a second pass, stronger shields, larger energy reserves and engine shutdown providing a silent safe haven. **Supported.** The report labels this historical developer-reported balance work and limits the transfer. |
| **S5**, `docs/research/04-game-design-review.md:39` | Feed entry `515997975634130855`, “Coming Next: Seabases,” **2015-02-27 UTC**. The article explains the cave-return dive line, the developer's experience standing on a deck watching outside life, prototype equipment/construction work and repeated PDA opening/closing as “clunky.” **Supported.** The report does not present this account as fresh-player comfort validation or request copying those mechanics. |
| **S6**, `docs/research/04-game-design-review.md:43` | Organizer-hosted PDF returned HTTP 200, **81 pages**, with title/author matching Kelsey Beachum. I inspected the extracted deck, including the cited one-based pages. Pages 13–24 support the curiosity/exploration/knowledge loop and knowledge-only rewards; 28–38 support physical hooks and player-pulled information; 39–41 show starting guidance; 45–46 address voices/individuals; 52–60 address story/navigation clues, backward/forward links and a log containing only certain knowledge; 61–73 address nonlinear smaller arcs, layered discoverability and intermediate emotional payoffs. **Supported.** The equipment-free Outer Wilds model is expressly excluded from transfer to Siltwake's capability progression. |
| **S7**, `docs/research/04-game-design-review.md:49` | Valve-hosted PDF returned HTTP 200, **6 pages**. Authors are Jason Mitchell, Moby Francke and Dhabih Eng. Sections 3 and 4.1–4.3 on PDF pages 2–3 directly support distinct silhouettes across distances/viewpoints, interior forms echoing silhouettes and control of high-frequency visual noise so value/color can emphasize gameplay features. The introduction supports readability across lighting. **Supported**, with the underwater/genre transfer properly identified as inference. |
| **S8**, `docs/research/04-game-design-review.md:53` | XAG 103 returned HTTP 200 and the substantive guideline. It explicitly calls for additional sensory methods for critical visual/audio content, another signifier for color information, and a nonvisual means even when multiple visual affordances exist. It explicitly rejects simulation filters as a replacement for affected-player testing. **Supported.** |
| **S9**, `docs/research/04-game-design-review.md:57` | XAG 101 returned HTTP 200. Its key areas include menus, HUD/prompts and errors. It specifies PC/VR minimum default body height **18 px at 1080p**, measured using ascender/x-height/descender pixels, and scaling up to **200% of minimum sizes** without loss of content/function/meaning. **Supported.** The candidate correctly treats these as reference guidance rather than newly adopted Siltwake thresholds. |
| **S10**, `docs/research/04-game-design-review.md:61` | XAG 104 returned HTTP 200. It distinguishes speech subtitles from captions for significant non-speech sounds, discusses initial access or default-enabled subtitles, direction for otherwise unclear/offscreen cues, readable backgrounds and preventing enlarged subtitles from hiding important gameplay/UI. **Supported.** The candidate does not silently adopt the entire guideline or its sign-language/platform provisions. |

The Steam fallback was reproduced exactly using the report's linked API:

`https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=264710&count=100&maxlength=0&feeds=steam_community_announcements`

It returned HTTP 200 with 100 entries and full `contents` fields for all four cited announcement IDs. Each corresponding `steamcommunity.com/games/264710/announcements/detail/<ID>` URL redirected with HTTP 302 to the generic announcement index, matching the report's warning. Thus the API link plus exact IDs, titles, dates and section names make the actual evidence recoverable despite the article-link redirects.

The Microsoft pages also reproduced the generic authorization notice in their shell while exposing the substantive public text. Each displayed “Last updated on 2026-03-04”; embedded `ms.date` and `updated_at` metadata differed, as the research explicitly notes.

For reproducibility, the retrieved PDFs' SHA-256 values were:

- S6: `8797a73b25defdc533dd54ba988ff188860d7b46f66760eeca75d673f242e4be`.
- S7: `4645483c9354c756d08788f604a69a5a7d7ecf47338a45de07ba33a222a89ad8`.

## Requirements, coverage and procedure assessment

**Source fact versus inference:** Research lines 19, 23 onward, 75 and 108 consistently distinguish developer-reported intent/mechanics, Siltwake-specific transfer, proposed checks and untested human-response hypotheses. The matrix is explicitly prospective; it does not claim to have observed a current defect. Numerical travel/reserve guidance remains a tuning hypothesis or existing specification check, not research-proven pacing.

**Preserved scope:** Research line 17 retains the first-time ten-hour main-story target plus optional exploration, seven habitats/eight material families, six piloted craft, both completion strategies, food without thirst, deterrence, recoverable loss and richer cel. R4/R5/R8/R14/R15 retain meaningful hull missions and interiors, noncompulsory optional hulls/logs, deep/repeated all-advanced-hulls-disabled recovery and preparation without manufactured chores. These agree with the revised prompt and integration/fleet/world specifications. The short, vehicle-free design and old cut order are expressly superseded. No added copied asset, mandatory combat progression, arbitrary new source yield or new certification requirement was found in this documentation scope.

**Timing and independence:** `docs/build/tasks/DESIGN-CRITIC.md:7` requires a fresh non-author Astra xhigh, no production authorship and separation from both technical reviewers. Line 9 requires the complete authored campaign after M3/early M4, a frozen SHA/artifact and rescheduling if prerequisites are missing. PLAN's M4 row and integration order, delivery lines 52/54/56 and revised-prompt line 72 agree. Research completion is not presented as completion of the late critique.

**Actual ordinary-play evidence:** The brief at lines 17 and 19 requires a player-facing pass before protected canon/solutions, identifies prior knowledge honestly and distinguishes played/watched/read/inferred segments. It requires actual rendered game evidence, both fleet strategies, optional hull missions, early/missed clues, refuges and repeated recovery. Research lines 97–102 add save provenance, ordinary-input reproductions, full strategy evidence and a compact observation ledger; targeted saves and debug actions cannot substitute for complete runs. Missing essential behavioral evidence stays open.

**Cross-system design coverage:** R1–R3/R9/R15 connect onboarding, geography, resources, crafting and campaign flow; R4–R8 connect fleet/interiors, ecology, tension, refuge and recovery; R10/R11 connect lore and out-of-order evidence to progression/payoff; R12/R13 connect art, audio, UI and accessibility to actual navigation and decisions; R14 connects survival burden to expedition motivation. The critic brief's aspect table preserves those relationships rather than reducing review to a feature inventory.

**Actionable correction loop:** The brief at lines 39–45 requires ranked, scene/route-specific findings with exact artifacts, player consequences, evidence/confidence, remedies/tradeoffs and verification steps. Every substantive finding receives a disposition. Bounded Sol max fixes lead to affected checks, a new frozen candidate and a fresh Astra T3 review task carrying prior findings/dispositions and unresolved objections. Functional/content/contract changes still require the existing fresh technical Astra/Sol pair. The report's optional triage vocabulary does not override the brief or delivery authority.

**Evidence and spoiler boundaries:** Research lines 3, 69–71, 101, 104 and 119, critic-brief lines 17/21/47 and delivery line 56 accurately keep model critique, human enjoyment/comprehension/duration and hardware evidence separate. No ordinary-text Siltwake reveal was found. The later authorized critic receives canon only after the player-facing pass and writes spoiler-bearing findings separately. Browser isolation/resource-preservation rules are included for that future work.

## Review limitations

- This is a documentation/source-fidelity review. I did not inspect or accept M1 production changes, run application tests, launch a game/browser, capture screenshots, assess the actual audio/rendering or perform a gameplay critique. No runtime or browser resources were created.
- The credited sources' relevant text was directly checked. Linked talk/example videos were not watched. PDF text verification does not constitute an independent visual study of every illustrated slide or game example.
- The Subnautica GDC video/caption failure and failed personal-site/USC thesis attempts at research lines 69–70 are the author's historical access observations. I did not independently reproduce those particular failures; the attempted thesis endpoint URLs are not specified. No credited finding depends on their inaccessible content. The thesis quotations used by S6 are visibly present in Kelsey Beachum's inspected deck and remain attributed to that presentation.
- Successful current retrieval supports the reported source content and access paths; it cannot independently prove every action taken in the author's earlier research session or establish the effectiveness of the developers' reported changes.
- I did not audit protected Siltwake narrative canon; that is intentionally unnecessary for this preparation-only verdict. Human surprise, enjoyment, accessibility outcomes, first-time duration, game behavior and representative-GPU performance remain unverified.
- This is one independent review, not the paired gate's aggregate result. The coordinator must obtain the other independent verdict on this exact frozen candidate and reconcile any findings before recording DESIGN-PREP accepted.
