| Run | Commit | Caves reached | Minutes | Frames | p50 / p95 / p99 / max ms | Gaps > 33 ms | Streaming > 34 ms (GC-shaped) | Over 34 ms: host / host-stopped (GPU unknown) / mixed / clean (streaming ours) | Holds | Unsliced in travel (at load) | Dark cave frames | Gate |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| deep #2 | 64bf2565 | 7/7 | 14.4 | 51954 | 16.7 / 16.8 / 16.8 / 100 | 18 | 2 (0) | 0 / 2 / 12 / 0 (+3 unsampled) (2) | 0 | 0 (0) | 0 | **fail** |
| rerun #1 | 64bf2565 | 12/12 | 10.4 | 37356 | 16.7 / 16.7 / 16.8 / 116.7 | 16 | 1 (0) | 0 / 2 / 9 / 0 (+4 unsampled) (1) | 0 | 0 (0) | 0 | **fail** |
| surf #0 | 64bf2565 | 1/1 | 3.2 | 11474 | 16.7 / 16.8 / 16.8 / 16.8 | 0 | 0 (0) | – | 0 | 0 (0) | 0 | pass |
| tour #1 | 64bf2565 | 3/3 | – | – | – / – / – / – | – | – | – | – | – (–) | – | **fail** |
| tour #3 | 64bf2565 | 5/5 | 15.3 | 55065 | 16.7 / 16.7 / 16.8 / 116.7 | 21 | 0 (0) | 0 / 0 / 7 / 0 (+10 unsampled) (0) | 0 | 0 (0) | 0 | pass |
| tour #4 | 64bf2565 | 4/4 | 13.8 | 49761 | 16.7 / 16.7 / 16.8 / 116.7 | 20 | 0 (0) | 0 / 1 / 10 / 0 (+8 unsampled) (0) | 0 | 0 (0) | 0 | pass |
| tour #7 | 64bf2565 | 4/4 | 11.5 | 41357 | 16.7 / 16.7 / 16.8 / 100 | 14 | 0 (0) | 0 / 2 / 8 / 0 (+3 unsampled) (0) | 0 | 0 (0) | 0 | pass |

| Part | Worst p99 ms | Max ms | Run with the max |
|---|---|---|---|
| chunks | 4.6 | 23.7 | surf #0 |
| regions | 0.3 | 95.2 | rerun #1 |
| caves | 0.2 | 6.2 | deep #2 |
| caveWanted | 0.1 | 3.5 | tour #4 |
| caveBuild | 0.1 | 5.9 | deep #2 |
| caveEvict | 0.1 | 3 | tour #4 |
| caveLightList | 0.1 | 0.2 | deep #2 |
| caveTexture | 0.1 | 0.2 | tour #4 |
| caveUpload | 0 | 0.4 | tour #4 |
| caveView | 0.1 | 6.1 | deep #2 |
| chunkUpdates | 1 | 2 | deep #2 |
| chunkPlan | 0.3 | 6.1 | tour #4 |
| chunkDrop | 0.1 | 0.4 | tour #3 |
| chunkBuild | 4.4 | 23.5 | surf #0 |
| chunkUpload | 0.1 | 5.9 | tour #7 |
| chunkDisplay | 0.1 | 0.4 | rerun #1 |
| chunkEvict | 0.1 | 3.1 | tour #3 |
| chunkDispose | 0.1 | 1.3 | deep #2 |
| chunkDisposeMax | 0 | 1.3 | deep #2 |
| lights | 0.6 | 102.6 | deep #2 |
| optics | 0.1 | 4.1 | rerun #1 |
| lightScan | 0.1 | 1.6 | rerun #1 |
| lightCached | 0.1 | 6.1 | deep #2 |
| lightMoving | 0.1 | 0.9 | rerun #1 |
| lightPlacing | 0 | 0.5 | tour #3 |
| lightSentLag | 0 | 0 | deep #2 |
| lightLagWorst | 0 | 0 | deep #2 |
| lightPlace | 0.2 | 6.3 | deep #2 |
| lightSelect | 0.4 | 102.4 | deep #2 |
| render | 2.2 | 112.5 | rerun #1 |
| sim | 1.1 | 47.7 | deep #2 |

deep #2 power: /^(Service|Charge at)/ (call at divide_dock, done); /^(Service|Charge at)/ (call at meridian_office, done); end 89% with 2 cells, home covered

rerun #1 power: no calls; end 72% with 2 cells, home covered

surf #0 power: no calls; end 91% with 2 cells, home covered

tour #3 power: no calls; end 51% with 2 cells, home covered

