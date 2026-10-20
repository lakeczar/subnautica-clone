// Preloaded into every fast-tier test process (`--import`). Fails any import that
// resolves to Babylon, including computed dynamic imports and unmocked app code,
// so a mis-named heavy test cannot run without the heavy lock and memory budget.
import { register } from "node:module";

register("./fast-guard-hooks.mjs", import.meta.url);
