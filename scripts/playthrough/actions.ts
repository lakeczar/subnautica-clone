/** Player actions built from real commands: reach and aim at a host, press E,
 * use panel buttons. Read-only queries (targeting, clearance) choose where to
 * stand; only `travel` and commands change the game. */
import { ITEMS, MATERIALS, SOURCES } from "../../src/content/registry.js";
import type { ItemKind, RecipeId, SourceId } from "../../src/content/registry.js";
import { interactions } from "../../src/sim/progression.js";
import { aimedInteraction, interactionHost, INTERACTION_REACH } from "../../src/sim/targeting.js";
import { eyeHeight } from "../../src/sim/state.js";
import type { GameEvent, GameState, Vec3 } from "../../src/sim/types.js";
import { Blocked, Driver, where } from "./driver.js";
import { dist, faceEye, horizontal, route, travel } from "./travel.js";
import { breathe, enter, HEADLAND_IN, nearHeadland, surfaceTo, toWater } from "./nav.js";
import type { Refuge } from "./nav.js";
import { personalLimit } from "../../src/sim/capabilities.js";
import type { Waypoint } from "./travel.js";

const SWIM = { radius: 0.34, height: 0.95 };
const WALK = { radius: 0.34, height: 1.75 };

export function target(d: Driver, id: string) {
  const t = interactions(d.state).find((t) => t.id === id);
  if (!t) throw new Blocked(`No interaction ${id} exists in this build/state`, where(d.state));
  return { t, host: interactionHost(d.state, t) };
}

/** Would a player standing at `body` and looking at the host centre select `id`? */
function aimsFrom(d: Driver, id: string, body: Vec3, mode: GameState["player"]["mode"], center: Vec3): boolean {
  // A read-only probe: the same state with only the player's pose replaced.
  const probe: GameState = { ...d.state, player: { ...d.state.player, pose: { ...d.state.player.pose, position: { ...body } }, mode } };
  const eye = { ...body, y: body.y + eyeHeight(probe) };
  const h = horizontal(eye, center);
  probe.player.pose.yaw = Math.atan2(center.x - eye.x, -(center.z - eye.z));
  probe.player.pose.pitch = Math.atan2(center.y - eye.y, h);
  if (Math.abs(probe.player.pose.pitch) > 1.33) return false;
  return aimedInteraction(probe, d.world)?.id === id;
}

/** Candidate places to stand for a host, nearest to the player first. */
export function workPoses(d: Driver, id: string): { body: Waypoint; land: boolean }[] {
  const { t, host } = target(d, id);
  const out: { body: Waypoint; land: boolean; cost: number }[] = [];
  const here = d.state.player.pose.position;
  for (const r of [1.4, 2.2, 3]) for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2, x = t.position.x + Math.cos(a) * r, z = t.position.z + Math.sin(a) * r;
    // Walkable ground (islands, pod floor, decks).
    const support = d.world.supportHeight(x, z, t.position.y + 2);
    // Dry footing: above the water, or the same floor the walking diver stands on (an air pocket).
    const floorY = d.state.player.mode === "walking" ? d.state.player.pose.position.y : NaN;
    if ((support >= -0.55 || Math.abs(support - floorY) < 0.6) && support > t.position.y - 3) {
      const body = { x, y: support, z };
      if (dist(body, t.position) < INTERACTION_REACH - 0.2 && d.world.clearance({ ...body, y: body.y + 0.02 }, WALK) &&
          aimsFrom(d, id, body, "walking", host.center))
        out.push({ body: { ...body, land: true, tolerance: 0.35 }, land: true, cost: dist(here, body) });
    }
    for (const dy of [1.2, 0.4, 2, -0.4]) {
      const body = { x, y: t.position.y + dy, z };
      if (body.y > -0.9 || d.world.groundHeight(x, z) > body.y - 0.1 || d.world.supportHeight(x, z, body.y) > body.y - 0.15) continue;
      if (dist(body, t.position) < INTERACTION_REACH - 0.2 && d.world.clearance(body, SWIM) &&
          aimsFrom(d, id, body, "swimming", host.center))
        out.push({ body: { ...body, tolerance: 0.3 }, land: false, cost: dist(here, body) });
    }
  }
  return out.sort((a, b) => a.cost - b.cost);
}

