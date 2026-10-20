import test from "node:test";
import assert from "node:assert/strict";
import { SiltwakeAudio } from "../src/audio/director.js";
import { AudioEngine } from "../src/audio/engine.js";
import { CUE_IDS } from "../src/audio/cues.js";
import { VOICE_LIMITS } from "../src/audio/mixer.js";
import { sceneFromState } from "../src/audio/scene.js";
import type { Caption } from "../src/audio/captions.js";
import type { RegionId } from "../src/content/registry.js";
import { createGame, makeVehicle } from "../src/sim/state.js";
import { completeOpening } from "../src/sim/progression.js";
import { rng } from "../src/audio/synth.js";
import { FakeContext, asContext } from "./audio-fake-context.js";

function fixture(t: test.TestContext, region: () => RegionId = () => "refuge_reef") {
  const ctx = new FakeContext(), captions: Caption[] = [];
  let clock = 0;
  const audio = new SiltwakeAudio({
    createContext: () => asContext(ctx), regionAt: region, onCaption: c => captions.push(c), clock: () => clock,
  });
  t.after(() => audio.dispose());
  const advance = (seconds: number) => { ctx.currentTime += seconds; clock += seconds; };
  return { audio, ctx, captions, advance };
}
const ocean = () => { const s = createGame(); completeOpening(s); s.player.mode = "swimming"; s.player.pose.position = { x: -17, y: -12, z: -8 }; return s; };

test("one owned context: resumes once, mute and volume reach the master, muted events still caption", (t) => {
  const { audio, ctx, captions } = fixture(t);
  const s = ocean();
  audio.activate();
  audio.activate();
  assert.equal(ctx.resumed, 1, "a running context is not resumed again");
  audio.settings = { volume: 0.25, muted: false, subtitles: false };
  audio.update(s, true);
  const master = ctx.created.find(n => n.kind === "gain" && (n as unknown as { gain: { last: number } }).gain.last === 0.25);
  assert.ok(master, "volume is applied to the master gain");
  audio.settings.muted = true;
  audio.update(s, true);
  const before = ctx.created.length;
  audio.event({ type: "sound", cue: "warning", origin: { x: 20, y: -12, z: -8 } }, s);
  assert.equal(ctx.created.length, before, "muted events allocate no voices");
  assert.equal(captions.at(-1)?.text, "[Paired hunter calls, right]", "the visual equivalent survives mute");
  audio.settings = { volume: 0, muted: false, subtitles: true };
  audio.event({ type: "sound", cue: "damage" }, s);
  assert.equal(ctx.created.length, before, "zero volume allocates nothing either");
});

test("alarms preempt actions, repeats collapse, threat and body stay distinct, pause silences", (t) => {
  const { audio, ctx, advance } = fixture(t);
  const s = ocean();
  audio.activate();
  audio.update(s, true);
  const engineStats = () => audio.stats()!;
  audio.event({ type: "sound", cue: "collect" }, s);
  audio.event({ type: "sound", cue: "scan" }, s);
  assert.equal(engineStats().bus.sfx, 2);
  audio.event({ type: "sound", cue: "warning" }, s);
  assert.equal(engineStats().bus.sfx, 0, "the alarm stopped the quieter actions");
  assert.equal(engineStats().bus.alert, 1);
  const nodes = ctx.created.length;
  for (let i = 0; i < 20; i++) audio.event({ type: "sound", cue: "warning" }, s);
  assert.equal(ctx.created.length, nodes, "repeated body alarms do not stack");
  audio.event({ type: "sound", cue: "warning", origin: { x: 20, y: -12, z: -8 } }, s);
  assert.equal(engineStats().bus.alert, 2, "a real threat call sounds beside the body alarm");
  assert.ok(ctx.panners().at(-1)!.pan.value > 0);
  audio.event({ type: "sound", cue: "craft" }, s);
  assert.equal(engineStats().bus.sfx, 0, "an action cannot mask a sounding alarm");
  advance(0.05);
  audio.update(s, false);
  assert.equal(engineStats().voices, 0, "pause stops one-shot voices");
  audio.event({ type: "sound", cue: "craft" }, s);
  assert.equal(engineStats().bus.sfx, 1, "a deliberate paused-panel command still has feedback");
  const live = ctx.live;
  advance(3);
  audio.update(s, false);
  assert.ok(ctx.live < live, "finished and faded voice graphs are released");
});

