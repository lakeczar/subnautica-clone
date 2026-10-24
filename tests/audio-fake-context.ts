/** Minimal WebAudio stand-in for node tests of the S6 engine. Records what the
 * engine asks for (params, starts/stops, disconnects); renders nothing. */

export class FakeParam {
  value: number;
  targets: number[] = [];
  cancelled = 0;
  constructor(v = 0) { this.value = v; }
  setValueAtTime(v: number): this { this.value = v; return this; }
  setTargetAtTime(v: number): this { this.targets.push(v); return this; }
  linearRampToValueAtTime(v: number): this { this.targets.push(v); return this; }
  exponentialRampToValueAtTime(v: number): this { this.targets.push(v); return this; }
  cancelScheduledValues(): this { this.cancelled++; return this; }
  get last(): number { return this.targets.at(-1) ?? this.value; }
}

export class FakeNode {
  connections = 0;
  readonly targets: unknown[] = [];
  disconnected = false;
  constructor(readonly ctx: FakeContext, readonly kind: string) { ctx.created.push(this); }
  connect<T>(n: T): T { this.connections++; this.targets.push(n); return n; }
  disconnect(): void { if (!this.disconnected) { this.disconnected = true; this.ctx.disconnects++; } }
}
class FakeSource extends FakeNode {
  starts: number[] = [];
  stops: (number | undefined)[] = [];
  onended: (() => void) | null = null;
  start(t = 0): void { this.starts.push(t); }
  stop(t?: number): void { this.stops.push(t); }
}
class FakeOscillator extends FakeSource {
  type: OscillatorType = "sine";
  frequency = new FakeParam(440);
  detune = new FakeParam(0);
}
class FakeBufferSource extends FakeSource { buffer: unknown = null; loop = false; }
class FakeGain extends FakeNode { gain = new FakeParam(1); }
class FakeFilter extends FakeNode { type = "lowpass"; frequency = new FakeParam(350); Q = new FakeParam(1); gain = new FakeParam(0); }
class FakePanner extends FakeNode { pan = new FakeParam(0); }
class FakeCompressor extends FakeNode {
  threshold = new FakeParam(-24); knee = new FakeParam(30); ratio = new FakeParam(12); attack = new FakeParam(0.003); release = new FakeParam(0.25);
}
class FakeShaper extends FakeNode { curve: Float32Array | null = null; }
class FakeConvolver extends FakeNode { buffer: unknown = null; }

export class FakeContext {
  currentTime = 0;
  sampleRate = 4000;
  state: AudioContextState = "suspended";
  destination = {};
  created: FakeNode[] = [];
  disconnects = 0;
  resumed = 0;
  closed = 0;
  createGain(): FakeGain { return new FakeGain(this, "gain"); }
  createOscillator(): FakeOscillator { return new FakeOscillator(this, "oscillator"); }
  createBufferSource(): FakeBufferSource { return new FakeBufferSource(this, "buffer-source"); }
  createBiquadFilter(): FakeFilter { return new FakeFilter(this, "filter"); }
  createStereoPanner(): FakePanner { return new FakePanner(this, "panner"); }
  createDynamicsCompressor(): FakeCompressor { return new FakeCompressor(this, "compressor"); }
  createWaveShaper(): FakeShaper { return new FakeShaper(this, "shaper"); }
  createConvolver(): FakeConvolver { return new FakeConvolver(this, "convolver"); }
  createBuffer(channels: number, length: number, sampleRate: number): { numberOfChannels: number; length: number; sampleRate: number; getChannelData(c: number): Float32Array } {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { numberOfChannels: channels, length, sampleRate, getChannelData: (c: number) => data[c]! };
  }
  async resume(): Promise<void> { this.resumed++; this.state = "running"; }
  async close(): Promise<void> { this.closed++; this.state = "closed"; }

  /** Live nodes that connect directly into `n` (an AudioParam target counts too). */
  inbound(n: unknown): FakeNode[] { return this.created.filter(x => !x.disconnected && x.targets.includes(n)); }
  /** Nodes created and never disconnected. */
  get live(): number { return this.created.filter(n => !n.disconnected).length; }
  oscillators(): FakeOscillator[] { return this.created.filter((n): n is FakeOscillator => n instanceof FakeOscillator); }
  panners(): FakePanner[] { return this.created.filter((n): n is FakePanner => n instanceof FakePanner); }
}

/** The engine's typed view of a fake context. */
export const asContext = (c: FakeContext): AudioContext => c as unknown as AudioContext;
