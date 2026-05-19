# CLAUDE.md — universalWasmLoader-js

This file is the single source of project context for AI-assisted development. Keep it up to date as the project evolves.

## Project Overview

**Package:** `@jrmarcum/universalwasmloader-js`  
**Registry:** [JSR](https://jsr.io/@jrmarcum/universalwasmloader-js)  
**Version:** See `deno.json`  
**License:** See `LICENSE`

A lightweight, zero-dependency WebAssembly loader. Supports both a legacy raw-exports form and a WIT-aware ABI-translated form. Works in Node.js 18+, Bun, Deno, and all modern browsers without any configuration.

## File Structure

```text
universalWasmLoader-js/
├── universal-wasm-loader.js    # Main entry point — exported by JSR; imports wit-parser + abi
├── universal-wasm-loader.d.ts  # TypeScript declarations for the loader
├── wit-parser.js               # Regex-based WIT parser (no deps)
├── wit-parser.d.ts             # TypeScript declarations for the WIT parser
├── abi.js                      # ABI translation utilities (wasic profile + component stub)
├── abi.d.ts                    # TypeScript declarations for ABI utilities
├── deno.json                   # JSR package manifest (name, version, exports, publish include-list)
├── SPEC.md                     # Cross-language loader specification (published to JSR)
├── VISION.md                   # Pointer to ecosystem vision (wasmtk repo)
├── how-to-use.js               # Local usage example (not published)
├── math.wat                    # WebAssembly Text source for the example module
├── math.wasm                   # Compiled binary from math.wat (used in how-to-use.js)
├── publish.yml                 # Empty placeholder at repo root — unused
├── README.md                   # Public-facing documentation published to JSR
├── CLAUDE.md                   # This file — AI/developer project context
├── LICENSE
├── scripts/
│   ├── publish.ts              # deno task publish — tags and pushes to trigger CI
│   └── sync-version.ts         # No-op placeholder; reserved for future version syncing
├── tests/
│   ├── run_tests.js            # Reference test suite (18 assertions across 4 fixtures)
│   ├── math_50.wasm + .wit     # Numeric round-trip fixture
│   ├── booleans_50.wasm + .wit # Bool normalization fixture
│   ├── strings_50.wasm + .wit  # String param + return fixture
│   └── imports_50.wasm + .wit  # Host import callback fixture
└── .github/
    └── workflows/
        └── publish.yml         # CI: deno lint → deno publish (OIDC) → release branch → GitHub Release
```

## Architecture

### Legacy form

`wasmImport(path)` / `wasmImport(path, importObject)` — resolves and instantiates a `.wasm` file, returns raw `WebAssembly.Exports`. Falls back from `instantiateStreaming` to `fetch` + `arrayBuffer` for Node.js compatibility. Triggered when the second argument is absent or contains none of `abi`, `wit`, `imports`.

### WIT-aware form

`wasmImport(path, { abi, wit, imports })` — detected via `isOptionsObject()`.

1. Fetches and parses the companion `.wit` file (auto-detected: replace `.wasm` → `.wit`)
2. `buildWasicImportEnv` — wraps host callbacks with ABI decoding; returns `{ env, memRef }`
3. Instantiates the WASM module with the translated `env` import object
4. Sets `memRef.current` to `instance.exports.memory` (needed for string import decoding)
5. `buildWasicExportProxy` — wraps raw exports with ABI encoding
6. Returns the typed proxy keyed by camelCase WIT export names

The `@ts-self-types` pragma in each JS file links its companion `.d.ts` without a build step.

### WIT parser (`wit-parser.js`)

Regex-based, no dependencies. Parses the format emitted by `wasmtk`:

- `package local:name;` → `packageName`
- `world name { import ...; export ...; }` → `imports[]`, `exports[]`
- Kebab-to-camel for export names (`is-positive` → `isPositive`)
- Kebab-to-underscore for import keys (`env-mul` → `env_mul`)

### ABI utilities (`abi.js`)

Two profiles:

| Profile | Status | Description |
| --- | --- | --- |
| `"wasic"` | Stable | Matches `wasmtk` Phase 50 bindgen exactly |
| `"component"` | Stub | Throws — reserved for Canonical ABI when wasmtk Stage 0 completes |

**wasic encoding:**

| WIT type | Export: JS → WASM | Export: WASM → JS |
| --- | --- | --- |
| `s32`, `s64`, `f32`, `f64` | pass as-is | pass as-is |
| `bool` | `v ? 1 : 0` | `r !== 0` |
| `string` | TextEncoder → `__malloc(len)` → write → pass `(ptr, len)` | call fn (void), read `__str_ret_ptr` + `__str_ret_len` globals |

Import callbacks (WASM → JS) use the inverse: `(ptr, len)` pairs decoded from linear memory via `memRef.current`.

## WIT Name Conventions

- WIT export names are **kebab-case** in source; JS proxy keys are **camelCase** (`is-positive` → `isPositive`)
- WIT import names are **kebab-case** in source; WASM import keys are **underscore** (`env-mul` → `env_mul`)
- User-supplied import callbacks in `imports.env` must use **camelCase** (`envMul`)

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

## Reference Test Suite

Run with: `deno task test`

Four fixture pairs in `tests/` (compiled with `wasmtk modc`, Phase 50 bindgen):

| Fixture | What it tests |
| --- | --- |
| `math_50` | Numeric round-trip (s32, f64) |
| `booleans_50` | Bool normalization (i32 ↔ boolean) |
| `strings_50` | String params + returns via `__str_ret_ptr`/`__str_ret_len` |
| `imports_50` | Host import callbacks via `env` object |

## Publishing Workflow

Triggered by pushing a `v*` tag. The workflow (`.github/workflows/publish.yml`) uses only `run:` steps — no external actions — to satisfy the org-level policy that all actions must be owned by `jrmarcum`:

1. `git clone --depth=1 --branch TAG` with `x-access-token` auth (replaces `actions/checkout`)
2. `curl deno.land/install.sh | sh` (replaces `denoland/setup-deno`)
3. `deno lint` — must pass
4. `deno publish` — OIDC provenance recorded by JSR via `id-token: write`; no manual token needed
5. Create `release/${TAG}` branch and push
6. `gh release create` with auto-generated notes

**To release a new version:** bump `version` in `deno.json`, then run `deno task publish`. The script commits if needed, creates/replaces the tag, and pushes both — GitHub Actions handles the rest.

## JSR Publish Include List

Defined in `deno.json`. Only these files are published:

- `universal-wasm-loader.js` + `universal-wasm-loader.d.ts`
- `wit-parser.js` + `wit-parser.d.ts`
- `abi.js` + `abi.d.ts`
- `README.md`
- `SPEC.md`

Not published: `CLAUDE.md`, `VISION.md`, `how-to-use.js`, `math.wat`, `math.wasm`, `tests/`, `scripts/`, `.github/`, `publish.yml` (root).

## Development Notes

- **No build step** — all JS files are the source of truth; edit them directly.
- **Lint before push** — `deno lint` enforces JSR compliance (JSDoc on exports, no implicit `any`). Run locally before every commit.
- **Test** — `deno task test` runs the 18-assertion reference suite under Deno.
- **JSR package name** — `@jrmarcum/universalwasmloader-js` (matches `deno.json` `name` field). Local filenames use hyphens (`universal-wasm-loader.js`) and are distinct from the registry name.
- **`publish.yml` at repo root** — empty and unused; the real workflow is `.github/workflows/publish.yml`.
