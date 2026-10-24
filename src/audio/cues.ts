/** S6 cue catalog. Pure data: no WebAudio, no state. Every sound is an original
 * recipe of oscillators and deterministic noise rendered by `synth.ts`. */

export type Bus = "ambience" | "vehicle" | "sfx" | "alert" | "music";

/** One oscillator partial. Times in seconds from the cue start; gain is linear
 * before the cue's `level`. Envelope: linear attack, optional hold, then an
 * exponential decay that reaches silence at `dur`. */
export interface TonePart {
  kind: "tone";
  wave: OscillatorType;
  freq: number;
  /** Exponential glide target reached at `glide` seconds (default `dur`). */
  to?: number;
  glide?: number;
  at: number;
  dur: number;
  attack: number;
  hold?: number;
  gain: number;
  detune?: number;
  /** Frequency modulation for bells and creature calls; index in carrier Hz multiples. */
  fm?: { ratio: number; index: number; indexTo?: number };
  /** Lowpass on this partial, for soft saw/square timbres. */
  lowpass?: number;
}
export interface NoisePart {
  kind: "noise";
  color: "white" | "pink" | "brown";
  filter: BiquadFilterType;
  freq: number;
  to?: number;
  q: number;
  at: number;
  dur: number;
  attack: number;
  hold?: number;
  gain: number;
}
export type Part = TonePart | NoisePart;

/** A musical phrase: notes are scheduled as soft FM bells over an optional pad. */
export interface Phrase {
  kind: "phrase";
  /** Seconds per beat. */
  beat: number;
  notes: readonly { at: number; midi: number; beats: number; gain: number }[];
  pad?: readonly { at: number; midi: readonly number[]; beats: number; gain: number }[];
}

export type CueId =
  | "action.collect" | "action.craft" | "action.scan" | "action.panel" | "action.refused"
  | "refuge.enter" | "opening.pod" | "recovery.wake"
  | "alert.oxygen" | "alert.food" | "alert.pressure" | "alert.power" | "alert.hull-stress"
  | "alert.body" | "alert.threat-call" | "alert.boundary"
  | "hit.impact" | "hit.damage" | "hull.failure"
  | "transition.submerge" | "transition.surface" | "transition.board"
  | "transition.disembark" | "transition.interior"
  | "carrier.clamp" | "carrier.lock" | "carrier.helm" | "carrier.hold" | "threat.disengage"
  | "music.discovery" | "music.blueprint" | "music.arrival" | "music.homecoming" | "music.ending";

export interface CueSpec {
  bus: Bus;
  /** 1 action feedback · 2 transitions and music · 3 warnings · 4 contact and
   * creature calls · 5 critical outcomes · 6 the ending. Higher steals lower. */
  priority: number;
  /** Voice trim in dB at full volume, calibrated in tools/audio-lab.html so the
   * measured loudness lands in its class target (docs/build/streams/S6.md). */
  level: number;
  /** Minimum seconds between starts of the same cue key; later requests merge. */
  cooldown: number;
  /** Concurrent instances of this cue. */
  maxInstances: number;
  /** Positional cues pan to their event origin; others stay centred. */
  spatial: boolean;
  /** Visual equivalent text. `{dir}` is replaced by left/right/ahead/behind. */
  caption: string | null;
  /** Essential warnings must reach the player with sound off or masked. */
  essential: boolean;
  /** Reverb send, 0..1. */
  wet: number;
  sound: readonly Part[] | Phrase;
}

const t = (p: Omit<TonePart, "kind">): TonePart => ({ kind: "tone", ...p });
const n = (p: Omit<NoisePart, "kind">): NoisePart => ({ kind: "noise", ...p });

/** D dorian with a raised fourth on arrival: the restrained Siltwake identity.
 * Motif: rising fifth, a step down, a falling third — open, unresolved. */
const D4 = 62, A4 = 69, G4 = 67, E4 = 64, F4 = 65, C5 = 72, D5 = 74, B3 = 59, A3 = 57;

