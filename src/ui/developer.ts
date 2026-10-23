/** Developer tools (the carrier test fixture, its obstruction and drills) stay
 * out of ordinary play unless the page was opened with `?dev`. */
export const developerMode = (): boolean => new URLSearchParams(globalThis.location?.search ?? "").has("dev");
