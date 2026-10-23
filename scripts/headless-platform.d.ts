// The platform APIs sim and content may use beyond ES2022, all present in Node and in
// workers (tsconfig.headless.json, STEW-1 R4). Anything else, the DOM included, fails
// that typecheck. Add an API here only if every headless runtime has it.
interface ImportMeta { readonly url: string }
declare const performance: { now(): number };
declare function structuredClone<T>(value: T): T;
