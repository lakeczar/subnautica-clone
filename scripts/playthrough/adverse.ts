/** Adverse phase: lose the Creel at a deep site and recover it with Bobbin.
 * A greedy player takes the unrefitted 240 m Creel to the Basin fracture frames
 * (about 258 m at the keel). The hull fails below its rating; the 350 m suit lets
 * the diver exit and ascend; Bobbin tows the hull from the shallow staging bench
 * along the surveyed Basin tether; a bound field patch and a reserve cell bring it home. */
import { HULL_COLLIDERS, SOURCES } from "../../src/content/registry.js";
import { RECOVERY_SURFACE_OPERATOR } from "../../src/content/routes.js";
import { armTarget } from "../../src/sim/fleet.js";
import { sweptHullClearance } from "../../src/sim/world.js";
import { board, interact, leaveCraft, reach } from "./actions.js";
import { Blocked, where } from "./driver.js";
import type { Phase } from "./live.js";
import { all, custom, hull } from "./outcomes.js";
import { boardAt } from "./live.js";
import { enter, surface, surfaceTo } from "./nav.js";
import { fly, pilotTo, turnTo } from "./routes.js";
import { yawTo } from "./travel.js";

export const creelLoss: Phase = {
  id: "creel-loss", title: "Adverse: the 240 m Creel lost in the Basin fracture, towed home by Bobbin",
  verify: all(hull("creel", 240), custom("no rescue recorded", (d) => d.state.metrics.rescues > 0)),
  missing: () => [],
  play(d) {
    const creel = () => d.vehicle("creel")!;
    if (creel().rating !== 240) throw new Blocked(`This adverse run needs the unrefitted Creel (rated ${creel().rating} m)`);
    reach(d, creel().id);
    boardAt(d, creel());
    fly(d, "creel_out");
    fly(d, "basin_outbound");
    // Over the fracture floor, beside its frame spill.
    const host = SOURCES.basin_frame_fracture.position;
    const park = [{ x: host.x + 5.5, y: host.y + 4.5, z: host.z }, { x: host.x - 5.5, y: host.y + 4.5, z: host.z }]
      .find((q) => sweptHullClearance(d.world, [{ ...q, y: q.y + 30 }, q], HULL_COLLIDERS.creel));
    if (!park) throw new Blocked("No open water beside the fracture frames");
    pilotTo(d, "down into the fracture", park);
    turnTo(d, yawTo(park, host));
    // Work the frames until the hull gives out below its rating.
    d.legOf("arm lifts below the hull rating", "work", () => {
      for (let i = 0; i < 90 * 60 && !creel().disabled; i++) {
        const t = armTarget(d.state);
        if (!d.state.world.action && t && !t.refusal) d.command({ type: "arm-lift" });
        d.tick();
      }
    });
    if (!creel().disabled) throw new Blocked(`The Creel held ${(-creel().pose.position.y).toFixed(0)} m for 90 s at rating ${creel().rating}`);
    d.run.checks.push({ name: "creel lost below rating", ok: true,
      detail: `disabled at ${(-creel().pose.position.y).toFixed(0)} m, tick ${d.state.tick}, ${d.count("tagged_frame", [creel().cargoId])} frames aboard` });
    // A protected exit, an ascent on suit air, then the surface to the staging bench.
    leaveCraft(d);
    surface(d);
    surfaceTo(d, RECOVERY_SURFACE_OPERATOR);
    d.legOf("Bobbin recovery from the staging bench", "work", () => {
      interact(d, "rescue_staging");
      const id = creel().id;
      d.command({ type: "recover", vehicleId: id, method: "tow" });
      d.waitFor("Bobbin at the collar", 240, (s) => s.recovery.operation?.phase === "ready", "recovery:bobbin");
      d.command({ type: "recover", vehicleId: id, method: "tow" });
      d.waitFor("the tow to the bench", 300, (s) => !s.recovery.operation, "recovery:tow");
      if (!d.state.feedback.startsWith("Creel moored")) throw new Blocked(`Tow ended: ${d.state.feedback}`, where(d.state));
    });
    d.run.checks.push({ name: "Bobbin tow home", ok: true, detail: `moored at the rescue bench, tick ${d.state.tick}` });
    // Patch at the collar, power from a reserve cell carried in the hold, then home.
    reach(d, creel().id);
    d.command({ type: "recover", vehicleId: creel().id, method: "repair" });
    if (creel().charge < 30) d.command({ type: "reserve", vehicleId: creel().id }, { allowRefusal: true });
    board(d, creel().id);
    fly(d, { id: "rescue_home", source: "harness: rescue mooring → medium slip, swept", points: [
      { x: 46, y: -5, z: -30 }, { x: 32, y: -3.4, z: -11 }, { x: 6, y: -3.4, z: -13 }, { x: -6, y: -3.2, z: -16 }, { x: -6, y: -3.2, z: -25 }] });
    leaveCraft(d);
    d.command({ type: "service", vehicleId: creel().id });
    enter(d, "workshop");
    if (creel().disabled || creel().health < 100)
      throw new Blocked(`The recovered Creel is not serviceable: health ${creel().health}`, where(d.state));
    d.run.checks.push({ name: "recovered Creel serviced", ok: true, detail: `health ${creel().health}, charge ${creel().charge.toFixed(0)}` });
  },
};
