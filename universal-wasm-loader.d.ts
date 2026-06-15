/**
 * Flat, camelCase map of host functions the WASM module may import (call back into).
 *
 * Keys are the camelCase form of the module's WIT import names (e.g. `env-mul` → `envMul`);
 * each value is the JS implementation the loader wires into the module's import object.
 */
export type HostCallbacks = Record<string, (...args: unknown[]) => unknown>;

/**
 * The ABI-translated exports returned by the loader for a WIT-described module.
 *
 * Keys are the camelCase form of the module's WIT export names (e.g. `is-positive` → `isPositive`);
 * each value is a wrapper that encodes/decodes arguments and results across the Canonical ABI.
 */
export type ModuleExports = Record<string, (...args: unknown[]) => unknown>;

/**
 * Load a `.wasm` file and return its ABI-translated exports.
 *
 * Auto-detects the companion `.wit` file and applies the Canonical ABI (wasmtime).
 * If no `.wit` file exists, raw `WebAssembly.Exports` are returned instead.
 *
 * Append `@N` to the path to pin to a specific module version. The loader
 * verifies the module's exported `version` global matches `N` and throws if not,
 * following the C shared-library (SONAME) major-version convention.
 *
 * ```ts
 * // Destructure individual exports
 * const { greet, isEven } = await wasmImport("./mod.wasm");
 *
 * // Or use as a namespace
 * const m = await wasmImport("./mod.wasm");
 * m.greet("World");
 *
 * // Pin to a specific module version
 * const { greet } = await wasmImport("./mod.wasm@2");
 *
 * // With host import callbacks (flat, camelCase)
 * const { scale } = await wasmImport("./mod.wasm", { envMul: (a, b) => a * b });
 * ```
 */
export declare function wasmImport(
  wasmPath: string | URL,
  hostCallbacks?: HostCallbacks,
): Promise<WebAssembly.Exports | ModuleExports>;

/**
 * Create a singleton accessor that loads the WASM instance on the first call
 * and caches the promise for all subsequent calls.
 *
 * Appropriate for CLI tools and bounded-call scenarios.
 */
export declare function createSingleton(
  wasmPath: string | URL,
  hostCallbacks?: HostCallbacks,
): () => Promise<WebAssembly.Exports | ModuleExports>;

/**
 * A pool of pre-instantiated WASM instances for concurrent or high-throughput scenarios.
 *
 * Manages acquire/release semantics so no two concurrent callers share the same instance.
 */
export declare class InstancePool {
  /**
   * Create a pool that eagerly loads `size` independent instances of the module.
   *
   * @param wasmPath Path to the `.wasm` file (optionally with an `@N` version-pin suffix).
   * @param hostCallbacks Optional flat, camelCase map of host import callbacks.
   * @param size Number of instances to pre-instantiate (defaults to 4).
   */
  constructor(wasmPath: string | URL, hostCallbacks?: HostCallbacks, size?: number);

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
