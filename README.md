# universalWasmLoader-js

A lightweight, zero-dependency WebAssembly loader for JavaScript, TypeScript, and the Web. Works in **Node.js 18+**, **Bun**, **Deno**, and all **modern browsers** without any configuration or bundler setup.

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

1. Resolves the `.wasm` path relative to the calling module via `import.meta.url`
2. Auto-detects the companion `.wit` file by replacing `.wasm` → `.wit`
3. Applies the Canonical ABI (wasmtime) — bool and string types handled automatically
4. Uses `WebAssembly.instantiateStreaming` for best performance; falls back to `fetch` + `arrayBuffer` for Node.js edge cases
5. Returns an ABI-translated proxy keyed by camelCase WIT export names

If no `.wit` file is found, raw `WebAssembly.Exports` are returned.

## API

### `wasmImport(wasmPath, hostCallbacks?)`

| Parameter | Type | Description |
| --- | --- | --- |
| `wasmPath` | `string \| URL` | Path to the `.wasm` file, resolved relative to the calling module. Append `@N` to pin to a major version. |
| `hostCallbacks` | `Record<string, Function>` | Host functions the WASM module calls into JS. Flat object, camelCase keys. |

**Returns:** `Promise<Record<string, Function>>` — ABI-translated proxy keyed by camelCase WIT export names, or raw `WebAssembly.Exports` if no `.wit` file is found.

### Type mapping

| WIT type | JS → WASM | WASM → JS |
| --- | --- | --- |
| `s32`, `s64`, `f32`, `f64` | pass as-is | return as-is |
| `bool` | `value ? 1 : 0` | `result !== 0` |
| `string` | UTF-8 encode → `cabi_realloc` → write → pass `(ptr, len)` | export returns an i32 ptr to a callee-allocated `[ptr, len]` pair; read via `DataView`, then call `cabi_post_<name>` |

See [SPEC.md](./SPEC.md) for the full cross-language conformance specification.

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

## Publishing

This package is published to JSR via GitHub Actions on tag push (`v*`). OIDC provenance is recorded by JSR automatically — no manual token required.

To release a new version: bump `version` in `deno.json`, then run `deno task publish`.
