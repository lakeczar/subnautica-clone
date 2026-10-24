# OS2 feedback and concise-copy refinement — Sol 6.1/max

One bounded implementation leaf after the movement owner has released its paths. Root supplies the exact clean committed parent at dispatch. Movement source **cc3f20d** is provisionally integrated and root-checked at **1231fee**: 410 tests/typecheck/build/economies, both root reproductions and complete actual reload comparisons pass. Read AGENTS/STATUS, PLAN/CONTRACTS, the revised prompt and applicable delivery/UI requirements, [Opus R2](../reviews/OPUS-STAGE1-R2.md), its [implementation advice](../design/OPUS-STAGE1-R2-IMPLEMENTATION.md) section 5 and [root disposition](../reviews/OPUS-STAGE1-R2-IMPLEMENTATION-DISPOSITION.md). This assignment narrows and supersedes conflicting proposed paths/mechanics in the advice.

Implement OS2-02, OS2-03 and OS2-07. Do not expand into M2 atmosphere/cover, new interaction design, mouse-resume speculation, general layout redesign or movement tuning. Keep richer cel and the owner's concise menus. You are Sol 6.1 at **max**; verify actual runtime, clean T3-bound worktree and exact parent. No children, peer messages/waiting, push/PR/merge, parent mutation or edits outside the following ownership. Root alone integrates.

## Exclusive paths

- `src/ui/{hud,notices,view,panels}.ts`: only impact-chip display, targeted action-result presentation, and the listed copy/visibility changes.
- `src/sim/types.ts`: only the small transient typed exit-refusal metadata below; no saved-state/schema or other interfaces.
- `src/sim/vehicles.ts`: only the authoritative structured exit-block query and compatibility wrapper below; preserve validation order, all refusal text, successful exit mutation and every other vehicle function.
- `src/sim/step.ts`: only exit success receipt and matching exit-refusal event metadata in both command adapters. All movement/collision and the new surface helpers are frozen.
- `src/runtime/session.ts`: only the successful manual-save text. `src/sim/progression.ts`: only the Dart fabrication guidance sentence.
- Tests: new `tests/os2-refinements.test.ts`; existing `tests/{presentation,encounter-presentation,experience-signals,session}.test.ts` only affected behavioral cases and exact-copy expectations. Preserve all unrelated coverage. Reuse existing fixtures/helpers; no new test framework.
- `docs/build/evidence/POLISH-1-REFINEMENTS.md`.

No CSS, renderer, input, content, codec, geometry, survival, economy, general notification architecture or private root record changes. If an actual adjacent-path defect prevents correctness, report the exact path/line/proposal and continue independent owned work; do not silently broaden scope.

## OS2-02: truthful small impacts

Keep impact accumulation by craft/time, the 600 ms card flash, urgency, 1800 ms chip lifetime and reset/disposal. Round the accumulated loss to one decimal for display (`Math.round(loss * 10) / 10`); hide the text chip when that rounds below 0.1. Do not invent a minimum damage amount or round every positive hit up. Hidden chips must not retain a visible earlier value. A small impact still flashes the hull card. Standalone 0.01 and 0.04 losses hide; accumulated 0.01 + 0.04 reaches the normal 0.1 display; 0.26 displays 0.3. Switching craft and letting the accumulation window expire still reset normally.

## OS2-03: one full exit refusal, intact accessibility

The current pilot guidance already shows the full current exit refusal. A matching recent failed exit may show the short result **“Exit blocked”**, with the complete original refusal announced once to assistive technology. Preserve generic refusals and all hazards, persistence messages, successful receipts, lifetimes and menu/panel routing. Do not classify or match refusals by prose, regex, translated labels or DOM text.

Root authorizes this narrow typed seam because the advisory one-line command check misses contextual E/interact exits and can conceal a reason without matching guidance:

1. Export `ExitRefusalCode = "not-piloting" | "carrier" | "depth" | "obstructed"` from sim/types. Add optional transient `NoticeOptions.refusal?: { kind: "exit"; vehicleId: string; code: ExitRefusalCode }`. This is event metadata only, never persisted.
2. Add `exitBlock(s: GameState, world: WorldQueries): { code: ExitRefusalCode; message: string } | null` in vehicles, with the exact existing exitRefusal validation order and messages. Existing `exitRefusal` remains a compatible string/null wrapper, and `exit()` continues to obey the same rules. No duplicate depth/clearance rules in UI.
3. Both `executeCommand` and `stepGame` must deliver exactly one refusal event, no success cue or mutation. Tag a genuine refused `exit` or contextual `interact` while piloting the identified craft, after the opening; unsupported/missing-actor commands retain full generic refusal. Consider command batches and final actor changes. Never attach exit metadata to an earlier opening refusal or arbitrary failed interaction.
4. The UI action result retains both the short display and full original message plus the metadata. Shorten only when the actual current pilot guidance supplies the matching craft/reason. Clear obsolete targeted results when the reason clears/changes or the actor/context changes. If an event lacks matching guidance at delivery, preserve a full readable refusal rather than hiding its information. Keep the original full accessible announcement, once per actual attempt, including repeated identical attempts; ordinary renders/active-time expiry must not replay it. A value change within the same depth reason must retain an accurate current full guidance sentence. Hidden menus/panels and actor reset retain their existing behavior.

