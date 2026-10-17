# Siltwake final-input review

Initial review at planning commit `8a66bbc`: **No mandatory correction or blocking contradiction found in that planning input.** The dual-review workflow added later is a separate amendment. This is a static specification review, not evidence that the planned game is implemented, balanced, enjoyable or performant.

Reviewed `prompts/BUILD_GAME_REVISED.md`, `docs/EXPEDITION_INTEGRATION.md`, `docs/DELIVERY_AND_ACCEPTANCE.md`, `docs/FLEET_AND_SURVIVAL.md`, `docs/WORLD_PROGRESSION.md`, `docs/STORY_DESIGN.md`, `docs/GRAPHICS_PIPELINE.md`, `GLOSSARY.md`, the planning map and decision tickets. Read the labelled canon only to verify its machinery/access, clue placement, optional-record and ending dependencies. No truth spoilers are repeated here. Ignored the coordinator’s explicitly in-flight README/AGENTS/ticket status edits.

## What holds together

- **Progression:** The proposed material-depth chain is acyclic: early materials at or above 150 m enable 350 m; ceramic at 250–285 m and core at 280–320 m enable 450 m; lattice at 360–390 m enables 800 m. Basic and later personal suit tiers are explicit, so hull capability is not mistakenly treated as exit protection. The carrier’s separate 400/550 m path is reconciled with these shelves. Actual oxygen, source quantities, blueprint placement and round-trip budgets are appropriately required before content multiplication rather than presented as proven.
- **Fleet:** All six hulls are production scope, while only suitable subsets are required for completion. Upgraded Creel/service stops and Hearthline/Mantle are compatible alternative strategies. A medium craft occupies the whole bay; two compact craft can coexist. Isolated dry berths plus a separate launch lock protect a stowed Spindle. Station keeping, blocked exits, atomic docking and save interruptions have explicit checks.
- **Recovery:** The plan explicitly covers loss of every advanced hull. Bobbin’s kit, power and full tether are shallow-accessible; every loss-capable site must have starter-accessible staging and an authored retrieval route. In-place salvage preserves advanced frame materials as well as modules. Reusable recovery supplies and repeated-failure checks prevent the one-successful-rescue assumption. These remain mandatory level-design/runtime gates, not established feasibility claims.
- **Story integration:** Exterior approaches do not bypass the internal machinery boundary. Optional personal records are not interaction keys; required procedures have local facility/schematic sources. Out-of-order evidence persists. The canon’s decisive clues have corresponding world placements and independent earlier support. The public appendix is correctly described as spoiler-labelled rather than private.
- **User choices:** Discovery-first exploration, richer cel iteration, food without thirst, stealth/deterrence, broader inhabited/deployable fleet, preserved knowledge, regional leads and dedicated-GPU targeting are consistent across the active specification.
- **Scope and evidence:** About ten hours remains a first-time human-play target. Browser delivery and 1080p/60 fps are selected targets, not claims proved by SwiftShader art captures. Functional candidate delivery with human/performance criteria unverified is expressly allowed without claiming full acceptance. Game construction remains deferred until owner submission of the reviewed input.
- **Orchestration:** The prompt specifies Astra coordination and engineering/lore/world/QA, Sol 6.1 at max for original graphics, live catalogue verification, bounded concurrency, coordinator ownership, committed worktree baselines, durable task IDs and status inspection before retry. Feature/draft PRs have explicit integration bases and a final integration PR; owner review remains distinct from main merge/deployment.

## Still required during construction, already present as gates

The future coordinator must instantiate recipes/source quantities and blueprint locations, prove normal-control route margins, test the full rescue topology, implement/save-test carrier transitions, play both completion strategies and each optional hull’s niche, and obtain or clearly qualify fresh-player and dedicated-GPU evidence. Their absence from a planning-only run is not a defect or permission to call them verified.

## Narrative review and sources

A separate Astra audit raised three narrative consistency issues: historical/present route causality, independent support for the personal reveal, and optional-record handling. The coordinator revised the canon; a limited second review passed all three. Details stay in the spoiler appendix rather than this owner-facing summary.

The live T3 catalogue confirmed `gpt-6-astra`, `gpt-6.1-sol` and the Sol `max` reasoning option during this planning run. The next build must discover them again. Tool lifecycle and worktree semantics come from the live T3 tool schemas, not invented public API guarantees.

