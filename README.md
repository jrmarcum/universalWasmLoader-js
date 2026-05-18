# universalWasmLoader

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

```javascript
import { wasmImport } from "@jrmarcum/universal-wasm-loader";

const { calculate, version } = await wasmImport("./math.wasm");

console.log("Result:", calculate(10, 20)); // (10 * 20) + 10 = 210
console.log("Wasm version:", version);
```

### With custom imports

```javascript
import { wasmImport } from "@jrmarcum/universal-wasm-loader";

const importObject = {
  env: {
    memory: new WebAssembly.Memory({ initial: 1 }),
  },
};

const exports = await wasmImport("./my-module.wasm", importObject);
```

## API

### `wasmImport(wasmPath, importObject?)`

| Parameter      | Type                  | Description                                                               |
| -------------- | --------------------- | ------------------------------------------------------------------------- |
| `wasmPath`     | `string \| URL`       | Path or URL to the `.wasm` file. Resolved relative to the calling module. |
| `importObject` | `WebAssembly.Imports` | Optional imports passed to the WebAssembly instance.                      |

**Returns:** `Promise<WebAssembly.Exports>` — the exported members of the instantiated WebAssembly module.

## How It Works

1. Resolves the `.wasm` path relative to the calling module via `import.meta.url`
2. Uses `WebAssembly.instantiateStreaming` for best performance (browsers, Deno, Bun)
3. Falls back to `fetch` + `arrayBuffer` + `WebAssembly.instantiate` for environments where streaming is unavailable
4. Returns `instance.exports` directly — destructure named exports just like ESM imports

## TypeScript

Full TypeScript support is included. No `@types` package needed.

```typescript
import { wasmImport } from "@jrmarcum/universal-wasm-loader";

const exports: WebAssembly.Exports = await wasmImport("./module.wasm");
```

## Publishing

This package is published to JSR via GitHub Actions on every push to `main`. Each release is attested with [build provenance](https://docs.github.com/en/actions/security-guides/using-artifact-attestations-to-establish-provenance-for-builds) for supply-chain security.

To release a new version, bump `version` in `deno.json` and push to `main`.
