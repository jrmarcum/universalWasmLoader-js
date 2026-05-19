export type WitType = "s32" | "s64" | "f32" | "f64" | "bool" | "string";
export type AbiProfile = "wasic" | "component";

export interface WasmImportOptions<TEnv extends Record<string, unknown> = Record<string, unknown>> {
  /** ABI profile. Default: "wasic". "component" is a future stub. */
  abi?: AbiProfile;
  /** Path to the .wit file. Auto-detected by replacing .wasm with .wit when omitted. */
  wit?: string;
  /** Host callbacks matching the WIT import section. */
  imports?: { env?: TEnv };
}

export type ModuleExports = Record<string, (...args: unknown[]) => unknown>;

/** Legacy positional form — returns raw WebAssembly.Exports. */
export declare function wasmImport(
  wasmPath: string | URL,
  importObject: WebAssembly.Imports,
): Promise<WebAssembly.Exports>;

/** Options-object form — returns ABI-translated typed proxy. */
export declare function wasmImport<TEnv extends Record<string, unknown> = Record<string, unknown>>(
  wasmPath: string | URL,
  options?: WasmImportOptions<TEnv>,
): Promise<ModuleExports>;
