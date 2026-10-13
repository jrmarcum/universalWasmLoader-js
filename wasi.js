// @ts-self-types="./wasi.d.ts"
/**
 * Minimal WASI Preview 1 shim (SPEC §10).
 *
 * Lets I/O-using *library* modules — e.g. a `wasmtk modc` library that calls
 * `console.log` (which lowers to `fd_write`) — instantiate in a host that has no
 * native WASI (notably the browser). It covers the small subset such libraries
 * commonly import; anything outside the subset surfaces as a normal
 * missing-import error at instantiation, which documents the gap rather than
 * hiding it. A pure-compute library imports none of this and is unaffected.
 *
 * @module
 */

const _dec = new TextDecoder();
const ERRNO_SUCCESS = 0;

/**
 * Build a minimal `wasi_snapshot_preview1` import object. The shim reads and
 * writes the module's linear memory through `memRef.current`, which the loader
 * sets to `instance.exports.memory` after instantiation (WASI calls only happen
 * at run time, by which point it is populated). `fd_write` routes stdout (fd 1)
 * to `console.log` and stderr (fd 2) to `console.error` — a sensible default for
 * a browser/host loader.
 *
 * @param {{ current: WebAssembly.Memory | null }} memRef
 * @returns {Record<string, (...args: never[]) => number>}
 */
export function buildWasiShim(memRef) {
  /** The module's memory; set by the loader after instantiation. */
  const memory = () => {
    if (memRef.current === null) {
      throw new Error(
        "wasmImport: a WASI call arrived before the module's memory was available " +
          "(the module exports no `memory`, or calls WASI from its start function)",
      );
    }
    return memRef.current;
  };
  const dv = () => new DataView(memory().buffer);
  const u8 = () => new Uint8Array(memory().buffer);

  return {
    /**
     * fd_write(fd, iovs, iovs_len, nwritten) → errno.
     * @param {number} fd
     * @param {number} iovsPtr
     * @param {number} iovsLen
     * @param {number} nwrittenPtr
     */
    fd_write(fd, iovsPtr, iovsLen, nwrittenPtr) {
      const view = dv();
      const mem = u8();
      let written = 0;
      let text = "";
      for (let i = 0; i < iovsLen; i++) {
        const base = iovsPtr + i * 8;
        const ptr = view.getInt32(base, true);
        const len = view.getInt32(base + 4, true);
        text += _dec.decode(mem.subarray(ptr, ptr + len));
        written += len;
      }
      // console.log/error append their own newline; drop one trailing newline.
      const out = text.replace(/\n$/, "");
      if (typeof console !== "undefined") {
        if (fd === 2) console.error(out);
        else console.log(out);
      }
      view.setInt32(nwrittenPtr, written, true);
      return ERRNO_SUCCESS;
    },

    /**
     * proc_exit(code) → never. A reactor library should not normally call this.
     * @param {number} code
     */
    proc_exit(code) {
      throw new Error(`wasm proc_exit(${code})`);
    },

    /**
     * random_get(buf, len) → errno. Fills [buf, buf+len) with random bytes.
     * @param {number} buf
     * @param {number} len
     */
    random_get(buf, len) {
      const target = u8().subarray(buf, buf + len);
      if (typeof crypto !== "undefined" && crypto.getRandomValues) {
        for (let off = 0; off < len; off += 65536) { // getRandomValues caps at 65536 bytes
          crypto.getRandomValues(
            target.subarray(off, Math.min(off + 65536, len)),
          );
        }
      } else {
        for (let i = 0; i < len; i++) target[i] = (Math.random() * 256) | 0;
      }
      return ERRNO_SUCCESS;
    },

    /**
     * clock_time_get(id, precision, time_ptr) → errno. Writes i64 ns since epoch.
     * @param {number} _id
     * @param {bigint} _precision an i64, so a BigInt on the JS side
     * @param {number} timePtr
     */
    clock_time_get(_id, _precision, timePtr) {
      dv().setBigInt64(timePtr, BigInt(Date.now()) * 1000000n, true);
      return ERRNO_SUCCESS;
    },

    /**
     * @param {number} countPtr
     * @param {number} sizePtr
     */
    environ_sizes_get(countPtr, sizePtr) {
      const view = dv();
      view.setInt32(countPtr, 0, true);
      view.setInt32(sizePtr, 0, true);
      return ERRNO_SUCCESS;
    },
    environ_get() {
      return ERRNO_SUCCESS;
    },
    /**
     * @param {number} countPtr
     * @param {number} sizePtr
     */
    args_sizes_get(countPtr, sizePtr) {
      const view = dv();
      view.setInt32(countPtr, 0, true);
      view.setInt32(sizePtr, 0, true);
      return ERRNO_SUCCESS;
    },
    args_get() {
      return ERRNO_SUCCESS;
    },
    fd_close() {
      return ERRNO_SUCCESS;
    },
    fd_fdstat_get() {
      return ERRNO_SUCCESS;
    },
    /**
     * fd_seek(fd, offset, whence, newoffset_ptr) → errno.
     * @param {number} _fd
     * @param {bigint} _offset an i64, so a BigInt on the JS side
     * @param {number} _whence
     * @param {number} newOffsetPtr
     */
    fd_seek(_fd, _offset, _whence, newOffsetPtr) {
      dv().setBigInt64(newOffsetPtr, 0n, true);
      return ERRNO_SUCCESS;
    },
  };
}
