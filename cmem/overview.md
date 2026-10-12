# Overview — universal-wasm-loader

The **JS/TS reference implementation** of the Universal WASM Loader (Project 2 of the polyglot
ecosystem; see `wasmtk`). Published to JSR as `@jrmarcum/universal-wasm-loader` (renamed 2026-06-15
from `@jrmarcum/universalwasmloader-js`; the manifest `name` — `jsr.json` since the 2026-10-12 Bun
migration, `deno.json` before — must exactly equal the JSR package name or `deno publish` fails). All other language
ports (`-rs`, `-py`, `-go`, `-jvm`, `-c`, `-dotnet`) must match this implementation's behavior and
the cross-language `SPEC.md`.

## What it does

Loads a `.wasm` module like an ESM import, auto-detecting its companion `.wit` and applying the
Canonical ABI so the caller gets a typed JS proxy. Works in Deno, Node 22.18+, Bun, and browsers
(Node with local files only since the 2026-10-12 `file:` URL fix — see [bun-migration.md](bun-migration.md)).

## Public surface (`universal-wasm-loader.js`)

- **`wasmImport(wasmPath, hostCallbacks?)`** — instantiate + return a proxy keyed by the WIT export
  names. Auto-detects `<path>.wit`; falls back to raw `WebAssembly.Exports` if absent. Supports an
  optional `@N` version-pin suffix (checked against the module's exported `version` global).
- **`createSingleton(wasmPath, hostCallbacks?)`** — caches the load promise; returns the same
  instance on every call (CLI / bounded-call pattern).
- **`InstancePool(wasmPath, hostCallbacks?, size=4)`** — `acquire()` / `release()` / `run(fn)` over
  N independent instances (server / high-throughput pattern; distributes bump-allocator memory).

Internal modules: `wit-parser.js` (parse `.wit` → imports/exports), `abi.js`
(`buildComponentImportEnv` / `buildComponentExportProxy` — the ABI marshalling).

## ABI implemented (Canonical, wasmtime profile)

Numerics pass through; `bool` is `v?1:0` / `r!==0`; string PARAMS flatten to `(ptr,len)` via
`cabi_realloc`. **String RETURNS use the canonical callee-allocated convention (aligned 2026-06-15,
SPEC 3.0.0):** the export returns an i32 pointer to a callee-allocated `[ptr,len]` pair; the loader
reads it via `DataView`, decodes, then calls the paired **`cabi_post_<name>(retPtr)`** export. This
replaced the old caller-allocated out-parameter convention. The change lives in `abi.js`
`buildComponentExportProxy`. See [[abi-notes]] if added later.

## Conformance / SPEC

`SPEC.md` is the cross-language contract; currently **v3.0.0** (the 3.0.0 major bump WAS the
return-convention change above — breaking vs. 2.x). Other-language ports predate this and must be
re-aligned to SPEC 3.0.0.

## Tests

`bun run test` (also `test:node`, `test:deno`) runs `tests/loader.test.js` (`node:test` +
`@std/assert`, since 2026-10-12; `tests/run_tests.js` before) against fixtures produced by `wasmtk`
(`math_50` / `booleans_50` / `strings_50` / `imports_50` / `wasi_io_50`, plus the hand-written
`init_check`) and the lifecycle scenarios (`createSingleton`, `InstancePool`). Current (2026-10-12):
**26 assertions in 24 tests, 24/24 on Bun 1.4.3, Node 22 + 24, Deno 2.9.7**. `strings_50.wasm` was
regenerated 2026-06-15 with the new ABI.

## Release flow

`jsr.json` version is the package version (since 2026-10-12; `deno.json` before). `bun run bump
[patch|minor|major]` raises it; `bun run release` commits, tags `vX.Y.Z`, and pushes → the
`publish.yml` GitHub Action runs the Bun gate, then `deno publish` with OIDC provenance, then checks
`rekorLogId` on `api.jsr.io`.
Provenance requires the GitHub OIDC token to reach the runner — the workflow has an
"Check OIDC availability" diagnostic step (added 2026-06-15, mirroring wasmtk) because that org's
OIDC was found to be environmentally gated.

**`publish.yml` MUST use only `run:` steps — never `uses:` (third-party actions).** This org's Actions
policy permits only actions owned by `jrmarcum`; any `uses: actions/checkout` / `uses: denoland/setup-deno`
makes the run end in `startup_failure` (no step executes, so nothing reaches JSR even though the local
`deno task publish` still creates the tag/release — making it look "published on GitHub" but absent on
JSR). The v1.0.6 tag hit exactly this when the workflow was briefly switched to external actions
(2026-06-15); reverted to `git clone` + curl-install-Deno `run:` steps. The triggering workflow file is
the one **at the tagged commit**, so the tag must point at a commit that already contains a `run:`-only
`publish.yml`.

**Published:** `@jrmarcum/universal-wasm-loader@1.0.8` is live on JSR — **score 100**
(`hasProvenance: true`, `percentageDocumentedSymbols: 1.0`). The `run:`-only workflow delivered
provenance cleanly.

## Producer model + SPEC §10 capabilities (IMPLEMENTED 2026-06-15)

The loader consumes **reactor/library** modules — the `wasmtk modc` shape (no `_start`; `_initialize`
+ named exports). NOT command (`_start`) modules. Both SPEC §10 capabilities are now **implemented**:

1. **`_initialize`** — `callInitialize()` in `universal-wasm-loader.js` calls the export once after
   instantiation (both the WIT and raw-exports paths), if present. (`wasmtk modc` doesn't currently
   emit `_initialize`, but other reactor producers — Rust/Zig/TinyGo — do; guarded, so it's a no-op
   otherwise.) Tested via the hand-written `tests/init_check.wasm` (its `_initialize` sets a global to
   99 that `getValue` reads back).
2. **WASI-P1 shim** — `wasi.js` `buildWasiShim(memRef)` is always merged into the import object as
   `wasi_snapshot_preview1` (unused namespace is ignored, so pure-compute modules are unaffected).
   Covers `fd_write` (stdout→`console.log` / stderr→`console.error`), `proc_exit` (throws),
   `random_get`, `clock_time_get`, and `environ`/`args`/`fd_*` stubs. Reads/writes memory via a
   `memRef` set after instantiation. Tested via `tests/wasi_io_50.wasm` (a `modc` library that calls
   `console.log` → imports `fd_write`; without the shim it would fail to instantiate). Suite now 26/26.

`wasi.js`/`wasi.d.ts` added to the publish include-list (now in `jsr.json`). The public API is unchanged
(`buildWasiShim` is internal). **Other ports SHOULD mirror both** (SPEC §10). Next publish: minor bump
(additive) — `bun run bump minor`.
