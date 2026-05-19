// @ts-self-types="./universal-wasm-loader.d.ts"
import { parseWit } from "./wit-parser.js";
import { buildWasicImportEnv, buildWasicExportProxy, buildComponentImportEnv, buildComponentExportProxy } from "./abi.js";

/**
 * Detect whether the second argument is the new options-object form.
 * The legacy form is a plain WebAssembly.Imports (e.g. `{ env: {...} }`).
 * The options form always has at least one of: abi, wit, imports.
 * @param {unknown} v
 * @returns {boolean}
 */
function isOptionsObject(v) {
  if (v === null || typeof v !== "object") return false;
  return "abi" in v || "wit" in v || "imports" in v;
}

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
 * A universal WebAssembly loader that mimics ESM import behavior.
 * Works in Node.js 18+, Bun, Deno, and all modern browsers.
 *
 * **Positional form (legacy):**
 * ```js
 * const { add } = await wasmImport("./math.wasm");
 * const { fn } = await wasmImport("./mod.wasm", { env: { log: console.log } });
 * ```
 *
 * **Options-object form (WIT-aware):**
 * ```js
 * const mod = await wasmImport("./mod.wasm", {
 *   abi: "wasic",          // "component" for Canonical ABI; "raw" for no translation
 *   wit: "./mod.wit",      // auto-detected as mod.wit when omitted
 *   imports: {             // host callbacks matching WIT import section
 *     env: { envMul: (a, b) => a * b },
 *   },
 * });
 * mod.greet("World");      // ABI-translated, typed proxy
 * ```
 *
 * @param {string | URL} wasmPath - Path or URL to the .wasm file, resolved relative to the calling module.
 * @param {WebAssembly.Imports | import("./universal-wasm-loader.d.ts").WasmImportOptions} [optionsOrImports]
 * @returns {Promise<WebAssembly.Exports | Record<string, Function>>}
 */
export async function wasmImport(wasmPath, optionsOrImports = {}) {
  const wasmUrl = new URL(wasmPath, import.meta.url);

  // ── Options-object form ──────────────────────────────────────────────────────
  if (isOptionsObject(optionsOrImports)) {
    const opts = /** @type {{ abi?: string, wit?: string, imports?: Record<string,unknown> }} */ (optionsOrImports);
    const abi = opts.abi ?? "wasic";
    const userImports = opts.imports ?? {};

    // "raw" profile: pass user env directly, skip WIT parsing, return raw exports.
    if (abi === "raw") {
      const envCallbacks = /** @type {Record<string,Function>} */ (userImports.env ?? {});
      const importObj = /** @type {WebAssembly.Imports} */ (
        Object.keys(envCallbacks).length ? { env: envCallbacks } : {}
      );
      return instantiateWasm(wasmUrl, importObj);
    }

    // Resolve and parse .wit file (required for wasic and component profiles)
    const witPath = opts.wit
      ? new URL(opts.wit, import.meta.url)
      : new URL(wasmUrl.href.replace(/\.wasm$/, ".wit"));

    const witSrc = await (await fetch(witPath)).text();
    const parsed = parseWit(witSrc);

    if (abi === "component") {
      const { env, memRef } = buildComponentImportEnv(parsed.imports, userImports.env);
      const rawExports = await instantiateWasm(wasmUrl, parsed.imports.length ? { env } : {});
      if (rawExports["memory"]) {
        memRef.current = /** @type {WebAssembly.Memory} */ (rawExports["memory"]);
      }
      return buildComponentExportProxy(parsed.exports, rawExports);
    }

    // Default: "wasic"
    const envCallbacks = /** @type {Record<string,Function>} */ (userImports.env ?? {});
    const { env, memRef } = buildWasicImportEnv(parsed.imports, envCallbacks);
    const rawExports = await instantiateWasm(wasmUrl, parsed.imports.length ? { env } : {});
    if (rawExports["memory"]) {
      memRef.current = /** @type {WebAssembly.Memory} */ (rawExports["memory"]);
    }
    return buildWasicExportProxy(parsed.exports, rawExports);
  }

  // ── Legacy positional form ───────────────────────────────────────────────────
  const importObject = /** @type {WebAssembly.Imports} */ (optionsOrImports);
  return instantiateWasm(wasmUrl, importObject);
}

/**
 * Create a singleton accessor that loads the WASM instance on the first call and
 * caches it. Subsequent calls return the same instance immediately.
 *
 * Appropriate for CLI tools and bounded-call scenarios where memory growth under
 * a bump allocator is not a concern.
 *
 * ```js
 * const getMod = createSingleton("./mod.wasm", { abi: "wasic" });
 * const mod = await getMod();   // loads on first call
 * const same = await getMod();  // returns cached instance
 * ```
 *
 * @param {string | URL} wasmPath
 * @param {WebAssembly.Imports | import("./universal-wasm-loader.d.ts").WasmImportOptions} [optionsOrImports]
 * @returns {() => Promise<WebAssembly.Exports | Record<string, Function>>}
 */
export function createSingleton(wasmPath, optionsOrImports = {}) {
  let _promise = null;
  return () => {
    if (!_promise) _promise = wasmImport(wasmPath, optionsOrImports);
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
 * const pool = new InstancePool("./mod.wasm", { abi: "wasic" }, 4);
 * const result = await pool.run(mod => mod.compute(42));
 * ```
 */
export class InstancePool {
  /**
   * @param {string | URL} wasmPath
   * @param {import("./universal-wasm-loader.d.ts").WasmImportOptions} [options]
   * @param {number} [size] - Number of instances to maintain. Default: 4.
   */
  constructor(wasmPath, options = {}, size = 4) {
    this._wasmPath = wasmPath;
    this._options = options;
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
        Array.from({ length: this._size }, () => wasmImport(this._wasmPath, this._options)),
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