The small metadata/query additions and internal UI bookkeeping are authorized here; report their final exact exports. Public lifecycle signatures remain unchanged. Reorder local HUD rendering if necessary for same-frame truthful composition, not as a broader rewrite. Successful exit receipt becomes simply **“Left the craft”**. Do not claim “on suit air”: a surface/dry-refuge exit can have a different air supply. Keep existing full saved exit feedback unchanged.

## OS2-07: bounded copy/visibility

- Hide the decorative `.scene-caption` on title and pause. Keep the title's single tagline “A refuge. A reef. A first horizon.”; pause already hides it. Verify actual `hidden` behavior in the browser, not only the attribute.
- Title build note: **“FIRST EXPEDITION · Pod, workshop, Dart and the upper Canopy. More of the campaign is in development.”** Hide that note on pause. Keep an honest incomplete-build label while M2/M3 remain unbuilt.
- Manual save success: **“Saved locally”**. Retain backup explanation in Save safety, all persistence/error metadata and all failure text/behavior.
- Known habitats: **“N ready · N in reserve · N per gather.”** Food follow-up: **“When empty, tend here for 20 seconds to prepare two more.”** Material follow-up: **“When none are ready, sort the reserve here.”** Counts still read actual discovered source state; no undiscovered source reveal or reserve/yield change.
- Fabricate count label: **“Have here / needed”**. Completed group: **“Completed · N”** or the same concise count using its existing small element. Preserve grouping, focus identities and material availability/prerequisites.
- Dart fabrication feedback: **“Dart is in the yellow launch cradle. Board it from the cockpit side.”** Preserve actual build pose and remaining feedback.

Keep Current question, regional leads, useful notebook narrative, the deliberately retained personal-field-note explanation, dive preparation, story/accessibility captions, oxygen/pressure warnings, recovery, save/graphics errors and essential confirmation consequences. No broad copy sweep, new decorative subheadings or font reduction. Preserve current minimum text sizes and the accepted layout constraints.

## Verification and evidence

Meaningful behavior tests cover impact accumulation/flash/reset, both exit adapters (including contextual interact), unchanged query precedence/refusals and successful state, target/reason changes, missing actor, safe underwater and dry/surface exit, full one-time accessible announcements, repeated identical attempts, generic refusal fallback and panel/menu routing. Changing copy does not justify implementation-mirroring tests; update existing exact-text expectations only where necessary while retaining their behavior coverage. Run `npm run check` and both economy scripts once on final source; fix real failures rather than weakening assertions.

Use production browser views at 960×600 and 1280×800 for title, pause, known habitats, fabrication and a matching blocked-exit cockpit. Verify one full actionable refusal plus short result at both sizes, including the retained seven-warning composition. Exercise changing/clearing the refusal, opening/closing a panel and save/error routing. Use an existing earned Dart checkpoint for a short ordinary control/exit/return-menu/manual-save workflow. A brief contact confirms the impact presentation; deterministic staged exact-damage cases may supplement it and must be labelled. Do not replay the whole expedition or claim fresh full-route evidence from a checkpoint. New/import/Continue/reset semantics remain covered by meaningful existing tests and a bounded actual reload where affected.

Before any browser action read `/work/repos/fleet/BROWSER_RULES.md` and `docs/BROWSER_RULES.md`. Prefer artifacts/APIs when sufficient. For new browser work use T3 preview_status then preview_open if needed; prove page-to-process ownership on isolated factory-worker/Linux (remote thread alone is insufficient), own incognito storage and a bounded tab. Check port **5190** free before your own production server; choose a free alternative if occupied. Preserve user/shared tabs, browser hosts and peers. Keep actions page-local; no unattended Windows automation, OS cursor/focus actions or unverified pointer lock. Use the app lifecycle to close only your own tab/context and your terminal lifecycle for your server. Stop recordings and verify cleanup; no global process kills or relaunch loops. If remote execution is unavailable, report it and continue non-browser work; do not silently switch to the owner's desktop. Follow the current T3 fallback rules for actual preview failures.

Retain exact source/build hashes, current model/effort, before/after comparable actual captures, bounded input/timing traces and unedited save exports under `/tmp/siltwake-os2-refinements/`, with a finite payload manifest. Existing archives are read-only; copy/adapt any script that writes alongside itself into your own directory. No separate human comfort/enjoyment/audible-mix/consumer-GPU claims from software-rendered automation.

Return coherent source/evidence commits, exact paths/seams, checks, correction results, artifacts, limitations and cleanup. Stop and release ownership; no peer waiting. Root will inspect provisionally, freeze the **combined movement + refinement batch**, obtain fresh non-author Astra xhigh and Sol6.1 max acceptance, then a fresh Opus stage1 verification. You do not accept your own work or close stage1.
