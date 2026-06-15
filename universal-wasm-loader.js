// @ts-self-types="./universal-wasm-loader.d.ts"
/**
 * A lightweight, zero-dependency WebAssembly loader.
 *
 * Loads a `.wasm` module like an ES import: it auto-detects the companion `.wit`
 * file and applies the Canonical ABI (wasmtime) so the caller receives a typed
 * proxy keyed by the module's export names. If no `.wit` is found, raw
 * {@linkcode WebAssembly.Exports} are returned. Works in Node.js 18+, Bun, Deno,
 * and modern browsers without any configuration.
 *
 * @example Basic usage
 * ```ts
 * import { wasmImport } from "@jrmarcum/universal-wasm-loader";
 *
 * const { greet, isEven } = await wasmImport("./mod.wasm");
 * greet("World"); // "Hello, World!"
 * ```
 *
 * @module
 */
import { parseWit } from "./wit-parser.js";
import { buildComponentImportEnv, buildComponentExportProxy } from "./abi.js";

/**
 * Instantiate a .wasm file from a URL, returning raw exports.
 * @param {URL} url
 * @param {WebAssembly.Imports} importObject
 * @returns {Promise<WebAssembly.Exports>}
 */
async function instantiateWasm(url, importObject) {
  if (typeof WebAssembly.instantiateStreaming === "function") {
    try {
      const response = await fetch(url);
      const { instance } = await WebAssembly.instantiateStreaming(response, importObject);
      return instance.exports;
    } catch (_e) {
      // fall through to arrayBuffer path
    }
  }
  const bytes = await (await fetch(url)).arrayBuffer();
  const { instance } = await WebAssembly.instantiate(bytes, importObject);
  return instance.exports;
}

/**
 * Parse an optional `@N` version suffix from a wasm path string.
 * Returns the clean path and the requested version (or null if absent).
 * @param {string | URL} wasmPath
 * @returns {{ cleanPath: string, requestedVersion: number | null }}
 */
function parseVersionSuffix(wasmPath) {
  const raw = typeof wasmPath === "string" ? wasmPath : wasmPath.href;
  const atIdx = raw.lastIndexOf("@");
  if (atIdx !== -1) {
    const suffix = raw.slice(atIdx + 1);
    if (/^\d+$/.test(suffix)) {
      return { cleanPath: raw.slice(0, atIdx), requestedVersion: parseInt(suffix, 10) };
    }
  }
  return { cleanPath: raw, requestedVersion: null };
}

/**
 * Assert that a loaded module's exported `version` global matches the requested version.
 * @param {WebAssembly.Exports} rawExports
 * @param {number} requestedVersion
 * @param {string} wasmPath
 */
function assertVersion(rawExports, requestedVersion, wasmPath) {
  const versionExport = /** @type {WebAssembly.Global|undefined} */ (rawExports["version"]);
  if (!versionExport || typeof versionExport.value !== "number") {
    throw new Error(
      `wasmImport: version @${requestedVersion} requested for "${wasmPath}" but the module does not export a "version" global`,
    );
  }
  if (versionExport.value !== requestedVersion) {
    throw new Error(
      `wasmImport: version mismatch for "${wasmPath}" — requested @${requestedVersion}, module exports version ${versionExport.value}`,
    );
  }
}

/**
 * A universal WebAssembly loader that mimics ESM import behavior.
 * Works in Node.js 18+, Bun, Deno, and all modern browsers.
 *
 * Auto-detects the companion `.wit` file and applies the Canonical ABI.
 * If no `.wit` file is found, raw `WebAssembly.Exports` are returned.
 *
 * An optional `@N` version suffix on the path pins to a specific module
 * version, matching the C shared-library (SONAME) convention.
 *
 * ```js
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
 * const { scale } = await wasmImport("./mod.wasm", {
 *   envMul: (a, b) => a * b,
 * });
 * ```
 *
 * @param {string | URL} wasmPath - Path or URL to the .wasm file. Append `@N` to pin to a version.
 * @param {Record<string, Function>} [hostCallbacks] - Host import callbacks keyed by camelCase WIT name.
 * @returns {Promise<WebAssembly.Exports | Record<string, Function>>}
 */
