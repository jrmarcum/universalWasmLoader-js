# CLAUDE.md — universalWasmLoader-js

This file is the single source of project context for AI-assisted development. Keep it up to date as the project evolves.

## Project Overview

**Package:** `@jrmarcum/universal-wasm-loader`  
**Registry:** [JSR](https://jsr.io/@jrmarcum/universal-wasm-loader)  
**Version:** 1.0.1 (see `deno.json`)  
**License:** See `LICENSE`

A lightweight, zero-dependency WebAssembly loader that mimics ESM `import` behavior. Works in Node.js 18+, Bun, Deno, and all modern browsers without any configuration.

## File Structure

```
universalWasmLoader-js/
├── universal-wasm-loader.js    # Main library — the only published source file
├── universal-wasm-loader.d.ts  # TypeScript declarations for the loader
├── deno.json                   # JSR package manifest (name, version, exports, publish include-list)
├── how-to-use.js               # Local usage example (not published)
├── math.wat                    # WebAssembly Text source for the example module
├── math.wasm                   # Compiled binary from math.wat (used in how-to-use.js)
├── publish.yml                 # Empty placeholder (unused)
├── README.md                   # Public-facing documentation published to JSR
├── CLAUDE.md                   # This file — AI/developer project context
├── LICENSE
└── .github/
    └── workflows/
        └── publish.yml         # CI: lints with `deno lint`, publishes via `npx jsr publish`, attests build provenance
```

## Architecture

The loader (`universal-wasm-loader.js`) resolves the `.wasm` path relative to the calling module using `import.meta.url`, then:

1. Tries `WebAssembly.instantiateStreaming` (fastest — browsers, Deno, Bun)
2. Falls back to `fetch` + `arrayBuffer` + `WebAssembly.instantiate` (Node.js edge cases)
3. Returns `instance.exports` directly so callers destructure exports like ESM named imports

The `@ts-self-types` pragma at the top of the JS file links the `.d.ts` without a build step.

## Example WebAssembly Module (`math.wat`)

The bundled `math.wasm` exports:
- `calculate(a: i32, b: i32) -> i32` — computes `(a * b) + 10`
- `version` — exported i32 global, value `1`

Run the example locally:
```sh
node how-to-use.js      # Node.js 18+
deno run how-to-use.js  # Deno
bun how-to-use.js       # Bun
```

## Publishing Workflow

Publishes are triggered automatically on every push to `main` via GitHub Actions (`.github/workflows/publish.yml`):

1. Checkout
2. Set up Deno v2
3. `deno lint` — must pass before publish
4. `npx jsr publish` — publishes to JSR using OIDC (no token needed; `id-token: write` permission)
5. `actions/attest-build-provenance` — attests provenance for supply-chain security

**To release a new version:** bump `version` in `deno.json`, commit, and push to `main`.

## JSR Publish Include List

Only these files are published to JSR (defined in `deno.json`):
- `universal-wasm-loader.js`
- `universal-wasm-loader.d.ts`
- `README.md`

The example files, `.wat`/`.wasm`, and workflow files are intentionally excluded.

## Development Notes

- No build step — the JS file is the source of truth; edit it directly.
- No test runner — `how-to-use.js` serves as a manual smoke test.
- JSR requires JSDoc on exports for type inference; the existing `@param`/`@returns` tags satisfy this.
- The `deno lint` step enforces JSR compliance (no `any`, explicit return types, etc.) — check locally with `deno lint` before pushing.
- `publish.yml` at the repo root is empty and unused; the real workflow is under `.github/workflows/`.
