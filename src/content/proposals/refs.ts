/** Short constructors for proposal data. */
import type { Point, Ref } from "./types.js";

export const p = (x: number, y: number, z: number): Point => ({ x, y, z });
export const rect = (minX: number, maxX: number, minZ: number, maxZ: number) => ({ minX, maxX, minZ, maxZ });
export const site = (id: string): Ref => ({ kind: "site", id });
export const source = (id: string): Ref => ({ kind: "source", id });
export const place = (id: string): Ref => ({ kind: "place", id });
export const story = (id: string): Ref => ({ kind: "story_site", id });
export const tech = (id: string): Ref => ({ kind: "tech_record", id });
export const vista = (id: string): Ref => ({ kind: "vista", id });
export const cave = (id: string): Ref => ({ kind: "cave", id });
export const prop = (id: string): Ref => ({ kind: "proposal", id });
