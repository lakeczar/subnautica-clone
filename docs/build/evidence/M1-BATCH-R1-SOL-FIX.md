# M1 round-one Sol correction — author evidence

2026-10-17. Corrects **SOL-M1-01 / SOL-M1-02** only. Author is `gpt-6.1-sol`, `max`, the assigned implementation worker under root Astra xhigh. This is author verification, **not independent review or batch/milestone acceptance**.

Clean initial HEAD exactly matched **`253200a8f969d390e175d339fa8d3b0db47770d0`**, on isolated feature branch `t3/bound-distraction-cache-lifecycle`. Final source/test commit: **`b2014592512786920b2bcfdb8f28ed90145aebea`**. Only the two assigned production files, two assigned tests and this evidence path changed. No children, peer polling/waiting, parent mutation, push, PR or merge. Root's separately assigned occupied-Dart correction remains outside this task.

## Corrections and regressions

- [step.ts](../../../src/sim/step.ts): directional distraction intersects the existing shared `WORLD_BOUNDS`, shortening the 16 m ray at its first edge. Final coordinate clamps prevent numerical overshoot. Cardinal trigonometric residue does not incorrectly clip a tangent ray. A zero-length outward ray refuses atomically through the existing notice/error transaction semantics with truthful direction feedback. Interior projection, 12 seconds, expiry, one-active-pulse refusal and all unrelated state remain unchanged. Strict validation/import behavior is unchanged.
- [expedition.ts](../../../src/render/expedition.ts): absent cache IDs are disposed/deleted before current caches update, including `null`. Existing position/cargo visibility updates handle retained and reused IDs; current empty caches stay hidden. Mesh disposal preserves shared scene-owned materials. No save, physical cache, recovery or renderer/session API change.
- [expedition.test.ts](../../../tests/expedition.test.ts): production commands plus immediate encode/decode at four edges, four diagonal corners and four near-rounding corners; exact-edge/corner atomic refusal, tangent heading, unchanged interior ray, duration/expiry/renewal, repeated refusal and full unrelated-state conservation. Synthetic placements are labelled and validated before commands.
- [render-lifecycle.test.ts](../../../tests/render-lifecycle.test.ts): actual Babylon NullEngine and production expedition/material factories, with only a bounded text-canvas stub. Covers nonempty cache → New/cache-free decoded import/null, retained-ID position/cargo changes, empty/refilled cache, removed/reused IDs and 20 alternating distinct-ID replacements. Asserts actual mesh disposal/enabled state, stable mesh/material counts, shared-material survival and unchanged physical input. Disposes scene/engine and restores the temporary canvas global.

Red command tests fail on the old out-of-world target and non-atomic outward release. The first render attempt exposed an invalid synthetic fixture; completing its opening fixed setup. The subsequent unchanged-production red run fails **“absent cache geometry must be disposed.”** Both logs are retained, with the fixture failure explicitly excluded from defect proof. Focused final files pass **28/28**.

Exactly **one final `npm run check` after source settled** passed strict typecheck, **143/143 tests** and production build. Existing large-chunk warning and one low dependency advisory remain; no dependency/config change. Final production main JS **`index-BMDwO_EB.js`**, SHA256 **`53ec35d493f9173d84a6cb8dc501707f20c1c57e9145ae0c885168169adcaa3d`**; CSS **`index-DONjl4IF.css`**, SHA256 **`14756146fd5523913bc59b8079703e86ae867d0250079c88ed57e6198ab0a797`**. Artifact identity hashes every built file; 13 relevant source snapshots byte-match Git.

## Exact retained replay and production persistence

Copied/redirected reproducers before execution; original review/author artifacts stayed read-only. Reverified all **112 original review payloads** and unchanged original archive SHA256 `cbf841a672e6737ff8cbfb876b508b45e7e9364cb5fc78404856fb30a1616226`.

Untouched earned inputs:

- Combined-expedition main-final, original source `4d0a7f0`: SHA256 `91e531020ec16cfd9cf7c513f8822cb368be3952b592892a78db5e408103a928`.
- Earned recovery trace070, tick26383: SHA256 `9f2f11a7172279fc410fb4d909e293c37d6d18f387d3310c2d8e5fbea4fa3eac`.
- Existing earned Canopy checkpoint: retained `original/expedition-limits-imported.json`, tick18210; exact copy/hash indexed in the artifact. No fresh full route was driven.

The retained command schedule produces the **identical pre-command envelope** at tick22585, player Z54.0318424396. Its post-command envelope differs from baseline only in target Z: **70.0318424396 → 66**. Immediate encode/decode now succeeds; the old derived invalid envelope remains rejected. That old envelope is diagnostic data, never an actual exported save. Both baseline/final expiry replays remain saveable after721 ordinary steps.

