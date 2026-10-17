import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { LOCAL_SAVE_KEY, SaveRepository } from '../src/save/repository.js';
import { GameView, TestRenderer, browserFixture } from './app-browser-support.js';
import { deferred, encoded, sample, settled } from './persistence-support.js';

register('./app-loader.js', import.meta.url);
const { SiltwakeApp } = await import('../src/runtime/app.js');

async function fixture(t: test.TestContext) {
  const browser = browserFixture();
  const seed = new SaveRepository(browser.storage, browser.lock);
  seed.load(); assert.equal((await seed.commit(sample(300))).ok, true);
  const app = new SiltwakeApp({} as HTMLElement);
  const view = GameView.current, renderer = TestRenderer.current;
  t.after(() => { app.dispose(); browser.restore(); });
  view.actions.continueGame(); browser.frames();
  assert.equal(view.screen, 'playing');
  view.actions.pause(); browser.frames();
  return { ...browser, app, view, renderer };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function replacement(f: Fixture, source: 'new' | 'import') {
  const gate = deferred(); f.lock.gate = gate.promise;
  const before = f.storage.getItem(LOCAL_SAVE_KEY);
  if (source === 'new') f.view.actions.newGame();
  else {
    const text = encoded(sample(900));
    f.view.actions.importFile({ size: text.length, text: async () => text } as File);
    await settled();
  }
  f.view.actions.confirm();
  assert.equal(f.view.screen, 'menu');
  assert.equal(f.storage.getItem(LOCAL_SAVE_KEY), before);
  return { gate, tick: source === 'new' ? 0 : 900 };
}
function assertPaused(f: Fixture, tick: number) {
  f.frames();
  assert.equal(f.view.screen, 'menu', 'entry must preserve the interruption pause');
  assert.equal(f.view.state?.tick, tick);
  f.frames(120);
  assert.equal(f.view.state?.tick, tick, 'no fixed updates without explicit Resume');
}

for (const source of ['new', 'import'] as const) {
  test(`app: delayed ${source} automatically enters without an interruption`, async t => {
    const f = await fixture(t), { gate, tick } = await replacement(f, source);
    gate.resolve(); await settled(); f.frames();
    assert.equal(f.view.screen, 'playing'); assert.ok(f.view.state!.tick > tick);
    const saved = new SaveRepository(f.storage, f.lock).load();
    assert.equal(saved.save?.state.tick, tick); assert.equal(saved.backup?.state.tick, 300);
  });

  for (const interruption of ['blur', 'hidden', 'graphics'] as const) {
    test(`app: delayed ${source} preserves ${interruption} even after recovery before completion`, async t => {
      const f = await fixture(t), { gate, tick } = await replacement(f, source);
      if (interruption === 'blur') { f.window.dispatchEvent(new Event('blur')); f.window.dispatchEvent(new Event('focus')); }
      if (interruption === 'hidden') { f.hidden(true); f.hidden(false); }
      if (interruption === 'graphics') { f.renderer.lose(); f.renderer.nativeRestore(); f.renderer.finishRestore(); }
      // A disabled/busy Resume action must not authorize a later restart.
      f.view.actions.resume();
      gate.resolve(); await settled();
      assertPaused(f, tick);
      f.view.actions.resume(); f.frames();
      assert.equal(f.view.screen, 'playing'); assert.ok(f.view.state!.tick > tick);
    });
  }

  test(`app: delayed ${source} finishes paused while graphics are unavailable; early Resume cannot queue`, async t => {
    const f = await fixture(t), { gate, tick } = await replacement(f, source);
    f.renderer.lose(); gate.resolve(); await settled(); assertPaused(f, tick);
    f.view.actions.resume(); f.renderer.nativeRestore(); f.renderer.finishRestore();
    assertPaused(f, tick);
    f.view.actions.resume(); f.frames(); assert.equal(f.view.screen, 'playing');
  });

  test(`app: delayed ${source} preserves a deliberate pause and refuses busy entry actions`, async t => {
    const f = await fixture(t), { gate, tick } = await replacement(f, source);
    f.view.actions.pause(); f.view.actions.resume();
    f.view.actions.newGame(); f.view.actions.continueGame();
    f.view.actions.importFile({ size: 1, text: async () => '{' } as File);
    gate.resolve(); await settled(); assertPaused(f, tick);
    f.view.actions.resume(); f.frames(); assert.equal(f.view.screen, 'playing');
  });

  test(`app: delayed ${source} finishes in a hidden tab; visibility alone cannot resume it`, async t => {
    const f = await fixture(t), { gate, tick } = await replacement(f, source);
    f.hidden(true); gate.resolve(); await settled(); assertPaused(f, tick);
    f.view.actions.resume(); f.hidden(false); assertPaused(f, tick);
    f.view.actions.resume(); f.frames(); assert.equal(f.view.screen, 'playing');
  });

  for (const interrupted of [false, true]) {
    test(`app: ${source} unsaved fallback preserves entry intent (interrupted=${interrupted})`, async t => {
      const f = await fixture(t), { gate, tick } = await replacement(f, source);
      const old = structuredClone(f.view.state), before = f.storage.getItem(LOCAL_SAVE_KEY);
      f.storage.failWrite = true;
      if (interrupted) f.window.dispatchEvent(new Event('blur'));
      gate.resolve(); await settled();
      assert.deepEqual(f.view.state, old); assert.equal(f.storage.getItem(LOCAL_SAVE_KEY), before);
      f.view.actions.confirm();
      if (interrupted) assertPaused(f, tick);
      else { f.frames(); assert.equal(f.view.screen, 'playing'); assert.ok(f.view.state!.tick > tick); }
      assert.equal(f.storage.getItem(LOCAL_SAVE_KEY), before);
    });
  }

  for (const ending of ['Escape', 'dispose'] as const) {
    test(`app: pending ${source} cannot re-enter after ${ending}`, async t => {
      const f = await fixture(t), before = f.storage.getItem(LOCAL_SAVE_KEY);
      const { gate } = await replacement(f, source), old = structuredClone(f.view.state);
      if (ending === 'Escape') f.escape(); else f.app.dispose();
      gate.resolve(); await settled(); f.frames(120);
      assert.equal(f.storage.getItem(LOCAL_SAVE_KEY), before);
      assert.deepEqual(f.view.state, old); assert.equal(f.view.screen, 'menu');
      assert.equal(f.view.disposed, ending === 'dispose');
    });
  }
}

test('app: native restored event cannot permit Resume or paused draws before engine readiness', async t => {
  const f = await fixture(t), tick = f.view.state!.tick;
  f.renderer.lose(); const presents = f.renderer.presents;
  f.renderer.nativeRestore(); f.view.actions.resume(); f.frames(120);
  assert.equal(f.view.screen, 'menu'); assert.equal(f.view.state?.tick, tick);
  assert.equal(f.renderer.presents, presents, 'no stale-resource rendering on the canvas event');
  f.renderer.finishRestore(); f.frames();
  assert.equal(f.renderer.presents, presents + 1, 'engine readiness requests a paused redraw');
  assertPaused(f, tick);
  f.view.actions.resume(); f.frames(); assert.equal(f.view.screen, 'playing');
});

for (const source of ['new', 'import'] as const) {
  test(`app: a fresh ${source} after a settled interruption can deliberately enter`, async t => {
    const f = await fixture(t);
    f.window.dispatchEvent(new Event('blur')); f.window.dispatchEvent(new Event('focus'));
    const { gate, tick } = await replacement(f, source); gate.resolve(); await settled(); f.frames();
    assert.equal(f.view.screen, 'playing'); assert.ok(f.view.state!.tick > tick);
  });
}

test('app: interruption during a slow import read survives validation, confirmation and write', async t => {
  const f = await fixture(t), read = deferred<string>();
  f.view.actions.importFile({ size: 100, text: () => read.promise } as File);
  f.window.dispatchEvent(new Event('blur')); f.window.dispatchEvent(new Event('focus'));
  read.resolve(encoded(sample(900))); await settled(); f.view.actions.confirm(); await settled();
  assertPaused(f, 900);
  f.view.actions.resume(); f.frames(); assert.equal(f.view.screen, 'playing');
});

for (const ending of ['Escape', 'dispose'] as const) {
  test(`app: slow import read cannot prompt or re-enter after ${ending}`, async t => {
    const f = await fixture(t), read = deferred<string>(), before = f.storage.getItem(LOCAL_SAVE_KEY);
    f.view.actions.importFile({ size: 100, text: () => read.promise } as File);
    const old = structuredClone(f.view.state);
    if (ending === 'Escape') f.escape(); else f.app.dispose();
    read.resolve(encoded(sample(900))); await settled(); f.frames(120);
    assert.deepEqual(f.view.state, old); assert.equal(f.view.screen, 'menu');
    assert.equal(f.storage.getItem(LOCAL_SAVE_KEY), before);
  });
}

test('app: internal preparation releasing mouse lock does not become an external interruption', async t => {
  const f = await fixture(t);
  f.document.pointerLockElement = f.view.canvas; f.document.dispatchEvent(new Event('pointerlockchange'));
  const { gate } = await replacement(f, 'new');
  f.document.dispatchEvent(new Event('pointerlockchange'));
  gate.resolve(); await settled(); f.frames(); assert.equal(f.view.screen, 'playing');
});

test('app: late renderer readiness cannot resurrect a disposed app', async t => {
  const f = await fixture(t);
  f.renderer.lose(); f.app.dispose();
  const notices = [...f.view.notices], presents = f.renderer.presents;
  f.renderer.nativeRestore(); f.renderer.finishRestore(); f.frames(120);
  assert.deepEqual(f.view.notices, notices); assert.equal(f.renderer.presents, presents);
  assert.equal(f.view.disposed, true); assert.equal(f.view.screen, 'menu');
});
