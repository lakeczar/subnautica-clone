import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { LOCAL_SAVE_KEY, SaveRepository } from "../src/save/repository.js";
import {
  GameView,
  TestRenderer,
  browserFixture,
} from "./app-browser-support.js";
import { deferred, encoded, sample, settled } from "./persistence-support.js";
import { createWorldQueries } from "../src/sim/world.js";
import { craft, completeOpening, discover } from "../src/sim/progression.js";
import { addItem } from "../src/sim/inventory.js";
import { RECIPES, type ItemKind } from "../src/content/registry.js";
import { faceTarget } from "./targeting-support.js";
import { fixtureGame } from "../src/sim/carrier.js";
import type { SaveEnvelope } from "../src/save/codec.js";

register("./app-loader.js", import.meta.url);
const { SiltwakeApp } = await import("../src/runtime/app.js");

async function fixture(t: test.TestContext, initial: SaveEnvelope = sample(300)) {
  const browser = browserFixture();
  const seed = new SaveRepository(browser.storage, browser.lock);
  seed.load();
  assert.equal((await seed.commit(initial)).ok, true);
  const app = new SiltwakeApp({} as HTMLElement);
  const view = GameView.current,
    renderer = TestRenderer.current;
  t.after(() => {
    app.dispose();
    browser.restore();
  });
  view.actions.continueGame();
  browser.frames();
  assert.equal(view.screen, "playing");
  view.actions.pause();
  browser.frames();
  return { ...browser, app, view, renderer };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function replacement(f: Fixture, source: "new" | "import") {
  const gate = deferred();
  f.lock.gate = gate.promise;
  const before = f.storage.getItem(LOCAL_SAVE_KEY);
  if (source === "new") f.view.actions.newGame();
  else {
    const text = encoded(sample(900));
    f.view.actions.importFile({
      size: text.length,
      text: async () => text,
    } as File);
    await settled();
  }
  f.view.actions.confirm();
  assert.equal(f.view.screen, "menu");
  assert.equal(f.storage.getItem(LOCAL_SAVE_KEY), before);
  return { gate, tick: source === "new" ? 0 : 900 };
}
function assertPaused(f: Fixture, tick: number) {
  f.frames();
  assert.equal(
    f.view.screen,
    "menu",
    "entry must preserve the interruption pause",
  );
  assert.equal(f.view.state?.tick, tick);
  f.frames(120);
  assert.equal(
    f.view.state?.tick,
    tick,
    "no fixed updates without explicit Resume",
  );
}

for (const source of ["new", "import"] as const) {
  test(`app: delayed ${source} automatically enters without an interruption`, async (t) => {
    const f = await fixture(t),
      { gate, tick } = await replacement(f, source);
    gate.resolve();
    await settled();
    f.frames();
    assert.equal(f.view.screen, "playing");
    assert.ok(f.view.state!.tick > tick);
    const saved = new SaveRepository(f.storage, f.lock).load();
    assert.equal(saved.save?.state.tick, tick);
    assert.equal(saved.backup?.state.tick, 300);
  });

  for (const interruption of ["blur", "hidden", "graphics"] as const) {
    test(`app: delayed ${source} preserves ${interruption} even after recovery before completion`, async (t) => {
      const f = await fixture(t),
        { gate, tick } = await replacement(f, source);
      if (interruption === "blur") {
        f.window.dispatchEvent(new Event("blur"));
        f.window.dispatchEvent(new Event("focus"));
      }
      if (interruption === "hidden") {
        f.hidden(true);
        f.hidden(false);
      }
      if (interruption === "graphics") {
        f.renderer.lose();
        f.renderer.nativeRestore();
        f.renderer.finishRestore();
      }
      // A disabled/busy Resume action must not authorize a later restart.
      f.view.actions.resume();
      gate.resolve();
      await settled();
      assertPaused(f, tick);
      f.view.actions.resume();
      f.frames();
      assert.equal(f.view.screen, "playing");
      assert.ok(f.view.state!.tick > tick);
    });
  }

  test(`app: delayed ${source} finishes paused while graphics are unavailable; early Resume cannot queue`, async (t) => {
    const f = await fixture(t),
      { gate, tick } = await replacement(f, source);
    f.renderer.lose();
    gate.resolve();
    await settled();
    assertPaused(f, tick);
    f.view.actions.resume();
    f.renderer.nativeRestore();
    f.renderer.finishRestore();
    assertPaused(f, tick);
    f.view.actions.resume();
    f.frames();
    assert.equal(f.view.screen, "playing");
  });

  test(`app: delayed ${source} preserves a deliberate pause and refuses busy entry actions`, async (t) => {
    const f = await fixture(t),
      { gate, tick } = await replacement(f, source);
    f.view.actions.pause();
    f.view.actions.resume();
    f.view.actions.newGame();
    f.view.actions.continueGame();
    f.view.actions.importFile({ size: 1, text: async () => "{" } as File);
    gate.resolve();
    await settled();
    assertPaused(f, tick);
    f.view.actions.resume();
    f.frames();
    assert.equal(f.view.screen, "playing");
  });

  test(`app: delayed ${source} finishes in a hidden tab; visibility alone cannot resume it`, async (t) => {
    const f = await fixture(t),
      { gate, tick } = await replacement(f, source);
    f.hidden(true);
    gate.resolve();
    await settled();
    assertPaused(f, tick);
    f.view.actions.resume();
    f.hidden(false);
    assertPaused(f, tick);
    f.view.actions.resume();
    f.frames();
    assert.equal(f.view.screen, "playing");
  });

  for (const interrupted of [false, true]) {
    test(`app: ${source} unsaved fallback preserves entry intent (interrupted=${interrupted})`, async (t) => {
      const f = await fixture(t),
        { gate, tick } = await replacement(f, source);
      const old = structuredClone(f.view.state),
        before = f.storage.getItem(LOCAL_SAVE_KEY);
      f.storage.failWrite = true;
      if (interrupted) f.window.dispatchEvent(new Event("blur"));
      gate.resolve();
      await settled();
      assert.deepEqual(f.view.state, old);
      assert.equal(f.storage.getItem(LOCAL_SAVE_KEY), before);
      f.view.actions.confirm();
      if (interrupted) assertPaused(f, tick);
      else {
        f.frames();
        assert.equal(f.view.screen, "playing");
        assert.ok(f.view.state!.tick > tick);
      }
      assert.equal(f.storage.getItem(LOCAL_SAVE_KEY), before);
    });
  }

  for (const ending of ["Escape", "dispose"] as const) {
    test(`app: pending ${source} cannot re-enter after ${ending}`, async (t) => {
      const f = await fixture(t),
        before = f.storage.getItem(LOCAL_SAVE_KEY);
      const { gate } = await replacement(f, source),
        old = structuredClone(f.view.state);
      if (ending === "Escape") f.escape();
      else f.app.dispose();
      gate.resolve();
      await settled();
      f.frames(120);
      assert.equal(f.storage.getItem(LOCAL_SAVE_KEY), before);
      assert.deepEqual(f.view.state, old);
      assert.equal(f.view.screen, "menu");
      assert.equal(f.view.disposed, ending === "dispose");
    });
  }
}

test("app: native restored event cannot permit Resume or paused draws before engine readiness", async (t) => {
  const f = await fixture(t),
    tick = f.view.state!.tick;
  f.renderer.lose();
  const presents = f.renderer.presents;
  f.renderer.nativeRestore();
  f.view.actions.resume();
  f.frames(120);
  assert.equal(f.view.screen, "menu");
  assert.equal(f.view.state?.tick, tick);
  assert.equal(
    f.renderer.presents,
    presents,
    "no stale-resource rendering on the canvas event",
  );
  f.renderer.finishRestore();
  f.frames();
  assert.equal(
    f.renderer.presents,
    presents + 1,
    "engine readiness requests a paused redraw",
  );
  assertPaused(f, tick);
  f.view.actions.resume();
  f.frames();
  assert.equal(f.view.screen, "playing");
});

for (const source of ["new", "import"] as const) {
  test(`app: a fresh ${source} after a settled interruption can deliberately enter`, async (t) => {
    const f = await fixture(t);
    f.window.dispatchEvent(new Event("blur"));
    f.window.dispatchEvent(new Event("focus"));
    const { gate, tick } = await replacement(f, source);
    gate.resolve();
    await settled();
    f.frames();
    assert.equal(f.view.screen, "playing");
    assert.ok(f.view.state!.tick > tick);
  });
}

test("app: interruption during a slow import read survives validation, confirmation and write", async (t) => {
  const f = await fixture(t),
    read = deferred<string>();
  f.view.actions.importFile({ size: 100, text: () => read.promise } as File);
  f.window.dispatchEvent(new Event("blur"));
  f.window.dispatchEvent(new Event("focus"));
  read.resolve(encoded(sample(900)));
  await settled();
  f.view.actions.confirm();
  await settled();
  assertPaused(f, 900);
  f.view.actions.resume();
  f.frames();
  assert.equal(f.view.screen, "playing");
});

for (const ending of ["Escape", "dispose"] as const) {
  test(`app: slow import read cannot prompt or re-enter after ${ending}`, async (t) => {
    const f = await fixture(t),
      read = deferred<string>(),
      before = f.storage.getItem(LOCAL_SAVE_KEY);
    f.view.actions.importFile({ size: 100, text: () => read.promise } as File);
    const old = structuredClone(f.view.state);
    if (ending === "Escape") f.escape();
    else f.app.dispose();
    read.resolve(encoded(sample(900)));
    await settled();
    f.frames(120);
    assert.deepEqual(f.view.state, old);
    assert.equal(f.view.screen, "menu");
    assert.equal(f.storage.getItem(LOCAL_SAVE_KEY), before);
  });
}

test("app: internal preparation releasing mouse lock does not become an external interruption", async (t) => {
  const f = await fixture(t);
  f.document.pointerLockElement = f.view.canvas;
  f.document.dispatchEvent(new Event("pointerlockchange"));
  const { gate } = await replacement(f, "new");
  f.document.dispatchEvent(new Event("pointerlockchange"));
  gate.resolve();
  await settled();
  f.frames();
  assert.equal(f.view.screen, "playing");
});

test("app: late renderer readiness cannot resurrect a disposed app", async (t) => {
  const f = await fixture(t);
  f.renderer.lose();
  f.app.dispose();
  const notices = [...f.view.notices],
    presents = f.renderer.presents;
  f.renderer.nativeRestore();
  f.renderer.finishRestore();
  f.frames(120);
  assert.deepEqual(f.view.notices, notices);
  assert.equal(f.renderer.presents, presents);
  assert.equal(f.view.disposed, true);
  assert.equal(f.view.screen, "menu");
});

test("app: gameplay panels and transactional actions freeze all simulation drains; blur closes command authority until explicit Resume", async (t) => {
  const f = await fixture(t);
  f.view.actions.resume();
  f.frames();
  f.view.actions.command({ type: "skip-opening" });
  f.frames();
  f.view.actions.panel("notebook");
  const tick = f.view.state!.tick,
    vitals = structuredClone(f.view.state!.player.vitals);
  assert.equal(f.view.screen, "panel");
  f.frames(600);
  assert.equal(f.view.state!.tick, tick);
  assert.deepEqual(f.view.state!.player.vitals, vitals);
  f.view.actions.command({ type: "hint" });
  assert.equal(f.view.state!.knowledge.hintLevel, 1);
  assert.equal(f.view.state!.tick, tick);
  f.window.dispatchEvent(new Event("blur"));
  f.window.dispatchEvent(new Event("focus"));
  f.view.actions.command({ type: "hint" });
  assert.equal(f.view.state!.knowledge.hintLevel, 1);
  assertPaused(f, tick);
  f.view.actions.resume();
  f.frames();
  assert.equal(f.view.screen, "playing");
  assert.ok(f.view.state!.tick > tick);
});

test("app: gameplay menu cannot grant delayed New/import permission, and commands are refused while writes are queued", async (t) => {
  const f = await fixture(t),
    { gate } = await replacement(f, "new");
  f.view.actions.panel("inventory");
  f.view.actions.command({ type: "skip-opening" });
  f.window.dispatchEvent(new Event("blur"));
  gate.resolve();
  await settled();
  assertPaused(f, 0);
  assert.equal(f.view.state!.opening.phase, 0);
});

test("app: carrier menu command then immediate queued manual save is coherent and a blur cannot resume it", async (t) => {
  const initial = sample(0);
  initial.state = fixtureGame();
  const f = await fixture(t, initial);
  f.view.actions.resume();
  f.frames();
  f.view.actions.panel("carrier");
  const tick = f.view.state!.tick;
  f.view.actions.command({ type: "carrier", action: "helm" });
  assert.equal(f.view.state!.tick, tick);
  assert.equal(f.view.state!.player.mode, "piloting");
  const gate = deferred();
  f.lock.gate = gate.promise;
  const oldRecord = f.storage.getItem(LOCAL_SAVE_KEY);
  f.view.actions.save();
  f.window.dispatchEvent(new Event("blur"));
  f.view.actions.command({ type: "carrier", action: "station-keep" });
  f.view.actions.resume();
  assert.equal(f.storage.getItem(LOCAL_SAVE_KEY), oldRecord);
  gate.resolve();
  await settled();
  assertPaused(f, tick);
  const loaded = new SaveRepository(f.storage, f.lock).load();
  assert.ok(loaded.save);
  assert.equal(loaded.save.state.tick, tick);
  assert.equal(loaded.save.state.player.mode, "piloting");
  assert.equal(loaded.save.state.fleet.docking!.stationKeeping, false);
  assert.deepEqual(loaded.save.state.player.pose.position, loaded.save.state.fleet.vehicles[0]!.pose.position);
});

for (const failure of ["throw", "reject"] as const) {
  test(`app: ${failure} capture leaves active drag/keyboard fallback and never retries on focus`, async (t) => {
    const f = await fixture(t);
    let calls = 0;
    f.view.canvas.lock = () => { calls++; if (failure === "throw") throw Error("Denied"); return Promise.reject(Error("Denied")); };
    f.activation.isActive = true;
    f.view.actions.resume();
    await settled();
    assert.equal(calls, 1);
    assert.equal(f.view.screen, "playing");
    assert.equal(f.view.lookVisible && f.view.fallback, true);
    f.window.dispatchEvent(new Event("focus")); f.frames(60);
    assert.equal(calls, 1);
    assert.ok(f.view.state!.tick > 300);
  });
}

test("app: capture only follows deliberate return; panel toggle and Escape have distinct lock intent", async (t) => {
  const f = await fixture(t);
  assert.equal(f.view.canvas.captures, 0, "Continue without activation cannot capture");
  f.activation.isActive = true;
  f.view.actions.resume();
  assert.equal(f.view.canvas.captures, 1);
  f.locked(true);
  f.view.actions.command({ type: "skip-opening" });
  f.key("Tab");
  assert.equal(f.view.screen, "panel");
  f.locked(false);
  assert.equal(f.view.screen, "panel", "our asynchronous release does not double pause");
  f.key("Tab");
  assert.equal(f.view.screen, "playing");
  assert.equal(f.view.canvas.captures, 2);
  f.locked(true);
  f.key("KeyJ"); f.locked(false);
  f.escape();
  assert.equal(f.view.screen, "playing");
  assert.equal(f.view.canvas.captures, 2, "Escape closing a panel never captures");
  f.view.actions.lockMouse(); f.locked(true);
  f.locked(false); // Native Escape may precede its keydown.
  f.escape();
  assert.equal(f.view.screen, "menu", "native event before Escape cannot resume the game");
  const count = f.view.canvas.captures;
  f.view.actions.resume();
  assert.equal(f.view.canvas.captures, count, "cooldown never retries");
});

test("app: panel letter toggles work from focused buttons but preserve text entry", async (t) => {
  const f = await fixture(t);
  f.view.actions.resume();
  f.view.actions.command({ type: "skip-opening" });
  const keyFrom = (code: string, tagName: string, isContentEditable = false) => {
    const event = Object.assign(new Event("keydown", { cancelable: true }), { code });
    Object.defineProperty(event, "target", { value: { tagName, isContentEditable } });
    f.window.dispatchEvent(event);
    return event.defaultPrevented;
  };
  for (const code of ["KeyK", "KeyJ"]) {
    f.key(code);
    assert.equal(f.view.screen, "panel");
    for (const tagName of ["INPUT", "TEXTAREA", "SELECT"]) {
      assert.equal(keyFrom(code, tagName), false);
      assert.equal(f.view.screen, "panel");
    }
    assert.equal(keyFrom(code, "DIV", true), false);
    assert.equal(keyFrom(code, "BUTTON"), true);
    assert.equal(f.view.screen, "playing");
  }
});

for (const order of ["unlock-before-close", "close-before-unlock"] as const) {
  test(`app: intentional panel release tolerates ${order}`, async (t) => {
    const f = await fixture(t);
    f.activation.isActive = true; f.view.actions.resume(); f.locked(true);
    f.view.actions.command({ type: "skip-opening" });
    f.key("KeyK");
    if (order === "unlock-before-close") f.locked(false);
    f.key("KeyK");
    if (order === "close-before-unlock") f.locked(false);
    assert.equal(f.view.screen, "playing");
    f.frames(); assert.equal(f.view.screen, "playing");
  });
}

for (const interruption of ["blur", "graphics", "replacement", "dispose"] as const) {
  test(`app: stale successful capture after ${interruption} is released without resuming`, async (t) => {
    const f = await fixture(t), gate = deferred();
    let requests = 0;
    f.view.canvas.lock = () => { requests++; return gate.promise; };
    f.activation.isActive = true; f.view.actions.resume();
    assert.equal(requests, 1);
    if (interruption === "blur") f.window.dispatchEvent(new Event("blur"));
    if (interruption === "graphics") f.renderer.lose();
    if (interruption === "replacement") {
      f.view.actions.newGame(); f.view.actions.confirm(); await settled();
    }
    if (interruption === "dispose") f.app.dispose();
    const screen = f.view.screen;
    f.document.pointerLockElement = f.view.canvas;
    gate.resolve(); await settled();
    f.document.dispatchEvent(new Event("pointerlockchange"));
    assert.equal(f.document.pointerLockElement, null);
    assert.equal(f.view.screen, screen);
    assert.equal(requests, 1, "pending request cannot be reused for a replacement");
  });
}

for (const [json, expected] of [
  ["{}", ["rich", 1, false, "captured", 1]],
  ["[garbage", ["rich", 1, false, "captured", 1]],
  ['{"mouseMode":"drag","keyTurnSpeed":5,"sensitivity":0.1,"invertY":true}', ["rich", 0.4, true, "drag", 2]],
  ['{"mouseMode":"oops","keyTurnSpeed":"fast"}', ["rich", 1, false, "captured", 1]],
] as const) {
  test(`app: tolerant preferences ${json}`, (t) => {
    const b = browserFixture(); b.storage.setItem("siltwake.settings.v1", json);
    const app = new SiltwakeApp({} as HTMLElement);
    t.after(() => { app.dispose(); b.restore(); });
    assert.deepEqual(GameView.current.lastSettings, expected);
    assert.equal(GameView.current.canvas.captures, 0);
  });
}

test("app: canvas skip is a continuous 0.8-second hold; keyup, repeat, blur and pause cancel it", async (t) => {
  const f = await fixture(t);
  f.view.actions.resume(); f.view.canvas.focus();
  f.key("Space"); f.frames(20); f.key("Space", "keyup");
  assert.equal(f.view.state!.opening.phase, 0);
  f.key("Space", "keydown", true); f.frames(70);
  assert.equal(f.view.state!.opening.phase, 0, "repeat after cancellation is not a new hold");
  f.key("Space"); f.frames(20); f.window.dispatchEvent(new Event("blur"));
  f.view.actions.resume(); f.frames(70);
  assert.equal(f.view.state!.opening.phase, 0);
  f.key("Space"); f.frames(20); f.view.actions.pause();
  f.view.actions.resume(); f.frames(70);
  assert.equal(f.view.state!.opening.phase, 0);
  f.key("Space"); f.frames(49);
  assert.equal(f.view.state!.opening.phase, 4);
  assert.equal(f.view.progress.kind, null);
});

function pilotSave(depth = 4) {
  const envelope = sample(0), s = envelope.state, world = createWorldQueries();
  completeOpening(s);
  discover(s, "C03");
  for (const id of ["pod_repair", "essential_tools", "suit_150", "restore_workshop", "dart_base"] as const) {
    const r = RECIPES[id];
    if (r.site === "island_workshop") { s.player.pose.position = { x: 10, y: 1.2, z: -36 }; s.player.mode = "walking"; }
    for (const [kind, n] of Object.entries(r.cost)) addItem(s, kind as ItemKind, n, id === "restore_workshop" ? "diver" : r.site === "island_workshop" ? "workshop_locker" : "pod_locker");
    assert.equal(craft(s, id, world), null);
  }
  const v = s.fleet.vehicles[0]!;
  v.pose.position = { x: 55, y: -depth, z: 5 }; v.pose.yaw = Math.PI;
  v.velocity.z = 8;
  s.player.mode = "piloting"; s.player.controlledVehicleId = v.id;
  s.player.pose = structuredClone(v.pose); s.player.velocity = { ...v.velocity };
  return envelope;
}

for (const code of ["KeyE", "KeyX"]) {
  test(`app: ${code} tap, cancelled hold and one continuous hold issue a single semantic exit`, async (t) => {
    const f = await fixture(t, pilotSave()); f.view.actions.resume();
    f.key(code); f.frames(4); f.key(code, "keyup");
    assert.ok(f.view.state!.player.controlledVehicleId);
    f.view.actions.pause(); f.view.actions.resume(); f.frames(3);
    assert.ok(f.view.state!.player.controlledVehicleId, "cancelled gesture never executes later");
    f.key(code); f.frames(24);
    assert.equal(f.view.state!.player.controlledVehicleId, null);
    const feedback = f.view.notices.filter(n => n.startsWith("Clear exit.")).length;
    f.frames(40); assert.equal(f.view.notices.filter(n => n.startsWith("Clear exit.")).length, feedback);
  });
}

test("app: known aimed E opens its validated entry; Q cannot open notebook without scanner", async (t) => {
  const initial = sample(0); completeOpening(initial.state); faceTarget(initial.state, "C01");
  const f = await fixture(t, initial); f.view.actions.resume();
  f.key("KeyQ"); assert.equal(f.view.screen, "playing");
  f.key("KeyE"); assert.equal(f.view.screen, "panel");
  assert.equal(f.view.currentPanel, "notebook"); assert.equal(f.view.targetId, "C01");
});

test("app: moving hold preserves the simulation's deep exit refusal", async (t) => {
  const f = await fixture(t, pilotSave(170)); f.view.actions.resume();
  f.key("KeyX"); f.frames(24);
  assert.ok(f.view.state!.player.controlledVehicleId);
  assert.ok(f.view.notices.some(n => n.includes("Exit exposure")));
});
