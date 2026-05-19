# CLAUDE.md — universalWasmLoader-js

This file is the single source of project context for AI-assisted development. Keep it up to date as the project evolves. **All project memory lives here for portability — do not use external memory files.**

---

## Project Memory

### Architectural decisions (current session)

**ABI migration — wasic removed, Canonical ABI only**
The `"wasic"` ABI profile (Phase 50 bindgen: `__malloc`, `__str_ret_ptr`, `__str_ret_len`) was removed entirely. The only ABI is now the wasmtime Canonical ABI (`cabi_realloc`, out-parameter string returns). This matches the direction of `wasmtk` and the WebAssembly Component Model. The `buildWasicImportEnv` / `buildWasicExportProxy` functions in `abi.js` are gone; `buildComponentImportEnv` / `buildComponentExportProxy` are the sole exports.

**API simplification — no options object**
`wasmImport(path, options)` was replaced with `wasmImport(path, hostCallbacks?)`. The user specifies only the `.wasm` path and, when needed, a flat camelCase object of host import callbacks. WIT detection and ABI selection are fully automatic. This mirrors ES module import ergonomics and was a deliberate design directive. The `"raw"` and `"component"` profile flags are gone.

**Version pinning — `@N` path suffix**
`wasmImport("./mod.wasm@2")` pins to a specific major version. The loader strips `@N` before URL construction, then checks `rawExports["version"].value === N` after instantiation. Throws descriptively on mismatch or missing export. Follows the C shared-library SONAME convention (`libfoo.so.2`). Integer-only — WASM modules export an i32 `version` global, not a semver string.

**Host callbacks — needed for future GUI**
The `hostCallbacks` second argument exists to support WASM modules that call back into JS (DOM, events, render). This is the correct mechanism for future graphical or interactive modules and must remain in the API.

**WIT auto-detection with graceful fallback**
When no `.wit` file is found (404 or network error), the loader silently returns raw `WebAssembly.Exports`. This allows `math.wasm`-style modules with no WIT to continue working without configuration.

### Pending work

- **Test fixtures need recompilation** — `strings_50.wasm`, `booleans_50.wasm`, `imports_50.wasm` were compiled with the old `wasmtk wasic` protocol. They must be recompiled with `wasmtk` targeting the Canonical ABI before `deno task test` will pass on all 18 assertions. `math_50.wasm` works as-is (numeric only, no string encoding path).

### Design principles (binding for all future work)

1. User specifies only: the `.wasm` path, and optionally, flat host callbacks.
2. Both `{ greet, isEven } = await wasmImport(...)` and `m = await wasmImport(...)` must work.
3. No options objects, no ABI flags, no explicit WIT paths — zero configuration.
4. Version pinning via `@N` follows C SONAME convention, not npm semver.
5. `createSingleton` and `InstancePool` share the same minimal signature.
6. See `VISION.md` for the authoritative cross-project design directives.

---

## Project Overview

