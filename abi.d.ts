import type { WitFunc } from "./wit-parser.js";

export interface MemRef {
  current: WebAssembly.Memory | null;
}

export interface WasicImportEnv {
  env: Record<string, (...args: unknown[]) => unknown>;
  memRef: MemRef;
}

/**
 * Build the WASM `env` import object for the "wasic" ABI profile.
 *
 * Set `memRef.current` to `instance.exports.memory` after instantiation so
 * that string-param import callbacks can decode from linear memory.
 */
export declare function buildWasicImportEnv(
  importFuncs: WitFunc[],
  userCallbacks: Record<string, (...args: unknown[]) => unknown> | undefined,
): WasicImportEnv;

/**
 * Build a typed JS proxy over raw WASM exports using the "wasic" ABI profile.
 */
export declare function buildWasicExportProxy(
  exportFuncs: WitFunc[],
  rawExports: WebAssembly.Exports,
): Record<string, (...args: unknown[]) => unknown>;

/**
 * Build the WASM `env` import object for the "component" ABI profile (Canonical ABI).
 *
 * Import-side encoding is identical to "wasic". Set `memRef.current` to
 * `instance.exports.memory` after instantiation.
 */
export declare function buildComponentImportEnv(
  importFuncs: WitFunc[],
  userCallbacks: Record<string, (...args: unknown[]) => unknown> | undefined,
): WasicImportEnv;

/**
 * Build a typed JS proxy over raw WASM exports using the "component" ABI profile
 * (Canonical ABI). Requires `cabi_realloc` to be exported by the WASM module.
 */
export declare function buildComponentExportProxy(
  exportFuncs: WitFunc[],
  rawExports: WebAssembly.Exports,
): Record<string, (...args: unknown[]) => unknown>;
