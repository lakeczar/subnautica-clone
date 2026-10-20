/** SYS-2 survey, ping, beacon and chart constants. Proposed balance. */

/** Survey-station range by tier. SYS-1's upgrade supplies the tier; each step
 * matches the next frontier's spread. */
export const SURVEY_TIERS = [
  { label: "Shelf survey", range: 150 },
  { label: "Canopy survey", range: 300 },
  { label: "Basin survey", range: 500 },
  { label: "Deep survey", range: 800 },
] as const;
/** The scanner's handheld ping: short range, same rules as a station. */
export const PING_RANGE = 35;

export type BeaconCategory = "player" | "outpost" | "stop" | "landmark" | "site" | "hint";
export const BEACON_CATEGORIES: readonly BeaconCategory[] = ["player", "outpost", "stop", "landmark", "site", "hint"];
export const BEACON_NAME_MAX = 24;
export const PLAYER_BEACON_LIMIT = 16;
/** Placing or collecting a player beacon happens within this reach. */
export const BEACON_REACH = 6;

/** Chart cells are square, metres on X/Z. */
export const CHART_CELL = 50;
/** Cells within this radius of the player count as explored. */
export const CHART_VISIT_RADIUS = 40;
