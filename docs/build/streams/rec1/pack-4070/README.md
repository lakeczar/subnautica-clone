# Evidence pack (REC-1)

**Verdict: partial.** Unproven: no streaming frame over 33 ms, frame times judged, memory flat.

## Reading order for agents (text first, images only where flagged)
1. `summary.json` (under 1 KB): the verdict, key numbers and the machine.
2. `story.md`: the checks, the **attention list** (each entry names its strip), the pacing table and the event timeline.
3. Open **only the strips you need** from `strips/`: **a budget of about 6–10 strips per review**. Start with failures, holds, errors and streaming long frames; the `R*` strips are random unflagged moments.
4. Charts (`charts/frame-time.png`, `charts/memory.png`, `charts/pacing.png`) and `contact-sheet.jpg` only if the question needs them.
5. More frames around any moment: `node scripts/rec/strip.mjs <pack> --event A07` or `--at 312.4 [--before 2 --after 2] [--fps 12]`, `--from 300 --to 360 --fps 1` for a minute of travel.

## For people
`timeline.html`: the video, frame-time chart, memory curve and event markers, synchronised (open it beside `recording/video.webm`).

## Files
- `recording/`: the raw recording (header, frames, samples, events, snapshots, system memory, video), the same format from either machine and from an owner playtest export.
- `analysis.json`: everything the story is built from.
- Side by side with another pack: `node scripts/rec/compare.mjs <this> <other> <out>`.
