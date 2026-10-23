# Recorder overhead (3 rounds, interleaved; ticket 261023-220053-e7bd)

| Mode | Frames | Gap p50 | Gap p99 | Over 33 ms | Work p50 | Work p99 | Work mean (spread) | Main thread ms/frame (spread) | Recorder self (mean/frame) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| off | 43156 | 16.5 | 16.8 | 7 | 2 | 5.5 | 1.513 (0.093) | 1.793 (0.103) | — |
| playtest | 43178 | 16.5 | 16.8 | 4 | 2.1 | 7.1 | 1.707 (0.409) | 2.083 (0.523) | 0.0889 |

Deltas against off (ms; % of a 16.67 ms frame from the mean work). Main thread: every task on the page's main thread over the window (CDP TaskDuration), GC and the recorder's later tasks included: the inclusive cost, judged against the rounds' own spread:

| Mode | Gap p50 | Gap p99 | Work p50 | Work p99 | Work mean | % of frame | Main thread Δ | Inclusive |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| playtest | 0 | 0 | 0.1 | 1.6 | 0.194 | 1.16 | 0.29 | inside the noise |

Recorder self-time by part (mean ms per frame): playtest: sample 0.0104, frame 0.01, heap 0.0132, gpu-timer 0.0238, snapshot 0.0008, video 0.0235, spool 0.0027, events 0.0045

Work: the game's frame callback (simulation, streaming, render, HUD, and the recorder when on), timed by the same wrapper in every mode. Gap: the rAF interval a player sees.
