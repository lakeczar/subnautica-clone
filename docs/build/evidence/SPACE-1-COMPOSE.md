# SPACE-1 composition on accepted M2-A — Claude Opus 5.5 / high

Author report for [SPACE-1-COMPOSE-OPUS](../tasks/SPACE-1-COMPOSE-OPUS.md). This is not acceptance; root inspection and one fresh Sol 6.1/xhigh review remain. Design record: [PROGRESSION-CURVE](../design/PROGRESSION-CURVE.md). Earlier reports: [author](SPACE-1-OPUS.md), [staged inspection](SPACE-1-STAGING.md), [reconciliation](SPACE-1-RECONCILE.md).

## Identity

| Item | Value |
| --- | --- |
| Parent (clean, confirmed before edits) | `e2a9d04ae7a47657b7336b8a2ec8fc44af6128a2` (M2-A production `c2c6155`, accepted at `51c4dcd`) |
| Composition merge | `4c083a5` — merges reconciliation tip `4f6f464` (Opus `7df64e3` → isolated merge `32e9fce` → literal fix `153b4a4` → report) |
| Source commit | `e4062aeaaba1d44a139269bc8d752e74b0a82c5e` |
| Report commit | child of the source commit; adds this file and the one-sentence PROGRESSION-CURVE update |
| Worktree / branch | `/home/worker/.t3/worktrees/subnautica-clone/t3-41d00e18`, `t3/finish-resource-renewal` (T3 `t3_worktree_status` attached) |
| Model | requested `claude-opus-5-5` / `high`; effective per `t3_thread_configuration`: `claude-opus-5-5`, effort `high`, runtime `full-access` |
| Final build (clean `npm ci`) | `dist/assets/index-t0ZyIhsg.js` SHA256 `b3f2d8020b4dbc5d6ffdf1b0de4c173902202989218fdeebcf6f1746086c817b`; `index.html` `112de2e0…1d55`; CSS `ec97b5d9…09dd` |
| Artifacts | `/home/worker/.local/share/siltwake-evidence/space1-compose-opus/` (`MANIFEST.sha256`, 55 files, SHA256 `d5da2205b7183b0a33e3b1dae4f7b20c11daddd01820f19b66d76c895113779d`). Prior sealed evidence was only read; the earned input was copied read-only |

## Composition

I merged the whole reconciliation line (`git merge --no-ff 4f6f464`), so both histories remain ancestors. The merge was automatic with **no conflicts**:

- SPACE-1 touched save, sim, content, panels and migration tests.
- M2-A touched render, runtime, vehicles, the HUD/view and render tests.
- No source path overlapped. The only shared file, `SPACE-1-RECONCILE.md`, was already byte-identical in root.

Between the SPACE-1 parent `dae17fc` and this parent, `src/content`, `src/save`, `src/sim/{types,state,progression}` did not change, so the frozen expedition.4 domain still describes exactly what the M2-A build wrote. The frozen validator imports only its own snapshot. I did not change it, the historical validators or any migration fixture assertion.

The merge alone passed **566/566** (546 M2-A + 20 SPACE-1), build and all five checkers. That is logged in `logs/`. The corrections below came from inspecting the composite in play.

## Changes beyond the staged work (`e4062ae`)

1. **Empty Canopy pockets stay recognizable** (`render/environment.ts`). Browser play showed that once a pocket was harvested, nothing marked it except the floating target bracket (`browser/08`). The reef catches keep stone lee rails and Basin sources keep hosts. Each renewable resin pocket now has a persistent `source-host.<id>`: a shallow stone cup on its pinnacle with three cured-resin stains. The nodules (work face) still come only from stock. Finite island drift coves are unchanged; their emptiness is final.
2. **The aimed prompt says why a living shed is empty** (`ui/hud.ts`). It now reads "Empty · regrowing" for the four living sheds, matching the existing `E` notice. Finite sources still say "Empty".
3. **Concise known-source list** (`ui/panels.ts`). The staged rows repeated "· sort the reserve when none are ready" on 10 of 11 entries in the earned state. The rule is now stated once: "Living sheds regrow while you explore; finite stock does not. When none are ready, sort a reserve on site." Each row ends with a short tag: `Living shed · regrows to 12 ready` / `Finite` / `Finite · no reserve left` / `Tended · when empty, tend 20 s for two more`.
4. **New composition test** (`tests/renewal-render.test.ts`), described in item 3 below. Existing tests were tightened, not weakened: `presentation` adds the living-shed prompt case, and `preparation-panels` asserts each row tag and that the rule appears once.

Rates, caps, policy, recipes, unlocks, positions, stock and all save rules are unchanged.

## Contract changes for root to record

