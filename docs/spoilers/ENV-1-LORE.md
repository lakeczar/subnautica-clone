# ENV-1 interiors: lore appendix

**MAJOR STORY SPOILERS: writers and integration agents only.** Companion to [NARRATIVE_CANON](NARRATIVE_CANON.md), [CONTENT_BIBLE_LORE](CONTENT_BIBLE_LORE.md) and [LS-1-LORE](LS-1-LORE.md); all three win on conflict. The owner-facing plan is [ENV-1](../build/streams/ENV-1.md). Its text, the interior data, IDs, labels, signs, captions and all player strings stay twist-free. Written by the ENV-1 lore and world integration worker (Opus 5.5, 2026-10-24).

## The shape every interior follows

The tell is something wrong that you read by eye. The log explains it. The twist (the survivors are asleep below, and Ren closed the return) **reverses the emotional sign** of what you saw: absence becomes waiting, and abandonment becomes care. Every interior is written so that its hindsight reading is *gentler and sadder* than its first reading, never crueller. The one exception is the dormitory's untagged bundle (below), which is meant to hurt.

**Moved here from the owner-facing plan (Sol R1 F5).** Two rationales that had appeared in the plan's spoiler-safe text:
- the twist changes what an interior's tell meant in hindsight (the reversal above);
- the no-bodies, no-remains dressing rule also keeps the canon's exact casualty count of 20 + 6 (rule 3 below).

The plan keeps only the dressing restrictions themselves.

## Rules for every ENV-1 interior

1. **CONTENT_BIBLE_LORE's six rules apply to all dressing,** whether or not the interior is a lost site:
   - no human-authored text dated after disaster day;
   - no counts, no suspension, no refuge below, no six, no gate order or pressure trace;
   - exactly 20 + 6 deaths;
   - a physical cause.
2. **Dressing strings pass LS-1's lint list, without exception.** That covers signs, tags, stencils, notes, captions and labels. The numbers the story needs (198, 192, 191) live only in the story's records (C08, C10, the controller, the roster), never in dressing. Numbered hooks, bunks and drawers skip those three values and never show a total.
3. **No bodies or remains, and nothing that implies a death beyond canon.** Animals dying in brine at the mirror is ordinary brine-pool natural history, never tied to people.
4. **A story interior's dressing shows only what its own clue's tier already shows.**
   - The dormitory (C05, T1) may show inward movement, tags timed D0 and a witness note. It shows nothing of transfer numbering (C08) or suspension (C10).
   - The halls (C08 and C10, T2) show orderly consolidation and medical preparation. They show no beds, no sleepers, nothing from C13 to C15, and never the inner hall.
5. **Nothing is heaped** (owner-facing design call 4). The consolidation was a rescue. Dressing must never let it be read as an atrocity, so belongings are always folded, hung, bagged or racked.
6. **Never past the machinery boundary.** No ENV-1 room, window or silted passage shows the gate gallery, the service window's beds or the inner hall. The transfer hall's silted stair is solid within 3 m.
7. **The six get exactly one nod in ENV-1:** the dormitory's untagged bundle. No other interior refers to them. The names stay with `outside_names` in the inner hall.

## Hindsight, per interior