export const CUES: Readonly<Record<CueId, CueSpec>> = {
  "action.collect": {
    bus: "sfx", priority: 1, level: -12, cooldown: 0.08, maxInstances: 2, spatial: false,
    caption: null, essential: false, wet: 0.15,
    sound: [
      t({ wave: "sine", freq: 880, to: 660, glide: 0.09, at: 0, dur: 0.22, attack: 0.004, gain: 0.7 }),
      t({ wave: "sine", freq: 1320, at: 0.05, dur: 0.16, attack: 0.004, gain: 0.25 }),
      n({ color: "white", filter: "bandpass", freq: 2400, to: 900, q: 6, at: 0, dur: 0.08, attack: 0.002, gain: 0.25 }),
    ],
  },
  "action.craft": {
    bus: "sfx", priority: 1, level: -15, cooldown: 0.3, maxInstances: 1, spatial: false,
    caption: null, essential: false, wet: 0.2,
    sound: [
      n({ color: "pink", filter: "bandpass", freq: 600, to: 1800, q: 3, at: 0, dur: 0.45, attack: 0.05, gain: 0.35 }),
      t({ wave: "triangle", freq: 330, at: 0.05, dur: 0.18, attack: 0.005, gain: 0.5 }),
      t({ wave: "triangle", freq: 440, at: 0.17, dur: 0.18, attack: 0.005, gain: 0.5 }),
      t({ wave: "sine", freq: 495, at: 0.29, dur: 0.5, attack: 0.005, gain: 0.6, fm: { ratio: 2, index: 0.6, indexTo: 0.05 } }),
    ],
  },
  "action.scan": {
    bus: "sfx", priority: 1, level: -19, cooldown: 0.25, maxInstances: 1, spatial: false,
    caption: null, essential: false, wet: 0.5,
    sound: [
      t({ wave: "sine", freq: 620, to: 1450, glide: 0.32, at: 0, dur: 0.7, attack: 0.01, hold: 0.25, gain: 0.6, fm: { ratio: 3.01, index: 0.4, indexTo: 0 } }),
      t({ wave: "sine", freq: 1450, at: 0.42, dur: 0.6, attack: 0.01, gain: 0.18 }),
    ],
  },
  "action.panel": {
    bus: "sfx", priority: 1, level: 0, cooldown: 0.1, maxInstances: 1, spatial: false,
    caption: null, essential: false, wet: 0,
    sound: [n({ color: "white", filter: "bandpass", freq: 2200, q: 4, at: 0, dur: 0.035, attack: 0.001, gain: 1 })],
  },
  "action.refused": {
    bus: "sfx", priority: 1, level: -12, cooldown: 0.4, maxInstances: 1, spatial: false,
    caption: null, essential: false, wet: 0.05,
    sound: [
      t({ wave: "triangle", freq: 196, at: 0, dur: 0.12, attack: 0.004, gain: 0.7, lowpass: 900 }),
      t({ wave: "triangle", freq: 165, at: 0.13, dur: 0.16, attack: 0.004, gain: 0.7, lowpass: 900 }),
    ],
  },
  "refuge.enter": {
    bus: "sfx", priority: 2, level: -19, cooldown: 4, maxInstances: 1, spatial: false,
    caption: null, essential: false, wet: 0.35,
    sound: [
      t({ wave: "sine", freq: 293.7, at: 0, dur: 1.4, attack: 0.01, gain: 0.5, fm: { ratio: 2, index: 0.5, indexTo: 0 } }),
      t({ wave: "sine", freq: 440, at: 0.16, dur: 1.6, attack: 0.01, gain: 0.45, fm: { ratio: 2, index: 0.4, indexTo: 0 } }),
    ],
  },
  "opening.pod": {
    bus: "sfx", priority: 2, level: -19, cooldown: 1, maxInstances: 1, spatial: false,
    caption: "[Pod systems hum awake]", essential: false, wet: 0.25,
    sound: [
      t({ wave: "sine", freq: 55, to: 110, glide: 1.1, at: 0, dur: 1.6, attack: 0.3, hold: 0.6, gain: 0.7 }),
      t({ wave: "triangle", freq: 110, to: 220, glide: 1.1, at: 0.1, dur: 1.5, attack: 0.4, hold: 0.5, gain: 0.2, lowpass: 700 }),
      n({ color: "pink", filter: "highpass", freq: 3000, q: 0.7, at: 0.2, dur: 1, attack: 0.3, gain: 0.08 }),
    ],
  },
  "recovery.wake": {
    bus: "alert", priority: 5, level: -13, cooldown: 3, maxInstances: 1, spatial: false,
    caption: "[Recovery tone · returning to refuge]", essential: true, wet: 0.5,
    sound: [
      n({ color: "brown", filter: "lowpass", freq: 300, to: 90, q: 0.7, at: 0, dur: 1.8, attack: 0.4, gain: 0.6 }),
      t({ wave: "sine", freq: 196, at: 0.5, dur: 1.6, attack: 0.02, gain: 0.5, fm: { ratio: 2, index: 0.5, indexTo: 0 } }),
      t({ wave: "sine", freq: 293.7, at: 0.75, dur: 1.8, attack: 0.02, gain: 0.45, fm: { ratio: 2, index: 0.4, indexTo: 0 } }),
    ],
  },
  "alert.oxygen": {
    bus: "alert", priority: 3, level: -9, cooldown: 1.2, maxInstances: 1, spatial: false,
    caption: "[Low-air tone]", essential: true, wet: 0.05,
    sound: [
      t({ wave: "triangle", freq: 440, to: 523, glide: 0.12, at: 0, dur: 0.24, attack: 0.008, hold: 0.08, gain: 0.6, lowpass: 2400 }),
      t({ wave: "triangle", freq: 440, to: 523, glide: 0.12, at: 0.32, dur: 0.24, attack: 0.008, hold: 0.08, gain: 0.6, lowpass: 2400 }),
      n({ color: "pink", filter: "bandpass", freq: 1400, q: 1.2, at: 0, dur: 0.6, attack: 0.08, gain: 0.12 }),
    ],
  },
  "alert.food": {
    bus: "alert", priority: 3, level: -8, cooldown: 1.2, maxInstances: 1, spatial: false,
    caption: "[Food reserve tone]", essential: true, wet: 0.1,
    sound: [
      t({ wave: "sine", freq: 293.7, at: 0, dur: 0.35, attack: 0.01, gain: 0.6 }),
      t({ wave: "sine", freq: 246.9, at: 0.3, dur: 0.5, attack: 0.01, gain: 0.6 }),
    ],
  },
  "alert.pressure": {
    bus: "alert", priority: 3, level: -5, cooldown: 1.2, maxInstances: 1, spatial: false,
    caption: "[Suit pressure tone · beyond rated depth]", essential: true, wet: 0.1,
    sound: [
      t({ wave: "square", freq: 98, at: 0, dur: 0.2, attack: 0.01, gain: 0.5, lowpass: 600 }),
      t({ wave: "square", freq: 98, at: 0.26, dur: 0.2, attack: 0.01, gain: 0.5, lowpass: 600 }),
      t({ wave: "square", freq: 98, at: 0.52, dur: 0.3, attack: 0.01, gain: 0.5, lowpass: 600 }),
      n({ color: "white", filter: "bandpass", freq: 420, to: 260, q: 14, at: 0.1, dur: 0.7, attack: 0.1, gain: 0.5 }),
    ],
  },
  "alert.power": {
    bus: "alert", priority: 3, level: -3, cooldown: 1.2, maxInstances: 1, spatial: false,
    caption: "[Low-power chime]", essential: true, wet: 0.1,
    sound: [
      t({ wave: "triangle", freq: 784, at: 0, dur: 0.14, attack: 0.004, gain: 0.5 }),
      t({ wave: "triangle", freq: 659.3, at: 0.15, dur: 0.14, attack: 0.004, gain: 0.5 }),
      t({ wave: "triangle", freq: 523.3, at: 0.3, dur: 0.3, attack: 0.004, gain: 0.5 }),
    ],
  },
  "alert.hull-stress": {
    bus: "alert", priority: 3, level: -7, cooldown: 1.5, maxInstances: 1, spatial: false,
    caption: "[Hull creaks · near rated depth]", essential: true, wet: 0.3,
    sound: [
      n({ color: "white", filter: "bandpass", freq: 340, to: 170, q: 22, at: 0, dur: 1.1, attack: 0.15, hold: 0.3, gain: 1 }),
      n({ color: "brown", filter: "lowpass", freq: 160, q: 1, at: 0, dur: 0.9, attack: 0.2, gain: 0.4 }),
      t({ wave: "sine", freq: 72, to: 64, at: 0.1, dur: 1, attack: 0.2, gain: 0.3 }),
      n({ color: "white", filter: "bandpass", freq: 2600, q: 8, at: 0.55, dur: 0.06, attack: 0.002, gain: 0.25 }),
      // Stress bands: a mid-range pair that stays legible over engine and rift rumble.
      t({ wave: "triangle", freq: 523, to: 494, at: 0.05, dur: 0.32, attack: 0.01, hold: 0.1, gain: 0.35, lowpass: 2200 }),
      t({ wave: "triangle", freq: 523, to: 466, at: 0.5, dur: 0.42, attack: 0.01, hold: 0.12, gain: 0.35, lowpass: 2200 }),
    ],
  },
  "alert.body": {
    bus: "alert", priority: 3, level: -4, cooldown: 1.2, maxInstances: 1, spatial: false,
    caption: "[Warning tone]", essential: true, wet: 0.05,
    sound: [
      t({ wave: "triangle", freq: 280, at: 0, dur: 0.25, attack: 0.02, gain: 0.6 }),
      t({ wave: "triangle", freq: 220, at: 0.4, dur: 0.42, attack: 0.04, gain: 0.55 }),
    ],
  },
  "alert.threat-call": {
    bus: "alert", priority: 4, level: -6, cooldown: 1.2, maxInstances: 1, spatial: true,
    caption: "[Paired hunter calls, {dir}]", essential: true, wet: 0.45,
    sound: [
      t({ wave: "sine", freq: 150, to: 112, glide: 0.32, at: 0, dur: 0.36, attack: 0.03, hold: 0.1, gain: 0.7, fm: { ratio: 1.51, index: 2.4, indexTo: 0.6 } }),
      n({ color: "pink", filter: "bandpass", freq: 520, to: 300, q: 3, at: 0, dur: 0.34, attack: 0.03, gain: 0.25 }),
      t({ wave: "sine", freq: 138, to: 98, glide: 0.38, at: 0.46, dur: 0.44, attack: 0.03, hold: 0.12, gain: 0.7, fm: { ratio: 1.51, index: 2.8, indexTo: 0.5 } }),
      n({ color: "pink", filter: "bandpass", freq: 480, to: 260, q: 3, at: 0.46, dur: 0.42, attack: 0.03, gain: 0.25 }),
    ],
  },
  "alert.boundary": {
    bus: "sfx", priority: 2, level: -20, cooldown: 6, maxInstances: 1, spatial: false,
    caption: "[Survey-edge tone]", essential: false, wet: 0.3,
    sound: [
      t({ wave: "sine", freq: 123.5, at: 0, dur: 0.9, attack: 0.1, gain: 0.6, fm: { ratio: 0.5, index: 0.3 } }),
      t({ wave: "sine", freq: 185, at: 0.15, dur: 0.8, attack: 0.1, gain: 0.3 }),
    ],
  },
  "hit.impact": {
    bus: "alert", priority: 4, level: -11, cooldown: 0.12, maxInstances: 1, spatial: false,
    caption: "[Hull impact]", essential: false, wet: 0.25,
    sound: [
      t({ wave: "sine", freq: 58, to: 31, glide: 0.2, at: 0, dur: 0.36, attack: 0.003, gain: 0.9 }),
      n({ color: "brown", filter: "lowpass", freq: 900, to: 180, q: 0.8, at: 0, dur: 0.3, attack: 0.002, gain: 0.8 }),
      n({ color: "white", filter: "bandpass", freq: 1800, q: 5, at: 0.005, dur: 0.12, attack: 0.002, gain: 0.25 }),
    ],
  },
  "hit.damage": {
    bus: "alert", priority: 4, level: -1.5, cooldown: 0.4, maxInstances: 1, spatial: true,
    caption: "[Bite · taking damage]", essential: true, wet: 0.2,
    sound: [
      t({ wave: "sawtooth", freq: 66, to: 48, at: 0, dur: 0.32, attack: 0.004, gain: 0.6, lowpass: 520 }),
      n({ color: "white", filter: "bandpass", freq: 900, to: 400, q: 2, at: 0, dur: 0.18, attack: 0.002, gain: 0.6 }),
      n({ color: "brown", filter: "lowpass", freq: 500, q: 0.7, at: 0.02, dur: 0.3, attack: 0.004, gain: 0.5 }),
      n({ color: "white", filter: "bandpass", freq: 1300, to: 600, q: 1.5, at: 0, dur: 0.24, attack: 0.002, hold: 0.04, gain: 0.6 }),
      t({ wave: "triangle", freq: 440, to: 311, at: 0.01, dur: 0.3, attack: 0.003, hold: 0.05, gain: 0.35, lowpass: 1800 }),
    ],
  },
  "hull.failure": {
    bus: "alert", priority: 5, level: -14, cooldown: 4, maxInstances: 1, spatial: false,
    caption: "[Hull systems powering down]", essential: true, wet: 0.35,
    sound: [
      t({ wave: "sawtooth", freq: 220, to: 38, at: 0, dur: 1.7, attack: 0.01, hold: 0.3, gain: 0.45, lowpass: 900 }),
      t({ wave: "sine", freq: 110, to: 30, at: 0, dur: 1.8, attack: 0.01, hold: 0.4, gain: 0.5 }),
      n({ color: "white", filter: "highpass", freq: 2500, q: 0.7, at: 0.05, dur: 0.7, attack: 0.01, gain: 0.12 }),
    ],
  },
  "transition.submerge": {
    bus: "sfx", priority: 2, level: -4, cooldown: 0.6, maxInstances: 1, spatial: false,
    caption: null, essential: false, wet: 0.2,
    sound: [
      n({ color: "white", filter: "bandpass", freq: 1500, to: 380, q: 1.5, at: 0, dur: 0.5, attack: 0.005, gain: 0.7 }),
      t({ wave: "sine", freq: 380, to: 900, glide: 0.05, at: 0.12, dur: 0.07, attack: 0.002, gain: 0.25 }),
      t({ wave: "sine", freq: 300, to: 800, glide: 0.05, at: 0.22, dur: 0.07, attack: 0.002, gain: 0.2 }),
      t({ wave: "sine", freq: 450, to: 1000, glide: 0.04, at: 0.3, dur: 0.06, attack: 0.002, gain: 0.15 }),
    ],
  },
  "transition.surface": {
    bus: "sfx", priority: 2, level: -1, cooldown: 0.6, maxInstances: 1, spatial: false,
    caption: null, essential: false, wet: 0.05,
    sound: [
      n({ color: "white", filter: "bandpass", freq: 1800, to: 3200, q: 0.8, at: 0, dur: 0.35, attack: 0.004, gain: 0.5 }),
      n({ color: "pink", filter: "bandpass", freq: 700, q: 1, at: 0.04, dur: 0.4, attack: 0.02, gain: 0.35 }),
    ],
  },
  "transition.board": {
    bus: "sfx", priority: 2, level: -9, cooldown: 0.6, maxInstances: 1, spatial: false,
    caption: null, essential: false, wet: 0.15,
    sound: [
      t({ wave: "sine", freq: 90, to: 60, glide: 0.08, at: 0, dur: 0.18, attack: 0.002, gain: 0.8 }),
      n({ color: "brown", filter: "lowpass", freq: 700, q: 0.8, at: 0, dur: 0.12, attack: 0.002, gain: 0.5 }),
      n({ color: "white", filter: "highpass", freq: 3500, to: 1800, q: 0.7, at: 0.12, dur: 0.6, attack: 0.03, gain: 0.2 }),
    ],
  },
  "transition.disembark": {
    bus: "sfx", priority: 2, level: -11, cooldown: 0.6, maxInstances: 1, spatial: false,
    caption: null, essential: false, wet: 0.15,
    sound: [
      n({ color: "white", filter: "highpass", freq: 1800, to: 3500, q: 0.7, at: 0, dur: 0.45, attack: 0.02, gain: 0.25 }),
      t({ wave: "sine", freq: 80, to: 55, glide: 0.08, at: 0.35, dur: 0.18, attack: 0.002, gain: 0.7 }),
      n({ color: "brown", filter: "lowpass", freq: 600, q: 0.8, at: 0.35, dur: 0.12, attack: 0.002, gain: 0.45 }),
    ],
  },
  "transition.interior": {
    bus: "sfx", priority: 2, level: -8, cooldown: 0.6, maxInstances: 1, spatial: false,
    caption: null, essential: false, wet: 0.1,
    sound: [
      n({ color: "pink", filter: "bandpass", freq: 500, to: 1400, q: 2, at: 0, dur: 0.4, attack: 0.05, gain: 0.5 }),
      t({ wave: "sine", freq: 110, to: 70, glide: 0.06, at: 0.38, dur: 0.14, attack: 0.002, gain: 0.6 }),
    ],
  },
  "carrier.clamp": {
    bus: "sfx", priority: 2, level: -15, cooldown: 0.8, maxInstances: 1, spatial: false,
    caption: "[Berth clamps lock]", essential: false, wet: 0.4,
    sound: [
      t({ wave: "sine", freq: 180, at: 0, dur: 0.7, attack: 0.002, gain: 0.6, fm: { ratio: 2.76, index: 1.6, indexTo: 0.1 } }),
      t({ wave: "sine", freq: 240, at: 0.09, dur: 0.6, attack: 0.002, gain: 0.45, fm: { ratio: 3.41, index: 1.2, indexTo: 0.1 } }),
      n({ color: "brown", filter: "lowpass", freq: 500, q: 0.8, at: 0, dur: 0.15, attack: 0.002, gain: 0.5 }),
    ],
  },
  // UX-1: the bridge console wakes as the helm is taken (two soft rising notes)...
  "carrier.helm": {
    bus: "sfx", priority: 2, level: -18, cooldown: 1, maxInstances: 1, spatial: false,
    caption: "[Helm console wakes]", essential: false, wet: 0.25,
    sound: [
      t({ wave: "sine", freq: 523, at: 0, dur: 0.35, attack: 0.01, gain: 0.45 }),
      t({ wave: "sine", freq: 784, at: 0.12, dur: 0.5, attack: 0.01, gain: 0.35 }),
      n({ color: "pink", filter: "bandpass", freq: 2400, q: 3, at: 0, dur: 0.08, attack: 0.002, gain: 0.15 }),
    ],
  },
  // ...and the station-keeping thrusters spool down to a hold (a falling hum).
  "carrier.hold": {
    bus: "sfx", priority: 2, level: -17, cooldown: 1.5, maxInstances: 1, spatial: false,
    caption: "[Thrusters settle to a hold]", essential: false, wet: 0.35,
    sound: [
      n({ color: "brown", filter: "lowpass", freq: 380, to: 140, q: 0.9, at: 0, dur: 1.6, attack: 0.08, gain: 0.7 }),
      t({ wave: "sine", freq: 98, to: 73, glide: 1.2, at: 0, dur: 1.4, attack: 0.05, gain: 0.4 }),
    ],
  },
  "carrier.lock": {
    bus: "sfx", priority: 2, level: -17, cooldown: 1.5, maxInstances: 1, spatial: false,
    caption: "[Launch lock flooding]", essential: false, wet: 0.4,
    sound: [
      n({ color: "brown", filter: "lowpass", freq: 120, to: 420, q: 0.8, at: 0, dur: 2.4, attack: 0.6, hold: 0.8, gain: 0.8 }),
      n({ color: "pink", filter: "bandpass", freq: 900, q: 1.5, at: 0.3, dur: 1.8, attack: 0.5, gain: 0.2 }),
    ],
  },
  "threat.disengage": {
    bus: "sfx", priority: 2, level: -21, cooldown: 4, maxInstances: 1, spatial: false,
    caption: "[Hunter calls fade]", essential: false, wet: 0.5,
    sound: [
      t({ wave: "sine", freq: 220, to: 165, at: 0, dur: 1.4, attack: 0.1, gain: 0.5 }),
      t({ wave: "sine", freq: 330, to: 247, at: 0.1, dur: 1.4, attack: 0.1, gain: 0.25 }),
    ],
  },
  "music.discovery": {
    bus: "music", priority: 2, level: -21, cooldown: 8, maxInstances: 1, spatial: false,
    caption: null, essential: false, wet: 0.45,
    sound: {
      kind: "phrase", beat: 0.42,
      notes: [
        { at: 0, midi: D4, beats: 1, gain: 0.8 }, { at: 1, midi: A4, beats: 1.5, gain: 0.9 },
        { at: 2.5, midi: G4, beats: 0.5, gain: 0.6 }, { at: 3, midi: E4, beats: 3, gain: 0.7 },
      ],
      pad: [{ at: 0, midi: [D4 - 24, A4 - 24, E4 - 12], beats: 7, gain: 0.5 }],
    },
  },
  "music.blueprint": {
    bus: "music", priority: 2, level: -21, cooldown: 4, maxInstances: 1, spatial: false,
    caption: null, essential: false, wet: 0.4,
    sound: { kind: "phrase", beat: 0.3, notes: [{ at: 0, midi: D4, beats: 1, gain: 0.8 }, { at: 1, midi: A4, beats: 3, gain: 0.8 }] },
  },
  "music.arrival": {
    bus: "music", priority: 2, level: -19, cooldown: 20, maxInstances: 1, spatial: false,
    caption: null, essential: false, wet: 0.55,
    sound: {
      kind: "phrase", beat: 0.55,
      notes: [{ at: 2, midi: A4, beats: 1, gain: 0.6 }, { at: 3, midi: B3 + 12, beats: 1, gain: 0.55 }, { at: 4, midi: E4, beats: 4, gain: 0.6 }],
      pad: [{ at: 0, midi: [D4 - 24, A4 - 24, D4 - 12, G4 + 1 - 12], beats: 9, gain: 0.6 }],
    },
  },
  "music.homecoming": {
    bus: "music", priority: 2, level: -18, cooldown: 30, maxInstances: 1, spatial: false,
    caption: null, essential: false, wet: 0.45,
    sound: {
      kind: "phrase", beat: 0.5,
      notes: [{ at: 0, midi: A4, beats: 1, gain: 0.6 }, { at: 1, midi: F4 + 1, beats: 1, gain: 0.6 }, { at: 2, midi: D4, beats: 4, gain: 0.7 }],
      pad: [{ at: 0, midi: [D4 - 24, A4 - 24, F4 + 1 - 12], beats: 7, gain: 0.5 }],
    },
  },
  "music.ending": {
    bus: "music", priority: 6, level: -17.5, cooldown: 60, maxInstances: 1, spatial: false,
    caption: null, essential: false, wet: 0.55,
    sound: {
      // i – VI – III – VII, then the motif settles on a major tonic: restrained, not triumphant.
      kind: "phrase", beat: 0.75,
      pad: [
        { at: 0, midi: [D4 - 24, A4 - 24, F4 - 12, E4], beats: 8, gain: 0.55 },
        { at: 8, midi: [58 - 24, F4 - 12, D4, A4], beats: 8, gain: 0.55 },
        { at: 16, midi: [F4 - 24, C5 - 24, A4 - 12, G4], beats: 8, gain: 0.55 },
        { at: 24, midi: [72 - 36, G4 - 12, E4, C5 - 12], beats: 8, gain: 0.55 },
        { at: 32, midi: [D4 - 24, A4 - 24, F4 + 1 - 12, E4], beats: 16, gain: 0.6 },
      ],
      notes: [
        { at: 2, midi: D4, beats: 2, gain: 0.7 }, { at: 4, midi: A4, beats: 3, gain: 0.8 },
        { at: 7, midi: G4, beats: 1, gain: 0.55 }, { at: 8, midi: F4, beats: 6, gain: 0.65 },
        { at: 16, midi: C5, beats: 2, gain: 0.7 }, { at: 18, midi: A4, beats: 2, gain: 0.6 },
        { at: 20, midi: G4, beats: 4, gain: 0.6 }, { at: 24, midi: E4, beats: 4, gain: 0.6 },
        { at: 28, midi: A3, beats: 4, gain: 0.5 },
        { at: 34, midi: D4, beats: 2, gain: 0.7 }, { at: 36, midi: A4, beats: 3, gain: 0.8 },
        { at: 39, midi: B3 + 12, beats: 1, gain: 0.55 }, { at: 40, midi: F4 + 1, beats: 2, gain: 0.6 },
        { at: 42, midi: D5, beats: 6, gain: 0.55 },
      ],
    },
  },
};

