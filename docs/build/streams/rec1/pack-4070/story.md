# Run story: PARTIAL

RTX 4070 Laptop (alickers, shared desktop host; indicative) · NVIDIA GeForce RTX 4070 Laptop GPU 595.97 · 156.0.8078.47 · commit `2bf9b14eee97` · build `index-Bu6IaKMK.js` · 5.4 min · driver · segment 0 · isolated (5 µs timers)

Frames 17254: gap p50 16.7 / p99 50 / max 133.3 ms, 1692 over 33 ms. Game's own work p50 2.8 / p99 7.4 ms. Recorder 0.044 ms mean, 0.16 ms p99 per frame (self-timed). GPU per scene p50 2.1 / p99 18.6 ms. Legacy #ocean counters 0.062 ms mean, 0.12 ms p99 per frame.
Before the measured window (load and entry, not judged): 771 frames over 67.8 s, 280 over 33 ms, 0 errors.
Memory: tab 535.4 → 597.8 MiB, heap 149.2 → 159.2 MiB, GPU (whole) 4048 → 4047 MiB, trend 12.8 MiB/min. Draw calls p50 90, max 209. Holds 0 frames. Errors 0, warnings 0.

## Checks

| Check | Result | Note |
| --- | --- | --- |
| no streaming frame over 33 ms | unproven | 0 of 1692 long frames were streaming's (recorded; a shared run does not judge frame times) |
| no cave hold | pass | admission evaluated every play frame |
| no unsliced cave build | pass | counter read every sample |
| no errors | pass | none recorded |
| recording complete | pass | lost {"frames":0,"samples":0,"events":0,"snapshots":0}; snapshots missing 0 |
| video | pass | cdp-screencast, 12 fps, 1280x720 |
| frame times judged | unproven | shared run: frame times are recorded, not performance evidence |
| memory flat | unproven | trend 12.8 MiB/min over 5 min (under 10 min: not judged) |
| tab memory (RSS) | pass | renderer process RSS |
| VRAM | pass | whole-GPU memory in use only (nvidia-smi lists no processes here; 3867 MiB before launch, desktop included); the game's own estimate of streamed bytes alongside |

## Attention (42; strips for the first 40)

