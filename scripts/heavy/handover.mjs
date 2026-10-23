#!/usr/bin/env node
// Hands the queue's state over to code that may not know the exclusive CPU
// boost (TST-16): a rollback to an older version, or an uninstall. Older
// versions never reset state.boost, so this version finishes it first, under
// one protocol with ownership and admission (R3-F1):
//
//   handover.mjs --for WHAT [--wait S]   freeze, wait, certify; exit 0 frozen
//   handover.mjs --thaw                  lift the freeze (install.sh, after
//                                        installing an aware version)
//
// 1. Freeze, in a transaction: state.frozen. From then on no holder of this
//    version starts a boost: it decides in the same transaction as its journal
//    (holder.mjs), so already-running and queued supervisors of this version,
//    pinned to their install, still admit their jobs, unboosted, after the
//    switch. The mark stays through the switch; an older version ignores it.
// 2. Wait, up to S seconds (default SILTWAKE_HANDOVER_WAIT or 1800), until no
//    boost is owned: a running exclusive releases its own; a dead owner's is
//    reset by reconcile once its scope is empty (R2-F1).
// 3. Certify in one transaction: reconcile, no boost record, and the slice's
//    weight verified at its default (the backstop resets a stray one; under the
//    freeze, an unboosted exclusive doesn't protect it). Every reset happens in
//    reconcile, with its ownership checks, under state.lock.
// Exit 0 handed over (still frozen: install.sh then switches or removes
// `current`); 3, with the reason, if not: the freeze is lifted again.
import { alive, boostBackstop, ledger, loadConfig, readState, reconcile, self, transaction } from "./state.mjs";

const cfg = loadConfig();
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const me = self();
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

if (process.argv.includes("--thaw")) {
  const was = transaction(cfg, (state) => {
    if (!state.frozen) return { result: null };
    const f = state.frozen;
    delete state.frozen;
    ledger(cfg, { event: "handover-thaw", was: f });
    return { changed: true, result: f };
  });
  if (was) console.log(`heavy-check handover: boosting allowed again (the freeze for ${was.for} is lifted)`);
  process.exit(0);
}

const what = arg("--for") ?? "handover";
const waitS = Number(arg("--wait") ?? process.env.SILTWAKE_HANDOVER_WAIT ?? 1800);
transaction(cfg, (state) => {
  if (state.frozen && state.frozen.by && alive(state.frozen.by) && state.frozen.by.pid !== me.pid) throw new Error(`another handover (${state.frozen.for}) is in progress`);
  state.frozen = { for: what, at: Date.now(), by: me };
  ledger(cfg, { event: "handover-freeze", for: what });
  return { changed: true };
});
const unfreeze = (why) => {
  transaction(cfg, (state) => {
    if (state.frozen?.by?.pid !== me.pid) return {};
    delete state.frozen;
    ledger(cfg, { event: "handover-refused", for: what, why });
    return { changed: true };
  });
  console.error(`heavy-check handover: not handed over: ${why}`);
  process.exit(3);
};

const deadline = Date.now() + waitS * 1000;
let lastNote = 0;
for (;;) {
  const r = transaction(cfg, (state) => {
    let changed = reconcile(cfg, state);
    if (state.boost) return { changed, result: { done: false, why: `exclusive job ${state.boost.ticket} still holds the CPU boost on ${state.boost.slice} (${state.boost.state}${state.boost.failures ? `, its reset failed ${state.boost.failures}×` : ""})` } };
    const b = boostBackstop(cfg, state, { force: true });
    changed = changed || b.changed;
    return { changed, result: { done: b.clean, why: b.clean ? null : `${cfg.boostSlice}'s CPU weight could not be verified at its default` } };
  });
  if (r.done) break;
  if (Date.now() >= deadline) unfreeze(`${r.why}; waited ${waitS} s`);
  if (Date.now() - lastNote > 30000) { lastNote = Date.now(); console.error(`heavy-check handover: waiting: ${r.why}`); }
  sleep(1000);
}
const pending = Object.entries(readState(cfg).tickets).filter(([, t]) => t.req?.exclusive).map(([id]) => id);
console.log(`heavy-check handover: boosting frozen, no boost held${cfg.boostSlice ? `, ${cfg.boostSlice} at its default CPU weight` : ""}` +
  (pending.length ? `; exclusive jobs ${pending.join(", ")} will run unboosted` : ""));
