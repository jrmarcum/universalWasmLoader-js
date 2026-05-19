import type { WitFunc } from "./wit-parser.js";

export interface ImportEnvResult {
  env: Record<string, (...args: unknown[]) => unknown>;
  memRef: { current: WebAssembly.Memory | null };
}

/**
 * Build the WASM `env` import object for the Canonical ABI (wasmtime) profile.
 *
 * Set `memRef.current` to `instance.exports.memory` after instantiation so
 * that string-param import callbacks can decode from linear memory.
 */
export declare function buildComponentImportEnv(
  importFuncs: WitFunc[],
  userCallbacks: Record<string, (...args: unknown[]) => unknown> | undefined,
): ImportEnvResult;

/**
 * Build a typed JS proxy over raw WASM exports using the Canonical ABI (wasmtime) profile.
 * Requires the WASM module to export `cabi_realloc`.
 */
export declare function buildComponentExportProxy(
  exportFuncs: WitFunc[],
  rawExports: WebAssembly.Exports,
): Record<string, (...args: unknown[]) => unknown>;