test("adverse case: a 300-event burst stays inside the voice limits and leaks no nodes", (t) => {
  const { audio, ctx, advance } = fixture(t);
  const s = ocean();
  audio.activate();
  audio.update(s, true);
  advance(1);
  audio.update(s, true);
  const baseline = audio.stats()!.liveNodes;
  const r = rng(11), cues = ["collect", "craft", "warning", "damage", "impact", "scan", "recovery"] as const;
  let peak = 0;
  for (let frame = 0; frame < 60; frame++) {
    for (let i = 0; i < 5; i++) {
      const cue = cues[Math.floor(r() * cues.length)]!;
      audio.event(r() < 0.3 ? { type: "sound", cue: "warning", origin: { x: r() * 80 - 40, y: -12, z: r() * 80 - 40 } } : { type: "sound", cue }, s);
      audio.moment(r() < 0.1 ? "discovery" : "blueprint");
      const st = audio.stats()!;
      peak = Math.max(peak, st.voices);
      assert.ok(st.voices <= VOICE_LIMITS.total);
      for (const b of Object.keys(VOICE_LIMITS.bus) as (keyof typeof VOICE_LIMITS.bus)[]) assert.ok(st.bus[b] <= VOICE_LIMITS.bus[b], b);
    }
    advance(1 / 60);
    audio.update(s, true);
  }
  assert.ok(peak >= 3, `the burst really overlapped (${peak})`);
  advance(12);
  audio.update(s, true);
  advance(1);
  audio.update(s, true);
  const after = audio.stats()!;
  assert.equal(after.voices, after.bus.ambience, "only ambient grains may still sound");
  assert.ok(after.liveNodes <= baseline + 40, `nodes ${after.liveNodes} vs baseline ${baseline}`);
  assert.equal(after.liveNodes, ctx.live, "engine accounting matches the context");
});

test("region and hull changes crossfade and retire their old layers", (t) => {
  let region: RegionId = "refuge_reef";
  const { audio, ctx, advance } = fixture(t, () => region);
  const s = ocean();
  audio.activate();
  audio.update(s, true);
  advance(4);
  audio.update(s, true);
  const settled = audio.stats()!.liveNodes;
  const regions: RegionId[] = ["suspended_garden", "silt_basin", "thermal_rift", "brine_divide", "deep_district", "island_chain", "refuge_reef"];
  for (let lap = 0; lap < 3; lap++) for (const r of regions) {
    region = r;
    advance(0.1);
    audio.update(s, true);
    advance(0.8); // past the ambience hold
    audio.update(s, true);
    assert.equal(audio.stats()!.ambience, r);
    assert.ok(audio.stats()!.fadingSlots <= 2);
  }
  const v = makeVehicle("d", "dart", { x: -17, y: -12, z: -8 }, "h");
  s.fleet.vehicles.push(v);
  for (const hull of ["dart", "creel", "hush", "spindle", "mantle", "hearthline"] as const) {
    v.hull = hull;
    s.player.controlledVehicleId = v.id;
    s.player.mode = "piloting";
    advance(0.5);
    audio.update(s, true);
    assert.equal(audio.stats()!.hull, hull);
  }
  advance(4);
  audio.update(s, true);
  const end = audio.stats()!.liveNodes;
  assert.ok(end < settled + 60, `bounded after 27 changes: ${end} vs ${settled}`);
  assert.ok(ctx.created.length > end + 200, "old slots were actually disposed");
});

test("engine plays every catalog cue once without throwing", () => {
  const ctx = new FakeContext(), e = new AudioEngine(asContext(ctx));
  const s = ocean();
  e.update(sceneFromState(s, true, () => "refuge_reef"));
  for (const cue of CUE_IDS) {
    ctx.currentTime += 10;
    e.update(sceneFromState(s, true, () => "refuge_reef"));
    const a = e.play({ cue, intensity: 1, pan: 0.3, distance: 12, dir: "right" });
    assert.ok(a.play, `${cue}: ${a.play ? "" : a.reason}`);
  }
  e.dispose();
  e.dispose();
});
