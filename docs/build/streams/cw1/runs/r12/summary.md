| Run | Commit | Caves reached | Minutes | Frames | p50 / p95 / p99 / max ms | Gaps > 33 ms | Streaming > 34 ms (GC-shaped) | Over 34 ms: host / host-stopped (GPU unknown) / mixed / clean (streaming ours) | Holds | Unsliced in travel (at load) | Dark cave frames | Gate |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| deep #2 | 6ca73311 | 7/7 | 14.4 | 51796 | 16.7 / 16.7 / 16.8 / 116.7 | 22 | 1 (0) | 20 / 1 / 1 / 0 (0) | 0 | 0 (0) | 0 | pass |
| hops #2 | 6ca73311 | 1/1 | 7.1 | 25639 | 16.7 / 16.7 / 16.8 / 100 | 2 | 0 (0) | 2 / 0 / 0 / 0 (0) | 0 | 0 (0) | 0 | pass |
| surf #0 | 6ca73311 | 1/1 | 3.2 | 11428 | 16.7 / 16.7 / 16.8 / 100 | 7 | 1 (0) | 5 / 1 / 0 / 1 (0) | 0 | 0 (0) | 0 | pass |
| tour #0 | 6ca73311 | 6/6 | 6.4 | 22954 | 16.7 / 16.7 / 16.8 / 116.6 | 12 | 0 (0) | 10 / 0 / 0 / 1 (0) | 0 | 0 (0) | 0 | pass |
| tour #3 | 6ca73311 | 5/5 | 10.9 | 39217 | 16.7 / 16.7 / 16.8 / 116.8 | 17 | 1 (0) | 12 / 1 / 1 / 1 (0) | 0 | 0 (0) | 0 | pass |
| tour #4 | 6ca73311 | 4/4 | 13.8 | 49783 | 16.7 / 16.7 / 16.8 / 116.7 | 20 | 1 (0) | 12 / 0 / 2 / 2 (0) | 0 | 0 (0) | 0 | pass |
| tour #5 | 6ca73311 | 13/13 | 12.3 | 44290 | 16.7 / 16.7 / 16.8 / 116.6 | 13 | 0 (0) | 11 / 0 / 1 / 0 (0) | 0 | 0 (0) | 0 | pass |
| tour #7 | 6ca73311 | 4/4 | 11.5 | 41386 | 16.7 / 16.7 / 16.8 / 116.7 | 9 | 1 (0) | 6 / 1 / 1 / 0 (0) | 0 | 0 (0) | 0 | **fail** |

| Part | Worst p99 ms | Max ms | Run with the max |
|---|---|---|---|
| chunks | 4.6 | 25.8 | surf #0 |
| regions | 0.2 | 33.1 | tour #5 |
| caves | 0.2 | 56.8 | tour #3 |
| caveWanted | 0.1 | 4 | tour #3 |
| caveBuild | 0.1 | 6.5 | tour #3 |
| caveEvict | 0.1 | 0.2 | deep #2 |
| caveLightList | 0.1 | 0.5 | surf #0 |
| caveTexture | 0.1 | 0.6 | deep #2 |
| caveUpload | 0 | 0.3 | deep #2 |
| caveView | 0.1 | 56.7 | tour #3 |
| chunkUpdates | 1 | 2 | deep #2 |
| chunkPlan | 0.2 | 6.9 | tour #3 |
| chunkDrop | 0.1 | 4.1 | tour #4 |
| chunkBuild | 4.3 | 25.6 | surf #0 |
| chunkUpload | 0.1 | 6.9 | tour #7 |
| chunkDisplay | 0.1 | 0.8 | tour #7 |
| chunkEvict | 0.1 | 0.9 | tour #5 |
| chunkDispose | 0.1 | 0.7 | deep #2 |
| chunkDisposeMax | 0 | 0.6 | deep #2 |
| lights | 0.7 | 92.7 | tour #7 |
| optics | 0.1 | 1.1 | hops #2 |
| lightScan | 0.1 | 1.7 | tour #0 |
| lightCached | 0.1 | 92.1 | tour #7 |
| lightMoving | 0.1 | 0.5 | tour #5 |
| lightPlacing | 0 | 4.6 | tour #3 |
| lightSentLag | 0 | 0 | deep #2 |
| lightLagWorst | 0 | 0 | deep #2 |
| lightPlace | 0.2 | 92.4 | tour #7 |
| lightSelect | 0.4 | 88.4 | deep #2 |
| render | 1.7 | 114.1 | tour #7 |
| sim | 1.6 | 103.4 | tour #5 |

deep #2 power: /^(Service|Charge at)/ (call at divide_dock, done); /^(Service|Charge at)/ (call at meridian_office, done); end 89% with 2 cells, home covered

hops #2 power: /^(Service|Charge at)/ (call at meridian_office, done); end 92% with 2 cells, home covered

surf #0 power: no calls; end 91% with 2 cells, home covered

tour #0 power: no calls; end 80% with 2 cells, home covered

tour #3 power: no calls; end 65% with 2 cells, home covered

tour #4 power: no calls; end 56% with 2 cells, home covered