| Interior | What it means in hindsight | Canon ties | Constraints |
| --- | --- | --- | --- |
| **Field station** | The note on the door reads **"Called down till it blows through. Kettle's on the hook."**, signed by role ("Station hydrology"). Early it reads as "went down to the shore for the storm". In hindsight, *called down* is the recall into the deep refuge. The person whose kettle you found never came back up because they are asleep below, one of the 191. The windward hut's damage is the disaster's storm. | Chronology step 3 (the storm); step 4 (consolidation); a fifth, very soft inward-movement foreshadow, below the three canonical ones and the tide store's fourth | **The hydrologist is not Mara** (her shelter is the headland, C11) and not one of the six. OP-1 owns the journal: its last dated entry is D−1 or earlier, and the note is D0 morning. **OP-1's consent is needed for the note's wording.** If OP-1 declines, the note reads "Back when it blows through" and the soft foreshadow is dropped. |
| **Cold store** | Its spare strain gauges match the Splitspine gauge posts. The slope technicians kept spares because posts kept "failing", and they didn't fail. | Misread warnings; the slope collapse (step 3); LS-1's gauge line | Physical match only: the same post numbering. No text says the warnings were real. |
| **Pump house** | Nothing dark. The crew's fond tally of the fans colonising their intake is the expedition's early optimism, and those fans are the native filter communities whose disturbed geography is the disaster's root. The cheerfulness is the point: it's what was lost. | Chronology step 1; C02 | Dated years 1–2 only. |
| **Dormitory** | <ul><li>**The pale picture rectangles:** people facing a sleep of unknown length took what mattered most.</li><li>**The bundles:** staged inward at D0 +04:20 for a transfer that took people, not belongings. They wait still.</li><li>**The lashed landing doors:** the outward side sealed against the sediment surge (C06's trace).</li><li>**The witness note (C05)** is pinned on Tavi's own bunk.</li><li>**On the bunk beside it, one bundle has no transfer tag:** Tavi's partner's, never staged, because they were outside on assignment.</li></ul> | C05 (inward movement, the witness to Ren's sole control); C06's surge; the partner among the six | The untagged bundle carries no name, no tag and no note. It reads as *absent*, not dead; only C12 and the roster make it a death. The instrument belongs to nobody in particular. The tags show the time and a bunk label, never a transfer number. |
| **Rift station** | <ul><li>**The cots between machines:** the quota (tripled in two years) paid in crews' sleep. That is extraction pressure, chronology step 2, without blaming any named person.</li><li>**The crates for the Divide upper dock:** the deep-service rings of the ledger, bound for the dock whose launch rail later sent Ren's pod up (C07).</li><li>**The calendar:** days are crossed off to D−1, towards a circled leave date after disaster day that was never taken. Its owner is alive below.</li><li>**PACE-1's empty, tagged cradles** are works hardware (lore owner approved, 2026-10-24).</li></ul> | Step 2; the ledger's M. Sen margin note (Mara's share stays unsettled, C11); C07 | The calendar was written before D0. The circled future date is a plan, not an entry. There is no second quota board (LS-1's pump heads have it). |
| **Wreck on the mirror** | An extraction tender, a brine-haul barge on the Divide's lanes. On disaster day the saddle breach drove dense water down the lanes and the barge settled onto the pool. **The empty raft cradle and swung-out davit:** the crew got off, reached the Divide dock and are among the survivors below. **The line and the preserved hold** show, with no words, what dense, oxygen-poor water does. It is the same kind of water that entered the extraction circuits on the first hour. | Step 3 (the breach, the oxygen-poor water); the physical cause; rule 5 (the crew lived) | **No record, no names, no name tapes.** It never says that people died of this water. The 20 belong to the circuits, elsewhere. The cache, if LS-1 takes it, is ordinary spares. |
| **Transfer hall** | <ul><li>**The orderly lanes:** the consolidation of the survivors into the refuge (C08, D0 +04:55).</li><li>**The bags on numbered hooks:** belongings left because beds take people only.</li><li>**The folded blankets:** a waiting area.</li><li>**The silted stair:** the original way down, buried since. The player's way in is the works.</li><li>**The chalk doodle of the island lookout:** the people who knew that view will see it again. The ending's restored lookout pays it off.</li><li>**The cable tenders** on the actuator's feed: the live-lines cue.</li></ul> | C08 (the board and the seal are the story's hosts in this room); the ending (the lookout) | Hook numbers skip 191/192/198 and show no total. The tenders stay on the actuator's own feed and never lead through the boundary. The stair shows nothing beyond 3 m. |
| **Medical annex** | <ul><li>**The couches made up for a drill:** the suspension procedure rehearsed.</li><li>**The whiteboard:** Iona's oxygen-hours arithmetic crossed out and revised in the same hand. It is her care and her fear of sentiment (canon), shown as handwriting.</li><li>**The empty numbered drawers:** the procedure's supplies, taken down.</li></ul> | C10, Iona's note | The whiteboard shows hours and litres only, never a population figure; the note and protocol carry the numbers. No bed, no sleeper, no "suspension" in any dressing string. |
| **Upper hall turn** | The hall frame and food bay the player restores are where the woken will eat. The laid table, lit once the works are done, is the ending's promise (communal stores and a food module), shown before the epilogue says it. | Act V; the ending | The restored state shows a laid table and lit planters only: no names, no places set with names, no beds. |

## If owner question 3 is answered yes (the deepest district rooms)

Dressing for the gate hall, service window and inner hall then follows the story structure's machinery graph and these rules:
- the records and hosts there are never moved or reworded;
- the inner hall's beds remain the story's reusable bed modules;
- the six's names stay where `outside_names` is.

That stage would get its own rows here before it starts.

## Player-text lint

ENV-1's test reads LS-1-LORE's `ls1-lint` block for every ENV-1 player string, so there is one list. ENV-1 adds no second list.

## District big stop (proposal, 2026-10-25; MAP-LAYOUT decision 23)

The owner-facing options are in the ENV-1 plan. This section gives the canon reasoning behind the recommendation, C (the district air plant), and why A and B are set aside.

| Option | Canon reading | Verdict |
| --- | --- | --- |
| **A. The commons, moved down** | The upper hall *is* the canon's "upper living area": where the woken will eat. Its laid table is the ending's promise. Restoring it as a service stop before the works spends that promise early. Moving it down also contradicts "upper". | Set aside |
| **B. Maintenance quarters** | Quarters kept ready for a returning shift read, in hindsight, as quarters for the first repair specialist to wake, which is Ren's designated role (chronology step 5, C14). It foreshadows the protagonist's identity more directly than any tier-2 clue may, and competes with C07/C08's deliberate pacing of Ren's involvement. | Set aside |
| **C. District air plant** | Chronology step 3: dense, oxygen-poor water entered the settlement's seawater oxygen-extraction circuits. The plant is where that physical failure lands. It's the controller summary's "dense, oxygen-poor water in the extraction circuits" made visible. The failure of the air is *why* the refuge plan had to be suspension: sleeping beds use far less oxygen than waking people (step 4). Restoring the plant in Act V is a quiet hindsight echo: the player makes the district breathe again, the thing the sleepers will need. | **Recommended** |

**Constraints for C** (CONTENT_BIBLE_LORE's six rules and this appendix's rules 1–7 apply):
- **It is not where the twenty died.** Canon doesn't place their deaths, and ENV-1 doesn't either. The plant shows the failure (frozen alarms, emergency closures, the flooded intake hall), never bodies, names or a death count. The racked masks with gaps imply people left in a hurry, not that they died.
- **Times in its records sit inside the first hour of disaster day,** consistent with C06's D0 +00:35 trace. Its last automatic record may follow the controller rule (an instrument, never a person) and must not state a count, a refuge or suspension.
- **It never substitutes for the story's works.** The plant gives the stop's local air only. The works' independent power and air assemblies, the gate procedure and the ending are unchanged. The echo is atmosphere, not a mechanic.
- **It stays outside the machinery boundary** (about 150 m from the gate hall). No window, duct or passage in it shows the gate gallery, the service window or the inner hall. The cable tenders may gather on its dead feed only after restoration, never leading inward.
- **Player strings pass the LS-1 lint list.** Signs read as an air plant ("Air plant", "Intake hall", "Filter stage"), never "life support for…" or anything that implies sleepers.
