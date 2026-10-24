// Module-resolution hook installed by fast-guard.mjs. Hooks registered later by a
// test (tests/app-loader.ts) run first, so a mocked renderer never reaches here.
export async function resolve(specifier, context, nextResolve) {
  const resolved = await nextResolve(specifier, context);
  if (specifier.startsWith("@babylonjs/") || resolved.url.includes("/node_modules/@babylonjs/"))
    throw new Error(`test:fast refused Babylon: ${specifier} imported by ${context.parentURL ?? "the entry"}. ` +
      "Tests that load Babylon belong in the heavy tier: rename the file to *.heavy.test.ts.");
  return resolved;
}
