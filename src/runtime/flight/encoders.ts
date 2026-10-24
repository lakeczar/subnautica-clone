/** REC-1 R3b: the in-game video's encoder ladder, one table the page and the
 * spool worker both read. The page asks the browser down the ladder once per
 * recording and takes the first rung it supports; the worker opens that rung
 * and, should the browser refuse it after all, the rungs below. A rung names
 * its codec, whether it is hardware, its container and its WebCodecs extras:
 * a new encoder, container or profile is a new row (with a writer for a new
 * container), not new control flow. DOM-free.
 *
 * Owner policy: hardware first (every machine that plays has a GPU, and almost
 * every GPU has an encoder); the CPU route at 960x540 only where all else fails
 * (in practice Linux test machines, whose Chrome exposes no hardware encoder). */
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

const AVC = { avc: { format: "avc" } };
export const ENCODER_LADDER: readonly EncoderRung[] = [
  { key: "av1-hw", codec: "av01.0.04M.08", hardware: true, codecId: "V_AV1", container: "webm" },
  { key: "vp9-hw", codec: "vp09.00.10.08", hardware: true, codecId: "V_VP9", container: "webm" },
  // Nearly every GPU's encoder, integrated ones included: as Matroska (WebM carries no H.264).
  { key: "h264-hw", codec: "avc1.42001f", hardware: true, codecId: "V_MPEG4/ISO/AVC", container: "matroska", extra: AVC },
  { key: "vp9", codec: "vp09.00.10.08", hardware: false, codecId: "V_VP9", container: "webm" },
  { key: "vp8", codec: "vp8", hardware: false, codecId: "V_VP8", container: "webm" },
  // Software H.264: for measurements only (?reccodec=h264), never chosen by default.
  { key: "h264", codec: "avc1.42001f", hardware: false, codecId: "V_MPEG4/ISO/AVC", container: "matroska", extra: AVC },
];
/** The default ladder: every hardware rung, then VP9 and VP8 in software. */
export const DEFAULT_RUNGS = ["av1-hw", "vp9-hw", "h264-hw", "vp9", "vp8"];

export const rung = (key: string): EncoderRung | undefined => ENCODER_LADDER.find((r) => r.key === key);
/** The rungs to try, in order: the default, or a measurement's own list (`?reccodec=vp8,h264`, `?rechw=0`). */
export function ladder(keys: readonly string[] = DEFAULT_RUNGS, hardware = true): EncoderRung[] {
  return keys.map(rung).filter((r): r is EncoderRung => !!r && (hardware || !r.hardware));
}
/** The VideoEncoderConfig for a rung at a size. */
export function encoderConfig(r: EncoderRung, width: number, height: number, bitrate: number, framerate: number): VideoEncoderConfig {
  return { codec: r.codec, width, height, bitrate, framerate, latencyMode: "realtime",
    hardwareAcceleration: r.hardware ? "prefer-hardware" : "prefer-software", ...(r.extra ?? {}) } as VideoEncoderConfig;
}
/** The summary's words for a rung: "hardware H.264", "software VP9". */
export function describeCodec(codecId: string): string {
  return ({ V_VP9: "VP9", V_VP8: "VP8", V_AV1: "AV1", "V_MPEG4/ISO/AVC": "H.264" } as Record<string, string>)[codecId] ?? codecId;
}
