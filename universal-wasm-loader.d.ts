export type WitType = "s32" | "s64" | "f32" | "f64" | "bool" | "string";
export type AbiProfile = "wasic" | "component" | "raw";

export interface WasmImportOptions<TEnv extends Record<string, unknown> = Record<string, unknown>> {
  /**
   * ABI translation profile.
   * - `"wasic"` (default) — Phase 50 bindgen encoding (`__malloc`, `__str_ret_ptr`/`__str_ret_len`).
   * - `"component"` — Canonical ABI (`cabi_realloc`, out-parameter string returns).
   * - `"raw"` — No ABI translation; user env passed directly, raw exports returned.
   */
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

/**
 * Create a singleton accessor that loads the WASM instance on the first call
 * and caches the promise for all subsequent calls.
 *
 * Appropriate for CLI tools and bounded-call scenarios.
 */
export declare function createSingleton(
  wasmPath: string | URL,
  optionsOrImports?: WebAssembly.Imports | WasmImportOptions,
): () => Promise<WebAssembly.Exports | ModuleExports>;

/**
 * A pool of pre-instantiated WASM instances for concurrent or high-throughput scenarios.
 *
 * Manages acquire/release semantics so no two concurrent callers share the same instance.
 */
export declare class InstancePool {
  constructor(wasmPath: string | URL, options?: WasmImportOptions, size?: number);

  /** Acquire an available instance. Waits if all are currently in use. */
  acquire(): Promise<WebAssembly.Exports | ModuleExports>;

  /** Return an instance to the pool. */
  release(instance: WebAssembly.Exports | ModuleExports): void;

  /**
   * Atomically acquire an instance, call `fn`, then release it.
   * The instance is released even if `fn` throws.
   */
  run<T>(fn: (instance: WebAssembly.Exports | ModuleExports) => T | Promise<T>): Promise<T>;
}