export async function wasmImport(wasmPath, hostCallbacks = {}) {
  const { cleanPath, requestedVersion } = parseVersionSuffix(wasmPath);
  const wasmUrl = new URL(cleanPath, import.meta.url);

  // Attempt WIT auto-detection; fall back to raw exports if absent
  const witUrl = new URL(wasmUrl.href.replace(/\.wasm$/, ".wit"));
  let witSrc = null;
  try {
    const res = await fetch(witUrl);
    if (res.ok) witSrc = await res.text();
  } catch (_e) {
    // no WIT file available
  }

  if (!witSrc) {
    const rawExports = await instantiateWasm(wasmUrl, {});
    if (requestedVersion !== null) assertVersion(rawExports, requestedVersion, cleanPath);
    return rawExports;
  }

  const parsed = parseWit(witSrc);
  const { env, memRef } = buildComponentImportEnv(parsed.imports, hostCallbacks);
  const rawExports = await instantiateWasm(wasmUrl, parsed.imports.length ? { env } : {});
  if (rawExports["memory"]) {
    memRef.current = /** @type {WebAssembly.Memory} */ (rawExports["memory"]);
  }
  if (requestedVersion !== null) assertVersion(rawExports, requestedVersion, cleanPath);
  return buildComponentExportProxy(parsed.exports, rawExports);
}

/**
 * Create a singleton accessor that loads the WASM instance on the first call and
 * caches it. Subsequent calls return the same instance immediately.
 *
 * Appropriate for CLI tools and bounded-call scenarios where memory growth under
 * a bump allocator is not a concern.
 *
 * ```js
 * const getMod = createSingleton("./mod.wasm@2");
 * const { greet } = await getMod();   // loads on first call, version verified
 * const same = await getMod();        // returns cached instance
 * ```
 *
 * @param {string | URL} wasmPath
 * @param {Record<string, Function>} [hostCallbacks]
 * @returns {() => Promise<WebAssembly.Exports | Record<string, Function>>}
 */
export function createSingleton(wasmPath, hostCallbacks = {}) {
  let _promise = null;
  return () => {
    if (!_promise) _promise = wasmImport(wasmPath, hostCallbacks);
    return _promise;
  };
}

/**
 * A pool of pre-instantiated WASM instances for concurrent or high-throughput scenarios.
 *
 * Manages acquire/release semantics so no two concurrent callers share the same instance.
 * Use `run()` for an atomic checkout-call-release pattern.
 *
 * Appropriate for servers and loop-intensive workloads where distributing memory pressure
 * across multiple independent linear memories improves longevity under bump allocators.
 *
 * ```js
 * const pool = new InstancePool("./mod.wasm@2", {}, 4);
 * const result = await pool.run(mod => mod.compute(42));
 * ```
 */
export class InstancePool {
  /**
   * @param {string | URL} wasmPath
   * @param {Record<string, Function>} [hostCallbacks]
   * @param {number} [size] - Number of instances to maintain. Default: 4.
   */
  constructor(wasmPath, hostCallbacks = {}, size = 4) {
    this._wasmPath = wasmPath;
    this._hostCallbacks = hostCallbacks;
    this._size = size;
    /** @type {Promise<void>|null} */
    this._initPromise = null;
    /** @type {Array<WebAssembly.Exports | Record<string,Function>>} */
    this._available = [];
    /** @type {Array<(inst: WebAssembly.Exports | Record<string,Function>) => void>} */
    this._waiters = [];
  }

  /** @returns {Promise<void>} */
  _ensureInit() {
    if (!this._initPromise) {
      this._initPromise = Promise.all(
        Array.from({ length: this._size }, () => wasmImport(this._wasmPath, this._hostCallbacks)),
      ).then(instances => { this._available = [...instances]; });
    }
    return this._initPromise;
  }

  /**
   * Acquire an available instance. Resolves immediately if one is free; otherwise
   * waits until a concurrent caller releases one.
   * @returns {Promise<WebAssembly.Exports | Record<string, Function>>}
   */
  async acquire() {
    await this._ensureInit();
    if (this._available.length > 0) return this._available.pop();
    return new Promise(resolve => this._waiters.push(resolve));
  }

  /**
   * Release an instance back to the pool.
   * @param {WebAssembly.Exports | Record<string, Function>} instance
   */
  release(instance) {
    if (this._waiters.length > 0) {
      this._waiters.shift()(instance);
    } else {
      this._available.push(instance);
    }
  }

  /**
   * Atomically acquire an instance, call `fn` with it, then release it.
   * The instance is released even if `fn` throws.
   * @template T
   * @param {(instance: WebAssembly.Exports | Record<string, Function>) => T | Promise<T>} fn
   * @returns {Promise<T>}
   */
  async run(fn) {
    const instance = await this.acquire();
    try {
      return await fn(instance);
    } finally {
      this.release(instance);
    }
  }
}