tour #5 power: no calls; end 63% with 2 cells, home covered

tour #7 power: no calls; end 62% with 2 cells, home covered

Stalls (15): surf #0 cruise#11 at 345,-27,124 (10.3 m short, O₂ 100% Dart air HEALTH 100 FOOD 55 F · eat meal DART 94% power Hull 99% · 28 / 350 m); surf #0 cruise#11 at 346,-27,124 (10 m short, O₂ 100% Dart air HEALTH 100 FOOD 55 F · eat meal DART 94% power Hull 99% · 27 / 350 m); surf #0 cruise#11 at 346,-26,124 (9.7 m short, O₂ 100% Dart air HEALTH 100 FOOD 55 F · eat meal DART 94% power Hull 99% · 27 / 350 m); surf #0 cruise#17 at 463,0,38 (56.9 m short, O₂ 100% Dart air HEALTH 100 FOOD 53 F · eat meal DART 92% power Hull 96% · 1 / 350 m Service here · Tab); tour #0 cruise#4 at -51,-7,-47 (59.3 m short, O₂ 100% Dart air HEALTH 100 FOOD 58 F · eat meal DART 99% power Hull 98% · 7 / 350 m); tour #4 cruise#55 at 1145,-3,124 (9.7 m short, O₂ 100% Dart air HEALTH 100 FOOD 42 F · eat meal DART 72% power Hull 99% · 4 / 350 m); tour #4 cruise#55 at 1145,-3,124 (9.8 m short, O₂ 100% Dart air HEALTH 100 FOOD 41 F · eat meal DART 72% power Hull 98% · 4 / 350 m); tour #4 cruise#55 at 1145,-3,124 (9.8 m short, O₂ 100% Dart air HEALTH 100 FOOD 41 F · eat meal DART 71% power Hull 98% · 4 / 350 m); tour #4 cruise#74 at 1145,-2,140 (19.1 m short, O₂ 100% Dart air HEALTH 100 FOOD 35 F · eat meal DART 62% power Hull 96% · 3 / 350 m); tour #4 cruise#74 at 1145,-2,140 (19.1 m short, O₂ 100% Dart air HEALTH 100 FOOD 35 F · eat meal DART 62% power Hull 95% · 3 / 350 m); tour #4 cruise#74 at 1145,-2,140 (19.1 m short, O₂ 100% Dart air HEALTH 100 FOOD 35 F · eat meal DART 62% power Hull 95% · 3 / 350 m); tour #5 cruise#22 at 341,-72,-21 (14.7 m short, O₂ 100% Dart air HEALTH 100 FOOD 52 F · eat meal DART 89% power Hull 99% · 73 / 350 m)

| Run | Title ms | Playable ms | Collision pack ms | CPU MiB | GPU MiB | Regions MiB | Heap MiB | Boxes | Built / evicted | Light uploads |
|---|---|---|---|---|---|---|---|---|---|---|
| deep #2 | 5189 | 24886 | 4336 | 40.3 | 34.3 | 12.7 | 283.5 | 52886 | 34 / 27 | 26 |
| hops #2 | 5015 | 24658 | 4133 | 39.5 | 28.9 | 12.7 | 261.1 | 64978 | 25 / 16 | 7 |
| surf #0 | 5173 | 27151 | 4335 | 47.7 | 35.1 | 12.7 | 220.1 | 84661 | 16 / 7 | 3 |
| tour #0 | 4972 | 27142 | 4053 | 66.7 | 45.1 | 12.7 | 347.5 | 93322 | 16 / 10 | 48 |
| tour #3 | 5172 | 26870 | 4306 | 47.9 | 35.3 | 12.7 | 280.2 | 80627 | 35 / 29 | 44 |
| tour #4 | 5153 | 27061 | 4226 | 47.6 | 43 | 12.7 | 279.3 | 62210 | 32 / 27 | 46 |
| tour #5 | 5252 | 26401 | 4339 | 61.6 | 40.4 | 12.7 | 303 | 113878 | 39 / 29 | 35 |
| tour #7 | 5201 | 26557 | 4273 | 50.4 | 41.6 | 12.7 | 285.1 | 70141 | 51 / 43 | 39 |

Not reached: none.

Streaming-attributed frames over 34 ms (the part that ran long; gc = the heap shrank across the gap):

- deep #2 at 1142, -619, -1485: 100 ms gap, 92.6 ms of work (lightsIn 1723.0, lightsWalked 270.0), no GC traced
- surf #0 at 44, -5, 119: 50 ms gap, 29.9 ms of work (lightsIn 911.0, lightsWalked 188.0), no GC traced
- tour #3 at 1137, 0, 137: 66.7 ms gap, 60.7 ms of work (lightsIn 2473.0, lightsWalked 274.0), no GC traced
- tour #4 at 1276, -104, -255: 83.4 ms gap, 84.7 ms of work (lightsIn 4180.0, lightsWalked 278.0), no GC traced
- tour #7 at 408, -126, -190: 83.4 ms gap, 96.5 ms of work (lightsIn 4797.0, lightsWalked 254.0), no GC traced
