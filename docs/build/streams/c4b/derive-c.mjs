// C4 stage B R1: the save for the outpost-charging and idle check, derived headless
// from the real rules: Creel-first, the workshop outpost sheet read, a basic kit
// made and deployed on the west ledge, the Creel moored 4 m above it at 50%. The
// diver floats beside the Creel. usage: node derive-c.mjs <repo> <out.json>
import { writeFileSync } from "node:fs";
import path from "node:path";
const [repo, out] = process.argv.slice(2), B = path.join(repo, ".test-build/");
const { creelFirst, creelOf, fund, at, meta, parkCreel } = await import(B + "tests/b1-support.js");
const { NORMAL_VIEWS, faceTarget } = await import(B + "tests/targeting-support.js");
const { executeCommand } = await import(B + "src/sim/step.js");
const { gameWorld } = await import(B + "src/sim/world.js");
const { createEnvelope, encodeSave } = await import(B + "src/save/codec.js");
const world = gameWorld(), LEDGE = { x: -44, y: -8.09, z: 8 };
let s = creelFirst();
const v = NORMAL_VIEWS.find((x) => x.id === "workshop_outpost_sheet");
at(s, v.position, v.mode); faceTarget(s, v.id); s = executeCommand(s, { type: "interact" }, world).state;
for (const i of s.inventory.items.filter((i) => i.containerId === "diver")) i.containerId = "pod_locker";
fund(s, "outpost_kit_basic");
const kit = s.inventory.items.find((i) => i.kind === "outpost_kit_basic").id;
at(s, { ...LEDGE, y: LEDGE.y + 0.8 }, "swimming");
const r = executeCommand(s, { type: "deploy-outpost", itemId: kit }, world);
if (r.events.some((e) => e.type === "notice" && e.error)) throw new Error("deploy refused");
s = r.state;
parkCreel(s, { x: LEDGE.x, y: -4.5, z: LEDGE.z + 4 }, 0);
creelOf(s).charge = 50;
at(s, { x: LEDGE.x, y: -5.5, z: LEDGE.z + 0.5 }, "swimming");
s.player.pose.yaw = Math.PI;
const e = encodeSave(createEnvelope(s, { ...meta, sessionId: "c4b-r1-gpu-check" }));
if (!e.ok) throw new Error(e.error);
writeFileSync(out, e.value);
console.log("derived", out);