Actual final production imported the unmodified earned main-final through the file input/confirmation. Bounded balanced arrow/W keyboard events passed through ordinary production controls to tick22721, player `(20.6746593527,-0.5121188906,54.3287978516)`, yaw3.025. Manual Save settled. Resume → G → Escape, synchronously without advancing a tick, produced `(22.0416355576,-0.5121188906,66)`, seconds12. **Actual manual Save settled with autosave enabled; actual Export downloaded a valid envelope whose entire state equals the saved state.** All inputs/checkpoints/journal were retained before reload.

Actual page reload → Continue → pause/Save restored the **complete identical state**, tick22721, target/seconds12 intact; no simulation tick elapsed in that entry. Subsequent ordinary no-input play yielded5.9666666667 seconds at tick23083 and null/zero at tick23470. Both whole states exactly equal production replay from the saved pulse. No field omissions; JSON signed-zero normalization only.

The existing earned Canopy checkpoint plus W1400ms produced actual warning calls at tick18295. G preserved the full16m interior projection;16 ordinary no-input ticks later the hunter was disengaging. Exact complete command/subsequent-state comparisons pass. This is a bounded continuation, not a fresh expedition/carrier matrix.

## Cache lifecycle in final production

Read-only production-scene instrumentation temporarily observes `Map.set`, forwards it unchanged, captures the actual `cache_20` mesh/scene and immediately restores the method. Later reads inspect enabled/disposed state, position, counts and shared materials. It never sets simulation, scene or material state; its source is retained separately.

Actual unchanged earned recovery import creates enabled `cache_20` at `(127.2085680449,-96.3742430860,-103.7481021331)`. Actual in-page New removes/disposes that same mesh in the reused scene (107 →96 meshes). Unchanged earned recovery reimport recreates its ID; actual unchanged cache-free earned main-final import removes/disposes the new mesh (107 →106). Shared cel/glass materials survive. Eight observations and complete relevant journal data are retained.

The normal replacement poses cannot see the deep loss location. Supplementary images therefore use **explicitly diagnostic valid camera save copies** of earned recovery, New and earned main-final, imported through the actual UI. Only player pose/velocity/mode and metadata differ; each source's cargo/cache/fleet/knowledge records remain intact. The pre-replacement image shows the ochre cache/antenna. After actual New, a cache-free camera import returns the same renderer's view to the old location; the cache is absent. The same inspection follows the actual unchanged cache-free earned import. All three images are visibly labelled diagnostic. Only the menu overlay was temporarily hidden/restored. The old point projects inside the final viewport, approximately `(640,576)`, depth0.986. These are no teleport-as-exploration or off-screen-absence claims. **Actual factory tests and read-only mesh disposal observations are primary proof.**

## Artifacts, limits and closure

[Artifact README](/tmp/siltwake-m1-batch-r1-sol-fix/README.md) indexes red/green/check logs, original/final simulator outputs, complete browser checkpoints/key edges/helpers, actual export, diagnostic camera generators/inputs/images, source/build verification and closure. [Portable archive](/tmp/siltwake-m1-batch-r1-sol-fix/artifacts.tar.gz): **1,032,787 bytes**, **76 payloads /77 regular archive files**, SHA256 **`a3e125b45dedb2d50f097772b18b7c60b4d6414788711078221b27ccc9457ee6`**. Manifest SHA256 **`d619c0207b3bf10dd0cf910d5b406c766085cad183d99871da772696e75b6631`**. Verified local/archive hashes, exact manifest bytes, unique safe member paths and no links. Frozen evidence payloads/manifest/archive are read-only.

Read current `/work/repos/fleet/BROWSER_RULES.md` and `docs/BROWSER_RULES.md` before browser work. Verified `factory-worker` Linux/T3 server and Linux Chromium154, owned incognito storage, checked-free5193; `preview_status` then `preview_open`. Rich1280×800/DPR2, WebGL2 ANGLE Vulkan **SwiftShader**, host **muted**. No consumer-GPU timing, audible-mix, fresh-human duration/enjoyment or acceptance claim. No fresh broad route/carrier rerun or occupied-Dart correction.

Released keys, restored the Map observer and menu overlay, and normally closed only owned tab **`tab_26_0430977b-1ed3-45f2-ac72-3683f9fe8942`** through T3. Owned server exec **16038** stopped by Ctrl-C, exit130; **5193 verified free**. No recording/controller/child remains. Historical tab14 and every shared/user/peer resource were untouched. Final snapshot has no runtime console error or failed network entry. Root owns integration, reconciliation and the fresh paired review on one revised frozen candidate.
