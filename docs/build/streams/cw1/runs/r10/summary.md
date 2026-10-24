| Run | Commit | Caves reached | Minutes | Frames | p50 / p95 / p99 / max ms | Gaps > 33 ms | Streaming > 34 ms (GC-shaped) | Over 34 ms: host / host-stopped (GPU unknown) / mixed / clean (streaming ours) | Holds | Unsliced in travel (at load) | Dark cave frames | Gate |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| deep #0 | 3779f59c | 2/2 | 5.1 | 18470 | 16.7 / 16.7 / 16.8 / 100 | 4 | 0 (0) | – | 0 | 0 (0) | 0 | pass |
| deep #1 | 3779f59c | 8/8 | 11.9 | 42835 | 16.7 / 16.7 / 16.8 / 100 | 8 | 0 (0) | – | 0 | 0 (0) | 0 | pass |
| deep #2 | 3779f59c | 7/7 | 12.5 | 45132 | 16.7 / 16.7 / 16.8 / 116.6 | 12 | 1 (0) | – | 0 | 0 (0) | 0 | **fail** |
| hops #0 | 3779f59c | 1/1 | 7.1 | 25566 | 16.7 / 16.7 / 16.8 / 100.1 | 16 | 0 (0) | – | 0 | 0 (0) | 0 | pass |
| hops #1 | 3779f59c | 1/1 | 7.3 | 26239 | 16.7 / 16.7 / 16.8 / 116.6 | 7 | 0 (0) | – | 0 | 0 (0) | 0 | pass |
| hops #2 | 3779f59c | 1/1 | 7.1 | 25774 | 16.7 / 16.7 / 16.8 / 100 | 9 | 1 (0) | – | 0 | 0 (0) | 0 | **fail** |
| hops #3 | 3779f59c | 1/1 | 7.8 | 28297 | 16.7 / 16.7 / 16.8 / 100.1 | 18 | 0 (0) | – | 0 | 0 (0) | 0 | pass |
| rerun #4 | 3779f59c | 4/4 | 16.2 | 58384 | 16.7 / 16.7 / 16.8 / 100.1 | 24 | 0 (0) | – | 0 | 0 (0) | 0 | pass |
| rerun #7 | 3779f59c | 3/4 | 18.8 | 67692 | 16.7 / 16.7 / 16.8 / 116.7 | 33 | 2 (0) | – | 0 | 0 (0) | 0 | **fail** |
| surf #0 | 3779f59c | 0/1 | 7.7 | 27935 | 16.7 / 16.7 / 16.8 / 116.6 | 17 | 1 (0) | – | 0 | 0 (0) | 0 | **fail** |
| tour #0 | 3779f59c | 6/6 | 6.3 | 22739 | 16.7 / 16.7 / 16.8 / 100.1 | 19 | 1 (0) | – | 0 | 0 (0) | 0 | **fail** |
| tour #1 | 3779f59c | 12/12 | 10.3 | 37167 | 16.7 / 16.7 / 16.8 / 116.7 | 16 | 0 (0) | – | 0 | 0 (0) | 0 | pass |
| tour #2 | 3779f59c | 9/9 | 12.1 | 43723 | 16.7 / 16.7 / 16.8 / 116.8 | 22 | 0 (0) | – | 0 | 0 (0) | 0 | pass |
| tour #3 | 3779f59c | 5/5 | 17.3 | 62352 | 16.7 / 16.7 / 16.8 / 100 | 22 | 3 (0) | – | 0 | 0 (0) | 0 | **fail** |
| tour #4 | 3779f59c | 4/4 | 14.1 | 50683 | 16.7 / 16.7 / 16.8 / 116.7 | 23 | 1 (0) | – | 0 | 0 (0) | 0 | **fail** |
| tour #5 | 3779f59c | 13/13 | 13.3 | 48147 | 16.7 / 16.7 / 16.8 / 100 | 16 | 1 (0) | – | 0 | 0 (0) | 0 | **fail** |
| tour #6 | 3779f59c | 9/9 | 11.6 | 41679 | 16.7 / 16.7 / 16.8 / 116.7 | 15 | 0 (0) | – | 0 | 0 (0) | 0 | pass |
| tour #7 | 3779f59c | 4/4 | 15.3 | 55229 | 16.7 / 16.7 / 16.8 / 150 | 42 | 3 (0) | – | 0 | 0 (0) | 0 | **fail** |

| Part | Worst p99 ms | Max ms | Run with the max |
|---|---|---|---|
| chunks | 4.7 | 90.3 | hops #2 |
| regions | 0.3 | 13.6 | hops #1 |
| caves | 0.2 | 79.5 | tour #0 |
| caveWanted | 0.1 | 6.1 | tour #7 |
| caveBuild | 0.1 | 6.4 | tour #7 |
| caveEvict | 0.1 | 2.1 | tour #4 |
| caveLightList | 0.1 | 2.4 | tour #4 |
| caveTexture | 0.1 | 5.1 | tour #7 |
| caveUpload | 0 | 0.5 | rerun #7 |
| caveView | 0.1 | 79.4 | tour #0 |
| lights | 0.7 | 74.3 | tour #7 |
| optics | 0.2 | 74.2 | tour #7 |
| lightScan | 0.1 | 1.7 | tour #0 |
| lightPlace | 0.2 | 66.9 | deep #2 |
| lightSelect | 0.5 | 73 | tour #5 |
| render | 2.4 | 114 | tour #7 |
| sim | 1.8 | 116.1 | tour #4 |

