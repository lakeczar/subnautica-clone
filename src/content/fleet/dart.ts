/** S3-02 data for the Dart's carrier berth. Composition adopted option B: the
 * fins are trimmed (SCOUT_GEOMETRY.finTip) and BERTH_ENVELOPES.dart is ½W 2.45.
 * `measured` is the visible Dart hull, keel datum, from
 * tests/s3-fleet-art.heavy.test.ts against the real expedition actor art. */
export const DART_BERTH = {
  measured: { halfWidth: 2.45, minZ: -3.6, maxZ: 2.7, height: 1.98 },
  /** Today's envelope (BERTH_ENVELOPES.dart): ½W 2.5 × ½L 3.6 × 2.1. At the
   * starboard datum x = 3 it spans x 0.5..5.5 and crosses the starboard
   * room's inboard wall (x 0.47..0.55), so every slot-1 transfer is refused. */
  current: { halfWidth: 2.5, halfLength: 3.6, height: 2.1, starboardX: 3 },
  /** A (recommended): move BERTH_LOCAL[1] to x 3.1, mirroring the port slot's
   * 5 cm inboard margin (port room ends at −0.45, datum −3). No art change. */
  proposedStarboardX: 3.1,
  /** B (alternative): envelope ½W 2.45, which requires trimming the swept side
   * fins (x·2.5 → x·2.45 in dartArt) and the running lights stay inside. */
  trimmedHalfWidth: 2.45,
} as const;
