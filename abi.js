// @ts-self-types="./abi.d.ts"

const _enc = new TextEncoder();
const _dec = new TextDecoder();

/**
 * Build the WASM `env` import object for the "wasic" ABI profile.
 *
 * Returns `{ env, memRef }`. After WASM instantiation, set `memRef.current`
 * to `instance.exports.memory` so that string-param imports can decode
 * from linear memory.
 *
 * @param {Array<{name:string,tsName:string,params:Array,result:string|null}>} importFuncs
 * @param {Record<string,Function>|undefined} userCallbacks - keyed by camelCase tsName
 * @returns {{ env: Record<string,Function>, memRef: { current: WebAssembly.Memory|null } }}
 */
export function buildWasicImportEnv(importFuncs, userCallbacks) {
  const memRef = { current: /** @type {WebAssembly.Memory|null} */ (null) };
  const env = {};

  for (const fn of importFuncs) {
    const wasmKey = fn.name.replace(/-/g, "_");
    const cb = userCallbacks?.[fn.tsName];
    const params = fn.params;
    const hasStrParam = params.some(p => p.type === "string");

    if (hasStrParam) {
      env[wasmKey] = (...rawArgs) => {
        const view = new Uint8Array(memRef.current.buffer);
        const jsArgs = [];
        let i = 0;
        for (const p of params) {
          if (p.type === "string") {
            const ptr = rawArgs[i++];
            const len = rawArgs[i++];
            jsArgs.push(_dec.decode(view.subarray(ptr, ptr + len)));
          } else if (p.type === "bool") {
            jsArgs.push(rawArgs[i++] !== 0);
          } else {
            jsArgs.push(rawArgs[i++]);
          }
        }
        if (!cb) return fn.result ? 0 : undefined;
        const ret = cb(...jsArgs);
        if (fn.result === "bool") return ret ? 1 : 0;
        return ret ?? (fn.result ? 0 : undefined);
      };
    } else {
      env[wasmKey] = (...rawArgs) => {
        const jsArgs = rawArgs.map((v, idx) => {
          const p = params[idx];
          if (!p) return v;
          return p.type === "bool" ? v !== 0 : v;
        });
        if (!cb) return fn.result ? 0 : undefined;
        const ret = cb(...jsArgs);
        if (fn.result === "bool") return ret ? 1 : 0;
        return ret ?? (fn.result ? 0 : undefined);
      };
    }
  }

  return { env, memRef };
}

/**
 * Build a typed JS proxy over raw WASM exports using the "wasic" ABI profile.
 *
 * @param {Array<{name:string,tsName:string,params:Array,result:string|null}>} exportFuncs
 * @param {WebAssembly.Exports} rawExports
 * @returns {Record<string,Function>}
 */
export function buildWasicExportProxy(exportFuncs, rawExports) {
  const exp = /** @type {Record<string,unknown>} */ (rawExports);
  const mem = /** @type {WebAssembly.Memory} */ (exp["memory"]);

  const needsMalloc = exportFuncs.some(fn => fn.params.some(p => p.type === "string"));
  const needsStrRet = exportFuncs.some(fn => fn.result === "string");

  const malloc = needsMalloc
    ? /** @type {(n:number)=>number} */ (exp["__malloc"])
    : null;

  function writeStr(s) {
    const bytes = _enc.encode(s);
    const ptr = malloc(bytes.length);
    new Uint8Array(mem.buffer).set(bytes, ptr);
    return [ptr, bytes.length];
  }

  function readStr() {
    const ptr = /** @type {{value:number}} */ (exp["__str_ret_ptr"]).value;
    const len = /** @type {{value:number}} */ (exp["__str_ret_len"]).value;
    return _dec.decode(new Uint8Array(mem.buffer, ptr, len));
  }

  const proxy = {};
  for (const fn of exportFuncs) {
    const wasmFn = /** @type {(...a:unknown[])=>unknown} */ (exp[fn.tsName]);

    proxy[fn.tsName] = (...jsArgs) => {
      const wasmArgs = [];
      for (let i = 0; i < fn.params.length; i++) {
        const p = fn.params[i];
        const v = jsArgs[i];
        if (p.type === "string") {
          wasmArgs.push(...writeStr(String(v)));
        } else if (p.type === "bool") {
          wasmArgs.push(v ? 1 : 0);
        } else {
          wasmArgs.push(v);
        }
      }

      const raw = wasmFn(...wasmArgs);

      if (fn.result === null) return undefined;
      if (fn.result === "string") return needsStrRet ? readStr() : "";
      if (fn.result === "bool") return raw !== 0;
      return raw;
    };
  }

  return proxy;
}

/**
 * Stub for the "component" ABI profile (Canonical ABI).
 * Reserved for when wasmtk Stage 0 completes.
 * @throws {Error}
 */
export function buildComponentImportEnv(_importFuncs, _userCallbacks) {
  throw new Error('ABI profile "component" is not yet implemented.');
}

/**
 * @throws {Error}
 */
export function buildComponentExportProxy(_exportFuncs, _rawExports) {
  throw new Error('ABI profile "component" is not yet implemented.');
}
