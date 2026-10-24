// Imported first by a script whose other imports are expensive (the compiled
// .test-build modules): asks the local-run guard (scripts/local-guard.mjs, STEW-2)
// with the script's own command line before any of them load.
import { guardLocalRun } from "./local-guard.mjs";

guardLocalRun();
