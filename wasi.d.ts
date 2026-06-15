/**
 * Minimal WASI Preview 1 shim (SPEC §10). See `wasi.js`.
 * @module
 */

/**
 * Build a minimal `wasi_snapshot_preview1` import object so that I/O-using
 * library modules instantiate in a host with no native WASI. `fd_write` routes
 * stdout to `console.log` and stderr to `console.error`. The shim accesses the
 * module's linear memory through `memRef.current`, set by the loader after
 * instantiation.
 *
 * @param memRef A mutable holder for the module's `WebAssembly.Memory`.
 * @returns The `wasi_snapshot_preview1` import namespace.
 */
export function buildWasiShim(
  memRef: { current: WebAssembly.Memory | null },
): Record<string, (...args: number[]) => number | void>;
