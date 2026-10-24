| Run | Commit | Caves reached | Minutes | Frames | p50 / p95 / p99 / max ms | Gaps > 33 ms | Streaming > 34 ms (GC-shaped) | Over 34 ms: host / host-stopped label / mixed / clean (streaming ours; labels are ours, R4-1) | Holds | Unsliced in travel (at load) | Dark cave frames | Gate |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| deep #2 | fc5059ff | 7/7 | 14.4 | 51779 | 16.7 / 16.7 / 16.8 / 116.7 | 19 | 1 (0) | 0 / 1 / 6 / 0 (+7 unsampled) (1) | 0 | 0 (0) | 0 | **fail** |
| tour #1 | fc5059ff | 12/12 | 10.4 | 37350 | 16.7 / 16.8 / 16.8 / 116.7 | 13 | 0 (0) | 0 / 0 / 8 / 0 (+3 unsampled) (0) | 0 | 0 (0) | 0 | pass |

| Part | Worst p99 ms | Max ms | Run with the max |
|---|---|---|---|
| chunks | 4.4 | 8.8 | deep #2 |
| regions | 0.3 | 9 | deep #2 |
| caves | 0.2 | 8.1 | tour #1 |
| caveWanted | 0.1 | 0.2 | deep #2 |
| caveBuild | 0.1 | 5.2 | tour #1 |
| caveEvict | 0.1 | 0.2 | deep #2 |
| caveLightList | 0.1 | 1.8 | tour #1 |
| caveTexture | 0.1 | 0.2 | deep #2 |
| caveUpload | 0 | 0.3 | deep #2 |
| caveView | 0.1 | 0.5 | deep #2 |
| chunkUpdates | 1 | 2 | deep #2 |
| chunkPlan | 0.3 | 4.7 | deep #2 |
| chunkDrop | 0.1 | 4.1 | deep #2 |
| chunkBuild | 4.2 | 8.6 | deep #2 |
| chunkUpload | 0.1 | 5.9 | tour #1 |
| chunkDisplay | 0.1 | 0.2 | deep #2 |
| chunkEvict | 0.1 | 2 | deep #2 |
| chunkDispose | 0 | 0.5 | deep #2 |
| chunkDisposeMax | 0 | 0.5 | deep #2 |
| lights | 0.6 | 52.6 | deep #2 |
| optics | 0.2 | 5.1 | tour #1 |
| lightScan | 0.1 | 6.9 | deep #2 |
| lightCached | 0.1 | 0.5 | tour #1 |
| lightMoving | 0.1 | 0.4 | tour #1 |
| lightPlacing | 0 | 0.8 | deep #2 |
| lightSentLag | 0 | 0 | deep #2 |
| lightLagWorst | 0 | 0 | deep #2 |
| lightPlace | 0.3 | 52.2 | deep #2 |
| lightSelect | 0.3 | 2.2 | deep #2 |
| render | 2.2 | 110.4 | tour #1 |
| sim | 1.2 | 10.9 | deep #2 |

deep #2 power: /^(Service|Charge at)/ (call at divide_dock, done); /^(Service|Charge at)/ (call at meridian_office, done); end 89% with 2 cells, home covered

tour #1 power: no calls; end 72% with 2 cells, home covered

Stalls (3): tour #1 cruise#60 at 178,-166,-426 (33.8 m short, O₂ 100% Dart air HEALTH 100 FOOD 45 F · eat meal DART 81% power Hull 100% · 166 / 350 m); tour #1 cruise#60 at 178,-156,-426 (43.4 m short, O₂ 100% Dart air HEALTH 100 FOOD 45 F · eat meal DART 81% power Hull 100% · 157 / 350 m); tour #1 cruise#60 at 178,-163,-426 (36.3 m short, O₂ 100% Dart air HEALTH 100 FOOD 45 F · eat meal DART 80% power Hull 100% · 164 / 350 m)

| Run | Title ms | Playable ms | Collision pack ms | CPU MiB | GPU MiB | Regions MiB | Heap MiB | Boxes | Built / evicted | Light uploads |
|---|---|---|---|---|---|---|---|---|---|---|
| deep #2 | 5146 | 24654 | 4387 | 40.4 | 34.3 | 12.7 | 291.8 | 52886 | 34 / 27 | 27 |
| tour #1 | 5166 | 26373 | 4300 | 77.7 | 58.5 | 12.7 | 311.2 | 136354 | 26 / 14 | 46 |

Not reached: none.

Streaming-attributed frames over 34 ms (the part that ran long; gc = the heap shrank across the gap):

- deep #2 at 683, -294, -1208: 49.9 ms gap, 56.8 ms of work (lightsIn 8749.0, lightsWalked 281.0), no GC traced
