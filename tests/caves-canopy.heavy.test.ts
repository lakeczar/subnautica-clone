// HEAVY TIER (by cost, no Babylon): the Lantern Canopy's small and medium
// caves, generated and swum in the composed world. Run through
// scripts/heavy-check.sh. Data checks are in tests/caves-canopy-basin.test.ts.
import { CANOPY_CAVES } from "../src/content/regions/caves/index.js";
import { registerCaveTests } from "./caves-canopy-basin-suite.js";

registerCaveTests(CANOPY_CAVES);
