# Side by side: RTX 3090 (factory-worker) | RTX 4070 Laptop (alickers, shared desktop host; indicative)

| | RTX 3090 (factory-worker) | RTX 4070 Laptop (alickers, shared desktop host; indicative) |
| --- | --- | --- |
| verdict | partial | partial |
| GPU · browser | NVIDIA GeForce RTX 3090 550.163.01 · 156.0.8078.4 | NVIDIA GeForce RTX 4070 Laptop GPU 595.97 · 156.0.8078.47 |
| commit · build | 2bf9b14eee97 · index-Bu6IaKMK.js | 2bf9b14eee97 · index-Bu6IaKMK.js |
| minutes · frames | 5.3 · 18924 | 5.4 · 17254 |
| frame gap p50 / p99 / max (ms) | 16.7 / 16.7 / 133.3 | 16.7 / 50 / 133.3 |
| frames over 33 ms | 34 | 1692 |
| game work p50 / p99 (ms) | 4.5 / 11.2 | 2.8 / 7.4 |
| recorder mean / p99 (ms) | 0.106 / 1.55 | 0.044 / 0.16 |
| hold frames | 0 | 0 |
| tab MiB | 687.9 → 777.4 | 535.4 → 597.8 |
| heap MiB | 162.9 → 161.2 | 149.2 → 159.2 |
| VRAM MiB (this browser where listed, else whole GPU) | 170 → 1474 | 4048 → 4047 |
| draw calls p50 / max | 91 / 207 | 90 / 209 |
| errors · warnings | 0 · 0 | 0 · 0 |
| attention | damage 2, long-frame 13, memory 2, milestone 1 | long-frame 39, damage 2, milestone 1 |

## Where each run was when (driver marks, seconds from start)

| Mark | RTX 3090 (factory-worker) | RTX 4070 Laptop (alickers, shared desktop host; indicative) | Δ |
| --- | --- | --- | --- |
| travel starts (segment 0, 55 points) | 0 | 0 | 0.0 |
| at reef_fan_crawl | 94.3 | 94.2 | -0.1 |
| at reef_shelf_lip | 202.5 | 209.7 | 7.2 |
| at reef_drop_cathedral | 223.2 | 230.3 | 7.1 |
| at reef_gully_window | 231.7 | 238.8 | 7.1 |
| at reef_pumphouse_undercut | 262.7 | 269.7 | 7.0 |
| at reef_bellhole | 283.1 | 290 | 6.9 |
| at reef_archlet | 296.4 | 303.3 | 6.9 |
| at reef_wrackhollow | 314.8 | 321.3 | 6.5 |

## Checks

| Check | RTX 3090 (factory-worker) | RTX 4070 Laptop (alickers, shared desktop host; indicative) |
| --- | --- | --- |
| no streaming frame over 33 ms | unproven | unproven |
| no cave hold | pass | pass |
| no unsliced cave build | pass | pass |
| no errors | pass | pass |
| recording complete | pass | pass |
| video | pass | pass |
| frame times judged | unproven | unproven |
| memory flat | unproven | unproven |
| tab memory (RSS) | pass | pass |
| VRAM | pass | pass |

Images: `compare.png` (frame time and memory, both runs, same scales), `contact-sheets.jpg`. Each pack's own story.md lists its attention entries and strips.
