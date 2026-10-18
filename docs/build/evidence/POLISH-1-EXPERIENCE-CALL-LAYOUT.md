# Bounded experience correction — call/save and cumulative warnings

Author handoff for **ASTRA-EXP-R1-01 and SOL-EXP-01**. Source **`555ac20efd66962bb503a6e49276148f63a0e786`** is complete within the amended assignment. The whole experience batch remains provisional: root inspection and fresh non-author Astra/xhigh plus Sol6.1/max acceptance are still required. This is not author acceptance or completion of stage1/M2–M4.

## Identity and boundaries

Started clean at the exact parent **`f70f4c89705a118fc3e19b21e59ef127f352507c`**, branch `t3/siltwake-call-save-layout`, cwd `/home/worker/.t3/worktrees/subnautica-clone/t3-e6e57172`. Parent source/tests/config equal reviewed `e81bb6fa3e19f01641f6fe874cce70443263b257`; `baseline.json` retains the empty production diff and initial Git status. Never switched checkout/branch, edited the parent, contacted a peer, created children, pushed, opened a PR or merged.

Actual original session runtime is **gpt-6.1-sol / max**, independently retained in `original-runtime.json`: session `01a1501e-6099-7892-a842-7800496fdfb0`, first `turn_context` ordinal7 at `2026-10-18T17:45:30.895Z`, original cwd and parent. T3 configuration also reported Sol6.1/max. Read STATUS first, PLAN/CONTRACTS, revised input/specification pointers, settled map/tracker, delivery gate, whole experience reconciliation and complete R1 brief/Astra report/interim disposition. Read Sol's terminal report from `a5f82822cde076310e4beb73aee20b440cc600e2` only after root's explicit amendment ended the independence restriction.

Only source paths changed are `src/ui/hud.css`, `src/ui/view.ts` and `tests/presentation.test.ts`. This report is the only documentation edit. No extra seam is requested.

## Concrete correction

The private `.session-notices` group contains the existing save warning, system chip and persistence/system notification. It stays **outside `#hud`** and stacks its children with8px gaps using actual content height. In play it begins at y122, below the unchanged call instrument at y75..114. Menu/panel/opening placements retain these essential notices outside hidden HUD ancestry. The call remains inside its original HUD ancestor.

At compact desktop widths, a reachable prompt reserves the centre for the unchanged prompt/result/look stack: warnings occupy the194px left lane, persistence errors the194px right lane. Without a prompt, warnings retain a wider centred lane, starting at y212 at960. This matters for adjacent craft warnings: an initial all-narrow variant reached the pilot guidance; self-review caught it and the final wider craft lane passes the six-warning cases. Toolbar, capture/look position, vitals and telemetry positions remain unchanged. No warning/result text is clipped, shortened or hidden; font floors remain12px actionable/11px labels.

`view.ts` changes only constructor markup grouping. IDs, action attributes, public signatures, handlers and focus identities are identical. No simulation, saved state, input, physics, copy, notification model, announcement, reset, timing or lifetime implementation changed. No layout polling, per-frame DOM rebuilding or extra live region was added. Eight assertions extend the existing storage-off test to check grouped notices through menu/panel HUD hiding; no CSS-mirroring test was added.

## ASTRA-EXP-R1-01 — real production proof

Retained before production image: `reviewer-before-production-call-save-960.png`, copied unchanged from Astra's reviewed-source archive. Own `before-production-1280.png` also captures the baseline real call. `before-capture-provenance.json` keeps their exact source/input attribution. At960, baseline call `(692.789,75,243.211,39)` lies wholly inside save `(632.594,72,303.406,48)`:9485.227 square CSS pixels covered.

All four **final production** captures use the actual retained/HTTP-verified build from555ac20, not injected DOM calls:

| Actual CSS viewport | Central persistence message | Active capture tick | Call/save overlap |
| --- | --- | ---: | ---: |
| 960×600 | Visible | 9327 | 0 |
| 960×600 | Expired | 9326 | 0 |
| 1280×800 | Visible | 9328 | 0 |
| 1280×800 | Expired | 9320 | 0 |

Files are `production-{960,1280}-{transient,expired}.{json,png}` with companion raw snapshots. The call rectangle is unchanged; the save warning begins at y122 and ends170, leaving8px below the call. Native combined fixtures also show the status chip at178..212 and the error below it at220, without overlaps. Complete dial, elevation and caption are visible in production.

The seed is the original **earned-derived diagnostic**: retained paid Dart, staged pose/velocity/threat, no inventory grant. Selected ordinary Import & save → Use without local saving → Resume after an owned quota-failure injection, restoring `Storage.prototype.setItem` before Resume. The simulation emits the call. For expiry checks, entry pauses at tick9304 **before any active step**, the existing12-wall-second notice expires, then ordinary Resume permits the first real call. Nothing extends the three-active-second call lifetime. `production-final-trace.json` retains inputs/observations; before-expiry/expiry-paused receipts retain tick/time boundaries. This is composition proof, not a newly earned expedition.

## SOL-EXP-01 — native diagnostic and production smoke

Copied/adapted the reviewed severe-state generator into this archive. It validates the seed with codec/clearance/actual `aimedInteraction`: swimmer `(101,-100,-99)`, base60m suit,25 oxygen/health,0 food, warning threat,8 alloy filling16/16CU, real upper resin target. Native `GameView` plus real `executeCommand(interact)` checks complete no-mutation refusal and displays the unabridged result.

