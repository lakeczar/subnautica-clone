/** S3 proposal: Hearthline's walkable interior kit.
 *
 * Carrier-local metres on the existing CARRIER_LAYOUT (deck top y = 4, walking
 * bounds x ±4.7, z -11..10, helm (0, 4, -6), vestibule (4, 4, 9)). The berth
 * rooms, lock and throat stay owned by sim/carrier.ts and are untouched.
 *
 * Every fixture is a walking solid; the coordinator appends HEARTHLINE_FIXTURES
 * (and the footprint of each occupied socket) to carrierInteriorSolids. The art
 * draws each fixture on exactly these bounds, so collision and the visible room
 * are one authority. tests/s3-fleet-interior.test.ts walks the real
 * moveCapsule/clearance between every room in both berth configurations. */
import type { Vec3 } from "../../sim/types.js";

export interface InteriorSolid { readonly id: string; readonly min: Vec3; readonly max: Vec3 }
export type RoomId = "bridge" | "fabrication" | "stores" | "passage" | "galley" | "cabin" | "vestibule";
export interface Room {
  readonly id: RoomId;
  readonly label: string;
  /** Floor footprint on the deck. Passage depends on the berth configuration. */
  readonly min: { readonly x: number; readonly z: number };
  readonly max: { readonly x: number; readonly z: number };
  /** A clear standing point inside the room that every route test must reach. */
  readonly anchor: Vec3;
  /** Standing point when it differs in the medium berth configuration. */
  readonly mediumAnchor?: Vec3;
}
export interface Station {
  readonly id: string;
  readonly room: RoomId;
  /** Fixture the player uses, and where they stand to use it. */
  readonly fixture: string;
  readonly stand: Vec3;
  readonly action: "helm" | "fabricate" | "store" | "cook" | "rest" | "launch_control" | "survey" | "leave_interior" | "suit_locker";
}
export type SocketKind = "furniture" | "equipment";
export interface Socket {
  readonly id: string;
  readonly room: RoomId;
  readonly kind: SocketKind;
  /** Largest occupant. Treated as a walking solid while occupied. */
  readonly footprint: InteriorSolid;
  readonly yaw: number;
  readonly accepts: readonly string[];
}
export interface Container {
  readonly id: string;
  readonly fixture: string;
  readonly room: RoomId;
  /** Proposed share of B1's 256 CU Hearthline hold. */
  readonly capacityCu: number;
  readonly accepts: "any" | "food" | "fabrication";
}

export const DECK_Y = 4;
/** Inner faces of the pressure house lining, and the interior ceiling. */
export const LINING = { x: 6.25, bow: -11.85, stern: 11.85, ceiling: 7.4 } as const;
/** Region the berth configurations can occupy (rooms plus walls, both sizes). */
export const BERTH_ZONE = { minZ: -3.78, maxZ: 5.78 } as const;

const solid = (id: string, min: readonly [number, number, number], max: readonly [number, number, number]): InteriorSolid =>
  ({ id, min: { x: min[0], y: min[1], z: min[2] }, max: { x: max[0], y: max[1], z: max[2] } });
const at = (x: number, z: number): Vec3 => ({ x, y: DECK_Y, z });

export const HEARTHLINE_ROOMS: readonly Room[] = [
  { id: "bridge", label: "BRIDGE", min: { x: -6.25, z: -11.85 }, max: { x: 6.25, z: -6.75 }, anchor: at(0, -6) },
  { id: "fabrication", label: "FABRICATION", min: { x: -6.25, z: -6.75 }, max: { x: -1.4, z: -3.78 }, anchor: at(-3.4, -5.0) },
  { id: "stores", label: "STORES", min: { x: 1.4, z: -6.75 }, max: { x: 6.25, z: -3.78 }, anchor: at(4.4, -4.2) },
  // Compact: the 0.84 m gap between the rooms. Medium: x 0.18..4.7 beside the room.
  { id: "passage", label: "PASSAGE", min: { x: -.37, z: -3.78 }, max: { x: 4.7, z: 5.78 }, anchor: at(.05, 1), mediumAnchor: at(2.4, 1) },
  { id: "galley", label: "GALLEY", min: { x: -6.25, z: 5.78 }, max: { x: .9, z: 9.6 }, anchor: at(-4.2, 7.4) },
  { id: "cabin", label: "CABIN", min: { x: -6.25, z: 9.6 }, max: { x: .9, z: 11.85 }, anchor: at(-2.4, 9.9) },
  { id: "vestibule", label: "VESTIBULE", min: { x: 1.05, z: 5.78 }, max: { x: 6.25, z: 11.85 }, anchor: at(4, 9) },
];

