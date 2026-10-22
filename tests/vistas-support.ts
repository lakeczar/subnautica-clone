// Shared by tests/vistas.test.ts and its heavy tier file (TT-1); not a test file itself.
import assert from "node:assert/strict";
import { type CheckContext } from "../src/content/regions/access.js";
import { HAZARDS } from "../src/content/regions/hazards.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import { VISTA_SOLIDS } from "../src/content/vistas.js";

export const ctx: CheckContext = { floor: worldFloor, hazards: HAZARDS, solids: VISTA_SOLIDS };

export const none = (problems: readonly string[], what: string): void =>
  assert.equal(problems.length, 0, `${what}:\n- ${problems.slice(0, 12).join("\n- ")}`);
