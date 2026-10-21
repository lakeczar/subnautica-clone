# ENC-1: threats you can see and read

Opus 5.5 high. Branch `t3/enc-1-readable-threats`, from C4 stage A at `b08747f`. Code `5c76abb` (evidence built from it). Answers M2 audit issue #4.

## Outcome
The Canopy sound hunter now teaches rather than kills:
- **Before it is near:** crossing 100 m from its home shows a caption naming Z (quiet), L (lamp off) and where the G pulse's reserve cell is.
- **Paired calls:** it swims toward the noise, and an edge pulse points at it.
- **Investigating:** it makes a **silhouette pass**, weaving in profile about 11 m across the bow along the view's heading and pitch. It begins its pursuit only once it is within 18 m and inside a 0.55 rad cone of the view; after 10 s it pursues regardless.
- **Pursuit:**
  - **The first contact is a 6% warning bump with knockback and a caption.** It never takes the last point of hull.
  - **Then one bite per 4 s contact cycle,** ramping 10 → 15 → 20 → 25 (the diver's ramp is 10 → 14 → 18 → 22).
  - **A loud craft that stays is still disabled,** about 18 s after the bump.
  - **Quiet and dark ends it** in about 2 s; quiet with the lamp on in about 5 s; cover or a boosted retreat end it too.
- **Ecology threats** (glare stalker, layer skate; the hollow choir is sessile):
  - their stand-off leans toward the actor's view;
  - they lunge only when seen, or 6 s later anyway;
  - the first strike of an engagement lands at 60%;
  - the deterrence rules are unchanged.
- **Edge cue:** every engaged threat gets a pulse on the screen edge toward it, sized and timed by stage, beside its banner. A bite flashes toward its origin.

## What changed (contracts)
- **New, ENC-owned:**
  - `content/ecology/encounter.ts`: all tuning.
  - `sim/hunterEncounter.ts`: `updateThreat` moved here, plus `approachCaption`, `viewAngle` and `biteLoss`.
  - `ui/threatCue.ts`: the pure `threatCues`/`edgePoint` model, `ThreatEdgeView` and `hunterBanner`.
  - Tests: `tests/enc-1-readable-threats.test.ts`.
  - Evidence tooling: `streams/enc1/{play,derive}.mjs`.
- **`sim/hunter.ts`:**
  - `hunterPassPoint` drives the investigate target and its facing;
  - warn now closes at 4 m/s to 24 m;
  - `H.investigateGap` and `H.investigateSpeed` are retired.
- **`content/encounterGeometry.ts`:** `cycleSeconds` goes from 3 to 4, giving a 2 s withdrawal after each bite.
- **Ecology (`sim/ecology/*`):**
  - `Stimulus.facing` is optional; without it there are no view rules, so S4's fixtures are unchanged;
  - `stimulusFrom` fills it in;
  - `agents.ts` adds `seenBy`, the view lean and `FIRST_STRIKE_SHARE`.
- **Minimal hooks in C4-owned files, please review:**
  - `sim/survival.ts`: the `updateThreat` body is removed and re-exported from `hunterEncounter.ts`. `step.ts` is untouched.
  - `ui/hud.ts`: the banner text comes from `hunterBanner`; the edge view updates in `update`, flashes in `threatDamage` and resets in `resetPresentation`.
  - `ui/view.ts`: one `#threat-edge` element.
  - `ui/hud.css`: an additive block.
  - `ui/panels.ts`: the dive check reads "No carried reserve cell · the G decoy pulse needs one".
  - No edits to `environment.ts`, `atmosphere.ts` or `materials.ts`.
- **Events:**
  - Hunter `threat-damage` now carries `origin`.
  - The damage sound fires once per bite, not every 60 ticks.
  - Investigate emits a `threat` notice.
  - The positional `threat-call` still fires at warn and pursue only.
- **Saves:** no persisted change. The bite cycle is derived from the saved `modeSeconds`: pursuit time holds just before cycle 0's withdrawal until the bump lands, and each bite jumps to its cycle's withdrawal. Interest is now capped at 7, which the validator's range accepts.

## The reserve cell: a hint, not an economy change
The save validator pins exactly two crafted cells, so a third (starter) cell would need a schema change. Quiet running fully counters the hunter without G. So the fix is information at the two moments it matters:
- **the approach caption,** which says "Your reserve cells are in the pod locker; carry one…" or "G spends 25…", depending on what is carried;
- **the cargo panel's dive check.**

## Checks (at `5c76abb`)
- **`npm run test:fast`:** 1,095 out of 1,095 pass, 7 of them new; the baseline was 1,088.
- **The existing hunter tests that pinned 12%/s continuous bites were rewritten to the new contract,** without loosening their geometry checks. They are in `m2-threat-damage`, `m2-encounter-contact`, `m2-hunter-reconciliation`, `expedition`, `encounter-signals` and `app`. Contact assertions now probe the bite's own contact phase.
- **All ecology suites pass unchanged,** including `ecology-adverse`.
- **Heavy tests:** `encounter-art` and `ecology-render` pass.
- **`npm run playthrough`:** exit 0. All 5 scenarios pass and both routes reach the ending; 14 of 14 milestone reloads match.

## 3090 ordinary-key play (`enc1/play.json`)
Setup: ANGLE GL-EGL on the RTX 3090, keys only. The save was derived headless with P1's phases through the isles, then `dart_out`.

**Run A (loud and lit):**
1. Warn at 57 m depth: the edge cue at the bottom edge, because the animal was under the dash ([01](enc1/01-warn-edge-cue-under-dash.webp)).
2. Investigate: the silhouette pass in view ([02](enc1/02-silhouette-pass-in-view.webp), [03](enc1/03-pass-closing-ahead.webp)).
3. Pursuit: the bump, 100 → 94, with a flash and caption ([04](enc1/04-warning-bump-flash-and-caption.webp)). Staying loud brought the ramp bite, 94 → 84 ([05](enc1/05-ramp-bite-edge-flash.webp)).
4. L plus Z and backing away: "Calls fading" after about 2 s, at 84% hull ([06](enc1/06-quiet-dark-disengaged.webp)).

**Run B (holding Z on the same route):** never noticed; arrived at the lab parking at 100% hull ([07](enc1/07-quiet-run-never-noticed.webp)).

No page errors.

## Adverse case
In headless play, a Creel that stays loud on the Canopy route is disabled. The hunter remains a soft gate.

## Known limits
- **Under steep pitch,** pursuit bites can still come from the side or behind, after the pass; the edge flash shows where.
- **The hunter art stays in `expedition.ts`** and was not moved into `render/creatures`. It reads clearly at pass distance, so moving it would have been a refactor of a C4 root with no player-facing gain.
- **Ecology view rules were tested headless only;** this session played no Rift or Divide GPU route.
- **The pass can be blocked by Canopy crowns.** The 10 s cap keeps the threat real, but such a lunge may come unseen; the edge cue covers it.
- **Tuning numbers are hypotheses** for the owner's playtests.
