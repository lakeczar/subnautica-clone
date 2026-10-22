// C4 stage B: the save the 3090 keyboard check starts from, derived headless from
// the real rules (B1's Creel-first preparation, the workshop records read, a basic
// outpost kit, a decoder and a planter made at their benches; a staple cutting
// carried, one alloy for the pack). The diver floats at the surface above the west ledge, 45 m off the pod.
// usage: node derive-b.mjs <repo> <out.json>
import { writeFileSync } from "node:fs";
import path from "node:path";
const [repo, out] = process.argv.slice(2), B = path.join(repo, ".test-build/");
const { creelFirst, fund, at, meta } = await import(B + "tests/b1-support.js");
const { NORMAL_VIEWS, faceTarget } = await import(B + "tests/targeting-support.js");
const { executeCommand } = await import(B + "src/sim/step.js");
const { addItem } = await import(B + "src/sim/inventory.js");
const { gameWorld } = await import(B + "src/sim/world.js");
const { createEnvelope, encodeSave } = await import(B + "src/save/codec.js");
const world = gameWorld();
let s = creelFirst();
const read = (id) => { const v = NORMAL_VIEWS.find((x) => x.id === id); at(s, v.position, v.mode); faceTarget(s, id); s = executeCommand(s, { type: "interact" }, world).state; };
for (const id of ["workshop_outpost_sheet", "workshop_decoder_rack", "reef_staple_cuttings"]) read(id);
const stow = () => { for (const i of s.inventory.items.filter((i) => i.containerId === "diver" && !/^(outpost_kit_basic|mod_|seed_)/.test(i.kind))) i.containerId = "pod_locker"; };
for (const id of ["outpost_kit_basic", "mod_planter"]) { stow(); fund(s, id); }
stow();
// One alloy for the anchor seals when the outpost is packed again (staged like fund()'s costs).
addItem(s, "structural_alloy", 1, "diver");
at(s, { x: -44, y: -0.6, z: 8 }, "swimming");
s.player.pose.yaw = 0;
const e = encodeSave(createEnvelope(s, { ...meta, sessionId: "c4b-gpu-check" }));
if (!e.ok) throw new Error(e.error);
writeFileSync(out, e.value);
console.log("derived", out, s.inventory.items.filter((i) => i.containerId === "diver").map((i) => `${i.kind}×${i.quantity}`).join(", "));