- **Content** `expedition.5`; `SOURCE_RENEWAL` covers `reef_ribbon_catch_{north,south}` at 2 per 21,600 steps and `canopy_resin_lee_{upper,lower}` at 2 per 36,000 steps; cap = original exposed stock. These are unchanged from the staged design.
- **State** `world.renewal: {id, progress}[]` sits after `resources`, in canonical order, with integer `0 ≤ progress < interval`. It is non-zero only below the cap, in `expedition`, after the opening.
- **Save** schema 4 / expedition.5 are current. Schema 3 / expedition.4 is validated by the frozen expedition.4 validator, then gains only zero progress. Schema 2 goes through the existing legacy validation and relocation, then the same step. Schema 1 is unchanged. Malformed current saves are refused on decode and encode without normalization. Reading never writes.
- **Simulation** `advanceRenewal` runs once per `stepGame` after `updateAction`. Sorting to the cap clears progress in the same transaction.
- **Presentation** (new in this composition):
  - Each regional owner reconciles source work faces from `stock > 0` on every `update`, including re-attachment and replacement (existing M2-A rule, now tested for living sheds).
  - Living resin pockets own a persistent `source-host.<id>` mesh.
  - The HUD `empty` verb label is source-aware.
  - Known-source rows use the tag format above.

## Checks on `e4062ae` (clean install, serial, `NODE_OPTIONS='--max-old-space-size=960 --max-semi-space-size=16'`, `--test-concurrency=1`)

| Check | Result |
| --- | --- |
| `npm ci` / `tsc --noEmit` / test compilation | pass |
| Full suite | **567/567**, 0 fail, 149 s |
| `npm run build` | pass (bundle above; same content-hashed name the browser served) |
| `scripts/check-m1-economy.mjs` | pass, content `expedition.5` |
| `docs/build/design/check-economy.mjs` | pass (16 PASS lines; it still lists "renewal implementation" as unverified, because it is a static candidate checker) |
| `check-m2-a-economy.mjs` fresh | pass, schema 4 / expedition.5 |
| `… --earned …/m2-a-opus-completion/inputs/earned-return-after-Continue.json` | pass; input SHA256 `45840e66…4e44`, schema 3 / expedition.4, tick 39125 |
| `scripts/check-progression-curve.mjs` | pass |
| Earned-migration identity (author script rerun, `final/11`) | pass: every expedition.4 field identical, zero progress, idempotent re-encode, 600-step save→decode future equality, input unchanged |

None of the economies or staged sequences advance time, so every solvency result credits **zero renewal**. Logs are in `final/`. The merge-state run and its own checker logs are in `logs/`.

## 1–2. Integration risks

| Risk | Evidence |
| --- | --- |
| Renewable vs finite | `resource-renewal`: 80,000 steps leave every finite source and every reserve unrefilled. The production policy lists exactly four IDs |
| Exact boundary, cap and sorting | One step short / exact boundary. Clipped generation; no banking at cap; stock above the cap kept. A sort to cap clears progress in the same step. Browser deltas matched exactly (1416 → 516 = 1416 − 900; 680 → 80; 656 → 56); a full pocket stayed at 0 |
| Active vs paused/offline | Menu commands, save/Continue, tick gaps, the opening and the carrier fixture add nothing. Browser: 6 s paused left 4204/1104 unchanged; reload + 8 s offline + Continue gave Δtick 416 = Δprogress 416 |
| Historical malformed saves | `renewal-migration`: ten frozen-domain mutations refused. Schema 1/2 suites unchanged and passing |
| Migration identity | Exact schema 3→4 output; schema 2→4 equals 2→3→4; real earned export identity (above) |
| save→decode→future | Uninterrupted and reloaded futures are equal across a regrowth boundary, and after migration |

## 3. Renewal while away, shown truthfully

`tests/renewal-render.test.ts` drives the **production** `createRegionalArt` composite under Babylon's NullEngine. It uses labelled near-boundary progress and actual `stepGame` steps:

- Depleted catches and pockets show no work face. Pocket hosts are present.
- In the Basin, the reef owner is retained and undrawn. The north catch crosses its boundary there; its twin, 30 steps short, does not.
- On return, the **same** retained meshes re-attach. Exactly the regrown catch is drawn.
- At the island, the Canopy owner is retained. Both pockets regrow and are drawn on return, with their hosts.
- A same-page replacement with an older depleted state hides them. A menu (`null`) detaches. Replacing back restores them.
- Save → Continue keeps `world` exactly. Both the same renderer and a fresh renderer draw the regrown sources. Every source with zero stock draws no work face.

Mutation check: if the compiled renderer always enables the work face, the test fails ("depleted catches start without a work face"). Browser evidence is under item 4.

## 4. Production-browser workflow

The browser ran on `factory-worker` Linux (Chrome 154 X11 user agent; it reached my loopback-only server) in one owned **incognito** T3 tab, against my own `vite preview` on 127.0.0.1:5190. Input stayed in the page: key events on `window`, file uploads to `#import-file`, Enter on focused buttons. Values come from in-game F5 saves and read-only reads of `localStorage`; there is no debug UI. Full trace: `browser/trace.json`; screenshots `browser/01–16`.

