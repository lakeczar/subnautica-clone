# Run story: PARTIAL

RTX 3090 (factory-worker) · NVIDIA GeForce RTX 3090 550.163.01 · 156.0.8078.4 · commit `2bf9b14eee97` · build `index-Bu6IaKMK.js` · 5.3 min · driver · segment 0 · isolated (5 µs timers)

Frames 18924: gap p50 16.7 / p99 16.7 / max 133.3 ms, 34 over 33 ms. Game's own work p50 4.5 / p99 11.2 ms. Recorder 0.106 ms mean, 1.55 ms p99 per frame (self-timed). GPU per scene p50 4 / p99 10.3 ms. Legacy #ocean counters 0.133 ms mean, 0.3 ms p99 per frame.
Before the measured window (load and entry, not judged): 1115 frames over 21.1 s, 49 over 33 ms, 0 errors.
Memory: tab 687.9 → 777.4 MiB, heap 162.9 → 161.2 MiB, VRAM (this browser) 170 → 1474 MiB, trend -7.2 MiB/min. Draw calls p50 91, max 207. Holds 0 frames. Errors 0, warnings 0.

## Checks

| Check | Result | Note |
| --- | --- | --- |
| no streaming frame over 33 ms | unproven | 0 of 42 long frames were streaming's (recorded; a shared run does not judge frame times) |
| no cave hold | pass | admission evaluated every play frame |
| no unsliced cave build | pass | counter read every sample |
| no errors | pass | none recorded |
| recording complete | pass | lost {"frames":0,"samples":0,"events":0,"snapshots":0}; snapshots missing 0 |
| video | pass | cdp-screencast, 12 fps, 1280x720 |
| frame times judged | unproven | shared run: frame times are recorded, not performance evidence |
| memory flat | unproven | trend -7.2 MiB/min over 5 min (under 10 min: not judged) |
| tab memory (RSS) | pass | renderer process RSS |
| VRAM | pass | this browser's own VRAM (nvidia-smi per process); whole-GPU use and the game's estimate of streamed bytes alongside |

## Attention (18)

