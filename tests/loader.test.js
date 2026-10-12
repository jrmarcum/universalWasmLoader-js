/**
 * Reference test suite for @jrmarcum/universal-wasm-loader.
 *
 * Written on `node:test` + `@std/assert` so ONE file runs under every supported runtime
 * (Bun migration, 2026-10-12): never `bun:test` or `Deno.test`.
 *
 *   bun run test        # bun test ./tests/loader.test.js  (the daily runner)
 *   bun run test:node   # node --test tests/loader.test.js
 *   bun run test:deno   # deno test --allow-read --allow-env tests/loader.test.js
 *
 * The 26 assertions of the pre-migration `run_tests.js`, as 24 tests: the concurrent-pool pair
 * and the acquire/release pair each stay in one test, because each pair is one sequence.
 */
import { describe, it } from "node:test";
import { assertStrictEquals } from "@std/assert";
import { wasmImport, createSingleton, InstancePool } from "../universal-wasm-loader.js";

/** @param {string} name */
const fixture = (name) => new URL(`./${name}`, import.meta.url);

describe("math_50 — numeric round-trip", () => {
  it("add(3, 4) = 7", async () => {
    const { add } = await wasmImport(fixture("math_50.wasm"));
    assertStrictEquals(add(3, 4), 7);
  });
  it("multiply(2.5,4)=10", async () => {
    const { multiply } = await wasmImport(fixture("math_50.wasm"));
    assertStrictEquals(multiply(2.5, 4.0), 10.0);
  });
  it("square(5) = 25", async () => {
    const { square } = await wasmImport(fixture("math_50.wasm"));
    assertStrictEquals(square(5), 25);
  });
});

describe("booleans_50 — bool normalization", () => {
  it("isPositive(1.0) = true", async () => {
    const { isPositive } = await wasmImport(fixture("booleans_50.wasm"));
    assertStrictEquals(isPositive(1.0), true);
  });
  it("isPositive(-1.0) = false", async () => {
    const { isPositive } = await wasmImport(fixture("booleans_50.wasm"));
    assertStrictEquals(isPositive(-1.0), false);
  });
  it("inRange(5,0,10) = true", async () => {
    const { inRange } = await wasmImport(fixture("booleans_50.wasm"));
    assertStrictEquals(inRange(5.0, 0.0, 10.0), true);
  });
  it("inRange(11,0,10) = false", async () => {
    const { inRange } = await wasmImport(fixture("booleans_50.wasm"));
    assertStrictEquals(inRange(11.0, 0.0, 10.0), false);
  });
  it("isEven(4) = true", async () => {
    const { isEven } = await wasmImport(fixture("booleans_50.wasm"));
    assertStrictEquals(isEven(4), true);
  });
  it("isEven(3) = false", async () => {
    const { isEven } = await wasmImport(fixture("booleans_50.wasm"));
    assertStrictEquals(isEven(3), false);
  });
});

describe("strings_50 — string params + returns", () => {
  it('greet("World") = "Hello, World!"', async () => {
    const { greet } = await wasmImport(fixture("strings_50.wasm"));
    assertStrictEquals(greet("World"), "Hello, World!");
  });
  it('shout("hi") = "hihi"', async () => {
    const { shout } = await wasmImport(fixture("strings_50.wasm"));
    assertStrictEquals(shout("hi"), "hihi");
  });
  it('strLen("hello") = 5', async () => {
    const { strLen } = await wasmImport(fixture("strings_50.wasm"));
    assertStrictEquals(strLen("hello"), 5);
  });
});

describe("imports_50 — host import callbacks", () => {
  const callbacks = {
    envMul: (/** @type {number} */ a, /** @type {number} */ b) => a * b,
    envAdd: (/** @type {number} */ a, /** @type {number} */ b) => a + b,
  };
  it("scale(3.0, 4.0) = 12.0", async () => {
    const { scale } = await wasmImport(fixture("imports_50.wasm"), callbacks);
    assertStrictEquals(scale(3.0, 4.0), 12.0);
  });
  it("combine(10, 7) = 17", async () => {
    const { combine } = await wasmImport(fixture("imports_50.wasm"), callbacks);
    assertStrictEquals(combine(10, 7), 17);
  });
});

describe("SPEC §10 — _initialize called after instantiation", () => {
  // init_check.wasm has no .wit (raw-exports path); its `_initialize` sets a global
  // to 99 that `getValue` reads — so 99 proves the loader invoked `_initialize`.
  it("getValue() = 99 (proves _initialize ran)", async () => {
    const m = await wasmImport(fixture("init_check.wasm"));
    assertStrictEquals(m.getValue(), 99);
  });
});

describe("SPEC §10 — WASI-P1 shim lets an I/O library instantiate", () => {
  // wasi_io_50 is a `modc` library that calls console.log → imports fd_write.
  // Without the loader's WASI-P1 shim it would fail to instantiate (missing import).
  it("logAndDouble(21) = 42 (instantiated via WASI shim)", async () => {
    const { logAndDouble } = await wasmImport(fixture("wasi_io_50.wasm"));
    assertStrictEquals(logAndDouble(21), 42);
  });
});

describe("createSingleton — identity across calls", () => {
  const getMod = createSingleton(fixture("math_50.wasm"));
  it("singleton returns same instance", async () => {
    assertStrictEquals(await getMod(), await getMod());
  });
  it("singleton result: add(1,2)=3", async () => {
    const a = await getMod();
    assertStrictEquals(a.add(1, 2), 3);
  });
});

describe("createSingleton — bool normalization", () => {
  const getMod = createSingleton(fixture("booleans_50.wasm"));
  it("singleton: isEven(6)=true", async () => {
    const { isEven } = await getMod();
    assertStrictEquals(isEven(6), true);
  });
  it("singleton: isEven(7)=false", async () => {
    const { isEven } = await getMod();
    assertStrictEquals(isEven(7), false);
  });
});

describe("InstancePool — run() completes correctly", () => {
  const pool = new InstancePool(fixture("math_50.wasm"), {}, 2);
  it("pool.run add(10,5)=15", async () => {
    assertStrictEquals(await pool.run((m) => m.add(10, 5)), 15);
  });
  it("pool.run square(4)=16", async () => {
    assertStrictEquals(await pool.run((m) => m.square(4)), 16);
  });
});

describe("InstancePool — concurrent run() calls", () => {
  it("concurrent pool: isEven(4)=true, isEven(3)=false", async () => {
    const pool = new InstancePool(fixture("booleans_50.wasm"), {}, 2);
    const [a, b] = await Promise.all([
      pool.run((m) => m.isEven(4)),
      pool.run((m) => m.isEven(3)),
    ]);
    assertStrictEquals(a, true);
    assertStrictEquals(b, false);
  });
});

describe("InstancePool — acquire/release", () => {
  it("acquired instance: add(3,3)=6, then run after release: add(7,8)=15", async () => {
    const pool = new InstancePool(fixture("math_50.wasm"), {}, 1);
    const inst = await pool.acquire();
    assertStrictEquals(inst.add(3, 3), 6);
    pool.release(inst);
    assertStrictEquals(await pool.run((m) => m.add(7, 8)), 15);
  });
});
