# SIG-1: every craft's signature identity, live, plus visible outposts

Branch `t3/sig-1-signatures`, from root `1662e5a0` (SIM-1a merged). Brief: the compromise verdict's plan row 9 (ART-09, UI-01, TST-11) and the steward verdict's F12, F17 and F05.

## Stage 0: one inventory authority (steward F12)

**Code `f2bdb984`, R1 fixes `cc7f55f7`, R2 fix `a4e1834e`.** Reported separately so it can be reviewed before anything builds on it.

### Outcome
`src/sim/inventory.ts` is the only inventory arithmetic. The temporary ledger fork (`src/sim/systems/ledger.ts`, `FORK(ledger)` in STEW-1's CORE-HELPERS) is deleted, and every one of its seven importers now calls the authority.

### Changed contracts
- **One spend path:** `planSpend(s, cost, containers, priority)` returns a detached plan (`lines`, `missing`), and `applySpend(s, lines)` applies it unchanged. `spend()` is gone.
- **Container priority is explicit** (`SpendPriority`), because the two old implementations really did differ:
  - **`listed`** (the default) draws container by container in the order the caller lists them. Systems, outposts, cultivation, navigation and fauna use it, as they did through the ledger.
  - **`oldest`** draws the oldest stack first across all the listed containers. The fabricator benches and story repairs use it, which keeps B1's accepted bench rule: which container empties first stays exactly as before.

  Unifying the two would be a design change (for example "a bench draws from storage before the diver's hold"), so I left them separate. That's a possible owner call, not part of this stage.
- **Sizes, labels and stacking** now come from the composed registry only:
  - `cuOf` and `labelOf`: an unknown kind weighs `Infinity`, so a room check fails closed;
  - `itemCu`, `freeCapacity` and `restoreInstance`, moved over from the ledger;
  - `addItem` stacks by `content/systems/items.ts` `stackable`, replacing its hardcoded list (the same set);
  - `removeQuantity` also replaces two inline copies, in `ecologyLink.ts` (lures and ink) and `fauna/catch.ts` (bait).
- **F05 for the previews this stage touches:** `craftingBlock` checks room after spending with `hasRoomAfter(s, plan, container, cu)`, which reads the spend plan. Before, it ran `structuredClone(s)` of the whole state twice per refusal query. A test proves the two agree across every container, cost and priority.
- **`journal.ts`** reads the composed `RECIPES` and no longer remerges raw `SYS2_RECIPES` over them.
- **`containerAccepts`** takes `kind: string`, as the ledger's `accepts` did.

### Checks
All bound to `f2bdb984` and run on the RTX 4070 Laptop (alickers), because of CW-1's 3090 window:
- **`npm test`:** typecheck plus **1,421/1,421** tests. That includes the new `tests/inventory-authority.test.ts`:
  - each priority's order;
  - fitted and maintenance stacks are excluded;
  - plan-based room checks equal a spent clone, in every container;
  - stacking comes from the registry.
- **Economy:** `check-campaign-economy`, `check-m1-economy`, `check-m2-a-economy`, `check-m2-b1-economy`, `upgrade-economy` and `check-progression-curve` all exit 0.
- **`npm run playthrough -- --jobs 3`:** all 8 scenarios complete, with every reload matching. The play minutes equal root's library exactly:
  - creel 201.7;
  - carrier 363;
  - creel-loss 209.7;
  - reverse 206.7;
  - no-optional 200.9;
  - low-air 5.3;
  - tour 129.9;
  - over-geared 83.9.
- **Unchanged means bit-identical.** Every one of the **122** saves the run made has a state hash that is in root's save library (`/work/tmp/siltwake-saves/b54bfd92…`, the same game code as `1662e5a0`), and all **73** library states are reproduced. Stage 0 changes no state on any route.

### R1 fixes (Sol `review/sig-1-stage0`, request changes; code `cc7f55f7`)
- **R2, an incomplete plan is not executable.** `applySpend(s, plan)` now takes the whole plan. It refuses with `SpendRefused` before writing anything when:
  - any `missing` is nonempty;
  - any line is stale: its stack is gone, has changed kind, container or spendability, or holds less than the lines on it ask.

  Every caller passes its plan, including the outpost pack and upgrade previews (`PackPreview.loss` and `UpgradePreview.cost` are now `SpendPlan`). A refusal there is a logic error: no current command plans a shortfall and then applies it.
- **R1, every removal and CU total goes through the authority.**
  - **`takeInstance(s, itemId)`** lifts one chosen item out whole, keeping its ID, charge and provenance. It now serves:
    - the bio-cell a hull is fed: the chosen cell, with its own charge;
    - socket installation (`systems/hosts.ts`);
    - outpost deployment and the modules refitted into its sockets (`systems/outposts.ts`).

    Socket and layout ownership stay in their domains.
  - **The duplicate CU sums** now read `usedCapacity`, `freeCapacity`, `itemCu` and `cuOf`:
    - `render/fleetArt.ts` `updateCreelArt`;
    - the playthrough `Driver.usedCu`/`freeCu`, its effects oracle and its cargo loads;
    - canister salvage, and the frame-salvage destination check;
    - the save loader's carrier hold split (over known items only, so a corrupt save is refused as before);
    - the Cargo panel's item sizes.
- **Checks (`cc7f55f7`, RTX 4070 Laptop on alickers):**
  - **`npm test`:** **1,424/1,424**. The new regressions cover an unpaid multi-material cost (refused, state unchanged), a stale plan and an over-asked stack (all or nothing), and the chosen bio-cell (its ID gone, the other cell kept, the feed from its charge).
  - **Economy:** all six scripts exit 0.
  - **Playthrough:** 8/8 complete with all 122 reloads equal and the minutes unchanged. All **122** save hashes are in root's library, and all **73** library states are reproduced: still bit-identical.

### R2 fix (Sol `review/sig-1-stage0-r2`, request changes; code `a4e1834e`)
- **Cooking room comes from the spend plan.** `cookPlan` summed freed *quantities* as freed CU, outside the authority. It now asks `hasRoomAfter(s, pay, container, cuOf("meal") * meals)`, keeping the destination order (the cooker's store, then the diver hold) and the acceptance checks. The refusal names the meals' CU from the same size.
- **No result changes:** fish, roe and meals are 1 CU each.
- **Regressions** (`tests/cr-1-creatures.test.ts`):
  - an exact fit from the locker cooks there;
  - raw from the diver beside a full locker cooks into the diver hold;
  - one CU short everywhere refuses with the meals' CU and changes nothing.
- **Checks (`a4e1834e`, RTX 4070 Laptop on alickers):**
  - `npm test`: **1,425/1,425**;
  - economy: all six scripts exit 0;
  - playthrough: 8/8 complete, with 122/122 reloads equal and the minutes unchanged. All **122** save hashes are in root's library, and all **73** library states are reproduced: still bit-identical.

### Follow-ups for the coordinator
- **CORE-HELPERS** lives on STEW-1's branch. When STEW-1 merges, delete the `ledger` row from *Open forks*, since this stage retired it. If STEW-1 merges first, I'll remove the row in my root merge.
- **F05 beyond this stage:** the panels' clone dry runs (`carrierPanel.ts`, `panels.ts` reserve and recovery) stay as the steward accepted them. Previews SIG-1 touches later use plans.
