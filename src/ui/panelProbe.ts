/** A headless panel driver: renders the real PanelView into string ports and
 * presses its buttons by label, exactly as a click does (the button's mapped
 * command). Used by tests and the playthrough so a command they issue is one a
 * player can reach: the button must exist and be enabled. No DOM, no Babylon. */
import { PanelView } from "./panels.js";
import type { PanelKind } from "./panels.js";
import type { GameCommand, GameState, WorldQueries } from "../sim/types.js";

class Port {
  private html = "";
  groups: { dataset: { panelGroup: string }; open: boolean }[] = [];
  textContent = "";
  hidden = false;
  scrollTop = 0;
  dataset: Record<string, string> = {};
  classList = { remove() {}, toggle() {}, add() {} };
  get innerHTML(): string { return this.html; }
  set innerHTML(value: string) {
    this.html = value;
    this.groups = [...value.matchAll(/<details\b([^>]*)>/g)].flatMap((m) => {
      const id = m[1]!.match(/data-panel-group="([^"]*)"/)?.[1];
      return id ? [{ dataset: { panelGroup: id }, open: /\bopen(?:\s|$)/.test(m[1]!) }] : [];
    });
  }
  contains(): boolean { return false; }
  setAttribute(): void {}
  focus(): void {}
  querySelector(): null { return null; }
  querySelectorAll(selector: string): unknown[] { return selector === "details[data-panel-group]" ? this.groups : []; }
}
export interface PanelButton { label: string; command: GameCommand; disabled: boolean; reason: string | null }
const unescape = (t: string): string => t.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'");

export class PanelProbe {
  private readonly ports = new Map<string, Port>();
  private readonly view: PanelView;
  constructor(world: WorldQueries) {
    const g = globalThis as Record<string, unknown>;
    if (!("document" in g)) g.document = { activeElement: null };
    if (!("window" in g)) g.window = { clearTimeout() {}, setTimeout: () => 0 };
    const get = (id: string): Port => { if (!this.ports.has(id)) this.ports.set(id, new Port()); return this.ports.get(id)!; };
    const root = { querySelector: (selector: string) => get(selector.slice(1)), querySelectorAll: () => [] };
    this.view = new PanelView(root as unknown as HTMLElement, world);
  }
  /** Render one panel for this state; returns its buttons. */
  buttons(kind: PanelKind, s: GameState): PanelButton[] {
    this.view.refresh(kind, s);
    const html = this.ports.get("panel-content")?.innerHTML ?? "";
    return [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].flatMap((m) => {
      const action = m[1]!.match(/data-action="([^"]*)"/)?.[1];
      const command = action ? this.view.command(action) : undefined;
      if (!command) return [];
      const id = m[1]!.match(/aria-describedby="([^"]*)"/)?.[1];
      const reason = id ? html.match(new RegExp(`id="${id}">([^<]*)<`))?.[1] ?? null : null;
      return [{ label: unescape(m[2]!.replace(/<[^>]+>/g, "").trim()), command, disabled: /\sdisabled(?:\s|=|$)/.test(m[1]!), reason: reason && unescape(reason) }];
    });
  }
  /** Press a journal tab, as its button does. */
  journalTab(id: Parameters<PanelView["showJournalTab"]>[0]): void { this.view.showJournalTab(id); }
  text(kind: PanelKind, s: GameState): string {
    this.view.refresh(kind, s);
    return unescape((this.ports.get("panel-content")?.innerHTML ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
  }
  /** The enabled button whose label matches; throws with what the panel shows otherwise. */
  press(kind: PanelKind, s: GameState, label: RegExp): GameCommand {
    const all = this.buttons(kind, s), b = all.find((x) => label.test(x.label));
    if (!b) throw new Error(`No ${label} button on ${kind}: ${all.map((x) => x.label).join(" | ")}`);
    if (b.disabled) throw new Error(`${b.label} on ${kind} is disabled: ${b.reason ?? "no reason shown"}`);
    return b.command;
  }
}
