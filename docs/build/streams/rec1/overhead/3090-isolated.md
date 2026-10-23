# Recorder overhead (2 rounds, interleaved; ticket 261023-123448-7658)

| Mode | Frames | Gap p50 | Gap p99 | Over 33 ms | Work p50 | Work p99 | Work mean | Recorder self (mean/frame) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| off | 14401 | 16.67 | 16.67 | 0 | 3.33 | 8.835 | 3.728 | — |
| perf | 14371 | 16.67 | 16.67 | 9 | 3.745 | 9.21 | 4.123 | 0.0698 |
| screencast | 14397 | 16.67 | 16.67 | 2 | 3.365 | 6.575 | 3.598 | 0.048 |
| game-video | 14374 | 16.67 | 16.67 | 10 | 4.055 | 10.525 | 4.426 | 0.1103 |

Deltas against off (ms; % of a 16.67 ms frame from the mean work):

| Mode | Gap p50 | Gap p99 | Work p50 | Work p99 | Work mean | % of frame |
| --- | --- | --- | --- | --- | --- | --- |
| perf | 0 | 0 | 0.415 | 0.375 | 0.395 | 2.37 |
| screencast | 0 | 0 | 0.035 | -2.26 | -0.13 | -0.78 |
| game-video | 0 | 0 | 0.725 | 1.69 | 0.698 | 4.19 |

Recorder self-time by part (mean ms per frame): perf: sample 0.0102, frame 0.0571, snapshot 0.0011, video 0.0009, spool 0.0005 · screencast: sample 0.0081, frame 0.0376, snapshot 0.0009, video 0.0009, spool 0.0005 · game-video: sample 0.0113, frame 0.0668, snapshot 0.001, video 0.0306, spool 0.0006

Work: the game's frame callback (simulation, streaming, render, HUD, and the recorder when on), timed by the same wrapper in every mode. Gap: the rAF interval a player sees.
