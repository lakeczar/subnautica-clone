# Content and asset manifest

Foundation runtime identifiers and asset metadata live in `src/content/registry.ts`, authored by Sol 6.1 max at `8d72dd2` and accepted by both reviewers at `50f5569` for the foundation scope. This file indexes ownership, provenance and acceptance; it does not duplicate recipe quantities or canon prose.

| Group | Authoritative source | Production status / evidence |
| --- | --- | --- |
| Regions, source habitats, eight materials | [World](../WORLD_PROGRESSION.md), [integration](../EXPEDITION_INTEGRATION.md) | Stable roster IDs seeded; only foundation pod/reef/island geometry is active. ECO-01 source/recipe proposal remains provisional |
| Six piloted hulls and Bobbin | [Fleet](../FLEET_AND_SURVIVAL.md) | Stable roster IDs seeded; functional assets/interiors/roles pending |
| C01–C15 and scene history | [Story](../STORY_DESIGN.md); labelled canon appendix for assigned workers | Design only; spoilers excluded from this index |
| Richer-cel reference assets | `20711d1:.scratch/siltwake/art-prototype/` on art branch | Original editable Sol geometry; reference, not production architecture |
| Production foundation environment/ecology/UI | [Graphics contract](../GRAPHICS_PIPELINE.md); `src/render/`, `src/ui/`, `public/siltwake.svg` | Original Sol procedural terrain, reef ribs, pod, decorative marine life, shaders and SVG identity. Metadata in `ASSETS`; FND-01 accepted at `50f5569`; integrated M0 accepted at `d415436`. Island/reef density remains early art |
| Functional fleet, campaign assets and audio | [Graphics contract](../GRAPHICS_PIPELINE.md) | Pending original Sol 6.1 max construction and runtime review |

Each production entry must identify stable ID, source/generator, dimensions/pivot, material slots, semantic/interaction role, habitat/capability association, license/provenance and review batch. Bundle all required runtime content. Record generated local audio sources alongside geometry; no remote asset or live-model dependency.


## Provisional M1 additions

Accepted game source above remains M0-only. Feature source `ef6608f` stages CORE, VISUAL and PRESENTATION; see [assembly and limits](evidence/M1-ASSEMBLY.md). The runtime registry owns early source/recipe IDs, C01–C04 provenance and the first Dart; carrier/medium/Spindle scenes remain seeded feasibility, not campaign acquisition. Full campaign content is still pending.

Original deterministic Sol richer-cel geometry is in the six VISUAL leaf files at `6c533ca`. Retained semantic batches include `refuge.pod`, `ecology.filters.<source>`, `ecology.grazer.<source>.<n>`, `source.<source>`, `facilities.context`, `ecology.sound-hunter` and `carrier.physical-compartments`; new roles `ecology.holdfast.<source>` and `ecology.hunter-warning-fin.<side>` describe persistent habitat hosts and state-driven warning anatomy. Source habitats and interactions read the registry; decoration does not invent collectible IDs. Facilities use world coordinates; craft/shell/fins use local parent pivots. Palette slots live in `palette.ts`; signs are generated system-sans textures with explicit disposal. Dart bounds remain inside the existing berth envelope. [VISUAL evidence](evidence/M1-VISUAL.md) records dimensions, comparisons/provenance and the intentionally unresolved opaque panes/cockpit/atmosphere. These additions remain unaccepted until the paired related-batch and integrated M1 gates.
