# Universal WASM Loader — Cross-Language Specification

Version: 1.0.0  
Status: Draft  
Reference implementation: `@jrmarcum/universal-wasm-loader` (JSR)

---

## 1. Core Interface and Options Shape

Every conformant loader MUST export a single entry point called `wasmImport` (or the idiomatic equivalent in the target language) with the following logical signature:

```
wasmImport(wasmPath, options?) → Promise<ModuleExports>
```

### Parameters

| Field | Type | Default | Description |
|---|---|---|---|
| `wasmPath` | string or URL | — | Path to the `.wasm` file, resolved relative to the calling module. |
| `options.abi` | `"wasic"` \| `"component"` | `"wasic"` | ABI translation profile. |
| `options.wit` | string or URL | auto-detected | Path to the companion `.wit` file. |
| `options.imports` | `{ env?: Record<string, Function> }` | `{}` | Host callbacks matching the WIT `import` section. |

### Backward compatibility

Loaders SHOULD also support a legacy positional form:

```
wasmImport(wasmPath, importObject?) → Promise<RawExports>
```

Where `importObject` is a plain `WebAssembly.Imports`-compatible object. When the second argument contains none of the `abi`, `wit`, or `imports` keys, the loader MUST fall back to this behavior and return raw, untranslated WASM exports.

### Return value

The options-object form returns a typed proxy object whose keys are the camelCase names of the WIT `export` section, with all ABI translation applied. The legacy form returns the raw `WebAssembly.Exports` object.

---

## 2. WIT Auto-Detection Path Convention

When `options.wit` is omitted, the loader MUST attempt to load the companion `.wit` file by replacing the `.wasm` suffix with `.wit`:

```
./math.wasm  →  ./math.wit
```

Resolution is relative to `wasmPath`. If the `.wit` file cannot be fetched (e.g. 404), the loader MUST throw an error with a descriptive message.

---

## 3. ABI Profiles

### 3.1 `"wasic"` profile

The default profile. Matches the encoding emitted by `wasmtk wasic` / `wasmtk modc` (Phase 50 bindgen).

#### Export wrapper (JS → WASM → JS)

For each WIT `export`:

| WIT type | JS → WASM param | WASM return → JS |
|---|---|---|
| `s32` | pass as-is (number) | return as-is |
| `s64` | pass as-is (bigint) | return as-is |
| `f32` | pass as-is (number) | return as-is |
| `f64` | pass as-is (number) | return as-is |
| `bool` | `value ? 1 : 0` | `result !== 0` |
| `string` | `TextEncoder` → `__malloc(len)` → write bytes → pass `(ptr, len)` | call fn (void return), then read `__str_ret_ptr` + `__str_ret_len` globals |

#### Import wrapper (WASM → JS → WASM)

For each WIT `import`, the loader builds a WASM-callable function registered under the `env` namespace using the underscore-converted name (e.g. WIT `env-mul` → WASM key `env_mul`):

| WIT type | WASM raw arg → JS call arg |
|---|---|
| `s32` / `f64` / numeric | pass as-is |
| `bool` | `rawArg !== 0` |
| `string` | read `(ptr, len)` pair from WASM call stack, decode with `TextDecoder` from linear memory |

Return values from host callbacks follow the same encoding as export params in reverse.

### 3.2 `"component"` profile

Reserved. MUST NOT be invoked; MUST throw a descriptive `Error` indicating the profile is not yet implemented.

---

## 4. String Encoding Details — `"wasic"` Profile

### String params (export, JS → WASM)

1. Encode the JS string to UTF-8 bytes using `TextEncoder`.
2. Call `__malloc(byteLength)` — exported from the WASM module. This is a bump allocator that returns a `i32` pointer.
3. Write the bytes into WASM linear memory at that pointer.
4. Pass `(ptr: i32, len: i32)` as two consecutive WASM parameters.

The WASM module exports `__malloc` whenever any exported function has a `string` parameter.

### String returns (export, WASM → JS)

The WASM function's WAT signature returns nothing (`void`). After the call completes:

1. Read the exported mutable `i32` global `__str_ret_ptr`.
2. Read the exported mutable `i32` global `__str_ret_len`.
3. Decode `memory.buffer[__str_ret_ptr .. __str_ret_ptr + __str_ret_len]` with `TextDecoder`.

The WASM module exports `__str_ret_ptr` and `__str_ret_len` whenever any exported function returns `string`.

### String params (import callbacks, WASM → JS)

When WASM calls a host import with a `string` parameter, it passes `(ptr: i32, len: i32)`. The loader MUST:

1. Have access to WASM linear memory (set the memory reference after instantiation).
2. Read `memory.buffer[ptr .. ptr + len]` and decode with `TextDecoder`.
3. Pass the resulting JS string to the user callback.

---

## 5. Conformance Requirements

A port of this loader to another language or runtime MUST:

1. Accept the same logical options shape (§1).
2. Apply WIT auto-detection (§2).
3. Implement the `"wasic"` ABI profile exactly as specified (§3, §4), matching the encoding produced by `wasmtk wasic`.
4. Stub `"component"` with a clear not-implemented error.
5. Pass the reference test suite (§6) without modification to the fixture `.wasm` files.
6. Preserve backward compatibility for the legacy positional form (§1).

---

## 6. Reference Test Suite

Fixture files are in `tests/`. Each fixture consists of a `.wasm` binary and a companion `.wit` produced by `wasmtk modc`.

### math_50 — numeric round-trip

Fixture: `tests/math_50.wasm` + `tests/math_50.wit`

| Call | Expected return |
|---|---|
| `add(3, 4)` | `7` |
| `multiply(2.5, 4.0)` | `10.0` |
| `square(5)` | `25` |

### booleans_50 — bool normalization

Fixture: `tests/booleans_50.wasm` + `tests/booleans_50.wit`

| Call | Expected return |
|---|---|
| `isPositive(1.0)` | `true` |
| `isPositive(-1.0)` | `false` |
| `inRange(5.0, 0.0, 10.0)` | `true` |
| `inRange(11.0, 0.0, 10.0)` | `false` |
| `isEven(4)` | `true` |
| `isEven(3)` | `false` |

### strings_50 — string param + return via `__str_ret_ptr`/`__str_ret_len`

Fixture: `tests/strings_50.wasm` + `tests/strings_50.wit`

| Call | Expected return |
|---|---|
| `greet("World")` | `"Hello, World!"` |
| `shout("hi")` | `"hihi"` |
| `strLen("hello")` | `5` |

### imports_50 — host import callbacks

Fixture: `tests/imports_50.wasm` + `tests/imports_50.wit`

Host env: `{ envMul: (a, b) => a * b, envAdd: (a, b) => a + b }`

| Call | Expected return |
|---|---|
| `scale(3.0, 4.0)` | `12.0` |
| `combine(10, 7)` | `17` |

---

## 7. Versioning

This specification follows [Semantic Versioning](https://semver.org/).

- **Patch** — clarifications, typo fixes, no behavior change.
- **Minor** — new optional options fields, new ABI profile stubs. Backward compatible.
- **Major** — breaking changes to the core interface, ABI encoding, or test fixture expectations.

The spec version is independent of the package version in `deno.json`. Changes to the spec that require loader updates MUST bump the spec version.