- **A01** 1:33 (92.5 s) tick 152041 · damage · impact at 4.2 m/s: hull -0 → [strips/A01-damage-93s.jpg](strips/A01-damage-93s.jpg)
- **A02** 1:33 (93.4 s) tick 152098 · long-frame · 2 frames over 33 ms in 0.0 s, worst 33.3 ms (outside the game's frame) · split work 7.54, sim 2.87, chunks 0.13, caves 0.07, regions 0.23, lights 0.56, actors 0.1, render 1.36, hud 0.44, rec 0.05, gpu 7.33, outside 25.7 → [strips/A02-long-frame-93s.jpg](strips/A02-long-frame-93s.jpg)
- **A03** 1:34 (94.0 s) tick 152131 · damage · impact at 4.2 m/s: hull -0 → [strips/A03-damage-94s.jpg](strips/A03-damage-94s.jpg)
- **A04** 1:54 (114.1 s) tick 153346 · memory · this browser's VRAM rose 80 MiB in 6 s (295 → 375 MiB) → [strips/A04-memory-114s.jpg](strips/A04-memory-114s.jpg)
- **A05** 2:26 (146.0 s) tick 155250 · milestone · new region island_chain → [strips/A05-milestone-146s.jpg](strips/A05-milestone-146s.jpg)
- **A06** 3:44 (223.8 s) tick 159922 · long-frame · 50.0 ms frame (outside the game's frame) · split work 6.35, sim 2.06, chunks 0.14, caves 0.05, regions 0.16, lights 0.51, actors 0.11, render 1.47, rec 0.06, gpu 4.59, outside 43.6 → [strips/A06-long-frame-224s.jpg](strips/A06-long-frame-224s.jpg)
- **A07** 3:52 (232.0 s) tick 160418 · long-frame · 4 frames over 33 ms in 2.6 s, worst 50 ms (outside the game's frame) · split work 14.78, sim 7.44, chunks 0.16, caves 0.06, regions 0.17, lights 0.51, actors 0.25, render 4.07, hud 0.34, rec 1.06, gpu 8.39, outside 34.2 → [strips/A07-long-frame-232s.jpg](strips/A07-long-frame-232s.jpg)
- **A08** 3:57 (237.3 s) tick 160740 · long-frame · 3 frames over 33 ms in 0.1 s, worst 83.3 ms (outside the game's frame) · split work 8.2, sim 2.44, chunks 0.13, caves 0.06, regions 0.16, lights 0.49, actors 0.13, render 1.22, rec 0.66, gpu 4.75, outside 74.5 → [strips/A08-long-frame-237s.jpg](strips/A08-long-frame-237s.jpg)
- **A09** 4:01 (241.3 s) tick 160980 · long-frame · 3 frames over 33 ms in 0.1 s, worst 50 ms (outside the game's frame) · split work 6.01, sim 1.69, chunks 0.14, caves 0.05, regions 0.16, lights 0.53, actors 0.09, render 1.63, rec 0.13, gpu 3.82, outside 43.9 → [strips/A09-long-frame-241s.jpg](strips/A09-long-frame-241s.jpg)
- **A10** 4:07 (247.1 s) tick 161332 · memory · 4 in 37 s, first: this browser's VRAM rose 112 MiB in 6 s (650 → 762 MiB); then this browser's VRAM rose 81 MiB in 6 s (786 → 867 MiB); this browser's VRAM rose 112 MiB in 6 s (958 → 1070 MiB); this browser's VRAM rose 119 MiB in 5 s (1134 → 1253 MiB) → [strips/A10-memory-247s.jpg](strips/A10-memory-247s.jpg)
- **A11** 4:12 (252.3 s) tick 161636 · long-frame · 2 frames over 33 ms in 0.0 s, worst 33.3 ms (outside the game's frame) · split work 6.02, sim 1.18, chunks 0.15, caves 0.05, regions 0.82, lights 0.51, actors 0.13, render 1.37, rec 0.15, gpu 3.65, outside 27.2 → [strips/A11-long-frame-252s.jpg](strips/A11-long-frame-252s.jpg)
- **A12** 4:21 (260.9 s) tick 162148 · long-frame · 3 frames over 33 ms in 0.1 s, worst 33.3 ms (outside the game's frame) · split work 7.3, sim 1.35, chunks 0.13, caves 0.05, regions 0.69, lights 0.57, actors 0.12, render 1.28, hud 0.49, gpu 5.04, outside 26 → [strips/A12-long-frame-261s.jpg](strips/A12-long-frame-261s.jpg)
- **A13** 4:43 (283.2 s) tick 163492 · long-frame · 33.3 ms frame (outside the game's frame) · split work 4.92, sim 1.23, chunks 0.09, caves 0.05, regions 0.18, lights 0.45, actors 0.1, render 1.21, rec 1.46, gpu 3.91, outside 27 → [strips/A13-long-frame-283s.jpg](strips/A13-long-frame-283s.jpg)
- **A14** 4:53 (293.2 s) tick 164085 · long-frame · 13 frames over 33 ms in 5.0 s, worst 66.7 ms (outside the game's frame) · split work 12.59, sim 5.28, chunks 0.12, caves 0.12, regions 0.17, lights 1.51, actors 0.27, render 2.03, hud 0.63, rec 0.11, gpu 3.32, outside 54 → [strips/A14-long-frame-293s.jpg](strips/A14-long-frame-293s.jpg)
- **A15** 4:56 (295.8 s) tick 164246 · long-frame · 2 frames over 33 ms in 0.1 s, worst 50 ms (outside the game's frame) · split work 6.28, sim 1.49, chunks 0.09, caves 0.06, regions 0.16, lights 0.46, actors 0.13, render 1.03, hud 1.21, rec 0.47, gpu 6.84, outside 43.2 → [strips/A15-long-frame-296s.jpg](strips/A15-long-frame-296s.jpg)
- **A16** 5:00 (300.2 s) tick 164502 · long-frame · 6 frames over 33 ms in 2.2 s, worst 133.3 ms (outside the game's frame) · split work 9.77, sim 4.24, chunks 0.12, caves 0.05, regions 0.19, lights 0.48, actors 0.13, render 1.88, hud 0.31, rec 0.05, gpu 7.05, outside 123.5 → [strips/A16-long-frame-300s.jpg](strips/A16-long-frame-300s.jpg)
- **A17** 5:04 (303.8 s) tick 164730 · long-frame · 133.3 ms frame (outside the game's frame) · split work 10.1, sim 5.2, chunks 0.1, caves 0.05, regions 0.19, lights 0.44, actors 0.12, render 0.82, hud 0.3, rec 0.26, gpu 4.33, outside 123 → [strips/A17-long-frame-304s.jpg](strips/A17-long-frame-304s.jpg)
- **A18** 5:09 (308.7 s) tick 165018 · long-frame · 33.3 ms frame (outside the game's frame) · split work 5.09, sim 1.37, chunks 0.11, caves 0.05, regions 0.17, lights 0.51, actors 0.13, render 1.08, gpu 2.83, outside 28.2 → [strips/A18-long-frame-309s.jpg](strips/A18-long-frame-309s.jpg)

Random samples (unflagged moments, to catch visual surprises):
- **R1** 11s tick 147186 → [strips/R1-random-11s.jpg](strips/R1-random-11s.jpg)
- **R2** 55s tick 149794 → [strips/R2-random-55s.jpg](strips/R2-random-55s.jpg)
- **R3** 1:14 tick 150946 → [strips/R3-random-74s.jpg](strips/R3-random-74s.jpg)

## Pacing

| Activity | Time | Share |
| --- | --- | --- |
| travelling | 5:03 | 96% |
| doing | 11s | 4% |
| waiting | 2s | 1% |
| menus | 0s | 0% |

Travelling: moving ≥ 0.5 m/s with no action within 3 s. Doing: a command, gather, craft or milestone within 3 s. Waiting: still, or held by a cave. Menus: paused or in a panel.

Longest stretch with nothing new, by region:

| Region | Longest (s) | Ends at |
| --- | --- | --- |
| refuge_reef | 165 | 5:16 |
| island_chain | 5 | 2:31 |

Chart: [charts/pacing.png](charts/pacing.png)

## Timeline

- -24s session · recording started (driver)
- -19s t145422 load · expedition entered at tick 145422
- 0s mark · travel starts (segment 0, 55 points)
- 1:33 t152041 damage · impact at 4.2 m/s: hull -0
- 1:34 mark · at reef_fan_crawl
- 2:26 t155250 milestone · new region island_chain
- 3:22 mark · at reef_shelf_lip
- 3:43 mark · at reef_drop_cathedral
- 3:52 mark · at reef_gully_window
- 4:23 mark · at reef_pumphouse_undercut
- 4:43 mark · at reef_bellhole
- 4:56 mark · at reef_archlet
- 5:15 mark · at reef_wrackhollow

Autosaves that succeeded: 11. Long frames: in the attention list. Player actions: counted in pacing (recording/events.ndjson has every one).
