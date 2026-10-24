# Recorder overhead (3 rounds, interleaved; ticket 261024-032100-17b1)

| Mode | Frames | Gap p50 | Gap p99 | Over 33 ms | Work p50 | Work p99 | Work mean (spread) | Main thread ms/frame (spread) | Main thread ms/s (spread) | Recorder self (mean/frame) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| off | 21571 | 16.7 | 16.8 | 6 | 2.8 | 7.5 | 3.104 (0.412) | 3.669 (0.443) | 219.8 (27.5) | — |
| playtest | 21579 | 16.7 | 16.8 | 5 | 2.8 | 8 | 3.139 (0.491) | 3.724 (0.526) | 223.2 (32.3) | 0.0873 |

Deltas against off (ms; % of a 16.67 ms frame from the mean work). Main thread: every task on the page's main thread over the window (CDP TaskDuration), GC and the recorder's later tasks included: the inclusive cost, judged against the rounds' own spread:

| Mode | Gap p50 | Gap p99 | Work p50 | Work p99 | Work mean | % of frame | Main thread Δ ms/frame | Main thread Δ ms/s | Inclusive |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| playtest | 0 | 0 | 0 | 0.5 | 0.035 | 0.21 | 0.055 | 3.4 | inside the noise |

Recorder self-time by part (mean ms per frame): playtest: sample 0.0079, frame 0.0096, heap 0.0093, gpu-timer 0.0228, snapshot 0.0007, video 0.0277, spool 0.0054, events 0.0039

Frames: display frames, one per rAF timestamp. Work: that frame's rAF callbacks together (the game's: simulation, streaming, render, HUD and the recorder when on; and the soak's tiny frame recorder), timed by the same wrapper in every mode. Main thread: CDP TaskDuration over the measured window, divided by those frames, and per measured second. Gap: the rAF interval a player sees.
