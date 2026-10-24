/** REC-1 R3b: the in-game video's encoder ladder, one table the page and the
 * spool worker both read. The page asks the browser down the ladder once per
 * recording and takes the first rung it supports; the worker opens that rung
 * and, should the browser refuse it after all, the rungs below. A rung names
 * its codec, whether it is hardware, its container and its WebCodecs extras:
 * a new encoder, container or profile is a new row (with a writer for a new
 * container), not new control flow. DOM-free.
 *
 * Owner policy: hardware first (every machine that plays has a GPU, and almost
 * every GPU has an encoder); the CPU route at 960x540 only on Linux test
 * machines, whose Chrome exposes no hardware encoder; elsewhere no hardware
 * encoder means no video, recorded as such. */
import type { WebmCodec } from "./webm.js";

export type Container = "webm" | "matroska";
export interface EncoderRung {
  /** Short name: what the summary and the measurement overrides say. */
  key: string;
  /** WebCodecs codec string. */
  codec: string;
  hardware: boolean;
  /** Matroska codec ID, and the container that carries it. */
  codecId: WebmCodec;
  container: Container;
  /** Further VideoEncoderConfig fields (H.264's bitstream format). */
  extra?: Record<string, unknown>;
}

const AVC = { avc: { format: "avc" } }, HEVC = { hevc: { format: "hevc" } };
export const ENCODER_LADDER: readonly EncoderRung[] = [
  // Hardware, in the research's order for an RTX 40 laptop (BROWSER-HW-VIDEO-ENCODE-SOL §7): AV1, H.264, HEVC; then VP9 (Intel).
  { key: "av1-hw", codec: "av01.0.05M.08", hardware: true, codecId: "V_AV1", container: "webm" },
  // Nearly every GPU's encoder, integrated ones included: as Matroska (WebM carries no H.264 or HEVC).
  { key: "h264-hw", codec: "avc1.42001f", hardware: true, codecId: "V_MPEG4/ISO/AVC", container: "matroska", extra: AVC },
  { key: "hevc-hw", codec: "hvc1.1.6.L93.B0", hardware: true, codecId: "V_MPEGH/ISO/HEVC", container: "matroska", extra: HEVC },
  { key: "vp9-hw", codec: "vp09.00.31.08", hardware: true, codecId: "V_VP9", container: "webm" },
  // Software: Linux test machines only (owner policy), at the fallback's width.
  { key: "vp9", codec: "vp09.00.31.08", hardware: false, codecId: "V_VP9", container: "webm" },
  { key: "vp8", codec: "vp8", hardware: false, codecId: "V_VP8", container: "webm" },
  { key: "h264", codec: "avc1.42001f", hardware: false, codecId: "V_MPEG4/ISO/AVC", container: "matroska", extra: AVC },
];
/** The default ladder: every hardware rung, then software (used only where software is allowed). */
export const DEFAULT_RUNGS = ["av1-hw", "h264-hw", "hevc-hw", "vp9-hw", "vp9", "vp8"];
/** Rate control tried in turn: hardware profiles often advertise only constant bitrate (the research's §3). */
export const BITRATE_MODES = ["variable", "constant"] as const;
export type BitrateMode = (typeof BITRATE_MODES)[number];

export const rung = (key: string): EncoderRung | undefined => ENCODER_LADDER.find((r) => r.key === key);
/** The rungs to try, in order: the default, or a measurement's own list (`?reccodec=vp8,h264`, `?rechw=0`).
 * Software rungs only where `software` is allowed (owner policy: Linux test machines). */
export function ladder(keys: readonly string[] = DEFAULT_RUNGS, hardware = true, software = true): EncoderRung[] {
  return keys.map(rung).filter((r): r is EncoderRung => !!r && (r.hardware ? hardware : software));
}
/** The VideoEncoderConfig for a rung at a size. */
export function encoderConfig(r: EncoderRung, width: number, height: number, bitrate: number, framerate: number, bitrateMode: BitrateMode = "variable"): VideoEncoderConfig {
  return { codec: r.codec, width, height, bitrate, framerate, latencyMode: "realtime", bitrateMode,
    hardwareAcceleration: r.hardware ? "prefer-hardware" : "prefer-software", ...(r.extra ?? {}) } as VideoEncoderConfig;
}
/** The first configuration of a rung the browser says it supports (VBR, then CBR), or null. */
export async function supportedConfig(r: EncoderRung, width: number, height: number, bitrate: number, framerate: number,
  probe: (c: VideoEncoderConfig) => Promise<{ supported?: boolean }>): Promise<VideoEncoderConfig | null> {
  for (const mode of BITRATE_MODES) {
    const c = encoderConfig(r, width, height, bitrate, framerate, mode);
    try { if ((await probe(c)).supported === true) return c; } catch { /* not this one */ }
  }
  return null;
}
/** Owner policy: CPU encoding is a Linux test-machine fallback, never automatic elsewhere (the owner's Windows laptop). */
export function softwareAllowed(platform: string | undefined): boolean { return /linux/i.test(platform ?? ""); }
/** The summary's words for a rung: "hardware H.264", "software VP9". */
export function describeCodec(codecId: string): string {
  return ({ V_VP9: "VP9", V_VP8: "VP8", V_AV1: "AV1", "V_MPEG4/ISO/AVC": "H.264", "V_MPEGH/ISO/HEVC": "HEVC" } as Record<string, string>)[codecId] ?? codecId;
}
