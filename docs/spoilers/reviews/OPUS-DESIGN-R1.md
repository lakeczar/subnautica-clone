# OPUS-DESIGN-R1 — spoiler appendix

**MAJOR STORY SPOILERS.** This is the labelled companion to [`docs/build/reviews/OPUS-DESIGN-R1.md`](../../build/reviews/OPUS-DESIGN-R1.md). It is for the coordinator and the lore/world integration workers. Keep its content out of owner-facing summaries, PR descriptions and objective labels.

Reviewer: Claude Opus 5.5, effort requested `high` (see the main report for the verification limit). I read the canon **after** the player-facing pass and bounded live play. Basis: `docs/spoilers/NARRATIVE_CANON.md` at `a5260c9`, and `src/content/registry.ts` `OPENING`/`EVIDENCE` at production `47d8872`.

## Strengths of the canon worth protecting

- **SP-S1 The disaster is the resource ecology.** Filter communities concentrate brine. Extraction disturbed them. The first material the player harvests, shed filter membrane, comes from those same colonies. C02 → C04 → C06 → C11 turn "where do I find membrane" into "what broke this place". That is the strongest integration in the whole design: the survival loop *is* the investigation. Keep every scan entry for membrane/lattice consistent with this chain, and let later evidence explicitly recontextualize the player's own early harvesting.
- **SP-S2 The reveal is a reversal of meaning, not of facts.** Rescue rather than massacre, and a decision Ren really made. It respects earlier evidence and does not erase the six deaths. The open moral disagreement (Tavi) is the right ending tone for "consequential and somewhat shocking".
- **SP-S3 The finale reuses capability.** Independent air/power plus the hydraulic bypass procedure means the ending is solved by preparation and skill the game has already taught, not by a key item.

## Findings

### SP-01 · P2 · high · D — The opening and C01 give away the arrival-direction discovery at T0

- **Code:** opening phase 0 caption "Pressure alarm. **Upward motion.**"; phase 1 "The pod **rises through black water**"; C01 hypothesis "**An underwater launch fits the hardware.**"
- **Canon:** C01's intended first interpretation is *"Crash debris or an underwater launch"*. Act II lists *"Discover that the pod came from below"* as a playable consequence. Pod engineering is meant to *foreshadow* the reversal independently.
- **Consequence:** Within the first 30 seconds the player is told in plain text that they came up from the deep and were launched. A genre-literate player will then read C03 (unused departure supplies) and the deep settlement as "people are down there" far earlier than Acts II–IV intend. The canon itself says early guessing should feel perceptive, but here the guess is supplied rather than earned.
- **Change:** Keep the sensation physical but ambiguous ("Pressure alarm. The pod lurches; your stomach drops."). Let visuals carry it: bubbles streaming *past* the window can be read either way. Phrase the C01 hypothesis with both readings as canon specifies ("Crash damage, or a launch from depth: the ballast residue fits either."). The ascent then becomes something the player proves at C07, which is the real payoff.
- **Verify:** the opening and C01 contain no text asserting direction; C07 is where direction is confirmed.

### SP-02 · P2 · medium · I — Give optional hulls story-bearing optional sorties drawn from the canon

To answer the main report's campaign risk without making any hull mandatory:

- **Spindle — the island mast.** Canon: repairing the mast permits later rescue communication but cannot replace the local solution. A surface-tender mission to haul mast parts between the three islands is a natural, exclusive-feeling Spindle sortie. The reward is an epilogue variation or a distant-contact beat, not progression.
- **Hush — listening to the district.** A quiet survey near Meridian could pick up a slow, regular mechanical pulse beneath the terraces. That would be an *optional* corroborating physical observation of active life-support, consistent with C08/C10 and never replacing C13. The writer/coordinator must decide whether this counts as a fourth independent foreshadow or stays atmospheric; it must not become a progression flag.
- **Mantle — the gate machinery.** Precise station keeping at the hydraulic-bypass exterior fixture fits Mantle's niche on the carrier route. The Creel route must keep an equivalent sheltered-approach solution.
- **Hearthline — "make somewhere to wake".** Act V is about preparing habitation. Let a furnished Hearthline serve, *optionally*, as the first recovery ward / galley for the first awakened survivor, with the restored upper living area doing the same job on the Creel route. That gives the most expensive vessel an emotional payoff tied to the ending without making it a plot lock.

### SP-03 · P2 · medium · I — Acts IV–V risk becoming a repair shopping list

Canon allocates about 4.5 of 10 hours to "repair priorities replace speculative investigation" and finale preparation that includes collecting "known habitat-specific repair stock". After the survivor reveal the core question is answered, so the drive becomes errands. Mitigations:

- Gather most finale stock incidentally during Act II–III expeditions, and say so in the notebook.
- Make each finale task a *knowledge* test (read the current cues to cross the disturbed channel; time the plume; choose the station-keeping hull) rather than quantity.
- Keep one late human beat between C13 and revival: Tavi's or Iona's voice at the refuge window.

Verify via the M2 skeleton timeline: list every Act IV–V task and tag it knowledge/skill versus quantity.

### SP-04 · P3 · medium · I — The human voices need to arrive earlier

M1 has one human voice (Mara's short note). The canon's emotional engine is Tavi's accusation (C05) and Iona's revised certainty. C05 sits in the Pale Basin, the second big expedition. Consider moving one short, non-revealing Tavi or Iona trace into the island workshop or Canopy lab. Something human and specific, with no gate information: a name on a locker, a half-finished message about a partner's shift. The players who later meet the accusation will then already know who is speaking.

### SP-05 · P3 · low · I — Ren's competence should show in play

"Your hands remember the work" is a good line. Let it be literal. The access-engineer identity could show as faster or more confident machinery interactions (a valve the notebook did not need to explain), so the eventual "it was your order" lands on a skill the player has been using all game.

## Owner-facing note

None of the above needs to reach the owner in spoiler form. The non-spoiler forms are already in the main report: OD-08/OD-09 (opening and lead phrasing), campaign risk on optional hull sorties, and Acts IV–V variety.
