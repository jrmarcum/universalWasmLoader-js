/**
 * Reference test suite for @jrmarcum/universalwasmloader-js.
 * Run with:  deno run --allow-read --allow-net tests/run_tests.js
 *            node --experimental-vm-modules tests/run_tests.js  (Node 22+)
 *            bun tests/run_tests.js
 */
import { wasmImport, createSingleton, InstancePool } from "../universal-wasm-loader.js";

let passed = 0;
let failed = 0;

function assert(label, actual, expected) {
  if (actual === expected) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

// ── math_50 ──────────────────────────────────────────────────────────────────
console.log("\nmath_50 — numeric round-trip");
{
  const { add, multiply, square } = await wasmImport(new URL("./math_50.wasm", import.meta.url));
  assert("add(3, 4) = 7",      add(3, 4),          7);
  assert("multiply(2.5,4)=10", multiply(2.5, 4.0), 10.0);
  assert("square(5) = 25",     square(5),           25);
}

// ── booleans_50 ──────────────────────────────────────────────────────────────
console.log("\nbooleans_50 — bool normalization");
{
  const { isPositive, inRange, isEven } = await wasmImport(new URL("./booleans_50.wasm", import.meta.url));
  assert("isPositive(1.0) = true",        isPositive(1.0),             true);
  assert("isPositive(-1.0) = false",      isPositive(-1.0),            false);
  assert("inRange(5,0,10) = true",        inRange(5.0, 0.0, 10.0),    true);
  assert("inRange(11,0,10) = false",      inRange(11.0, 0.0, 10.0),   false);
  assert("isEven(4) = true",              isEven(4),                   true);
  assert("isEven(3) = false",             isEven(3),                   false);
}

// ── strings_50 ───────────────────────────────────────────────────────────────
console.log("\nstrings_50 — string params + returns");
{
  const { greet, shout, strLen } = await wasmImport(new URL("./strings_50.wasm", import.meta.url));
  assert('greet("World") = "Hello, World!"', greet("World"), "Hello, World!");
  assert('shout("hi") = "hihi"',             shout("hi"),   "hihi");
  assert('strLen("hello") = 5',              strLen("hello"), 5);
}

// ── imports_50 ───────────────────────────────────────────────────────────────
console.log("\nimports_50 — host import callbacks");
{
  const { scale, combine } = await wasmImport(new URL("./imports_50.wasm", import.meta.url), {
    envMul: (a, b) => a * b,
    envAdd: (a, b) => a + b,
  });
  assert("scale(3.0, 4.0) = 12.0", scale(3.0, 4.0), 12.0);
  assert("combine(10, 7) = 17",    combine(10, 7),   17);
}

// ── SPEC §10 — _initialize ─────────────────────────────────────────────────────
console.log("\nSPEC §10 — _initialize called after instantiation");
{
  // init_check.wasm has no .wit (raw-exports path); its `_initialize` sets a global
  // to 99 that `getValue` reads — so 99 proves the loader invoked `_initialize`.
  const m = await wasmImport(new URL("./init_check.wasm", import.meta.url));
  assert("getValue() = 99 (proves _initialize ran)", m.getValue(), 99);
}

// ── SPEC §10 — WASI-P1 shim ──────────────────────────────────────────────────────
console.log("\nSPEC §10 — WASI-P1 shim lets an I/O library instantiate");
{
  // wasi_io_50 is a `modc` library that calls console.log → imports fd_write.
  // Without the loader's WASI-P1 shim it would fail to instantiate (missing import).
  const { logAndDouble } = await wasmImport(new URL("./wasi_io_50.wasm", import.meta.url));
  assert("logAndDouble(21) = 42 (instantiated via WASI shim)", logAndDouble(21), 42);
}

// ── createSingleton ───────────────────────────────────────────────────────────
console.log("\ncreateSingleton — identity across calls");
{
  const getMod = createSingleton(new URL("./math_50.wasm", import.meta.url));
  const a = await getMod();
  const b = await getMod();
  assert("singleton returns same instance", a === b, true);
  assert("singleton result: add(1,2)=3", a.add(1, 2), 3);
}

// ── createSingleton (WIT-aware) ───────────────────────────────────────────────
console.log("\ncreateSingleton — bool normalization");
{
  const getMod = createSingleton(new URL("./booleans_50.wasm", import.meta.url));
  const { isEven } = await getMod();
  assert("singleton: isEven(6)=true",  isEven(6), true);
  assert("singleton: isEven(7)=false", isEven(7), false);
}

// ── InstancePool ──────────────────────────────────────────────────────────────
console.log("\nInstancePool — run() completes correctly");
{
  const pool = new InstancePool(new URL("./math_50.wasm", import.meta.url), {}, 2);
  const r1 = await pool.run(m => m.add(10, 5));
  const r2 = await pool.run(m => m.square(4));
  assert("pool.run add(10,5)=15",  r1, 15);
  assert("pool.run square(4)=16",  r2, 16);
}

// ── InstancePool concurrent ───────────────────────────────────────────────────
console.log("\nInstancePool — concurrent run() calls");
{
  const pool = new InstancePool(new URL("./booleans_50.wasm", import.meta.url), {}, 2);
  const [a, b] = await Promise.all([
    pool.run(m => m.isEven(4)),
    pool.run(m => m.isEven(3)),
  ]);
  assert("concurrent pool: isEven(4)=true",  a, true);
  assert("concurrent pool: isEven(3)=false", b, false);
}

// ── InstancePool acquire/release ─────────────────────────────────────────────
console.log("\nInstancePool — acquire/release");
{
  const pool = new InstancePool(new URL("./math_50.wasm", import.meta.url), {}, 1);
  const inst = await pool.acquire();
  assert("acquired instance: add(3,3)=6", inst.add(3, 3), 6);
  pool.release(inst);
  const result = await pool.run(m => m.add(7, 8));
  assert("run after release: add(7,8)=15", result, 15);
}

// ── summary ──────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  if (typeof Deno !== "undefined") Deno.exit(1);
  // deno-lint-ignore no-process-global
  else process.exit(1);
}
