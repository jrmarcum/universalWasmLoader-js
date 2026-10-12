# universal-wasm-loader

A lightweight, zero-dependency WebAssembly loader for JavaScript, TypeScript, and the Web. Works in **Node.js 22.18+**, **Bun**, **Deno**, and all **modern browsers** without any configuration or bundler setup. Every release is tested on every current Node LTS line, on Bun and on Deno.

Published to JSR with full build provenance for enhanced supply-chain security.

## Installation

Install via [JSR](https://jsr.io/@jrmarcum/universal-wasm-loader):

**Deno:**

```sh
deno add jsr:@jrmarcum/universal-wasm-loader
```

**npm:**

```sh
npx jsr add @jrmarcum/universal-wasm-loader
```

**Bun:**

```sh
bunx jsr add @jrmarcum/universal-wasm-loader
```

**pnpm:**

```sh
pnpm dlx jsr add @jrmarcum/universal-wasm-loader
```

**Yarn:**

```sh
yarn dlx jsr add @jrmarcum/universal-wasm-loader
```

**vlt:**

```sh
vlt install jsr:@jrmarcum/universal-wasm-loader
```

After installing, the import line is the same on every runtime:

```javascript
import { wasmImport } from "@jrmarcum/universal-wasm-loader";
```

`npx jsr add` and `bunx jsr add` write the dependency to `package.json` and the `@jsr` registry
line to `.npmrc`; commit both. Importing `jsr:@jrmarcum/universal-wasm-loader` with no install
step works on **Deno only**: Node and Bun do not resolve the `jsr:` prefix.

## Usage

### Basic — destructure exports

```javascript
import { wasmImport } from "@jrmarcum/universal-wasm-loader";

const { greet, isEven } = await wasmImport("./mod.wasm");

console.log(greet("World")); // "Hello, World!"
console.log(isEven(4));      // true
```

### Namespace style

```javascript
const m = await wasmImport("./mod.wasm");

m.greet("World");
m.isEven(4);
```

### Version pinning

Append `@N` to pin to a specific major version. The loader checks the module's
exported `version` global and throws a descriptive error if it doesn't match —
the same convention C shared libraries use with SONAME major versioning.

```javascript
const { greet } = await wasmImport("./mod.wasm@2");
// Throws if the module's exported `version` global !== 2
```

### With host import callbacks

When your WASM module calls back into JS, pass the host functions as a flat camelCase object. The loader maps WIT kebab-case names (`env-mul`) to camelCase JS keys (`envMul`) automatically.

```javascript
const { scale, combine } = await wasmImport("./math.wasm", {
  envMul: (a, b) => a * b,
  envAdd: (a, b) => a + b,
});

console.log(scale(3.0, 4.0)); // 12.0
```

## How It Works

1. Resolves a relative `.wasm` path against the **loader's own location** (its `import.meta.url`); a `URL` or absolute path is used as given (see [Where your modules live](#where-your-modules-live))
2. Auto-detects the companion `.wit` file by replacing `.wasm` → `.wit`
3. Applies the Canonical ABI (wasmtime) — bool and string types handled automatically
4. Reads a `file:` URL from disk on Node, Bun and Deno (Node's `fetch` does not accept `file:` URLs); otherwise uses `WebAssembly.instantiateStreaming` for best performance, falling back to `fetch` + `arrayBuffer`
5. Returns an ABI-translated proxy keyed by camelCase WIT export names

If no `.wit` file is found, raw `WebAssembly.Exports` are returned.

## API

### `wasmImport(wasmPath, hostCallbacks?)`

| Parameter | Type | Description |
| --- | --- | --- |
| `wasmPath` | `string \| URL` | Path or `URL` of the `.wasm` file. A relative string resolves against the loader's own location. Append `@N` to pin to a major version. |
| `hostCallbacks` | `Record<string, Function>` | Host functions the WASM module calls into JS. Flat object, camelCase keys. |

### Where your modules live

Keep your `.wasm` modules (and their `.wit` files) in whatever folder suits your project, such as
`wasm_modules/`, and pass a `URL` built from **your** file's `import.meta.url`:

```javascript
const { greet } = await wasmImport(new URL("./wasm_modules/mod.wasm", import.meta.url));
const pinned = await wasmImport(new URL("./wasm_modules/mod.wasm@2", import.meta.url));
```

A plain relative string such as `"./mod.wasm"` resolves against the loader's own file. That is
right only when the module sits next to the loader; from an installed package, that location is
inside `node_modules`.

**Returns:** `Promise<Record<string, Function>>` — ABI-translated proxy keyed by camelCase WIT export names, or raw `WebAssembly.Exports` if no `.wit` file is found.

### Type mapping

| WIT type | JS → WASM | WASM → JS |
| --- | --- | --- |
| `s32`, `s64`, `f32`, `f64` | pass as-is | return as-is |
| `bool` | `value ? 1 : 0` | `result !== 0` |
| `string` | UTF-8 encode → `cabi_realloc` → write → pass `(ptr, len)` | export returns an i32 ptr to a callee-allocated `[ptr, len]` pair; read via `DataView`, then call `cabi_post_<name>` |

See [SPEC.md](./SPEC.md) for the full cross-language conformance specification.

### Library modules & I/O (SPEC §10)

The loader consumes **reactor/library** modules (e.g. `wasmtk modc` output). It calls the module's
`_initialize` export once after instantiation if present, and always supplies a minimal built-in
**WASI Preview 1 shim**, so a library that does I/O (e.g. `console.log` → `fd_write`) instantiates even
in the browser. `fd_write` routes stdout→`console.log` and stderr→`console.error`; a pure-compute
library imports nothing and is unaffected.

### `createSingleton(wasmPath, hostCallbacks?)`

Returns an accessor function that loads the WASM instance on the first call and caches it for all subsequent calls.

```javascript
const getMod = createSingleton("./mod.wasm");
const { greet } = await getMod();   // loads on first call
const same = await getMod();        // returns cached instance
```

Appropriate for CLI tools and bounded-call scenarios.

### `InstancePool(wasmPath, hostCallbacks?, size?)`

Pre-instantiates `size` (default: 4) independent WASM instances and manages acquire/release semantics for concurrent workloads.

```javascript
const pool = new InstancePool("./mod.wasm", {}, 4);
const result = await pool.run(mod => mod.compute(42));
```

| Method | Description |
| --- | --- |
| `acquire()` | Check out an instance. Waits if all are in use. |
| `release(instance)` | Return an instance to the pool. |
| `run(fn)` | Acquire, call `fn(instance)`, release — even on throw. |

Appropriate for servers and loop-intensive workloads.

## TypeScript

Full TypeScript support is included. No `@types` package needed.

```typescript
import { wasmImport } from "@jrmarcum/universal-wasm-loader";
import type { HostCallbacks } from "@jrmarcum/universal-wasm-loader";

const callbacks: HostCallbacks = { envMul: (a, b) => (a as number) * (b as number) };
const { scale } = await wasmImport("./mod.wasm", callbacks);
```

## Versioning

This package follows [Semantic Versioning 2.0.0](https://semver.org/). Every bump is gated: the
release tooling compares the public API (`api-surface.json`, generated from the `.d.ts` files and
the `SPEC.md` version) with the previous release, and refuses a bump lower than the change requires.
It also runs the previous release's tests against the new code.

### ⚠️ Breaking Changes

| Version | What changed | How to migrate |
| --- | --- | --- |
| — | No breaking change since the compatibility gate began (1.1.0, 2026-10-12). | — |

## Publishing

This package is published to JSR via GitHub Actions on tag push (`v*`). OIDC provenance is recorded by JSR automatically — no manual token required.

To release a new version: `bun run bump [patch|minor|major]` (raises `version` in `jsr.json`, the
package manifest), then `bun run release`.

## Development

Bun is the development runtime; the code and tests also run on Node and Deno.

```sh
bun install          # dev dependencies (TypeScript, @types/node, @std/assert)
bun run gate         # type check, manifest, API-surface snapshot, browser check, tests on Bun
bun run compat       # API floor since the last release + that release's tests on this code
bun run test:node    # the same tests on Node   (node --test; needs Node on PATH, see below)
bun run test:deno    # the same tests on Deno   (deno test)
bun run lts          # the tests on every current Node LTS line, through fnm
```

When no `node` is on `PATH`, `bun run` substitutes Bun for `node`, so `bun run test:node` would
run Bun (it then fails with "Cannot use describe outside of the test runner"). Put a Node on
`PATH` first, e.g. `fnm exec --using=24 bun run test:node`.
