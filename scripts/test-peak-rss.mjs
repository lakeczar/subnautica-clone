// Preloaded into each heavy test process: reports its exact peak RSS (KiB) on exit.
import { writeFileSync } from "node:fs";

const file = process.env.SILTWAKE_PEAK_RSS_FILE;
if (file) process.on("exit", () => writeFileSync(file, String(process.resourceUsage().maxRSS)));
