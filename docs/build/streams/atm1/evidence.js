// ATM-1 evidence pass, the body of one /run call to server.mjs (ordinary keys only).
// "__WHICH__" is replaced by the caller with the dist to shoot ("before" | "after").
const which = "__WHICH__", S = "/work/tmp/atm1/saves/", out = { which, shots: [], segments: [], notes: [] };
const shot = async (name) => { const r = await h.shot(`${which}-${name}`); out.shots.push({ name, ...r }); return r; };
/** Fly or swim straight ahead (W held) for `ms`, recording frame times. */
const segment = async (label, ms, keys = ["KeyW"]) => {
  await h.fps(); for (const k of keys) await h.key(k, true); await h.wait(ms); await h.releaseAll();
  const f = await h.fps(); out.segments.push({ label, ...f }); return f;
};
// The file input fires no change event for the same file twice (M2 audit): clear it first.
const imp = async (file) => { await h.page.locator("#import-file").setInputFiles([]); await h.importSave(file); };
const bearingTo = (from, to) => (Math.atan2(to[0] - from[0], -(to[2] - from[2])) * 180 / Math.PI + 360) % 360;
await h.open(which);

// 1. Reef, 10 m: from the pod deck, walk off the ramp and swim to 10 m over the reef.
await imp("/work/tmp/m2-audit/saves/creel-reef.json");
await h.turnTo(0, 0); await h.hold("KeyW", 4500); await h.wait(800); await h.hold("KeyC", 600); await h.wait(500); await h.calibrate();
out.notes.push({ reef: await h.goto({ x: -24, y: -10, z: -6 }, { tol: 1.5, timeout: 90 }) });
await h.turnTo(285, -12); await h.wait(1500);
await shot("reef-10m");
await segment("reef 10 m: swim west", 6000);

// 2. Basin, 240 m: the Basin hub, looking down the dish-field route.
await imp(S + "basin-240.json"); await h.turnTo(142, -12); await h.wait(1500);
await shot("basin-240m");
await segment("Basin 240 m: Creel cruise", 8000);

// 3. Rift head (253 m), as a diver: down the trench, lamp on then off.
await imp(S + "rift-head.json"); await h.tap("KeyX"); await h.wait(1500);
await h.turnTo(325, -30); await h.wait(1500);
await shot("rift-head-diver-down-trench");
await h.tap("KeyL"); await h.wait(900); await shot("rift-head-diver-lamp-off"); await h.tap("KeyL"); await h.wait(500);

// 4. Rift, 300 m: the cool flank mooring, toward the trench.
await imp(S + "rift-300.json"); await h.turnTo(285, -10); await h.wait(1500);
await shot("rift-300m");
await segment("Rift 300 m: Creel cruise", 8000);

// 5. Divide, 395 m: the audit's view, lamp on and off.
await imp(S + "divide-395.json"); await h.turnTo(22, -13); await h.wait(1500);
await shot("divide-395m-lamp-on");
await h.tap("KeyL"); await h.wait(900);
await shot("divide-395m-lamp-off");
await segment("Divide 395 m: Creel cruise, lamp off", 8000);
// Adverse: a diver at 395 m, lamp off, no local light: find the craft, and the way up.
await imp(S + "divide-395.json");
{
  const seat = (await h.read()).cam;
  await h.tap("KeyL"); await h.wait(500); await h.tap("KeyX"); await h.wait(1500);
  await h.hold("KeyS", 4000); await h.hold("Space", 600); await h.wait(500);
  const here = (await h.read()).cam;
  out.notes.push({ diverFromCraft: +Math.hypot(here[0] - seat[0], here[1] - seat[1], here[2] - seat[2]).toFixed(1) });
  await h.turnTo(bearingTo(here, seat), -8);
}
await h.wait(2600); await shot("divide-395m-diver-lamp-off-craft");
await h.wait(1100); await shot("divide-395m-diver-lamp-off-craft-b");
await h.turnTo((await h.read()).bearing, 75); await h.wait(1200);
await shot("divide-395m-diver-lamp-off-way-up");

// 6. Meridian, 590 m: toward the district.
await imp(S + "meridian-590.json"); await h.turnTo(45, -10); await h.wait(1500);
await shot("meridian-590m");
await segment("Meridian 590 m: Creel cruise", 8000);

// 7. Creel arm work: pitch down over the Basin ridge frame stack.
await imp(S + "creel-arm.json");
{ const s = await h.read(); await h.turnTo(s.bearing, -70); }
await h.wait(1500);
await shot("creel-arm-pitch");
out.errors = h.errors();
return out;
