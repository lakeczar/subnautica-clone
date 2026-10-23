// CY currents, heavy tier (TT-1): the powerless-diver escape from a grid of starts in
// every lab current. tests/currents.test.ts keeps the rest and a fast smoke.
import test from "node:test";
import assert from "node:assert/strict";
import { ACTORS } from "../src/content/currents/actors.js";
import { LAB_VOLUMES } from "../src/content/currents/lab.js";
import { createSandbox, initialSandbox } from "../src/sim/currents/sandbox.js";
import type { SandboxInput, SandboxState } from "../src/sim/currents/sandbox.js";
import type { Vec3 } from "../src/sim/types.js";
import { run } from "./currents-support.js";

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const lab = createSandbox();

test("adverse: from anywhere inside every lab current a powerless diver reaches still water within 25 s", () => {
  const field = lab.field, diver = ACTORS.diver;
  const tries: { label: string; input: (s: SandboxState) => SandboxInput }[] = [
    { label: "rest", input: () => ({}) },
    { label: "up", input: () => ({ vertical: 1 }) },
    { label: "north", input: () => ({ forward: 1, yaw: Math.PI }) },
    { label: "south", input: () => ({ forward: 1, yaw: 0 }) },
    { label: "east", input: () => ({ forward: 1, yaw: Math.PI / 2 }) },
    { label: "west", input: () => ({ forward: 1, yaw: -Math.PI / 2 }) },
  ];
  let worst = 0, checked = 0;
  for (const vol of LAB_VOLUMES) {
    const b = vol.shape.kind === "box"
      ? { min: v(vol.shape.center.x - vol.shape.half.x, vol.shape.center.y - vol.shape.half.y, vol.shape.center.z - vol.shape.half.z),
        max: v(vol.shape.center.x + vol.shape.half.x, vol.shape.center.y + vol.shape.half.y, vol.shape.center.z + vol.shape.half.z) }
      : { min: v(Math.min(vol.shape.a.x, vol.shape.b.x), vol.shape.a.y - 5, Math.min(vol.shape.a.z, vol.shape.b.z)),
        max: v(Math.max(vol.shape.a.x, vol.shape.b.x), vol.shape.a.y + 5, Math.max(vol.shape.a.z, vol.shape.b.z)) };
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (const fy of [0.15, 0.8]) {
      const p = v(b.min.x + (b.max.x - b.min.x) * (i + 0.5) / 4, Math.min(-1, b.min.y + (b.max.y - b.min.y) * fy), b.min.z + (b.max.z - b.min.z) * (j + 0.5) / 4);
      if (field.peak(p).speed < 0.5 || !lab.world.clearance(p, diver.shape) || p.y < -39) continue;
      checked++;
      let best = Infinity;
      for (const t of tries) {
        const s = initialSandbox("diver", p); // tick 0: the spill is surging
        const { stoppedAt } = run(s, lab, 25, t.input, st => field.sample(st.position, st.tick).speed < 0.5);
        assert.equal(s.health, 100);
        if (stoppedAt !== null) best = Math.min(best, stoppedAt);
      }
      assert.ok(best <= 25, `${vol.id}: no escape from ${JSON.stringify(p)}`);
      worst = Math.max(worst, best);
    }
  }
  assert.ok(checked >= 40, `${checked} start points`);
  assert.ok(worst <= 25, `worst escape ${worst} s`);
});