- **A01** 0s (0.1 s) tick 146490 · long-frame · 43 frames over 33 ms in 8.0 s, worst 50 ms (outside the game's frame) · split work 4.01, sim 1.36, chunks 0.08, regions 0.11, lights 0.29, actors 0.1, render 0.84, rec 0.2, gpu 5.27, outside 45.8 → [strips/A01-long-frame-0s.jpg](strips/A01-long-frame-0s.jpg)
- **A02** 10s (10.1 s) tick 147101 · long-frame · 2 frames over 33 ms in 0.1 s, worst 33.3 ms (outside the game's frame) · split work 2.85, sim 0.68, chunks 0.07, regions 0.12, lights 0.3, actors 0.05, render 0.77, gpu 3.85, outside 30.5 → [strips/A02-long-frame-10s.jpg](strips/A02-long-frame-10s.jpg)
- **A03** 14s (14.3 s) tick 147341 · long-frame · 3 frames over 33 ms in 0.2 s, worst 33.3 ms (outside the game's frame) · split work 3.76, sim 0.66, chunks 1.04, regions 0.11, lights 0.29, actors 0.05, render 0.59, hud 0.21, gpu 2.81, outside 29.5 → [strips/A03-long-frame-14s.jpg](strips/A03-long-frame-14s.jpg)
- **A04** 17s (16.6 s) tick 147485 · long-frame · 2 frames over 33 ms in 0.1 s, worst 33.3 ms (outside the game's frame) · split work 2.25, sim 0.61, chunks 0.05, regions 0.09, lights 0.26, render 0.51, gpu 2.89, outside 31.1 → [strips/A04-long-frame-17s.jpg](strips/A04-long-frame-17s.jpg)
- **A05** 21s (20.9 s) tick 147757 · long-frame · 2 frames over 33 ms in 0.1 s, worst 33.3 ms (outside the game's frame) · split work 2.6, sim 0.68, chunks 0.07, regions 0.13, lights 0.27, actors 0.05, render 0.56, gpu 1.99, outside 30.7 → [strips/A05-long-frame-21s.jpg](strips/A05-long-frame-21s.jpg)
- **A06** 23s (23.0 s) tick 147870 · long-frame · 5 frames over 33 ms in 2.2 s, worst 33.3 ms (outside the game's frame) · split work 2.73, sim 0.77, chunks 0.06, regions 0.12, lights 0.27, actors 0.06, render 0.62, gpu 3.52, outside 30.6 → [strips/A06-long-frame-23s.jpg](strips/A06-long-frame-23s.jpg)
- **A07** 31s (31.2 s) tick 148366 · long-frame · 3 frames over 33 ms in 0.2 s, worst 33.3 ms (outside the game's frame) · split work 3.32, sim 1.04, chunks 0.07, caves 0.06, regions 0.1, lights 0.26, actors 0.05, render 0.56, gpu 3.52, outside 30 → [strips/A07-long-frame-31s.jpg](strips/A07-long-frame-31s.jpg)
- **A08** 36s (35.6 s) tick 148638 · long-frame · 33.3 ms frame (outside the game's frame) · split work 5.53, sim 0.72, chunks 0.05, caves 0.05, regions 0.09, lights 0.21, actors 0.07, render 3.5, gpu 1.45, outside 27.8 → [strips/A08-long-frame-36s.jpg](strips/A08-long-frame-36s.jpg)
- **A09** 50s (49.9 s) tick 149481 · long-frame · 638 frames over 33 ms in 49.5 s, worst 133.3 ms (outside the game's frame) · split work 4.32, sim 2.1, chunks 0.06, regions 0.1, lights 0.21, actors 0.05, render 0.88, hud 0.17, rec 0.2, gpu 17.86, outside 128.8 → [strips/A09-long-frame-50s.jpg](strips/A09-long-frame-50s.jpg)
- **A10** 1:34 (93.6 s) tick 152095 · damage · impact at 4.2 m/s: hull -0 → [strips/A10-damage-94s.jpg](strips/A10-damage-94s.jpg)
- **A11** 1:34 (94.2 s) tick 152138 · long-frame · 33 frames over 33 ms in 13.8 s, worst 66.7 ms (outside the game's frame) · split work 3.54, sim 1.17, chunks 0.07, regions 0.18, lights 0.28, actors 0.06, render 0.8, rec 0.2, gpu 4.65, outside 62.9 → [strips/A11-long-frame-94s.jpg](strips/A11-long-frame-94s.jpg)
- **A12** 1:47 (106.8 s) tick 152907 · long-frame · 3 frames over 33 ms in 0.1 s, worst 33.3 ms (outside the game's frame) · split work 2.6, sim 0.73, chunks 0.07, regions 0.09, lights 0.23, actors 0.06, render 0.59, rec 0.1, gpu 4.08, outside 30.6 → [strips/A12-long-frame-107s.jpg](strips/A12-long-frame-107s.jpg)
- **A13** 1:51 (111.0 s) tick 153147 · long-frame · 2 frames over 33 ms in 0.1 s, worst 33.3 ms (outside the game's frame) · split work 2.74, sim 0.73, chunks 0.06, regions 0.09, lights 0.23, actors 0.11, render 0.59, gpu 3.06, outside 30.6 → [strips/A13-long-frame-111s.jpg](strips/A13-long-frame-111s.jpg)
- **A14** 2:14 (133.7 s) tick 154504 · long-frame · 406 frames over 33 ms in 27.0 s, worst 116.7 ms (outside the game's frame) · split work 4.55, sim 1.72, chunks 0.09, regions 0.11, lights 0.24, actors 0.08, render 1.13, hud 0.22, rec 0.17, gpu 4.82, outside 111.9 → [strips/A14-long-frame-134s.jpg](strips/A14-long-frame-134s.jpg)
- **A15** 2:26 (145.6 s) tick 155220 · milestone · new region island_chain → [strips/A15-milestone-146s.jpg](strips/A15-milestone-146s.jpg)
- **A16** 2:27 (147.2 s) tick 155311 · damage · 2 in 0 s, first: impact at 11 m/s: hull -1.2; then impact at 5.8 m/s: hull -0.3 → [strips/A16-damage-147s.jpg](strips/A16-damage-147s.jpg)
- **A17** 2:29 (149.1 s) tick 155443 · long-frame · 58 frames over 33 ms in 6.6 s, worst 66.7 ms (outside the game's frame: a collection) · split work 3.65, sim 1.13, chunks 0.13, caves 0.05, regions 0.09, lights 0.27, actors 0.09, render 0.84, hud 0.18, rec 0.11, gpu 17.81, heapDrop 24.5, outside 62.9 → [strips/A17-long-frame-149s.jpg](strips/A17-long-frame-149s.jpg)
- **A18** 2:35 (155.3 s) tick 155813 · long-frame · 19 frames over 33 ms in 3.1 s, worst 33.3 ms (outside the game's frame) · split work 2.8, sim 0.63, chunks 0.1, regions 0.11, lights 0.23, actors 0.06, render 0.75, rec 0.1, gpu 3.13, outside 30.4 → [strips/A18-long-frame-155s.jpg](strips/A18-long-frame-155s.jpg)
- **A19** 2:41 (160.6 s) tick 156133 · long-frame · 12 frames over 33 ms in 0.8 s, worst 100 ms (outside the game's frame) · split work 9.02, sim 1.37, chunks 4.73, regions 0.1, lights 0.23, actors 0.07, render 1.09, hud 0.28, rec 0.16, gpu 2.55, outside 90.8 → [strips/A19-long-frame-161s.jpg](strips/A19-long-frame-161s.jpg)
- **A20** 2:46 (166.1 s) tick 156454 · long-frame · 31 frames over 33 ms in 5.8 s, worst 50 ms (outside the game's frame) · split work 3.36, sim 0.94, chunks 0.1, regions 0.12, lights 0.31, actors 0.09, render 0.8, rec 0.19, gpu 5.42, outside 46.5 → [strips/A20-long-frame-166s.jpg](strips/A20-long-frame-166s.jpg)
- **A21** 2:51 (171.3 s) tick 156777 · long-frame · 39 frames over 33 ms in 9.9 s, worst 50 ms (outside the game's frame) · split work 3.69, sim 0.85, chunks 0.11, caves 0.05, regions 0.12, lights 0.36, actors 0.09, render 0.85, hud 0.19, gpu 3.55, outside 46.3 → [strips/A21-long-frame-171s.jpg](strips/A21-long-frame-171s.jpg)
- **A22** 3:03 (183.3 s) tick 157498 · long-frame · 37 frames over 33 ms in 13.8 s, worst 50 ms (outside the game's frame) · split work 4.48, sim 1.05, chunks 0.16, regions 0.16, lights 0.3, actors 0.08, render 0.95, hud 0.26, rec 0.2, gpu 15.9, outside 45.3 → [strips/A22-long-frame-183s.jpg](strips/A22-long-frame-183s.jpg)
- **A23** 3:23 (203.1 s) tick 158682 · long-frame · 5 frames over 33 ms in 4.2 s, worst 50 ms (outside the game's frame) · split work 2.9, sim 0.81, chunks 0.07, regions 0.11, lights 0.24, render 0.72, rec 0.26, gpu 4.77, outside 46.8 → [strips/A23-long-frame-203s.jpg](strips/A23-long-frame-203s.jpg)
- **A24** 3:30 (210.2 s) tick 159098 · long-frame · 2 frames over 33 ms in 0.0 s, worst 33.3 ms (outside the game's frame) · split work 2.9, sim 0.61, chunks 0.07, regions 0.09, lights 0.25, actors 0.07, render 0.77, gpu 2.48, outside 30.4 → [strips/A24-long-frame-210s.jpg](strips/A24-long-frame-210s.jpg)
- **A25** 3:35 (214.6 s) tick 159371 · long-frame · 42 frames over 33 ms in 3.6 s, worst 66.7 ms (outside the game's frame) · split work 3.9, sim 1.04, chunks 0.09, regions 0.14, lights 0.24, actors 0.07, render 1.08, hud 0.26, rec 0.29, gpu 5.67, outside 62.5 → [strips/A25-long-frame-215s.jpg](strips/A25-long-frame-215s.jpg)
- **A26** 3:43 (222.5 s) tick 159846 · long-frame · 170 frames over 33 ms in 11.0 s, worst 116.7 ms (outside the game's frame: a collection) · split work 4.47, sim 1.47, chunks 0.1, regions 0.13, lights 0.27, actors 0.1, render 1.16, hud 0.23, rec 0.22, gpu 7.13, heapDrop 22.1, outside 112 → [strips/A26-long-frame-223s.jpg](strips/A26-long-frame-223s.jpg)
- **A27** 3:58 (237.7 s) tick 160747 · long-frame · 74 frames over 33 ms in 7.0 s, worst 83.3 ms (outside the game's frame) · split work 5.05, sim 1.34, chunks 0.09, regions 0.1, lights 0.26, actors 0.05, render 1.65, hud 0.19, rec 0.19, gpu 18.34, outside 78.1 → [strips/A27-long-frame-238s.jpg](strips/A27-long-frame-238s.jpg)
- **A28** 4:01 (241.2 s) tick 160956 · long-frame · 33.3 ms frame (outside the game's frame) · split work 2.95, sim 0.72, chunks 0.1, regions 0.09, lights 0.23, actors 0.05, render 0.86, rec 0.06, gpu 2.26, outside 30.3 → [strips/A28-long-frame-241s.jpg](strips/A28-long-frame-241s.jpg)
- **A29** 4:08 (247.5 s) tick 161340 · long-frame · 4 frames over 33 ms in 2.1 s, worst 50 ms (outside the game's frame) · split work 3.26, sim 0.88, chunks 0.11, regions 0.11, lights 0.26, actors 0.06, render 0.87, rec 0.21, gpu 5.01, outside 46.5 → [strips/A29-long-frame-248s.jpg](strips/A29-long-frame-248s.jpg)
- **A30** 4:10 (249.6 s) tick 161468 · long-frame · 33.3 ms frame (outside the game's frame) · split work 3.27, sim 0.87, chunks 0.1, regions 0.11, lights 0.26, actors 0.05, render 0.82, hud 0.16, gpu 7.82, outside 30 → [strips/A30-long-frame-250s.jpg](strips/A30-long-frame-250s.jpg)
- **A31** 4:14 (253.6 s) tick 161708 · long-frame · 3 frames over 33 ms in 0.1 s, worst 33.3 ms (outside the game's frame) · split work 3.38, sim 0.77, chunks 0.11, regions 0.1, lights 0.27, actors 0.07, render 0.79, gpu 3.36, outside 29.9 → [strips/A31-long-frame-254s.jpg](strips/A31-long-frame-254s.jpg)
- **A32** 4:18 (257.8 s) tick 161964 · long-frame · 2 frames over 33 ms in 2.0 s, worst 33.3 ms (outside the game's frame) · split work 3.15, sim 0.72, chunks 0.08, regions 0.09, lights 0.27, actors 0.05, render 0.76, hud 0.16, rec 0.09, gpu 2.07, outside 30.1 → [strips/A32-long-frame-258s.jpg](strips/A32-long-frame-258s.jpg)
- **A33** 4:22 (261.8 s) tick 162205 · long-frame · 33.3 ms frame (outside the game's frame) · split work 3.33, sim 0.68, chunks 0.09, regions 0.11, lights 0.27, actors 0.05, render 0.83, hud 0.17, rec 0.11, gpu 2.03, outside 29.9 → [strips/A33-long-frame-262s.jpg](strips/A33-long-frame-262s.jpg)
- **A34** 4:26 (265.8 s) tick 162445 · long-frame · 33.3 ms frame (outside the game's frame) · split work 2.9, sim 0.62, chunks 0.09, regions 0.09, lights 0.25, actors 0.05, render 0.73, gpu 2.08, outside 30.4 → [strips/A34-long-frame-266s.jpg](strips/A34-long-frame-266s.jpg)
- **A35** 4:28 (267.8 s) tick 162557 · long-frame · 7 frames over 33 ms in 6.1 s, worst 33.3 ms (outside the game's frame) · split work 2.82, sim 0.67, chunks 0.07, regions 0.1, lights 0.28, actors 0.05, render 0.76, gpu 2.15, outside 30.5 → [strips/A35-long-frame-268s.jpg](strips/A35-long-frame-268s.jpg)
- **A36** 4:36 (276.0 s) tick 163054 · long-frame · 4 frames over 33 ms in 6.0 s, worst 50 ms (outside the game's frame) · split work 3.37, sim 0.96, chunks 0.09, regions 0.1, lights 0.35, actors 0.09, render 0.79, gpu 2.29, outside 46.6 → [strips/A36-long-frame-276s.jpg](strips/A36-long-frame-276s.jpg)
- **A37** 4:44 (284.0 s) tick 163534 · long-frame · 3 frames over 33 ms in 4.0 s, worst 33.3 ms (outside the game's frame) · split work 2.39, sim 0.64, chunks 0.06, regions 0.09, lights 0.21, actors 0.05, render 0.52, gpu 2.06, outside 30.9 → [strips/A37-long-frame-284s.jpg](strips/A37-long-frame-284s.jpg)
- **A38** 4:54 (294.3 s) tick 164158 · long-frame · 5 frames over 33 ms in 2.2 s, worst 66.7 ms (outside the game's frame) · split work 4.05, sim 1.18, chunks 0.08, regions 0.13, lights 0.26, actors 0.1, render 1.02, hud 0.19, rec 0.19, gpu 4.79, outside 62.4 → [strips/A38-long-frame-294s.jpg](strips/A38-long-frame-294s.jpg)
- **A39** 4:59 (298.5 s) tick 164398 · long-frame · 2 frames over 33 ms in 0.1 s, worst 33.3 ms (outside the game's frame) · split work 3.22, sim 1.13, chunks 0.06, regions 0.1, lights 0.29, actors 0.05, render 0.6, gpu 3.59, outside 30.1 → [strips/A39-long-frame-299s.jpg](strips/A39-long-frame-299s.jpg)
- **A40** 5:05 (304.7 s) tick 164768 · long-frame · 23 frames over 33 ms in 1.1 s, worst 100 ms (outside the game's frame) · split work 4.36, sim 1.71, chunks 0.07, regions 0.09, lights 0.23, actors 0.07, render 0.99, hud 0.17, rec 0.16, gpu 6.16, outside 95.5 → [strips/A40-long-frame-305s.jpg](strips/A40-long-frame-305s.jpg)
- **A41** 5:08 (307.8 s) tick 164963 · long-frame · 33.3 ms frame (outside the game's frame) · split work 3.11, sim 0.84, chunks 0.07, regions 0.1, lights 0.25, actors 0.1, render 0.73, rec 0.09, gpu 1.48, outside 30.1 → no strip
- **A42** 5:10 (309.8 s) tick 165075 · long-frame · 2 frames over 33 ms in 0.1 s, worst 33.3 ms (outside the game's frame) · split work 2.86, sim 0.64, chunks 0.07, regions 0.1, lights 0.23, actors 0.07, render 0.76, gpu 2.67, outside 30.5 → no strip

Random samples (unflagged moments, to catch visual surprises):
- **R1** 55s tick 149813 → [strips/R1-random-55s.jpg](strips/R1-random-55s.jpg)
- **R2** 1:14 tick 150919 → [strips/R2-random-74s.jpg](strips/R2-random-74s.jpg)
- **R3** 3:12 tick 157978 → [strips/R3-random-192s.jpg](strips/R3-random-192s.jpg)

## Pacing

| Activity | Time | Share |
| --- | --- | --- |
| travelling | 5:05 | 95% |
| doing | 15s | 5% |
| waiting | 2s | 1% |
| menus | 0s | 0% |

Travelling: moving ≥ 0.5 m/s with no action within 3 s. Doing: a command, gather, craft or milestone within 3 s. Waiting: still, or held by a cave. Menus: paused or in a panel.

Longest stretch with nothing new, by region:

| Region | Longest (s) | Ends at |
| --- | --- | --- |
| refuge_reef | 164 | 5:23 |
| island_chain | 12 | 2:38 |

Chart: [charts/pacing.png](charts/pacing.png)

## Timeline

- -71s session · recording started (driver)
- -56s t145422 load · expedition entered at tick 145422
- 0s mark · travel starts (segment 0, 55 points)
- 1:34 t152095 damage · impact at 4.2 m/s: hull -0
- 1:34 mark · at reef_fan_crawl
- 2:26 t155220 milestone · new region island_chain
- 2:27 t155311 damage · impact at 11 m/s: hull -1.2
- 2:27 t155312 damage · impact at 5.8 m/s: hull -0.3
- 3:30 mark · at reef_shelf_lip
- 3:50 mark · at reef_drop_cathedral
- 3:59 mark · at reef_gully_window
- 4:30 mark · at reef_pumphouse_undercut
- 4:50 mark · at reef_bellhole
- 5:03 mark · at reef_archlet
- 5:21 mark · at reef_wrackhollow

Autosaves that succeeded: 11. Long frames: in the attention list. Player actions: counted in pacing (recording/events.ndjson has every one).
