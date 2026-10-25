# M1-LOOK author evidence

Started clean at exact parent `e06035df95a8ffe72f425a98dcb2e767b507b774`. Source **`b40d0772022b9e92fa4bfc5197adb5c4c5822cc7`** changes only eight owned render files and the affected lifecycle test. Simulation, registry, save, audio, renderer/factory signatures, seat and heading conventions are unchanged. No peers' in-flight source was used, no children, push or PR. This is an author deliverable; integrated M1 acceptance remains with root and fresh non-author reviews.

Actual production JS: `index-C4bIj-0F.js`, SHA256 **`5d82d1ac74844424b26dfb464a90ac569c9b2be3523ba27880cb0429c0acb0bc`**, matched to the browser-fetched bytes. Artifact root: [`/tmp/siltwake-m1-look/`](/tmp/siltwake-m1-look/). [Graphics observation](/tmp/siltwake-m1-look/graphics.json), [full manifest](/tmp/siltwake-m1-look/manifest.json), [comparison sheet](/tmp/siltwake-m1-look/comparison.png), [interactive comparison](/tmp/siltwake-m1-look/comparison.html).

## Six matched production pairs

Both columns use the same paused diagnostic state/pose at parent/final production builds. Coordinates below are player/keel datum; manifest records actual camera, yaw and pitch. Reef/scout study references sit beside the applicable pairs in the comparison sheet; they are different scenes/cameras. The editable `20711d1` generators informed shapes, not replacement physical envelopes.

| Scene | Position | Parent / final |
| --- | --- | --- |
| Reef / waterline | −9, −6.2, 7 | [before](/tmp/siltwake-m1-look/baseline/reef.png) / [after](/tmp/siltwake-m1-look/final/reef.png) |
| Pod interior | −0.7, 0.18, 23 | [before](/tmp/siltwake-m1-look/baseline/pod.png) / [after](/tmp/siltwake-m1-look/final/pod.png) |
| Dart fixed helm | 20, −1.6, −19 | [before](/tmp/siltwake-m1-look/baseline/dart.png) / [after](/tmp/siltwake-m1-look/final/dart.png) |
| Canopy clear-flank descent | 114, −69, −86 | [before](/tmp/siltwake-m1-look/baseline/canopy.png) / [after](/tmp/siltwake-m1-look/final/canopy.png) |
| Lab inside looking out | 114, −118, −128.6 | [before](/tmp/siltwake-m1-look/baseline/lab.png) / [after](/tmp/siltwake-m1-look/final/lab.png) |
| Carrier pane / stored craft | 65, −20, 4.8 | [before](/tmp/siltwake-m1-look/baseline/carrier.png) / [after](/tmp/siltwake-m1-look/final/carrier.png) |

Carrier is a **seeded glass/geometry diagnostic only**. Supplemental [hunter frontal](/tmp/siltwake-m1-look/final/hunter.png) has its matched parent in the sheet. I inspected all pairs: stronger reef contrast; lower, clearer helm; layered curved crowns with exposed warm lanterns; identifiable lab roof beacon; warmer inhabited refuges and smaller stencils. Actual ordinary-play [Canopy](/tmp/siltwake-m1-look/final/replay-canopy.png) and [lab](/tmp/siltwake-m1-look/final/replay-lab.png) captures confirm the improvements outside staged poses. Wet exterior attenuation and transparent panes remain visible from dry interiors.

## Ordinary replay, checks and limits

Imported the **unmodified earned Dart save** from `/tmp/siltwake-m1-combined-expedition/dart-boarded.json` (source `4d0a7f0`), byte-identical [input](/tmp/siltwake-m1-look/inputs/replay-earned-dart-boarded.json) SHA256 `0cc929d6a2ae85f38f898a456df911031cb639fa1053e54f819040387c1f1b88`. Session `af2ae693-a332-48b5-ad0b-205ff6943910`, created `2026-10-17T20:53:05.845Z`, saved `21:04:48.494Z`, tick11118. No preparation or state setters. HUD-guided keyboard inputs launched south beyond the rails, turned east, descended, quieted a hunter warning, exited Dart and crossed the lab threshold into walking/air. End tick15318, health/O₂/hull100%, Dart94.95175%, zero new failures/rescues; F5 saved successfully. [Input trace](/tmp/siltwake-m1-look/replay-trace.json), [final save](/tmp/siltwake-m1-look/replay-final-save.json), [103 s replay](/tmp/siltwake-m1-look/replay-short.mp4), [full 316 s recording](/tmp/siltwake-m1-look/replay-full.mp4). Short version removes menu pauses with no speed multiplier; [trim provenance](/tmp/siltwake-m1-look/replay-trim.json).

`npm run check` passed after final source: typecheck, **153/153 tests**, production build ([log](/tmp/siltwake-m1-look/final-check.log)). The meaningful lifecycle extension checks real charge/health bars, helm-only visibility and disposal/recreation. Actual Linux `factory-worker` Chromium154, Rich1280×800, ANGLE/SwiftShader, muted; `gl.getError()=0`, no shader/console errors. One owned diagnostic context loss restored actual pixels and remained paused; only expected loss/restoration warnings. Meshes96→98, vertices153313→253527: no representative GPU/performance or audio-quality claim. Existing chunk-size warning remains.

Small seams: `ArtBatch.leaf/glow/finish(contour)`; cel vertex alpha carries emission/contour while shared glass keeps its separate side attribute; region/depth optics retain wet/air-union math; lab shell reads existing `SOLIDS`; scene-owned Dart bars read real state. No new production module or public lifecycle seam. Remaining defects: inherited centre exit prompt obscures console bars (UI-owned); slight distant roof stippling remains visible under SwiftShader. No full economy/recovery matrix or fresh-player duration claim.

Cleanup: recording stopped, keys released, owned incognito tab closed normally, preview session87095 interrupted normally, port5191 verified free. Historical tab14, user/peer tabs and shared hosts preserved. No owned browser/server remains.
