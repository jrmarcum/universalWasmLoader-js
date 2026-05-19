# Universal WASM Loader — Cross-Language Specification

Version: 1.1.0  
Status: Draft  
Reference implementation: `@jrmarcum/universalwasmloader-js` (JSR)

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
| `options.abi` | `"wasic"` \| `"component"` \| `"raw"` | `"wasic"` | ABI translation profile. |
| `options.wit` | string or URL | auto-detected | Path to the companion `.wit` file. Not required for `"raw"`. |
| `options.imports` | `{ env?: Record<string, Function> }` | `{}` | Host callbacks matching the WIT `import` section. |

### Backward compatibility

Loaders SHOULD also support a legacy positional form:

```
wasmImport(wasmPath, importObject?) → Promise<RawExports>
```

Where `importObject` is a plain `WebAssembly.Imports`-compatible object. When the second argument contains none of the `abi`, `wit`, or `imports` keys, the loader MUST fall back to this behavior and return raw, untranslated WASM exports.

### Return value

The options-object form returns a typed proxy object whose keys are the camelCase names of the WIT `export` section, with all ABI translation applied. The legacy form and `"raw"` profile return the raw `WebAssembly.Exports` object.

---

## 2. WIT Auto-Detection Path Convention

When `options.wit` is omitted (and `abi` is not `"raw"`), the loader MUST attempt to load the companion `.wit` file by replacing the `.wasm` suffix with `.wit`:

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

Implements the Canonical ABI as produced by `wasmtk` Stage 0+. Requires the WASM module to export `cabi_realloc`.

#### Export wrapper (JS → WASM → JS)

| WIT type | JS → WASM param | WASM return → JS |
|---|---|---|
| `s32` / `s64` / `f32` / `f64` | pass as-is | return as-is |
| `bool` | `value ? 1 : 0` | `result !== 0` |
| `string` | `TextEncoder` → `cabi_realloc(0,0,1,len)` → write bytes → pass `(ptr, len)` | allocate 8-byte return area via `cabi_realloc(0,0,4,8)`, pass as trailing arg, read `(ptr, len)` back via `DataView` (little-endian i32) |

#### Import wrapper (WASM → JS → WASM)

Identical to the `"wasic"` profile — WASM passes `(ptr, len)` pairs for string parameters.

### 3.3 `"raw"` profile

No ABI translation. The user `env` object is passed directly to `WebAssembly.instantiate`, and raw `WebAssembly.Exports` are returned. No WIT file is fetched or parsed. Intended for modules with non-standard or no ABI.

---

## 4. String Encoding Details — `"wasic"` Profile

### String params (export, JS → WASM)

1. Encode the JS string to UTF-8 bytes using `TextEncoder`.
2. Call `__malloc(byteLength)` — exported from the WASM module. Returns an `i32` pointer.
3. Write the bytes into WASM linear memory at that pointer.
4. Pass `(ptr: i32, len: i32)` as two consecutive WASM parameters.

### String returns (export, WASM → JS)

The WASM function's WAT signature returns nothing (`void`). After the call:

1. Read the exported mutable `i32` global `__str_ret_ptr`.
2. Read the exported mutable `i32` global `__str_ret_len`.
3. Decode `memory.buffer[__str_ret_ptr .. __str_ret_ptr + __str_ret_len]` with `TextDecoder`.

### String params (import callbacks, WASM → JS)

When WASM calls a host import with a `string` parameter, it passes `(ptr: i32, len: i32)`. The loader MUST:

1. Have access to WASM linear memory (set the memory reference after instantiation).
2. Read `memory.buffer[ptr .. ptr + len]` and decode with `TextDecoder`.
3. Pass the resulting JS string to the user callback.

---

## 5. String Encoding Details — `"component"` Profile

### String params (export, JS → WASM)

1. Encode the JS string to UTF-8 bytes using `TextEncoder`.
2. Call `cabi_realloc(0, 0, 1, byteLength)` — exported from the WASM module. Returns an `i32` pointer.
3. Write the bytes into WASM linear memory at that pointer.
4. Pass `(ptr: i32, len: i32)` as two consecutive WASM parameters.

### String returns (export, WASM → JS)

1. Allocate an 8-byte return area: `retBuf = cabi_realloc(0, 0, 4, 8)`.
2. Call the WASM function with `retBuf` appended as a trailing argument (out-parameter).
3. Read `retPtr = DataView.getInt32(retBuf, true)` and `retLen = DataView.getInt32(retBuf + 4, true)`.
4. Decode `memory.buffer[retPtr .. retPtr + retLen]` with `TextDecoder`.

### String params (import callbacks, WASM → JS)

Same as the `"wasic"` profile — WASM passes `(ptr: i32, len: i32)`.

---

## 6. Instance Lifecycle

### 6.1 `createSingleton`

```
createSingleton(wasmPath, options?) → () => Promise<ModuleExports>
```

Returns an accessor function that loads the WASM instance on the first call and caches the result for all subsequent calls. The underlying `wasmImport` promise is cached (not the resolved value), so concurrent first-callers all await the same instantiation.

Appropriate for CLI tools and bounded-call scenarios.

### 6.2 `InstancePool`

```
new InstancePool(wasmPath, options?, size?) → InstancePool
```

Pre-instantiates `size` (default: 4) independent WASM instances and manages acquire/release semantics so that no two concurrent callers share the same instance.

| Method | Description |
|---|---|
| `acquire() → Promise<ModuleExports>` | Check out an instance. Waits if all are in use. |
| `release(instance)` | Return an instance to the pool. |
| `run(fn) → Promise<T>` | Acquire, call `fn(instance)`, release — even on throw. |

Appropriate for servers and loop-intensive workloads. Distributing state across N independent linear memories extends longevity under bump allocators.

---

## 7. Conformance Requirements

A port of this loader to another language or runtime MUST:

1. Accept the same logical options shape (§1).
2. Apply WIT auto-detection for `"wasic"` and `"component"` profiles (§2).
3. Implement the `"wasic"` ABI profile exactly as specified (§3.1, §4).
4. Implement the `"component"` ABI profile exactly as specified (§3.2, §5).
5. Implement the `"raw"` profile as specified (§3.3).
6. Expose `createSingleton` and `InstancePool` (or idiomatic equivalents) as specified (§6).
7. Pass the reference test suite (§8) without modification to the fixture `.wasm` files.
8. Preserve backward compatibility for the legacy positional form (§1).

---

## 8. Reference Test Suite

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

### Instance lifecycle

Using any available fixture:

| Scenario | Requirement |
|---|---|
| `createSingleton` called twice | Both calls return the same instance object |
| `InstancePool.run()` | Returns correct result from pooled instance |
| `InstancePool` with `size=2`, 2 concurrent `run()` calls | Both complete without error |

---

## 9. Versioning

This specification follows [Semantic Versioning](https://semver.org/).

- **Patch** — clarifications, typo fixes, no behavior change.
- **Minor** — new optional options fields, new ABI profile stubs. Backward compatible.
- **Major** — breaking changes to the core interface, ABI encoding, or test fixture expectations.

The spec version is independent of the package version in `deno.json`. Changes to the spec that require loader updates MUST bump the spec version.