export const CUE_IDS = Object.keys(CUES) as CueId[];

/** Synthesis timing, shared with synth.ts so allocation always matches the
 * graph: voices start START_LEAD after admission; every source stops STOP_PAD
 * after its envelope; phrase notes ring NOTE_TAIL seconds past their beats and
 * pad chords release over PAD_RELEASE seconds. */
export const START_LEAD = 0.005, STOP_PAD = 0.02, NOTE_TAIL = 2.2, PAD_RELEASE = 1.5;

/** Seconds from a sound's start time to its last source stop. */
export function soundLength(s: readonly Part[] | Phrase): number {
  if ("kind" in s && s.kind === "phrase") {
    const notes = s.notes.map(x => x.at * s.beat + x.beats * s.beat + NOTE_TAIL);
    const pads = (s.pad ?? []).map(x => x.at * s.beat + x.beats * s.beat + PAD_RELEASE);
    return Math.max(...notes, ...pads) + STOP_PAD;
  }
  return Math.max(...(s as readonly Part[]).map(p => p.at + p.dur)) + STOP_PAD;
}

/** Seconds from admission until a cue's graph has stopped completely. */
export const cueDuration = (spec: CueSpec): number => START_LEAD + soundLength(spec.sound);

export const midiHz = (m: number): number => 440 * 2 ** ((m - 69) / 12);