deep #0 power: no calls; end 37% with 2 cells, home covered

deep #1 power: Use reserve cell for hull power (battery 19%, done); /^(Service|Charge at)/ (call at divide_dock, done); end 50% with 1 cells, home covered

deep #2 power: Use reserve cell for hull power (battery 19%, done); /^(Service|Charge at)/ (call at mooring:meridian.staging_shelf, done); end 41% with 1 cells, home covered

hops #0 power: /^(Service|Charge at)/ (call at meridian_office, done); end 91% with 2 cells, home covered

hops #1 power: /^(Service|Charge at)/ (call at meridian_office, done); end 88% with 2 cells, home covered

hops #2 power: /^(Service|Charge at)/ (call at meridian_office, done); end 92% with 2 cells, home covered

hops #3 power: /^(Service|Charge at)/ (call at meridian_office, done); end 82% with 2 cells, home covered

rerun #4 power: no calls; end 48% with 2 cells, home covered

rerun #7 power: no calls; end 41% with 2 cells, home covered

surf #0 power: no calls; end 76% with 2 cells, home covered

tour #0 power: no calls; end 80% with 2 cells, home covered

tour #1 power: no calls; end 72% with 2 cells, home covered

tour #2 power: no calls; end 64% with 2 cells, home covered

tour #3 power: no calls; end 47% with 2 cells, home covered

tour #4 power: no calls; end 56% with 2 cells, home covered

tour #5 power: no calls; end 60% with 2 cells, home covered

tour #6 power: no calls; end 65% with 2 cells, home covered

tour #7 power: no calls; end 52% with 2 cells, home covered

Stalls (187): rerun #4 cruise#4 at -50,-7,-46 (60.5 m short, O₂ 100% Dart air HEALTH 100 FOOD 58 F · eat meal DART 99% power Hull 98% · 7 / 350 m); rerun #4 cruise#5 at -99,-7,-98 (22.7 m short, O₂ 100% Dart air HEALTH 100 FOOD 58 F · eat meal DART 98% power Hull 97% · 8 / 350 m); rerun #4 cruise#22 at 522,-2,45 (47.7 m short, O₂ 100% Dart air HEALTH 100 FOOD 51 F · eat meal DART 87% power Hull 96% · 3 / 350 m); rerun #4 cruise#22 at 525,-1,48 (44.1 m short, O₂ 100% Dart air HEALTH 100 FOOD 51 F · eat meal DART 86% power Hull 95% · 2 / 350 m); rerun #4 cruise#22 at 525,-1,49 (43.5 m short, O₂ 100% Dart air HEALTH 100 FOOD 50 F · eat meal DART 86% power Hull 94% · 2 / 350 m); rerun #4 cruise#23 at 525,-1,49 (56.9 m short, O₂ 100% Dart air HEALTH 100 FOOD 50 F · eat meal DART 85% power Hull 93% · 2 / 350 m); rerun #4 cruise#23 at 525,-1,49 (56.9 m short, O₂ 100% Dart air HEALTH 100 FOOD 50 F · eat meal DART 85% power Hull 92% · 2 / 350 m); rerun #4 cruise#23 at 525,-1,49 (56.9 m short, O₂ 100% Dart air HEALTH 100 FOOD 49 F · eat meal DART 84% power Hull 91% · 2 / 350 m); rerun #4 cruise#24 at 525,-1,49 (61.5 m short, O₂ 100% Dart air HEALTH 100 FOOD 49 F · eat meal DART 83% power Hull 90% · 2 / 350 m); rerun #4 cruise#24 at 525,-1,49 (61.5 m short, O₂ 100% Dart air HEALTH 100 FOOD 49 F · eat meal DART 83% power Hull 89% · 2 / 350 m); rerun #4 cruise#24 at 525,-1,49 (61.4 m short, O₂ 100% Dart air HEALTH 100 FOOD 48 F · eat meal DART 82% power Hull 88% · 2 / 350 m); rerun #4 cruise#55 at 1145,-3,124 (9.8 m short, O₂ 100% Dart air HEALTH 100 FOOD 38 F · eat meal DART 65% power Hull 86% · 4 / 350 m)

