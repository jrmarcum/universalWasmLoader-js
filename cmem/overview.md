# Overview — universal-wasm-loader

The **JS/TS reference implementation** of the Universal WASM Loader (Project 2 of the polyglot
ecosystem; see `wasmtk`). Published to JSR as `@jrmarcum/universal-wasm-loader` (renamed 2026-06-15
from `@jrmarcum/universalwasmloader-js`; the `deno.json` `name` must exactly equal the JSR package
name or `deno publish` fails). All other language
ports (`-rs`, `-py`, `-go`, `-jvm`, `-c`, `-dotnet`) must match this implementation's behavior and
the cross-language `SPEC.md`.

## What it does

Loads a `.wasm` module like an ESM import, auto-detecting its companion `.wit` and applying the
Canonical ABI so the caller gets a typed JS proxy. Works in Deno, Node 18+, Bun, and browsers.

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

`deno task test` runs `tests/run_tests.js` against fixtures produced by `wasmtk`
(`math_50` / `booleans_50` / `strings_50` / `imports_50`) plus the lifecycle scenarios
(`createSingleton`, `InstancePool`). Current: **24/24**. `strings_50.wasm` was regenerated
2026-06-15 with the new ABI.

## Release flow

`deno.json` version is the package version. `deno task bump [patch|minor|major]` raises it (runs
`sync-version.ts`, a no-op for this single-manifest package); `deno task publish` commits, tags
`vX.Y.Z`, and pushes → the `publish.yml` GitHub Action runs `deno publish` with OIDC provenance.
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

## Producer model + planned capabilities (SPEC §10)

The loader consumes **reactor/library** modules — the `wasmtk modc` shape (no `_start`; `_initialize`
+ named exports). NOT command (`_start`) modules. A pure-compute library imports nothing → loads with
an empty import object (the common case). A library that does I/O imports `wasi_snapshot_preview1`
funcs and needs the host to satisfy them. Two capabilities are specified (SPEC §10) but NOT yet
implemented in this reference loader: (1) call `_initialize` once after instantiation if exported;
(2) an optional **minimal WASI-P1 browser shim** (`fd_write`/`proc_exit`/`random_get`/`clock_time_get`
+ `environ`/`args`/`fd_*` stubs) so I/O-using libraries instantiate in the browser. Add these when a
real I/O-using `modc` library needs consuming.