/** Fixed furniture and partitions. Bottom at the deck top; walking capsule is
 * r 0.34 × 1.75 m. Anything above 5.75 m never touches a walking player. */
export const HEARTHLINE_FIXTURES: readonly InteriorSolid[] = [
  // Bridge: helm console with its seat, survey table to port, launch control to starboard.
  solid("hl.bridge.helm", [-1.25, 4, -8.6], [1.25, 5.15, -7.4]),
  solid("hl.bridge.seat", [-.36, 4, -7.36], [.36, 5.2, -6.74]),
  solid("hl.bridge.survey", [-5.9, 4, -11.3], [-3.9, 5.0, -9.9]),
  solid("hl.bridge.launch", [3.9, 4, -11.3], [5.9, 5.0, -9.9]),
  // Bulkhead stubs aft of the bridge; the 5.2 m opening leaves 1.4 m beside the console.
  solid("hl.bulkhead.fore.port", [-6.25, 4, -6.9], [-2.6, LINING.ceiling, -6.75]),
  solid("hl.bulkhead.fore.starboard", [2.6, 4, -6.9], [6.25, LINING.ceiling, -6.75]),
  // Fabrication alcove (port): fabricator against the hull, bench along the bulkhead, locker.
  solid("hl.fab.fabricator", [-6.25, 4, -6.6], [-5.0, 6.4, -4.7]),
  solid("hl.fab.bench", [-4.75, 4, -6.75], [-2.75, 4.95, -6.12]),
  solid("hl.fab.locker", [-6.25, 4, -4.55], [-5.35, 6.3, -3.86]),
  // Stores alcove (starboard): the carrier hold lockers and an open rack.
  solid("hl.stores.lockers", [5.1, 4, -6.6], [6.25, 7.0, -3.86]),
  solid("hl.stores.rack", [2.75, 4, -6.75], [4.4, 6.0, -6.25]),
  // Aft partition: galley/cabin to port, vestibule to starboard.
  solid("hl.bulkhead.aft", [.9, 4, 7.4], [1.05, LINING.ceiling, LINING.stern]),
  // Galley: counter with cooker, tall pantry, table and bench.
  solid("hl.galley.counter", [-6.25, 4, 5.95], [-5.2, 4.95, 8.5]),
  solid("hl.galley.pantry", [-6.25, 4, 8.6], [-5.2, 6.6, 9.55]),
  solid("hl.galley.table", [-3.3, 4, 6.85], [-2.1, 4.78, 7.95]),
  solid("hl.galley.bench", [-3.3, 4, 8.1], [-2.1, 4.48, 8.5]),
  // Cabin: two-tier bunk on the aft lining and a personal locker.
  solid("hl.cabin.bunks", [-6.25, 4, 10.65], [-3.55, 6.6, 11.85]),
  solid("hl.cabin.locker", [-2.55, 4, 11.2], [-1.35, 6.4, 11.85]),
  // Vestibule: suit lockers, a dressing bench and the launch window panel.
  solid("hl.vestibule.suits", [2.0, 4, 11.15], [3.6, 6.4, 11.85]),
  solid("hl.vestibule.bench", [1.05, 4, 8.3], [1.5, 4.46, 10.3]),
  solid("hl.vestibule.launch", [4.7, 4, 5.85], [6.0, 5.2, 6.35]),
];

export const HEARTHLINE_STATIONS: readonly Station[] = [
  { id: "hl.station.helm", room: "bridge", fixture: "hl.bridge.helm", stand: at(0, -6), action: "helm" },
  { id: "hl.station.survey", room: "bridge", fixture: "hl.bridge.survey", stand: at(-4.4, -9.3), action: "survey" },
  { id: "hl.station.launch", room: "bridge", fixture: "hl.bridge.launch", stand: at(4.4, -9.3), action: "launch_control" },
  { id: "hl.station.fabricator", room: "fabrication", fixture: "hl.fab.fabricator", stand: at(-4.6, -5.6), action: "fabricate" },
  { id: "hl.station.fab-locker", room: "fabrication", fixture: "hl.fab.locker", stand: at(-4.65, -4.2), action: "store" },
  { id: "hl.station.stores", room: "stores", fixture: "hl.stores.lockers", stand: at(4.6, -5.2), action: "store" },
  { id: "hl.station.cooker", room: "galley", fixture: "hl.galley.counter", stand: at(-4.7, 7.2), action: "cook" },
  { id: "hl.station.pantry", room: "galley", fixture: "hl.galley.pantry", stand: at(-4.7, 9.1), action: "store" },
  { id: "hl.station.bunk", room: "cabin", fixture: "hl.cabin.bunks", stand: at(-4.5, 10.0), action: "rest" },
  { id: "hl.station.suits", room: "vestibule", fixture: "hl.vestibule.suits", stand: at(2.8, 10.0), action: "suit_locker" },
  { id: "hl.station.berth-window", room: "vestibule", fixture: "hl.vestibule.launch", stand: at(4.6, 6.9), action: "launch_control" },
  { id: "hl.station.vestibule", room: "vestibule", fixture: "hl.vestibule.suits", stand: at(4, 9), action: "leave_interior" },
];

