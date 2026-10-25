import test from "node:test";
import assert from "node:assert/strict";
import { CUES, CUE_IDS, cueDuration, type CueId } from "../src/audio/cues.js";
import { BODY_GROUP, duckLevels, requestFor, VOICE_LIMITS, VoiceAllocator } from "../src/audio/mixer.js";
import { rng } from "../src/audio/synth.js";

const req = (cue: CueId) => requestFor(cue, cueDuration(CUES[cue]));

test("adverse burst: 600 mixed requests in two seconds never exceed the voice limits", () => {
  const a = new VoiceAllocator(), r = rng(7);
  const essentialHeard = new Set<CueId>();
  for (let frame = 0; frame < 120; frame++) {
    const now = frame / 60;
    for (let i = 0; i < 5; i++) {
      const cue = CUE_IDS[Math.floor(r() * CUE_IDS.length)]!;
      const out = a.admit(req(cue), now);
      if (out.play && CUES[cue].essential) essentialHeard.add(cue);
      assert.ok(a.count() <= VOICE_LIMITS.total, `total ${a.count()} at ${now}`);
      for (const bus of Object.keys(VOICE_LIMITS.bus) as (keyof typeof VOICE_LIMITS.bus)[])
        assert.ok(a.count(bus) <= VOICE_LIMITS.bus[bus], `${bus} ${a.count(bus)}`);
      assert.ok(a.voices.filter(v => BODY_GROUP.has(v.cue as CueId)).length <= 1, "one body alarm at a time");
    }
  }
  assert.ok(a.stats.peak <= VOICE_LIMITS.total);
  assert.ok(a.stats.merged > 300, `cooldown coalesced ${a.stats.merged}`);
  assert.ok(essentialHeard.has("alert.threat-call"), "the hunter call still gets through the burst");
  assert.ok(essentialHeard.has("hit.damage"));
});

test("alarms clear and then mask action feedback; repeats merge within the cooldown", () => {
  const a = new VoiceAllocator();
  assert.ok(a.admit(req("action.collect"), 0).play);
  assert.ok(a.admit(req("action.scan"), 0).play);
  const alarm = a.admit(req("alert.oxygen"), 0.01);
  assert.ok(alarm.play && alarm.steal.length === 2, "an alarm stops quieter actions");
  assert.deepEqual(a.admit(req("action.craft"), 0.02), { play: false, reason: "masked" });
  assert.deepEqual(a.admit(req("alert.oxygen"), 0.5), { play: false, reason: "cooldown" });
  assert.ok(a.admit(req("alert.threat-call"), 0.5).play, "a real threat and a body alarm sound together");
  assert.deepEqual(a.admit(req("alert.power"), 0.5), { play: false, reason: "deferred" }, "a second body cause waits its turn");
  assert.ok(a.admit(req("alert.power"), 2).play, "and sounds once the first has ended");
});

test("the ending is never stolen by a lesser phrase; music is one voice", () => {
  const a = new VoiceAllocator();
  assert.ok(a.admit(req("music.ending"), 0).play);
  assert.deepEqual(a.admit(req("music.discovery"), 1), { play: false, reason: "full" });
  const b = new VoiceAllocator();
  assert.ok(b.admit(req("music.discovery"), 0).play);
  const end = b.admit(req("music.ending"), 1);
  assert.ok(end.play && end.steal.length === 1);
  assert.equal(b.count("music"), 1);
});

test("ducking: alarms and pursuit pull ambience and music down", () => {
  const scene = { active: true, threat: { mode: "idle" as const, interest: 0, pan: 0, distance: 100, dir: "ahead" as const } };
  assert.deepEqual(duckLevels([], scene), { ambience: 1, vehicle: 1, sfx: 1, alert: 1, music: 1 });
  const alarm = [{ id: 1, cue: "alert.oxygen" as const, bus: "alert" as const, priority: 3, start: 0, end: 1 }];
  const d = duckLevels(alarm, { ...scene, threat: { ...scene.threat, mode: "pursue" } });
  assert.equal(d.alert, 1);
  assert.ok(d.ambience <= 0.25 && d.music < 0.1);
});
