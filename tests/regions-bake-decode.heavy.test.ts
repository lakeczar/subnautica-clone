import test from "node:test";
import { assertDecodedMatchesLive, SAMPLE } from "./regions-bake-support.js";

/** Baked terrain against the live recipe (the oracle) over the six sample
 * chunks (heavy tier, TT-1); tests/regions-bake.test.ts keeps a two-chunk smoke. */
test("decoded baked recipes equal the live recipe within the codec's quantization", () => {
  for (const c of SAMPLE) assertDecodedMatchesLive(c);
});
