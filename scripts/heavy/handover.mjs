#!/usr/bin/env node
// Before the queue's state is handed to code that may not know the exclusive
// boost (TST-16 R2-F2): a rollback to an older version, or an uninstall.
// install.sh runs it and stops if it fails. Older versions never reset
// state.boost, so this version finishes it first:
// - no exclusive job may be running (drain or cancel it first);
// - reconcile resets any boost whose owner is gone (holder dead, scope empty);
// - nothing may remain: no boost record, and the slice's weight reads back
//   as the default.
// Exit 0 when handed over; 3, with the reason, when not.
import { boostWeight, setBoost } from "./contention.mjs";
import { loadConfig, readState, reconcile, transaction } from "./state.mjs";

const cfg = loadConfig();
const refuse = (why) => { console.error(`heavy-check handover: ${why}`); process.exit(3); };
const exclusive = () => Object.entries(readState(cfg).tickets).filter(([, t]) => t.state === "running" && t.req?.exclusive).map(([id]) => id);

if (exclusive().length) refuse(`exclusive job ${exclusive().join(", ")} is running; let it finish or cancel it, then try again`);
transaction(cfg, (state) => ({ changed: reconcile(cfg, state) }));
const s = readState(cfg);
if (s.boost) {
  refuse(`the CPU boost on ${s.boost.slice} for ${s.boost.ticket} is still pending (${s.boost.state}): ` +
    (s.boost.failures ? "its reset has not been verified yet" : "its holder or a command it started is still running") + "; try again shortly");
}
if (cfg.boostSlice) {
  const w = boostWeight(cfg.boostSlice, { force: true });
  if (!w.known) refuse(`could not read ${cfg.boostSlice}'s CPU weight`);
  if (w.value !== null) {
    const r = setBoost(cfg.boostSlice, false);
    if (!r.verified) refuse(`could not reset ${cfg.boostSlice}'s CPU weight (${r.error})`);
  }
  if (exclusive().length) refuse("an exclusive job started meanwhile; try again when it ends");
}
console.log(`heavy-check handover: no exclusive job running, no boost pending${cfg.boostSlice ? `, ${cfg.boostSlice} at its default CPU weight` : ""}`);