| Leg | Attribution | Bundle | Result |
| --- | --- | --- | --- |
| A | **Ordinary** New Game | `BuHXn-SG` (merge plus the prompt change only) | Opening done. The fabricator lists only the pod-checklist ladder (01). Three E collections took the north catch 12 → 0 and the prompt became "Sort · 20 s" (02, 03). The save read schema 4 / expedition.5, tick 3828, stock 0 / reserve 12 / progress 728. Pause and reload/Continue added nothing (item 1–2 table). The Notebook was in its old wording (04) |
| B | **Imported earned** (schema 3 export via the menu) | `BuHXn-SG` | Written as schema 4 / expedition.5 at the same tick 39125. Renewal 0×4; stock preserved (north 0/12, south 8/12, upper 8/8, lower 12/8). The previous generation is the ordinary save. Canopy and Basin were retained. Notebook shows "Plans retained 4 · construction not available yet" (05) |
| C | **Accelerated diagnostic** from B: upper pocket 900 steps short at (100, −80, −48), Canopy retained | `bc6AYNw6` (wording, no host) | 1416 active steps with the Canopy still retained: upper 2/516, below-cap catches +1416, full lower pocket 0. Swimming back re-attached the Canopy (`activationMs` 0.400). Regrown nodules were drawn with "E Upper cured resin pocket · Collect"; E gave +2 resin (06, 07). The empty pocket then had no host (08), which led to correction 1 |
| D | **Accelerated diagnostic**: close view, 600 steps short | `t0ZyIhsg` (final) | Empty cup host (09). Regrew in view: 680 steps → 2/80 (10). Reload + Continue drew it from stock (11). A same-page import of the empty state hid the nodules; the cup remained and the journal read 0/0 (12) |
| E | **Accelerated diagnostic**: reef catch in view, 600 steps short | `t0ZyIhsg` | Empty: rails, fans and drifting sheds (13). 656 steps → 2/56, drawn (14). Replacement with the older depleted state hid it; the rails remained (15) |
| F | Final wording | `t0ZyIhsg` | One legend line and per-row tags (16 plus trace) |

Attribution notes:

- After the leg-A Continue click, yaw changed −37°. With no input it stayed identical for 664 ticks. The click had engaged pointer lock on the isolated canvas, so this is pointer travel from automation, not drift.
- During leg C I left the tab running while editing code. The diver ran out of air and M2-A recovery returned them to the workshop (tick 55413). That interval is excluded as evidence.
- The page ran at about 40–57 steps/s. No performance claim is made.

## 5. Gating, earned sequence, recovery and future plans

- **Fresh start**: `progression-curve` refuses every non-first recipe before and after the opening, even with materials at either bench. The browser fabricator (01) shows only the pod ladder.
- **Earned sequence and out-of-order clues**: all 120 C02–C06 orders converge to exact plan sets. Reef-first and island-first New Game sequences craft all ten recipes on finite exposed stock with zero renewal. The real earned export continues under migration, and its economy checker passes.
- **Recovery plan clarity**: without C02 the card reads "Requires Bobbin kit · plans at the reef intake"; with it, "fabricate at the pod" (`preparation-panels`).
- **Future plans**: C05/C06 plans stay research. There are no fabricator rows; the Notebook says "construction not available yet", and the unfinished berth is a future opportunity (B). No hull recipe was added and the world was not rescaled. The matrix's implemented/planned split still holds.

## Suggestions for M2-B (not implemented)

- Decide whether the specified second membrane habitat on the Canopy margins is a living shed. If so, give it a host from the start, and keep its finite stock solvent with zero renewal (planned demand 45–59 vs 48 placed).
- At (100, −80, −48) the HUD says "Upper Lantern Canopy" while the Canopy owner is still retained; silhouettes cover the gap. Include that edge in the first-entry and region budgets M2-A carries forward.
- Island drift resin coves have no host either. They are finite, so this is lower priority; add one if their emptiness ever needs explaining.
- Keep the rates (a full catch in 36 active minutes, a pocket in 60) until human pacing exists. If anything, consider moving the reef catches toward the Canopy rate once Creel hauling arrives.

## Limits

- The **reef** retained-region return was not shown by an ordinary browser swim. Every reef-retaining position is behind the island ridge, and a terrain search found no clear straight or two-leg route. The production-factory test covers that path, and in the browser it is covered by replacement and Continue. The Canopy return used the real swim.
- All regrowth seen in the browser is labelled accelerated diagnostic. No ordinary six-minute regrowth was idled.
- Screenshots 01–05 predate corrections 1 and 3. The final wording and host appear in 09–16.
- Human readability of the cup and the wording, pacing, enjoyment, audio, dedicated-GPU performance and duration are unverified.
- The frozen-domain helper semantics still need the independent review that root's staging note requested. This work does not establish them beyond the existing tests.
- Planned matrix rows remain design, not implementation.

## Resources

- No child agents, peer messages, pushes, PRs or parent merges.
- The owned tab was closed through `t3_preview_close`, and `preview_status` shows no tabs. My preview server is stopped and port 5190 is free.
- No other process, tab or worktree was touched. Prior sealed evidence was read only.
- After the report commit the worktree is clean.
