export declare const BAKE_ENTRY: string;
export declare function sourceHashOf(root: string, metafile: { inputs: Record<string, unknown> }): string;
export declare function bakeSourceHash(root: string): Promise<string>;
