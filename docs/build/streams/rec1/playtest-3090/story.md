# Run story: PARTIAL

? · ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 3090/PCIe/SSE2, OpenGL ES 3.2) · Chrome/156.0.0.0 · commit `67e8394d62bb` · build `index-rp_lEiSX.js` · 1.9 min · playtest

Frames 6716: gap p50 16.7 / p99 16.8 / max 916.7 ms, 30 over 33 ms. Game's own work p50 5.1 / p99 13.6 ms. Recorder 0.176 ms mean, 2.1 ms p99 per frame (self-timed). GPU per scene p50 4.3 / p99 10.9 ms. Legacy #ocean counters 0.113 ms mean, 0.4 ms p99 per frame.
Before the measured window (load and entry, not judged): 41 frames over 2.6 s, 29 over 33 ms, 0 errors.
Memory: tab n/a MiB, heap 415.9 → 231.7 MiB, GPU (whole) n/a MiB, trend -173.7 MiB/min. Draw calls p50 98, max 207. Holds 0 frames. Errors 0, warnings 0.

## Checks

| Check | Result | Note |
| --- | --- | --- |
| no streaming frame over 33 ms | unproven | 7 of 32 long frames were streaming's (recorded; a shared run does not judge frame times) |
| no cave hold | pass | admission evaluated every play frame |
| no unsliced cave build | pass | counter read every sample |
| no errors | pass | none recorded |
| recording complete | pass | lost {}; snapshots missing 0 |
| video | pass | game, 12 fps, 1280x720 |
| frame times judged | unproven | shared run: frame times are recorded, not performance evidence |
| memory flat | unproven | trend -173.7 MiB/min over 2 min (under 10 min: not judged) |
| tab memory (RSS) | missing | the driver read no process memory (in-game export: the browser exposes only the JS heap) |
| VRAM | missing | no GPU memory figure: browsers expose none; only the game's own estimate of streamed bytes |

## Attention (12)