tour #4 power: no calls; end 56% with 2 cells, home covered

tour #7 power: no calls; end 62% with 2 cells, home covered

Stalls (45): rerun #1 cruise#60 at 178,-169,-425 (30.7 m short, O₂ 100% Dart air HEALTH 100 FOOD 45 F · eat meal DART 81% power Hull 100% · 170 / 350 m); rerun #1 cruise#60 at 178,-153,-426 (46.2 m short, O₂ 100% Dart air HEALTH 100 FOOD 45 F · eat meal DART 81% power Hull 99% · 154 / 350 m); rerun #1 cruise#60 at 178,-161,-426 (38.1 m short, O₂ 100% Dart air HEALTH 100 FOOD 45 F · eat meal DART 80% power Hull 99% · 162 / 350 m); surf #0 cruise#11 at 346,-27,124 (10 m short, O₂ 100% Dart air HEALTH 100 FOOD 55 F · eat meal DART 94% power Hull 99% · 27 / 350 m); surf #0 cruise#11 at 346,-26,124 (9.8 m short, O₂ 100% Dart air HEALTH 100 FOOD 55 F · eat meal DART 94% power Hull 99% · 27 / 350 m); surf #0 cruise#11 at 346,-26,124 (9.6 m short, O₂ 100% Dart air HEALTH 100 FOOD 55 F · eat meal DART 94% power Hull 99% · 27 / 350 m); surf #0 cruise#17 at 463,0,36 (56.8 m short, O₂ 100% Dart air HEALTH 100 FOOD 53 F · eat meal DART 92% power Hull 96% · 1 / 350 m Service here · Tab); tour #3 cruise#40 at 1145,-2,124 (14.3 m short, O₂ 100% Dart air HEALTH 100 FOOD 46 F · eat meal DART 80% power Hull 98% · 3 / 350 m); tour #3 cruise#56 at 968,-2,-41 (11.1 m short, O₂ 100% Dart air HEALTH 100 FOOD 42 F · eat meal DART 73% power Hull 97% · 3 / 350 m); tour #3 cruise#56 at 966,-2,-40 (12.8 m short, O₂ 100% Dart air HEALTH 100 FOOD 42 F · eat meal DART 73% power Hull 97% · 3 / 350 m); tour #3 cruise#56 at 965,-2,-39 (14.4 m short, O₂ 100% Dart air HEALTH 100 FOOD 42 F · eat meal DART 72% power Hull 96% · 3 / 350 m); tour #3 cruise#57 at 965,-2,-38 (11.5 m short, O₂ 100% Dart air HEALTH 100 FOOD 41 F · eat meal DART 72% power Hull 96% · 3 / 350 m)

| Run | Title ms | Playable ms | Collision pack ms | CPU MiB | GPU MiB | Regions MiB | Heap MiB | Boxes | Built / evicted | Light uploads |
|---|---|---|---|---|---|---|---|---|---|---|
| deep #2 | 4993 | 24051 | 4071 | 40.3 | 34.3 | 12.7 | 289.3 | 52886 | 34 / 27 | 27 |
| rerun #1 | 4985 | 25516 | 4155 | 77.3 | 58.1 | 12.7 | 332.1 | 136354 | 26 / 14 | 49 |
| surf #0 | 5259 | 26862 | 4398 | 47.7 | 35.1 | 12.7 | 227.7 | 84661 | 16 / 7 | 3 |
| tour #1 | 5196 | 26720 | 4263 | – | – | – | – | – | – / – | – |
| tour #3 | 5199 | 26145 | 4374 | 49.2 | 36.9 | 12.7 | 279.7 | 80627 | 31 / 25 | 35 |
| tour #4 | 5197 | 26603 | 4392 | 47.6 | 43 | 12.7 | 279.5 | 62210 | 32 / 27 | 48 |
| tour #7 | 5184 | 26211 | 4318 | 51.9 | 41.6 | 12.7 | 298.3 | 80014 | 52 / 43 | 39 |

Not reached: none.

Streaming-attributed frames over 34 ms (the part that ran long; gc = the heap shrank across the gap):

- deep #2 at 656, -310, -1215: 83.3 ms gap, 68.4 ms of work (lightsIn 9305.0, lightsWalked 285.0), no GC traced
- deep #2 at 640, -323, -1221: 100 ms gap, 107.1 ms of work (lightsIn 9092.0, lightsWalked 285.0), no GC traced
- rerun #1 at -396, -7, -25: 100 ms gap, 98.9 ms of work (lightsIn 723.0, lightsWalked 219.0), no GC traced
