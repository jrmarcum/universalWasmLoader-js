// Example usage of the universal WASM loader
// Demonstrates the ESM-aligned API: destructure or namespace, version pinning, and host callbacks.
import { wasmImport, createSingleton, InstancePool } from "./universal-wasm-loader.js";

// ── Destructure style ─────────────────────────────────────────────────────────
// Mirrors: import { calculate } from "./math.wasm"
// math.wasm has no companion .wit — returns raw WebAssembly.Exports
const { calculate: runMath, version: moduleVersion } = await wasmImport("./math.wasm");

console.log("Result:        ", runMath(10, 20));         // (10 * 20) + 10 = 210
console.log("Module version:", moduleVersion.value);     // 1  (exported i32 global)

// ── Version pinning ───────────────────────────────────────────────────────────
// Append @N to pin to a specific major version — throws on mismatch.
// Follows the C shared-library SONAME convention (libfoo.so.1 → @1).
const { calculate: runMathPinned } = await wasmImport("./math.wasm@1");

console.log("Pinned result: ", runMathPinned(5, 5));     // (5 * 5) + 10 = 35

// ── Namespace style ───────────────────────────────────────────────────────────
// Mirrors: import * as math from "./math.wasm"
const math = await wasmImport("./math.wasm");

console.log("Namespace:     ", math.calculate(3, 3));    // (3 * 3) + 10 = 19

// ── Singleton (cached instance) ───────────────────────────────────────────────
// Loads once on first call; every subsequent call returns the same instance.
const getMath = createSingleton("./math.wasm@1");
const a = await getMath();
const b = await getMath();
console.log("Same instance: ", a === b);                 // true

// ── Instance pool (concurrent workloads) ─────────────────────────────────────
// Pre-instantiates N independent copies; no two callers share an instance.
const pool = new InstancePool("./math.wasm", {}, 2);
const [r1, r2] = await Promise.all([
  pool.run(m => m.calculate(1, 1)),
  pool.run(m => m.calculate(2, 2)),
]);
console.log("Pool results:  ", r1, r2);                  // 11, 14
