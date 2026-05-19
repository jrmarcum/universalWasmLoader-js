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
 *   abi: "wasic",          // default; "component" is a future stub
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

    // Resolve .wit path
    const witPath = opts.wit
      ? new URL(opts.wit, import.meta.url)
      : new URL(wasmUrl.href.replace(/\.wasm$/, ".wit"));

    const witSrc = await (await fetch(witPath)).text();
    const parsed = parseWit(witSrc);

    if (abi === "component") {
      // Stubs — will throw
      const { env, memRef } = buildComponentImportEnv(parsed.imports, userImports.env);
      const rawExports = await instantiateWasm(wasmUrl, { env });
      memRef.current = rawExports["memory"];
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
