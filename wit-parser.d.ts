export type WitType = "s32" | "s64" | "f32" | "f64" | "bool" | "string";

export interface WitParam {
  name: string;
  type: WitType;
}

export interface WitFunc {
  /** Original kebab-case name from WIT source. */
  name: string;
  /** camelCase JS-safe name (WIT `is-positive` → `isPositive`). */
  tsName: string;
  params: WitParam[];
  result: WitType | null;
}

export interface ParsedWit {
  packageName: string;
  worldName: string;
  imports: WitFunc[];
  exports: WitFunc[];
}

/** Convert kebab-case WIT name to camelCase JS name. */
export declare function kebabToCamel(name: string): string;

/** Convert kebab-case WIT import name to the underscore WASM import key. */
export declare function kebabToWasmImportKey(name: string): string;

/** Parse a WIT source string produced by wasmtk. */
export declare function parseWit(src: string): ParsedWit;
