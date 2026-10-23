// The platform APIs sim and content may use beyond ES2022, all present in Node (>= 22)
// and in workers (tsconfig.headless.json, STEW-1). Anything else, the DOM included,
// fails that typecheck. Declare an API here only if every headless runtime has it, and
// only the members code uses; never a browser-only API (LockManager, document, …):
// split a browser adapter from its portable port instead.
interface ImportMeta { readonly url: string }
declare const performance: { now(): number };
declare function structuredClone<T>(value: T): T;

/** UTF-8 encoding (WHATWG Encoding). */
declare class TextEncoder {
  readonly encoding: "utf-8";
  encode(input?: string): Uint8Array;
}
declare class TextDecoder {
  constructor(label?: string, options?: { fatal?: boolean; ignoreBOM?: boolean });
  readonly encoding: string;
  decode(input?: ArrayBufferView | ArrayBuffer, options?: { stream?: boolean }): string;
}

/** Cancellation (WHATWG DOM's AbortSignal, as Node and workers provide it). */
interface AbortSignal {
  readonly aborted: boolean;
  readonly reason: unknown;
  throwIfAborted(): void;
  addEventListener(type: "abort", listener: () => void, options?: { once?: boolean }): void;
  removeEventListener(type: "abort", listener: () => void): void;
}
declare const AbortSignal: { readonly prototype: AbortSignal; abort(reason?: unknown): AbortSignal; timeout(milliseconds: number): AbortSignal };
