import type { ResolveHook } from 'node:module';

// Replace only browser presentation/input ports. The real app, clock, session,
// codec, repository and native-lock adapter still run in these Node tests.
export const resolve: ResolveHook = (specifier, context, nextResolve) => {
  if (context.parentURL?.endsWith('/src/runtime/app.js')
    && ['../render/renderer.js', '../ui/view.js', './input.js'].includes(specifier)) {
    return { url: new URL('./app-browser-support.js', import.meta.url).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
};