Official OpenAI guidance was fetched for [persistent agent instructions](https://learn.chatgpt.com/docs/agent-configuration/agents-md) and [prompting Codex](https://learn.chatgpt.com/docs/prompting). It supports explicit context, behavioral constraints and verification in the input. These sources do not establish availability of custom model IDs in T3; the live catalogue does.

## Document and review-viewer checks

At `8a66bbc`, the coordinator checked whitespace, local Markdown link targets, all fifteen unique canonical clue IDs against their world placements, and the eight unique material-source rows. The review viewer contained that revision's complete 17,023-character / 2,254-word input, six fleet roles and functioning section selection. Its 728-pixel T3 HTML preview produced no console errors. That viewer predates the dual-review amendment; the current [build input](../prompts/BUILD_GAME_REVISED.md) is authoritative. These are document/viewer checks, not gameplay tests.

## Dual-review amendment — 2026-10-17

Batch: `planning-review-contract`. Specification/base: `8a66bbc4419c92e6d0872203143be48885d82c54` plus the owner's request for Astra xhigh and Sol max reviewers of completed/delegated work. Candidate: `c2f129bc357917618daafaf99212d4e9c3520c90`. Scope: the eight changed documents defining coordinator effort, feature/batch and integrated milestone coverage, reviewer independence, correction rounds, evidence records and the existing planning-only boundary.

| Independent reviewer | Native task ID | Model / effort | Findings and verdict |
| --- | --- | --- | --- |
| [Astra report](../.scratch/siltwake/artifacts/review-contract-astra.md) | `/root/review_contract_astra` | `gpt-6-astra` / `xhigh` | No mandatory corrections or blocking findings; **ACCEPT** candidate `c2f129b` |
| [Sol report](../.scratch/siltwake/artifacts/review-contract-sol.md) | `/root/review_contract_sol` | `gpt-6.1-sol` / `max` | No mandatory corrections or blocking findings; **ACCEPT** candidate `c2f129b` |

Both reviewers were spawned separately with explicit model/effort and no inherited conversation, authored none of the amendment, and formed their initial findings without seeing the other report. The native spawn records establish the requested configurations; the live T3 catalog separately confirmed their availability. Coordinator self-inspection was additional. No fixes or rejected findings were needed, so no correction round was necessary.

At the candidate, whitespace checks passed and all 52 relative Markdown link targets resolved across 28 tracked Markdown files. The review anchor exists. The revised input is 17,787 characters / 2,350 words. Both reviewers independently checked the diff's whitespace. These checks establish documentation consistency only; no game/browser construction, gameplay tests, human playtests or GPU measurements were performed. The later report-recording commit does not change the reviewed contract and is not represented as independently reviewed.

## Main-builder amendment and restart handoff — 2026-10-17

Batch: `planning-main-builder`. The owner selected Sol 6.1 max as the main builder with Astra setting direction and asked about compaction. Base: `8abcb1c1bcbe94bf199c80e7d1b4dc087da5d863`. Initial candidate: `702cd59bd28fa92d8a45d929623c04f3e770d2d3`. Accepted candidate: `6234042782e3a1723c7e80f9443ed5007f99625b`. The prompt and active role documents now assign production implementation to Sol while Astra coordinates; the map points to a durable restart handoff. Preparing that handoff neither performs compaction nor starts construction.

The same independently configured native reviewers examined the amendment without candidate authorship. Both separately found one P2: the active story contract still assigned an Astra lore writer. The coordinator corrected it at `6234042`: Astra directs and approves canon changes, while Sol 6.1 max authors/implements lore and canon edits under exclusive paths. Both reviewed the correction against the original scope and explicitly accepted the same full candidate. No finding was rejected or remains unresolved.

| Reviewer / native task ID | Initial independent report | Correction-round report | Model / effort and final verdict |
| --- | --- | --- | --- |
| `/root/review_contract_astra` | [Astra round 1](../.scratch/siltwake/artifacts/main-builder-astra-round1.md) | [Astra round 2](../.scratch/siltwake/artifacts/main-builder-astra-round2.md) | `gpt-6-astra` / `xhigh`; **ACCEPT** `6234042` |
| `/root/review_contract_sol` | [Sol round 1](../.scratch/siltwake/artifacts/main-builder-sol-round1.md) | [Sol round 2](../.scratch/siltwake/artifacts/main-builder-sol-round2.md) | `gpt-6.1-sol` / `max`; **ACCEPT** `6234042` |

At the initial candidate, all 59 relative Markdown links resolved across 31 tracked Markdown files; both reviewers also checked the 37 relative links in the seven changed files. The correction retained those link targets. Whitespace checks passed at the accepted candidate. The current full input is 18,418 characters / 2,439 words. These are static document checks, not game, browser, fresh-player or hardware validation. Later evidence-only bookkeeping cites these reviewed commits and is not itself represented as independently reviewed.