- **A01** 0s (0.0 s) tick 145422 · long-frame · 13 frames over 33 ms in 0.6 s, worst 916.7 ms (outside the game's frame) · split work 27.9, chunks 15.3, caves 6.6, regions 1.1, lights 2.2, actors 0.4, hud 0.9, rec 1, gpu 3.58, outside 887.8 → [strips/A01-long-frame-0s.jpg](strips/A01-long-frame-0s.jpg)
- **A02** 0s (0.3 s) tick 145428 · memory · 2 in 6 s, first: JS heap rose 73 MiB in 0 s (416 → 489 MiB); then JS heap rose 68 MiB in 6 s (469 → 538 MiB) → [strips/A02-memory-0s.jpg](strips/A02-memory-0s.jpg)
- **A03** 48s (48.1 s) tick 148283 · long-frame · 3 frames over 33 ms in 1.1 s, worst 100 ms (outside the game's frame) · split work 6.5, sim 3.5, chunks 0.1, regions 0.1, lights 0.4, render 0.9, hud 0.4, rec 0.1, gpu 3.79, outside 93.4 → [strips/A03-long-frame-48s.jpg](strips/A03-long-frame-48s.jpg)
- **A04** 58s (58.3 s) tick 148896 · long-frame · 2 frames over 33 ms in 1.8 s, worst 50.1 ms (outside the game's frame) · split work 5.4, sim 1.9, chunks 0.2, caves 0.1, regions 0.1, lights 0.4, actors 0.1, render 0.8, hud 0.3, gpu 5.6, outside 44.7 → [strips/A04-long-frame-58s.jpg](strips/A04-long-frame-58s.jpg)
- **A05** 1:01 (60.5 s) tick 149034 · long-frame · 33.3 ms frame (outside the game's frame) · split work 8.9, sim 1.5, chunks 0.1, regions 0.1, lights 1.5, actors 0.1, render 1.7, rec 0.2, gpu 14.27, outside 24.2 → [strips/A05-long-frame-61s.jpg](strips/A05-long-frame-61s.jpg)
- **A06** 1:09 (68.6 s) tick 149525 · long-frame · 2 frames over 33 ms in 0.0 s, worst 50.1 ms (render) · split work 53.9, sim 12.8, chunks 0.1, caves 0.1, regions 0.7, lights 0.8, actors 0.3, render 36.7, hud 0.6, rec 0.5, gpu 5.58, outside 0 → [strips/A06-long-frame-69s.jpg](strips/A06-long-frame-69s.jpg)
- **A07** 1:12 (71.8 s) tick 149712 · long-frame · 3 frames over 33 ms in 2.0 s, worst 49.9 ms (outside the game's frame) · split work 5.7, sim 1.9, chunks 0.2, caves 0.1, lights 0.2, actors 0.4, render 1.5, rec 0.4, gpu 8.8, outside 43.8 → [strips/A07-long-frame-72s.jpg](strips/A07-long-frame-72s.jpg)
- **A08** 1:17 (77.2 s) tick 150033 · long-frame · 66.6 ms frame (outside the game's frame) · split work 12, sim 2.4, chunks 0.1, regions 0.2, lights 0.4, render 3.1, hud 0.3, rec 0.2, gpu 4.47, outside 54.4 → [strips/A08-long-frame-77s.jpg](strips/A08-long-frame-77s.jpg)
- **A09** 1:22 (82.1 s) tick 150324 · long-frame · 2 frames over 33 ms in 0.1 s, worst 50 ms (outside the game's frame) · split work 6.7, sim 2.1, chunks 0.1, caves 0.1, regions 0.1, lights 0.5, actors 0.2, render 2.1, rec 0.2, gpu 4.46, outside 43.1 → [strips/A09-long-frame-82s.jpg](strips/A09-long-frame-82s.jpg)
- **A10** 1:31 (90.5 s) tick 150831 · long-frame · 2 frames over 33 ms in 0.1 s, worst 33.4 ms (outside the game's frame) · split work 15.6, sim 8.7, chunks 0.6, caves 0.3, regions 0.2, lights 0.4, actors 0.2, render 1.4, save 4, rec 0.6, gpu 4.98, heapDrop 1.2, outside 17.2 → [strips/A10-long-frame-91s.jpg](strips/A10-long-frame-91s.jpg)
- **A11** 1:43 (102.8 s) tick 151578 · long-frame · 3 frames over 33 ms in 0.3 s, worst 50 ms (outside the game's frame: a collection) · split work 9.2, sim 4.8, chunks 0.1, caves 0.1, regions 0.2, lights 0.7, actors 0.2, render 1.4, rec 3, gpu 3.78, heapDrop 24.1, outside 37.8 → [strips/A11-long-frame-103s.jpg](strips/A11-long-frame-103s.jpg)
- **A12** 1:52 (112.1 s) tick 152117 · note · note: REC-1 check: a note from the feedback key → no strip

Random samples (unflagged moments, to catch visual surprises):
- **R1** 11s tick 146072 → [strips/R1-random-11s.jpg](strips/R1-random-11s.jpg)
- **R2** 17s tick 146408 → [strips/R2-random-17s.jpg](strips/R2-random-17s.jpg)
- **R3** 42s tick 147934 → [strips/R3-random-42s.jpg](strips/R3-random-42s.jpg)

## Pacing

| Activity | Time | Share |
| --- | --- | --- |
| travelling | 1:28 | 78% |
| doing | 10s | 9% |
| waiting | 15s | 14% |
| menus | 0s | 0% |

Travelling: moving ≥ 0.5 m/s with no action within 3 s. Doing: a command, gather, craft or milestone within 3 s. Waiting: still, or held by a cave. Menus: paused or in a panel.

Longest stretch with nothing new, by region:

| Region | Longest (s) | Ends at |
| --- | --- | --- |
| refuge_reef | 112 | 1:52 |

Chart: [charts/pacing.png](charts/pacing.png)

## Timeline

- -6s session · video started (video/webm;codecs=vp9, 12 fps, 1280x720)
- -6s session · recording started (playtest, video)
- -1s t145422 load · expedition entered at tick 145422
- 1:52 t152117 note · note: REC-1 check: a note from the feedback key
- 1:53 session · recording exported

Autosaves that succeeded: 3. Long frames: in the attention list. Player actions: counted in pacing (recording/events.ndjson has every one).
