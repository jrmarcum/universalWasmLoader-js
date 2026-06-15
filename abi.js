// @ts-self-types="./abi.d.ts"

const _enc = new TextEncoder();
const _dec = new TextDecoder();

/**
 * Build the WASM `env` import object for the Canonical ABI (wasmtime) profile.
 *
 * Returns `{ env, memRef }`. After WASM instantiation, set `memRef.current`
 * to `instance.exports.memory` so that string-param imports can decode
 * from linear memory.
 *
 * @param {Array<{name:string,tsName:string,params:Array,result:string|null}>} importFuncs
 * @param {Record<string,Function>|undefined} userCallbacks - keyed by camelCase tsName
 * @returns {{ env: Record<string,Function>, memRef: { current: WebAssembly.Memory|null } }}
 */
export function buildComponentImportEnv(importFuncs, userCallbacks) {
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
 * Build a typed JS proxy over raw WASM exports using the Canonical ABI (wasmtime) profile.
 * Requires the WASM module to export `cabi_realloc`.
 *
 * @param {Array<{name:string,tsName:string,params:Array,result:string|null}>} exportFuncs
 * @param {WebAssembly.Exports} rawExports
 * @returns {Record<string,Function>}
 */
export function buildComponentExportProxy(exportFuncs, rawExports) {
  const exp = /** @type {Record<string,unknown>} */ (rawExports);
  const mem = /** @type {WebAssembly.Memory} */ (exp["memory"]);
  const cabiRealloc = /** @type {(origPtr:number,origLen:number,align:number,newLen:number)=>number} */ (exp["cabi_realloc"]);

  const proxy = {};
  for (const fn of exportFuncs) {
    const wasmFn = /** @type {(...a:unknown[])=>unknown} */ (exp[fn.tsName]);

    proxy[fn.tsName] = (...jsArgs) => {
      const wasmArgs = [];
      for (let i = 0; i < fn.params.length; i++) {
        const p = fn.params[i];
        const v = jsArgs[i];
        if (p.type === "string") {
          const bytes = _enc.encode(String(v));
          const ptr = cabiRealloc(0, 0, 1, bytes.length);
          new Uint8Array(mem.buffer).set(bytes, ptr);
          wasmArgs.push(ptr, bytes.length);
        } else if (p.type === "bool") {
          wasmArgs.push(v ? 1 : 0);
        } else {
          wasmArgs.push(v);
        }
      }

      if (fn.result === "string") {
        // Canonical ABI callee-allocated return: the export returns an i32 pointer to a
        // callee-allocated [ptr, len] pair. Read it, decode, then call the paired
        // `cabi_post_<name>` export to release the buffer (no-op under a bump allocator,
        // but part of the contract). Decoding copies the bytes, so the string survives post.
        const retArea = /** @type {number} */ (wasmFn(...wasmArgs));
        const dv = new DataView(mem.buffer);
        const retPtr = dv.getInt32(retArea, true);
        const retLen = dv.getInt32(retArea + 4, true);
        const str = _dec.decode(new Uint8Array(mem.buffer, retPtr, retLen));
        const post = /** @type {((p:number)=>void)|undefined} */ (exp["cabi_post_" + fn.tsName]);
        if (typeof post === "function") post(retArea);
        return str;
      }

      const raw = wasmFn(...wasmArgs);
      if (fn.result === null) return undefined;
      if (fn.result === "bool") return raw !== 0;
      return raw;
    };
  }

  return proxy;
}
