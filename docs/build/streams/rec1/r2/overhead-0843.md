# Recorder overhead (3 rounds, interleaved; ticket 261024-003520-0843)

| Mode | Frames | Gap p50 | Gap p99 | Over 33 ms | Work p50 | Work p99 | Work mean (spread) | Main thread ms/frame (spread) | Main thread ms/s (spread) | Recorder self (mean/frame) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| off | 21539 | 16.7 | 16.8 | 15 | 2.7 | 6.2 | 2.836 (0.099) | 3.363 (0.117) | 201.2 (8) | — |
| playtest | 21586 | 16.7 | 16.8 | 5 | 2.9 | 7.7 | 3.185 (0.246) | 3.762 (0.262) | 225.5 (16.3) | 0.0881 |

Deltas against off (ms; % of a 16.67 ms frame from the mean work). Main thread: every task on the page's main thread over the window (CDP TaskDuration), GC and the recorder's later tasks included: the inclusive cost, judged against the rounds' own spread:

| Mode | Gap p50 | Gap p99 | Work p50 | Work p99 | Work mean | % of frame | Main thread Δ ms/frame | Main thread Δ ms/s | Inclusive |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| playtest | 0 | 0 | 0.2 | 1.5 | 0.349 | 2.09 | 0.399 | 24.3 | conclusive |

Recorder self-time by part (mean ms per frame): playtest: sample 0.0082, frame 0.0095, heap 0.0099, gpu-timer 0.0228, snapshot 0.0008, video 0.0274, spool 0.0053, events 0.0043

Frames: display frames, one per rAF timestamp. Work: that frame's rAF callbacks together (the game's: simulation, streaming, render, HUD and the recorder when on; and the soak's tiny frame recorder), timed by the same wrapper in every mode. Main thread: CDP TaskDuration over the measured window, divided by those frames, and per measured second. Gap: the rAF interval a player sees.