export const HEARTHLINE_SOCKETS: readonly Socket[] = [
  { id: "hl.socket.bridge.survey", room: "bridge", kind: "equipment", yaw: 0,
    footprint: solid("hl.socket.bridge.survey", [-5.6, 5.0, -11.1], [-4.6, 5.55, -10.3]), accepts: ["directional_survey", "sonar_plotter", "relay_receiver"] },
  { id: "hl.socket.bridge.launch", room: "bridge", kind: "equipment", yaw: 0,
    footprint: solid("hl.socket.bridge.launch", [4.6, 5.0, -11.1], [5.6, 5.55, -10.3]), accepts: ["berth_monitor", "relay_receiver", "beacon_console"] },
  { id: "hl.socket.fab.bench.1", room: "fabrication", kind: "equipment", yaw: Math.PI,
    footprint: solid("hl.socket.fab.bench.1", [-4.6, 4.95, -6.7], [-3.8, 5.55, -6.18]), accepts: ["fabricator_module", "battery_charger", "sample_analyser"] },
  { id: "hl.socket.fab.bench.2", room: "fabrication", kind: "equipment", yaw: Math.PI,
    footprint: solid("hl.socket.fab.bench.2", [-3.65, 4.95, -6.7], [-2.85, 5.55, -6.18]), accepts: ["fabricator_module", "battery_charger", "sample_analyser"] },
  { id: "hl.socket.stores.floor", room: "stores", kind: "furniture", yaw: -Math.PI / 2,
    footprint: solid("hl.socket.stores.floor", [2.75, 4, -5.4], [3.9, 5.8, -4.4]), accepts: ["locker", "rack", "cold_store"] },
  { id: "hl.socket.galley.planter", room: "galley", kind: "furniture", yaw: Math.PI / 2,
    footprint: solid("hl.socket.galley.planter", [-6.15, 4.95, 7.2], [-5.3, 5.65, 8.4]), accepts: ["galley_planter"] },
  { id: "hl.socket.galley.wall", room: "galley", kind: "furniture", yaw: 0,
    footprint: solid("hl.socket.galley.wall", [-1.9, 4, 5.85], [-.75, 5.6, 6.3]), accepts: ["shelf", "display_case", "galley_planter", "locker"] },
  { id: "hl.socket.cabin.corner", room: "cabin", kind: "furniture", yaw: Math.PI,
    footprint: solid("hl.socket.cabin.corner", [-.6, 4, 10.75], [.8, 5.6, 11.8]), accepts: ["chair", "shelf", "display_case", "galley_planter"] },
  { id: "hl.socket.cabin.wall", room: "cabin", kind: "furniture", yaw: Math.PI,
    footprint: solid("hl.socket.cabin.wall", [-3.4, 6.7, 11.45], [-1.4, 7.25, 11.85]), accepts: ["shelf", "display_case"] },
  { id: "hl.socket.vestibule.wall", room: "vestibule", kind: "equipment", yaw: -Math.PI / 2,
    footprint: solid("hl.socket.vestibule.wall", [5.75, 4.5, 10.05], [6.25, 5.9, 11.0]), accepts: ["battery_charger", "rescue_kit", "suit_charger"] },
];

export const HEARTHLINE_CONTAINERS: readonly Container[] = [
  { id: "hearthline.stores", fixture: "hl.stores.lockers", room: "stores", capacityCu: 192, accepts: "any" },
  { id: "hearthline.pantry", fixture: "hl.galley.pantry", room: "galley", capacityCu: 32, accepts: "food" },
  { id: "hearthline.fabrication", fixture: "hl.fab.locker", room: "fabrication", capacityCu: 32, accepts: "fabrication" },
];

/** Fixtures plus the footprints of the given occupied sockets: the complete
 * set the coordinator appends to carrierInteriorSolids. */
export function hearthlineInteriorSolids(occupied: readonly string[] = []): InteriorSolid[] {
  return [...HEARTHLINE_FIXTURES, ...HEARTHLINE_SOCKETS.filter((s) => occupied.includes(s.id)).map((s) => s.footprint)];
}
