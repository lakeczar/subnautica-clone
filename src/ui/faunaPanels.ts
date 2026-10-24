/** CR-1: small UI hooks for creatures as resources. The Cargo panel gets one
 * compact "Catch" section (cook with portions, bait); the Base panel's socket
 * rows get the fish trap's status and Empty, and Feed on a young crop.
 * Derived from state only; every action is an ordinary command. */
import { FERTILISER, TRAP } from "../content/fauna/items.js";
import { GROUNDS, isFaunaSource } from "../content/fauna/grounds.js";
import { cookPlan, feedPlanterRefusal } from "../sim/fauna/catch.js";
import { emptyTrapPreview, trapViews } from "../sim/fauna/trap.js";
import type { GameState } from "../sim/types.js";
import type { CommandButton, PanelView, SectionKit } from "./panels.js";

const held = (s: GameState, kind: string): number =>
  s.inventory.items.filter((i) => i.kind === kind && !i.fitted).reduce((n, i) => n + i.quantity, 0);

export function catchSection(s: GameState, kit: SectionKit): string {
  const fish = held(s, "small_fish"), roe = held(s, "roe_cluster"), feed = held(s, "planter_feed"), net = held(s, "hand_net") > 0;
  if (!fish && !roe && !feed && !net) return "";
  const plan = cookPlan(s, 1), all = plan.maxPortions;
  const cook = plan.refusal && !all ? `<small>${kit.escape(plan.refusal)}</small>`
    : `${kit.button("Cook 1 portion", { type: "cook-catch", portions: 1 }, !!plan.refusal, plan.refusal ?? undefined, "Cook one portion")}${
      all > 1 ? kit.button(`Cook all · ${all}`, { type: "cook-catch", portions: all }, !!plan.refusal, plan.refusal ?? undefined, `Cook ${all} portions`) : ""}`;
  return `<article class="catch"><h3>Catch</h3><p>Small fish ${fish} · roe ${roe} · planter feed ${feed}${net ? " · hand net" : ""}</p>` +
    `<div class="service-actions">${cook}${kit.button("Release bait (M)", { type: "release-bait" }, fish === 0, fish ? undefined : "Catch a small fish first.")}</div>` +
    `<p><small>Two fish or one roe cluster per pair of portions at a cooker; meals keep. A released fish is bait threats feed on.</small></p></article>`;
}
export function registerFaunaPanels(panels: PanelView): void {
  panels.addSection("inventory", { id: "catch", after: "cargo", render: catchSection });
}

/** Extra actions on one Base-panel socket row: the trap's catch and Empty, or Feed on a young crop. */
export function faunaSocketActions(s: GameState, hostId: string, socket: string, module: string | null, button: CommandButton): string[] {
  if (module === "trap") {
    const t = trapViews(s, s.systems).find((v) => v.hostId === hostId && v.socket === socket);
    if (!t) return [];
    const p = emptyTrapPreview(s, s.systems, hostId, socket);
    const status = !t.wet ? "dry: catches nothing" : `${t.held}/${t.cap} fish${t.nextIn !== null ? ` · next in ${Math.ceil(t.nextIn / 60)} min` : t.held >= TRAP.cap ? " · full" : ""}${t.near ? "" : " · few fish pass here"}`;
    return [`<small>${status}</small>`, button("Empty", { type: "empty-trap", hostId, socket }, !!p.refusal, p.refusal ?? undefined, "Empty the fish trap")];
  }
  if (module === "planter") {
    const no = feedPlanterRefusal(s, s.systems, hostId, socket);
    // Offer Feed only while a young crop could take it; never nag about a ready or grown crop.
    if (no && !/^Carry/.test(no)) return [];
    return [button("Feed", { type: "feed-planter", hostId, socket }, !!no, no ?? `Grows the crop ${Math.round(FERTILISER.boost * 100)}% at once.`, "Feed the planter")];
  }
  return [];
}

/** HUD verb on a creature ground: Catch (Net with one carried), Take roe, or
 * a protected look. Null keeps the generic verb. */
export function faunaVerb(s: GameState | null, id: string, kind: string, verb: string): string | null {
  if (kind !== "source" || !isFaunaSource(id)) return null;
  const g = GROUNDS[id].kind;
  if (g === "protected") return "Look · protected";
  if (verb !== "collect") return null;
  if (g === "fish") return s && s.inventory.items.some((i) => i.kind === "hand_net" && i.containerId === "diver") ? "Net" : "Catch";
  return g === "roe" ? "Take roe" : null;
}