| Run | Title ms | Playable ms | Collision pack ms | CPU MiB | GPU MiB | Regions MiB | Heap MiB | Boxes | Built / evicted | Light uploads |
|---|---|---|---|---|---|---|---|---|---|---|
| deep #0 | 5162 | 25566 | 4297 | 67.3 | 50.8 | 12.7 | 280.5 | 125410 | 19 / 9 | 8 |
| deep #1 | 5295 | 24364 | 4331 | 55.4 | 42.7 | 12.7 | 289.8 | 84976 | 28 / 18 | 19 |
| deep #2 | 5196 | 24549 | 4298 | 40.5 | 36.4 | 12.7 | 256.6 | 52886 | 26 / 19 | 19 |
| hops #0 | 5183 | 25079 | 4311 | 38.9 | 31.6 | 12.7 | 245.7 | 57722 | 25 / 17 | 8 |
| hops #1 | 5383 | 25769 | 4410 | 36.2 | 29.7 | 12.7 | 240.3 | 52886 | 25 / 18 | 8 |
| hops #2 | 5234 | 24713 | 4359 | 40.4 | 29.8 | 12.7 | 251.1 | 64978 | 25 / 16 | 7 |
| hops #3 | 5235 | 24472 | 4323 | 39.5 | 31.8 | 12.7 | 241.6 | 59167 | 25 / 17 | 9 |
| rerun #4 | 5366 | 26309 | 4351 | 47.6 | 43 | 12.7 | 276.1 | 62210 | 32 / 27 | 47 |
| rerun #7 | 5013 | 25533 | 4166 | 47.8 | 41.5 | 12.7 | 300.9 | 70141 | 52 / 44 | 38 |
| surf #0 | 5191 | 25792 | 4204 | 44 | 34.7 | 12.7 | 236.9 | 62904 | 14 / 7 | 4 |
| tour #0 | 5201 | 25734 | 4346 | 66.7 | 45.1 | 12.7 | 267.9 | 93322 | 16 / 10 | 48 |
| tour #1 | 5149 | 25982 | 4313 | 77.3 | 58.1 | 12.7 | 300.1 | 136354 | 26 / 14 | 49 |
| tour #2 | 5177 | 25588 | 4217 | 55.2 | 38.3 | 12.7 | 285.2 | 98616 | 38 / 29 | 48 |
| tour #3 | 5220 | 26886 | 4350 | 49.2 | 36.9 | 12.7 | 285.5 | 80627 | 30 / 24 | 36 |
| tour #4 | 4996 | 27129 | 4153 | 47.6 | 43 | 12.7 | 262.1 | 62210 | 32 / 27 | 46 |
| tour #5 | 5198 | 27066 | 4348 | 58.7 | 40.4 | 12.7 | 299.6 | 113878 | 39 / 29 | 34 |
| tour #6 | 5161 | 25882 | 4292 | 41.3 | 32 | 12.7 | 266.1 | 70031 | 43 / 35 | 31 |
| tour #7 | 5026 | 25771 | 4173 | 47.8 | 41.5 | 12.7 | 302.2 | 70141 | 52 / 44 | 39 |

Not reached: isles_surf_cave (79.7 m short, rerun #7); isles_surf_cave (100.1 m short, surf #0).

Streaming-attributed frames over 34 ms (the part that ran long; gc = the heap shrank across the gap):

- deep #2 at 1036, -437, -1225: 100 ms gap, 71.3 ms of work (lightsIn 2798.0, lightsWalked 259.0), no GC traced
- hops #2 at 1071, -52, -803: 100 ms gap, 93.3 ms of work (lightsWalked 233.0, chunks 90.3), no GC traced
- rerun #7 at 342, -144, -179: 66.7 ms gap, 60.6 ms of work (lightsIn 4610.0, lightsWalked 255.0), no GC traced
- rerun #7 at 327, -134, -147: 66.7 ms gap, 55 ms of work (lightsIn 4267.0, lightsWalked 252.0), no GC traced
- surf #0 at 474, -3, 54: 100 ms gap, 57 ms of work (lightsIn 3414.0, lightsWalked 241.0), no GC traced
- tour #0 at -349, -8, -132: 83.4 ms gap, 83.3 ms of work (lightsIn 638.0, lightsWalked 230.0), no GC traced
- tour #3 at 340, -44, 92: 50 ms gap, 36 ms of work (lightsIn 2174.0, lightsWalked 238.0), no GC traced
- tour #3 at 1233, -72, -116: 99.9 ms gap, 75 ms of work (lightsIn 3761.0, lightsWalked 276.0), no GC traced
- tour #3 at 1191, -96, -142: 100 ms gap, 28.9 ms of work (lightsIn 5173.0, lightsWalked 280.0), no GC traced
- tour #4 at -113, -6, -113: 49.9 ms gap, 41.9 ms of work (lightsIn 886.0, lightsWalked 201.0), no GC traced
- tour #5 at 580, -339, -1284: 66.6 ms gap, 78.3 ms of work (lightsIn 6550.0, lightsWalked 283.0), no GC traced
- tour #7 at -105, -5, -105: 133.4 ms gap, 77.9 ms of work (lightsIn 900.0, lightsWalked 201.0), no GC traced
- tour #7 at -179, -94, -251: 83.3 ms gap, 57.2 ms of work (lightsIn 701.0, lightsWalked 202.0), no GC traced
- tour #7 at 347, -80, -61: 99.9 ms gap, 31.7 ms of work (lightsIn 4380.0, lightsWalked 253.0), no GC traced