/** Seconds of suit air left. */
const airSeconds = (d: Driver): number => d.state.player.vitals.oxygen / (100 / 180);

/** Move to a place where `id` can be aimed at, by short local travel, then aim. */
export function reach(d: Driver, id: string): void {
  const { host } = target(d, id);
  if (d.state.player.mode !== "piloting") {
    faceEye(d, host.center);
    if (aimedInteraction(d.state, d.world)?.id === id) return;
  }
  const poses = workPoses(d, id);
  const mode = d.state.player.mode;
  const pick = poses.find((p) => p.land === (mode === "walking")) ?? poses[0];
  if (!pick) throw new Blocked(`No clear work pose can aim at ${id}`, where(d.state));
  const b = pick.body;
  if (pick.land) {
    if (mode !== "walking") {
      if (Math.hypot(b.x - 10, b.z + 35) < 12) enter(d, "workshop");
      else if (Math.hypot(b.x, b.z - 18) < 8) enter(d, "pod");
      else if (nearHeadland(b)) {
        surfaceTo(d, HEADLAND_IN[0]!);
        travel(d, route("headland landing in", "diver", "S2 headland landing, played", HEADLAND_IN));
      }
      else throw new Blocked(`${id} stands ashore with no authored landing`, where(d.state));
    }
    travel(d, route(`approach ${id}`, "diver", "local approach, played", [b]), `to ${id}`);
  } else {
    if (mode === "walking") toWater(d);
    const p = d.state.player.pose.position;
    const direct = dist(p, b) < 30 && d.world.lineOfSight({ ...p, y: p.y + 0.5 }, { ...b, y: b.y + 0.5 }) &&
      airSeconds(d) > dist(p, b) / 3 + -b.y / 3 + 25;
    if (direct) travel(d, route(`approach ${id}`, "diver", "local approach, played", [b]), `to ${id}`);
    else {
      surfaceTo(d, b);
      breathe(d);
      travel(d, route(`dive ${id}`, "diver", "vertical dive, played", [b]), `dive to ${id}`);
    }
  }
  faceEye(d, host.center);
  const aimed = aimedInteraction(d.state, d.world)?.id;
  if (aimed !== id) throw new Blocked(`Aimed at ${aimed ?? "nothing"} instead of ${id}`, where(d.state));
}

/** Press E on the host, aiming first. Returns the command outcome. */
export function interact(d: Driver, id: string, options: { allowRefusal?: boolean } = {}) {
  reach(d, id);
  return d.command({ type: "interact" }, options);
}

const panel = (events: readonly GameEvent[]) =>
  events.find((e): e is Extract<GameEvent, { type: "interaction-panel" }> => e.type === "interaction-panel");

/** Open a bench, locker or craft panel by pressing E on its host. */
export function openPanel(d: Driver, id: string): void {
  const { events } = interact(d, id);
  if (!panel(events)) throw new Blocked(`E on ${id} opened no panel`, where(d.state));
}

/** Collect from one source until `want` units are taken, the stock ends or the
 * holds are full. Returns the quantity collected. */
export function gather(d: Driver, id: SourceId, want = Infinity): number {
  const kind = SOURCES[id].item;
  let got = 0;
  reach(d, id);
  while (got < want) {
    const node = d.state.world.resources.find((n) => n.id === id)!;
    if (node.stock <= 0 || !roomFor(d, kind, Math.min(SOURCES[id].bundle, node.stock))) break;
    const before = node.stock;
    d.command({ type: "interact" });
    const after = d.state.world.resources.find((n) => n.id === id)!.stock;
    if (after >= before) {
      // Frames are lifted over 10 s: hold still until the lift settles.
      if (d.state.world.action) d.waitFor(`lift at ${id}`, 12, (s) => !s.world.action);
      const settled = d.state.world.resources.find((n) => n.id === id)!.stock;
      if (settled >= before) throw new Blocked(`Collecting ${id} took nothing: ${d.state.feedback}`, where(d.state));
      got += before - settled;
    } else got += before - after;
  }
  return got;
}

function roomFor(d: Driver, kind: ItemKind | "tagged_frame", n: number): boolean {
  const cu = ITEMS[kind].cu * (kind === "tagged_frame" ? 1 : n);
  return d.freeCu("diver") >= cu || (d.state.inventory.buoy.deployed && d.freeCu("buoy_hold") >= cu);
}