At960, the exact baseline reproduces hazard `(288.594,220,382.805,132)` over prompt `(358.344,324,243.305,41)`, covering243.305×28 CSS pixels. Final five-warning hazard is `(24,220,194,240)`; the prompt keeps its exact original rectangle. Refusal `(240,371,480,59)` and look `(369.461,436,221.070,38)` also retain their positions. All are disjoint, including the concurrent save/error/status/call composition. At1280 the final native composition is likewise disjoint.

`final-five-{960,1280}-{no-error,concurrent}.{json,png}` and `native-fixture-final-trace.json` retain proof. **32** five-warning combinations cover save/error/status/call on/off with full prompt/refusal/fallback look; **52** bearing/elevation cases include all eight sectors, above/level/below and vertical-only semantics; **8** additional six-warning pilot cases cover warn/pursue and persistence on/off with current pilot guidance/vitals/telemetry. Every measured relevant intersection is zero.

`production-five-warning-refusal-{960,1280}.{json,png}` additionally uses the actual final production app, ordinary import/resume and trusted E. Both captures show all five typed warnings, the actual target and full capacity refusal without overlap. Standard drag-look visibility remains intact; the forced fallback look control is checked by the labelled native fixture. This severe production run is seeded, not ordinary route/recovery evidence.

Native Tab from the look control reaches the visible Export button; trusted Enter dispatches exactly one export at each viewport. Menu/panel transitions preserve notices and hide the call through HUD ancestry; graphics notices remain available. Those focus/transition receipts were captured on intermediate58cafc5, with identical final DOM grouping and identical applicable menu/panel/hidden-HUD CSS; the final amendment affects only playing warning placement. Final-source production independently exercises pause/resume and trusted keyboard save export, and all399 current checks include the extended grouped-notice behavior.

## Checks, exact build and artifacts

`npm ci`; final `npm run check` **399/399**, zero failure/skip/cancel/todo; strict typecheck and production build pass. Both economy checks pass on the unchanged simulation tree. Working-tree and parent-to-source diff checks pass. `final-source-checks.json` confirms unchanged unowned source/config, IDs and action attributes. Existing large-chunk warning remains.

`source-build-identity.json` verifies **all27** final outputs match working dist, retained `web/final` and actual HTTP5190 bytes; compiled GameView matches current `.test-build`. Before build also matches all27 reviewer build outputs. Final source tree **`4780e5b949c23dee3884dd4dfae0371f2a324f75`**, tests tree **`4e201e17ca20408006eab9aa5e3017ac23c682fb`**. Main outputs:

- JS `index-CgJzXPsR.js`: `f3580fa43f58cefa0b31801b79fd2248b73e9473779a881291f92e1acbd3aa39`.
- CSS `index-BhV6z4Hn.css`: `e082e3c45c0716bebd433f07fcdb21e23d5dfc687092f72f1aef648b84613a75`.

Artifact root **`/tmp/siltwake-polish-1-experience-call-layout/`**. `EVIDENCE-INDEX.md` maps current, baseline, intermediate and excluded evidence; `current-assertions.json`/`verify-current.mjs` recheck captures, cases and decoded exports. Own original transcript is retained. Immutable manifest covers **414 payloads /35,394,733 bytes**, excluding itself/sidecar; SHA256 **`bdc70f928d61646e499b1d361c0aafc1884bd87028d65764e273e11f8fb4a2a8`**. This repository report/subsequent report commit are outside that manifest. All **1652 original payloads** across five author archives and both completed R1 archives verify unchanged. No original script ran in place.

## Cleanup and limits

Read both fleet/repository browser rules before work. Used one owned incognito T3 tab `tab_3e_0430977b-1ed3-45f2-ac72-3683f9fe8942`, isolated storage and port5190. A900ms target-page pulse produces90 Linux CPU ticks in owned renderer2067407, UID1000 on factory-worker; process/Chrome/T3 ancestry is retained. Ownership is not inferred from UA/loopback. No Windows/physical-cursor or real pointer-lock work occurred.

Copied screenshots, raw traces and all four native downloads before normal tab closure. Restored the quota API, disconnected the observer, released inputs and verified no pointer lock. Closed only the owned tab via T3 lifecycle; sent normal SIGINT to the verified owned Python server2067365 (exit0). Both owned processes are gone; shared Chrome827911/T3 host811435 remain. `cleanup.json` retains the immediate closed-connection plain-bind failure and successful reuse bind/listen; **`port-final-exclusive.json` confirms later exclusive plain bind/listen of5190 succeeds**, with no listener. No browser/server/recording/check process remains owned.

Excluded pre-call/expired-call captures, a same-file upload retry that did not fire change, and a premature old-CSS build copy remain explicitly labelled. One final1280 pause click timed out after5000ms **after** the qualifying capture; subsequent status confirmed pause/menu and normal cleanup. The severe seed later triggered ordinary automatic incapacitation/recovery. Final export004 is tick278/walking after recovery; it does not prove capture-time state equality or an ordinary recovery route. Export003 is the call branch at tick9576 after disengagement, also not a capture-time equality claim. Both decode successfully; only the native command diagnostic proves full refusal-state equality.

Historical P1–P8/reload evidence keeps its original source attribution and was not replayed. Human feel, audible mix, enjoyment/duration and representative-GPU behavior remain unverified. Verification is bounded to the required960/1280 desktop compositions and labelled adjacent cases. Root inspection and fresh full-batch paired acceptance remain pending.