**Package:** `@jrmarcum/universalwasmloader-js`
**Registry:** [JSR](https://jsr.io/@jrmarcum/universalwasmloader-js)
**Version:** See `deno.json`
**License:** See `LICENSE`

A lightweight, zero-dependency WebAssembly loader. Auto-detects the companion `.wit` file and applies the Canonical ABI (wasmtime). Works in Node.js 18+, Bun, Deno, and all modern browsers without any configuration.

## File Structure

```text
universalWasmLoader-js/
├── universal-wasm-loader.js    # Main entry point — exported by JSR; imports wit-parser + abi
├── universal-wasm-loader.d.ts  # TypeScript declarations for the loader
├── wit-parser.js               # Regex-based WIT parser (no deps)
├── wit-parser.d.ts             # TypeScript declarations for the WIT parser
├── abi.js                      # ABI translation utilities (Canonical ABI / wasmtime profile)
├── abi.d.ts                    # TypeScript declarations for ABI utilities
├── deno.json                   # JSR package manifest (name, version, exports, publish include-list)
├── SPEC.md                     # Cross-language loader specification (published to JSR)
├── VISION.md                   # Design directives for this loader and dependent projects
├── how-to-use.js               # Local usage example (not published)
├── math.wat                    # WebAssembly Text source for the example module
├── math.wasm                   # Compiled binary from math.wat (used in how-to-use.js)
├── publish.yml                 # Empty placeholder at repo root — unused
├── README.md                   # Public-facing documentation published to JSR
├── CLAUDE.md                   # This file — AI/developer project context and memory
├── LICENSE
├── scripts/
│   ├── publish.ts              # deno task publish — tags and pushes to trigger CI
│   └── sync-version.ts         # No-op placeholder; reserved for future version syncing
├── tests/
│   ├── run_tests.js            # Reference test suite (assertions across 4 fixtures)
│   ├── math_50.wasm + .wit     # Numeric round-trip fixture
│   ├── booleans_50.wasm + .wit # Bool normalization fixture
│   ├── strings_50.wasm + .wit  # String param + return fixture (needs recompile)
│   └── imports_50.wasm + .wit  # Host import callback fixture
└── .github/
    └── workflows/
        └── publish.yml         # CI: deno lint → deno publish (OIDC) → release branch → GitHub Release
```

## Architecture

### No-WIT fallback

When no companion `.wit` file is found, `wasmImport` returns raw `WebAssembly.Exports` directly. Falls back from `instantiateStreaming` to `fetch` + `arrayBuffer` for Node.js compatibility.

### Version pinning (`@N` suffix)

`wasmImport("./mod.wasm@2")` — `parseVersionSuffix` strips `@2` before URL construction, then `assertVersion` checks `rawExports["version"].value === 2` after instantiation. Follows C shared-library SONAME major-version convention. Throws with a descriptive message on mismatch or missing export.

### WIT-aware form

`wasmImport(path, hostCallbacks?)` — `hostCallbacks` is a flat camelCase `Record<string, Function>`.

1. Auto-detects the companion `.wit` file (replace `.wasm` → `.wit`); falls back to raw exports if absent
2. `buildComponentImportEnv` — wraps host callbacks with ABI decoding; returns `{ env, memRef }`
3. Instantiates the WASM module with the translated `env` import object
4. Sets `memRef.current` to `instance.exports.memory` (needed for string import decoding)
5. `buildComponentExportProxy` — wraps raw exports with ABI encoding
6. Returns the typed proxy keyed by camelCase WIT export names

The `@ts-self-types` pragma in each JS file links its companion `.d.ts` without a build step.

### WIT parser (`wit-parser.js`)

Regex-based, no dependencies. Parses the format emitted by `wasmtk`:

- `package local:name;` → `packageName`
- `world name { import ...; export ...; }` → `imports[]`, `exports[]`
- Kebab-to-camel for export names (`is-positive` → `isPositive`)
- Kebab-to-underscore for import keys (`env-mul` → `env_mul`)

### ABI utilities (`abi.js`)

One profile — the Canonical ABI (wasmtime):

| WIT type | Export: JS → WASM | Export: WASM → JS |
| --- | --- | --- |
| `s32`, `s64`, `f32`, `f64` | pass as-is | pass as-is |
| `bool` | `v ? 1 : 0` | `r !== 0` |
| `string` | TextEncoder → `cabi_realloc(0,0,1,len)` → write → pass `(ptr, len)` | allocate 8-byte return area via `cabi_realloc(0,0,4,8)`, pass as trailing arg, read `(ptr, len)` via `DataView` |

Import callbacks (WASM → JS) use the inverse: `(ptr, len)` pairs decoded from linear memory via `memRef.current`.

## WIT Name Conventions

- WIT export names are **kebab-case** in source; JS proxy keys are **camelCase** (`is-positive` → `isPositive`)
- WIT import names are **kebab-case** in source; WASM import keys are **underscore** (`env-mul` → `env_mul`)
- User-supplied host callbacks are **camelCase** (`envMul`) — passed as a flat object, not nested

## Example WebAssembly Module (`math.wat`)

The bundled `math.wasm` exports:

- `calculate(a: i32, b: i32) -> i32` — computes `(a * b) + 10`
- `version` — exported i32 global, value `1`

No companion `.wit` — returns raw `WebAssembly.Exports`. The `version` export is a `WebAssembly.Global`; read its value with `.value`.

Run the example locally:

```sh
node how-to-use.js      # Node.js 18+
deno run how-to-use.js  # Deno
bun how-to-use.js       # Bun
```

## Reference Test Suite

Run with: `deno task test`

Four fixture pairs in `tests/` (must be compiled with `wasmtk` targeting the Canonical ABI):

| Fixture | What it tests | Status |
| --- | --- | --- |
| `math_50` | Numeric round-trip (s32, f64) | Ready |
| `booleans_50` | Bool normalization (i32 ↔ boolean) | Ready |
| `strings_50` | String params + returns via `cabi_realloc` / out-parameter | Needs recompile |
| `imports_50` | Host import callbacks via flat env object | Ready |

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
- **Test** — `deno task test` runs the reference suite under Deno. Strings fixture will fail until recompiled with Canonical ABI.
- **JSR package name** — `@jrmarcum/universalwasmloader-js` (matches `deno.json` `name` field). Local filenames use hyphens (`universal-wasm-loader.js`) and are distinct from the registry name.
- **`publish.yml` at repo root** — empty and unused; the real workflow is `.github/workflows/publish.yml`.
- **All project memory** belongs in this file, not in external memory stores.
