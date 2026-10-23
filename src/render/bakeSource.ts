/** The bake source hash this build was made from (STR-13): set by the vite
 * build (`vite.config.ts`, the same function the bake records it with), null
 * under Node. The baked stores refuse files from any other sources. */
declare const __BAKE_SOURCE_HASH__: string | undefined;
export const BAKE_SOURCE: string | null = typeof __BAKE_SOURCE_HASH__ === "string" ? __BAKE_SOURCE_HASH__ : null;
