# universalWasmLoader-js

A lightweight, zero-dependency WebAssembly loader for JavaScript, TypeScript, and the Web. Works in **Node.js 18+**, **Bun**, **Deno**, and all **modern browsers** without any configuration or bundler setup.

Published to JSR with full build provenance for enhanced supply-chain security.

## Installation

Install via [JSR](https://jsr.io/@jrmarcum/universalwasmloader-js):

**Deno:**

```sh
deno add jsr:@jrmarcum/universalwasmloader-js
```

**npm:**

```sh
npx jsr add @jrmarcum/universalwasmloader-js
```

**Bun:**

```sh
bunx jsr add @jrmarcum/universalwasmloader-js
```

**pnpm:**

```sh
pnpm dlx jsr add @jrmarcum/universalwasmloader-js
```

**Yarn:**

```sh
yarn dlx jsr add @jrmarcum/universalwasmloader-js
```

**vlt:**

```sh
vlt install jsr:@jrmarcum/universalwasmloader-js
```

## Usage

### Legacy form — raw exports

```javascript
import { wasmImport } from "@jrmarcum/universalwasmloader-js";

const { calculate, version } = await wasmImport("./math.wasm");

console.log("Result:", calculate(10, 20)); // (10 * 20) + 10 = 210
console.log("Wasm version:", version);
```

### WIT-aware form — ABI-translated proxy

Pair a `.wasm` with its companion `.wit` file (auto-detected by replacing `.wasm` → `.wit`) and get a fully ABI-translated proxy back. Bool and string types are handled automatically — no manual encoding needed.

```javascript
import { wasmImport } from "@jrmarcum/universalwasmloader-js";

// Loads ./greet.wasm + auto-detects ./greet.wit
const m = await wasmImport("./greet.wasm", { abi: "wasic" });

console.log(m.greet("World")); // "Hello, World!"  (string ↔ ptr/len handled internally)
console.log(m.isEven(4));     // true              (i32 → bool normalised)
```

### With host import callbacks

When your WASM module imports functions from the host environment, pass them via `imports.env`. The loader maps WIT kebab-case names (`env-mul`) to camelCase JS keys (`envMul`) automatically.

```javascript
const m = await wasmImport("./math.wasm", {
  abi: "wasic",
  imports: {
    env: {
      envMul: (a, b) => a * b,
      envAdd: (a, b) => a + b,
    },
  },
});

console.log(m.scale(3.0, 4.0)); // 12.0
```

### Explicit WIT path

```javascript
const m = await wasmImport("./build/module.wasm", {
  abi: "wasic",
  wit: "./types/module.wit",
});
```

## API

### `wasmImport(wasmPath, options?)`

**Options-object form** — returns an ABI-translated typed proxy.

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `options.abi` | `"wasic"` \| `"component"` | `"wasic"` | ABI translation profile. |
| `options.wit` | `string \| URL` | auto-detected | Path to the `.wit` file (replaces `.wasm` suffix when omitted). |
| `options.imports` | `{ env?: Record<string, Function> }` | `{}` | Host callbacks matching the WIT `import` section. |

**Returns:** `Promise<Record<string, Function>>` — ABI-translated proxy keyed by camelCase WIT export names.

**Legacy positional form** — returns raw `WebAssembly.Exports`.

```javascript
wasmImport(wasmPath, importObject?)
```

The loader uses the legacy form when the second argument contains none of `abi`, `wit`, or `imports`.

### ABI profiles

| Profile | Status | Description |
| --- | --- | --- |
| `"wasic"` | Stable | Matches `wasmtk wasic` / `wasmtk modc` Phase 50 bindgen. Default. |
| `"component"` | Stub | Canonical ABI — throws until wasmtk Stage 0 completes. |

### Type mapping — `"wasic"` profile

| WIT type | JS → WASM | WASM → JS |
| --- | --- | --- |
| `s32`, `s64`, `f32`, `f64` | pass as-is | return as-is |
| `bool` | `value ? 1 : 0` | `result !== 0` |
| `string` | UTF-8 encode → `__malloc` → write → pass `(ptr, len)` | call fn, read `__str_ret_ptr` / `__str_ret_len` globals |

See [SPEC.md](./SPEC.md) for the full cross-language conformance specification.

## How It Works

1. Resolves the `.wasm` path relative to the calling module via `import.meta.url`
2. Fetches and parses the companion `.wit` file (options-object form only)
3. Builds ABI translation wrappers for imports and exports
4. Uses `WebAssembly.instantiateStreaming` for best performance (browsers, Deno, Bun); falls back to `fetch` + `arrayBuffer` + `WebAssembly.instantiate` for Node.js edge cases
5. Returns an ABI-translated proxy (options form) or raw `instance.exports` (legacy form)

## TypeScript

Full TypeScript support is included. No `@types` package needed.

```typescript
import { wasmImport } from "@jrmarcum/universalwasmloader-js";
import type { WasmImportOptions } from "@jrmarcum/universalwasmloader-js";

// Legacy form
const raw: WebAssembly.Exports = await wasmImport("./module.wasm");

// WIT-aware form
const opts: WasmImportOptions = { abi: "wasic" };
const m = await wasmImport("./module.wasm", opts);
```

## Publishing

This package is published to JSR via GitHub Actions on tag push (`v*`). OIDC provenance is recorded by JSR automatically — no manual token required.

To release a new version: bump `version` in `deno.json`, then run `deno task publish`.
