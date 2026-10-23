import fs from "node:fs";
import path from "node:path";
const [inDir, outDir] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const B = process.cwd() + "/.test-build/";
const { Driver } = await import(B + "scripts/playthrough/driver.js");
const { loadSnapshot } = await import(B + "scripts/playthrough/persistence.js");
const { pilotTo, turnTo } = await import(B + "scripts/playthrough/routes.js");
const { yawTo } = await import(B + "scripts/playthrough/travel.js");
const { createEnvelope, encodeSave } = await import(B + "src/save/codec.js");
const { worldFloor } = await import(B + "src/content/regions/worldFloor.js");
await (await import(B + "scripts/playthrough/content.js")).loadCampaign();
const lift = (d, n = 90) => { for (let i = 0; i < n; i++) d.tick([{ type: "move", forward: 0, right: 0, vertical: 1, sprint: false }]); };
const save = (d, name, look) => {
  turnTo(d, yawTo(d.occupied().pose.position, look));
  const e = encodeSave(createEnvelope(d.state, { sessionId: "dish-evidence", createdAt: "2026-10-01T00:00:00.000Z", savedAt: "2026-10-01T01:00:00.000Z" }));
  if (!e.ok) throw new Error(e.error);
  fs.writeFileSync(path.join(outDir, `${name}.json`), e.value);
  console.log(name, JSON.stringify(d.occupied().pose.position));
};
for (const [name, cx, cz, ox, oz] of [["dish-north", 440, -526, 30, 42], ["dish-centre", 508, -572, -10, 62], ["dish-south", 578, -612, 40, 34]]) {
  const d = new Driver("dish", "creel", loadSnapshot(fs.readFileSync(path.join(inDir, "leg1-basin.json"), "utf8")));
  const to = { x: cx + ox, z: cz + oz }, y = Math.max(worldFloor(to.x, to.z) + 12, -250);
  lift(d); pilotTo(d, name, { x: to.x, y, z: to.z }, { quiet: true });
  save(d, `view-${name}`, { x: cx, y: worldFloor(cx, cz) + 6, z: cz });
}