/** Move every material stack (and frames) from one container to another with panel transfers. */
export function unload(d: Driver, from: string, to: string, kinds?: readonly string[]): void {
  for (const i of [...d.state.inventory.items]) {
    if (i.containerId !== from || i.fitted) continue;
    const material = Object.hasOwn(MATERIALS, i.kind) || i.kind === "tagged_frame";
    if (kinds ? !kinds.includes(i.kind) : !material) continue;
    d.command({ type: "transfer", itemId: i.id, to, quantity: i.quantity });
  }
}

/** Move up to `n` of one kind between containers. */
export function move(d: Driver, kind: ItemKind, n: number, from: string, to: string): number {
  let left = n;
  for (const i of [...d.state.inventory.items]) {
    if (left <= 0) break;
    if (i.containerId !== from || i.kind !== kind || i.fitted) continue;
    const q = Math.min(left, i.quantity);
    d.command({ type: "transfer", itemId: i.id, to, quantity: q });
    left -= q;
  }
  return n - left;
}

export function craft(d: Driver, id: RecipeId): void {
  d.command({ type: "craft", recipeId: id });
}

/** Board a craft at its access handle. */
export function board(d: Driver, vehicleId: string): void {
  const { ok } = interact(d, vehicleId);
  if (!ok || d.state.player.controlledVehicleId !== vehicleId)
    throw new Blocked(`Could not board ${vehicleId}: ${d.state.feedback}`, where(d.state));
}

export function leaveCraft(d: Driver): void {
  d.command({ type: "exit" });
}

/** Eat from carried or local stores when food is low. */
export function eatIfHungry(d: Driver, below = 45): void {
  if (d.state.player.vitals.food < below) d.command({ type: "eat" }, { allowRefusal: true });
}

/** Hand-gather materials from sources in `regions` (nearest first, within the
 * personal suit), ferrying full holds back to `refuge` and stowing them in its
 * locker when it has one. Stops when every need is met or sources run out. */
export function procure(d: Driver, needs: Readonly<Partial<Record<ItemKind | "tagged_frame", number>>>, refuge: Refuge,
  regions: readonly string[], options: { stow?: boolean; skip?: readonly string[] } = {}): void {
  const want: Record<string, number> = { ...needs } as Record<string, number>;
  const locker = refuge === "pod" ? "pod_locker" : d.facility("island_workshop") ? "workshop_locker" : null;
  const stow = (): void => {
    enter(d, refuge);
    if (locker && options.stow !== false) unload(d, "diver", locker);
  };
  d.legOf(`procure ${Object.entries(want).map(([k, n]) => `${n} ${k}`).join(", ")}`, "work", () => {
    for (let guard = 0; guard < 60; guard++) {
      const open = Object.entries(want).filter(([, n]) => n > 0);
      if (!open.length) break;
      const p = d.state.player.pose.position, limit = personalLimit(d.state);
      const choices = (Object.keys(SOURCES) as SourceId[])
        .filter((id) => open.some(([k]) => SOURCES[id].item === k) && regions.includes(SOURCES[id].region) &&
          !(options.skip ?? []).includes(id) &&
          d.state.world.resources.find((n) => n.id === id)!.stock > 0 && -SOURCES[id].position.y - 0.4 <= limit - 2)
        .sort((a, b) => dist(p, SOURCES[a].position) - dist(p, SOURCES[b].position));
      const id = choices.find((c) => roomFor(d, SOURCES[c].item, Math.min(SOURCES[c].bundle,
        d.state.world.resources.find((n) => n.id === c)!.stock)));
      if (!id) {
        if (!choices.length) throw new Blocked(`No reachable source left for ${open.map(([k, n]) => `${n} ${k}`).join(", ")}`, where(d.state));
        stow();
        if (!locker || options.stow === false) throw new Blocked(`Diver hold full before ${open.map(([k]) => k).join(", ")} was met`, where(d.state));
        continue;
      }
      const kind = SOURCES[id].item;
      want[kind] = want[kind]! - gather(d, id, want[kind]!);
      eatIfHungry(d);
    }
    stow();
  });
}
