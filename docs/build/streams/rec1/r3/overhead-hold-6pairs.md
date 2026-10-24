# Recorder overhead (collected runs)

| Mode | Runs | Frames | Gap p50 | Gap p99 | Over 33 ms | Work p50 | Work p99 | Work mean | Main thread ms/frame | Main thread ms/s | Renderer CPU ms/s | GPU process CPU ms/s | Recorder self ms/frame |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| off | 6 | 21616 | 16.7 | 16.8 | 0 | 2.4 | 5.9 | 2.661 | 3.078 | 184.7 | 314.7 | 448.8 | — |
| playtest | 6 | 21566 | 16.7 | 16.8 | 12 | 2.7 | 7.9 | 3.016 | 3.493 | 209.1 | 561.1 | 356.8 | 0.0942 |

Against off, paired by round (each run one unit): mean difference, its range, and a paired t 95% interval. Assumes independent pairs with roughly normal differences; with few pairs the interval is wide by design.

| Mode | Main thread Δ ms/frame | Median 10 s window Δ ms/frame (holds) | Main thread Δ ms/s | Renderer CPU Δ ms/s | GPU process CPU Δ ms/s | Budget (1% of a frame) |
| --- | --- | --- | --- | --- | --- | --- |
| playtest | 0.415 (range -0.269 to 1.132; 95% CI -0.142 to 0.972; n = 6) | 0.413 (range -0.234 to 0.985; 95% CI -0.386 to 1.213; n = 4) | 24.443 (range -16.68 to 67.89; 95% CI -9.576 to 58.463; n = 6) | 246.383 (range 155.9 to 365.8; 95% CI 160.544 to 332.222; n = 6) | -92.033 (range -111.3 to -68.5; 95% CI -109.763 to -74.304; n = 6) | not shown: the interval's upper end 0.972 ms is not under 0.167 ms |

Budget: judged on the whole window's paired interval. The median 10 s window is a robust figure for a hold (the recorder's work recurs in every window, the game's occasional bursts do not); it is reported, not substituted.

Recorder self-time by part (mean ms per frame): playtest: sample 0.0073, frame 0.01, heap 0.0091, gpu-timer 0.0221, snapshot 0.0074, video 0.0287, spool 0.0063, events 0.0033

Frames: display frames, one per rAF timestamp. Work: that frame's rAF callbacks together (the game's, with the recorder when on, and the soak's tiny frame recorder). Main thread: CDP TaskDuration over the measured window (every task and collection). Renderer and GPU process CPU: user and system time of all their threads (the page's worker and media threads are in the renderer's). Gap: the rAF interval a player sees.
