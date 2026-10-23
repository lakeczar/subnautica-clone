# Fixed views: 3 need attention

3090 · NVIDIA GeForce RTX 3090 550.163.01 · 156.0.8078.4 · commit `67e8394d62bb` · views v1 · 76 s

7 captured: 4 unchanged, 3 changed, 0 without a baseline. Unsettled: 0; animating while frozen: 0.

## Attention

- **hub.crown_station.outside** · SSIM 0.722 below 0.97 (69.0% of pixels changed) → [strips/hub.crown_station.outside.jpg](strips/hub.crown_station.outside.jpg)
- **region.refuge_reef.1** · SSIM 0.911 below 0.97 (8.9% of pixels changed) → [strips/region.refuge_reef.1.jpg](strips/region.refuge_reef.1.jpg)
- **cave.reef_archlet.interior** · SSIM 0.951 below 0.97 (40.7% of pixels changed) → [strips/cave.reef_archlet.interior.jpg](strips/cave.reef_archlet.interior.jpg)

## Pending views (missing, with why)


## Every view

| View | Status | SSIM | Flags |
| --- | --- | --- | --- |
| place.home_pod | unchanged | 0.9999 |  |
| hub.crown_station.outside | changed | 0.7225 |  |
| threat.canopy_crown | identical | 1 |  |
| region.refuge_reef.1 | changed | 0.9112 |  |
| cave.reef_archlet.interior | changed | 0.9508 |  |
| cave.reef_fan_crawl.mouth | unchanged | 1 |  |
| cave.reef_fan_crawl.interior | identical | 1 |  |

One image of all views: `contact-sheet.jpg`. Accept a change deliberately: `node scripts/rec/views/accept.mjs <dir> --views <id,…> --by <who> --why <reason>`.
