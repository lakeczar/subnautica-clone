import test from "node:test";
import assert from "node:assert/strict";
import { levels, OCTAVES, spectrum } from "../src/audio/analysis.js";

const sine = (hz: number, amp: number, fs: number, seconds: number): Float32Array =>
  Float32Array.from({ length: Math.round(fs * seconds) }, (_, i) => amp * Math.sin(2 * Math.PI * hz * i / fs));

test("peak, RMS and spectrum of a half-scale 1 kHz sine", () => {
  const fs = 48000, x = sine(1000, 0.5, fs, 2), l = levels([x, x], fs), sp = spectrum([x, x], fs);
  assert.ok(Math.abs(l.peakDb + 6.02) < 0.05, `${l.peakDb}`);
  assert.ok(Math.abs(l.rmsDb + 9.03) < 0.05, `${l.rmsDb}`);
  assert.equal(l.clipped, 0);
  assert.ok(Math.abs(sp.peakHz - 1000) < 15, `${sp.peakHz}`);
  const k = OCTAVES.indexOf(1000);
  assert.ok(Math.abs(sp.bands[k]! + 6.02) < 0.3, `1 kHz band ${sp.bands[k]}`);
  assert.ok(sp.bands[0]! < -60, "no energy at 31.5 Hz");
});

test("BS.1770: a full-scale 997 Hz sine in one channel reads -3.01 LUFS", () => {
  const fs = 48000, x = sine(997, 1, fs, 3);
  const l = levels([x], fs);
  assert.ok(Math.abs(l.lufs + 3.01) < 0.1, `${l.lufs}`);
  assert.ok(Math.abs(l.momentaryMaxLufs + 3.01) < 0.1);
  assert.equal(levels([sine(997, 1, 44100, 3)], 44100).lufs.toFixed(0), "-3", "rate independent");
});

test("silence, DC and clipping are reported, not hidden", () => {
  const fs = 8000;
  assert.equal(levels([new Float32Array(fs)], fs).lufs, -Infinity);
  const dc = new Float32Array(fs).fill(0.1);
  assert.equal(levels([dc], fs).dc, 0.1);
  const hot = sine(200, 1.2, fs, 1).map(v => Math.max(-1, Math.min(1, v)));
  assert.ok(levels([hot], fs).clipped > 100);
});
