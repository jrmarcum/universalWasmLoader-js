/**
 * Reference test suite for @jrmarcum/universalwasmloader-js.
 * Run with:  deno run --allow-read --allow-net tests/run_tests.js
 *            node --experimental-vm-modules tests/run_tests.js  (Node 22+)
 *            bun tests/run_tests.js
 */
import { wasmImport } from "../universal-wasm-loader.js";

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
  const m = await wasmImport(new URL("./math_50.wasm", import.meta.url));
  assert("add(3, 4) = 7",      m.add(3, 4),          7);
  assert("multiply(2.5,4)=10", m.multiply(2.5, 4.0), 10.0);
  assert("square(5) = 25",     m.square(5),           25);
}

// ── booleans_50 ──────────────────────────────────────────────────────────────
console.log("\nbooleans_50 — bool normalization (wasic)");
{
  const m = await wasmImport(new URL("./booleans_50.wasm", import.meta.url), {});
  // Legacy form — raw exports; booleans come back as 0/1
  assert("isPositive(1.0) = 1",           m.isPositive(1.0),             1);
  assert("isPositive(-1.0) = 0",          m.isPositive(-1.0),            0);
  assert("inRange(5,0,10) = 1",           m.inRange(5.0, 0.0, 10.0),    1);
  assert("isEven(4) = 1",                 m.isEven(4),                   1);
}

// ── booleans_50 via WIT ───────────────────────────────────────────────────────
console.log("\nbooleans_50 — bool normalization (wasic, WIT-aware)");
{
  const m = await wasmImport(new URL("./booleans_50.wasm", import.meta.url), { abi: "wasic" });
  assert("isPositive(1.0) = true",        m.isPositive(1.0),             true);
  assert("isPositive(-1.0) = false",      m.isPositive(-1.0),            false);
  assert("inRange(5,0,10) = true",        m.inRange(5.0, 0.0, 10.0),    true);
  assert("inRange(11,0,10) = false",      m.inRange(11.0, 0.0, 10.0),   false);
  assert("isEven(4) = true",              m.isEven(4),                   true);
  assert("isEven(3) = false",             m.isEven(3),                   false);
}

// ── strings_50 ───────────────────────────────────────────────────────────────
console.log("\nstrings_50 — string params + returns");
{
  const m = await wasmImport(new URL("./strings_50.wasm", import.meta.url), { abi: "wasic" });
  assert('greet("World") = "Hello, World!"', m.greet("World"), "Hello, World!");
  assert('shout("hi") = "hihi"',             m.shout("hi"),   "hihi");
  assert('strLen("hello") = 5',              m.strLen("hello"), 5);
}

// ── imports_50 ───────────────────────────────────────────────────────────────
console.log("\nimports_50 — host import callbacks");
{
  const m = await wasmImport(new URL("./imports_50.wasm", import.meta.url), {
    abi: "wasic",
    imports: {
      env: {
        envMul: (a, b) => a * b,
        envAdd: (a, b) => a + b,
      },
    },
  });
  assert("scale(3.0, 4.0) = 12.0", m.scale(3.0, 4.0), 12.0);
  assert("combine(10, 7) = 17",    m.combine(10, 7),   17);
}

// ── summary ──────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  if (typeof Deno !== "undefined") Deno.exit(1);
  // deno-lint-ignore no-process-global
  else process.exit(1);
}
