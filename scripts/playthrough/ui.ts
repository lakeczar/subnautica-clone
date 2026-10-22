/** Panel buttons, as a player presses them: the real PanelView renders the state
 * and the harness presses an enabled button by label. A command the panels do not
 * offer (absent or disabled) blocks, with the panel's own reason. */
import { PanelProbe } from "../../src/ui/panelProbe.js";
import type { PanelKind } from "../../src/ui/panels.js";
import { Blocked, Driver, where } from "./driver.js";

const probes = new WeakMap<Driver, PanelProbe>();
export function pressButton(d: Driver, kind: PanelKind, label: RegExp): void {
  let probe = probes.get(d);
  if (!probe) { probe = new PanelProbe(d.world); probes.set(d, probe); }
  let command;
  try { command = probe.press(kind, d.state, label); } catch (e) { throw new Blocked(String((e as Error).message), where(d.state)); }
  d.command(command);
}
