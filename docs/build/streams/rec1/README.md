# REC-1 evidence (curated)

A few files from each pack; the full packs (every strip, the video, the timeline page, the raw recording) are in `/work/tmp/rec1/final/` on factory-worker.

- `pack-3090/`, `pack-4070/`: CW-1 segment 0, recorded at `2bf9b14e` (summary, story, three charts, a few strips: A01 damage, A02 long frame, A05 milestone, R1 random).
- `playtest-3090/`: the owner's path at `67e8394d` (default playtest recording, a feedback note, Settings → Export, packed).
- `overhead/`: the exclusive A/B tables (isolated test modes; the owner path as a static host serves it).
- `compare/`: the 3090 and 4070 packs side by side.
- `views/`: the fixed-view contact sheet (143 views, RTX 3090), the run-to-run report (same build twice) with one strip, and the adverse case's report and its two strips.
- `r1/`: R1's evidence (see the handoff's R1 section for the commit each ran at). It holds the playtest export checks at `48b0f251` (3090 default and 6 MiB budget; 4070), the owner-path exclusive A/B at `48b0f251` (disturbed; read with its caveat), the recorded pack's summary at `af6d85de`, the views' repeatability (B against A, transcribed; B against the re-accepted baselines), and the timeline seam's micro-bench and its script. Full outputs: `/work/tmp/rec1/r1g/` and `/work/tmp/rec1/r1h/` on factory-worker.
- `r2/`: R2's evidence (see the handoff's R2 section for the commit each ran at), all at `126b2cc6`:
  - the playtest export checks (3090 default and 6 MiB budget; 4070 both);
  - the 3090 pack summary;
  - `adverse.mjs`'s verdict on the 4070 (the clock judged with `--decode`);
  - the two exclusive A/B tables (each ticket's round 1 excluded in the handoff's pooling);
  - the off/playtest sampling profiles (contended: attribution only).
