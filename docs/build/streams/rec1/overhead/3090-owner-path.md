# Recorder overhead (2 rounds, interleaved; ticket 261023-123455-1459)

| Mode | Frames | Gap p50 | Gap p99 | Over 33 ms | Work p50 | Work p99 | Work mean | Recorder self (mean/frame) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| off | 14371 | 16.7 | 16.8 | 9 | 3.4 | 9.8 | 3.969 | — |
| playtest | 14382 | 16.7 | 16.8 | 5 | 3.6 | 7.3 | 3.835 | 0.078 |

Deltas against off (ms; % of a 16.67 ms frame from the mean work):

| Mode | Gap p50 | Gap p99 | Work p50 | Work p99 | Work mean | % of frame |
| --- | --- | --- | --- | --- | --- | --- |
| playtest | 0 | 0 | 0.2 | -2.5 | -0.134 | -0.8 |

Recorder self-time by part (mean ms per frame): playtest: sample 0.0087, frame 0.0408, snapshot 0.0009, video 0.0248, spool 0.0029

Work: the game's frame callback (simulation, streaming, render, HUD, and the recorder when on), timed by the same wrapper in every mode. Gap: the rAF interval a player sees.
