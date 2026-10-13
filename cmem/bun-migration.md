# Bun migration — off Deno, still on JSR (2026-10-12)

**Why:** the Deno team joined Cloudflare (announced 2026-10-09); runtime development ends around
2027-10, JSR stays. **Owner (2026-10-12): code that runs on Bun AND Node, Bun as the main runtime;
JSR stays the source of the package.** The cross-package guide is binaryang's
`cmem/jsr-deno-exit-guide.md` (read-only from here; F-numbers below are its findings).

## What changed (branch `bun-migration`)

| Area | Before | After |
| --- | --- | --- |
| Manifest | `deno.json` (name, version, exports, publish, tasks) | **`jsr.json`** is the one manifest; `deno.json` deleted (F1 — so `deno publish` finds `jsr.json` with no `--config`) |
| Tasks | `deno task …` | `package.json` scripts run by `bun run …` (`test`, `test:node`, `test:deno`, `check`, `manifest`, `browser`, `lts`, `lint`, `gate`, `bump`, `release`, `publish:dry`) |
| Dev deps | none | `typescript` 7.0.2, `@types/node` ~22.18.0 (the Node floor), `@std/assert` via `npm:@jsr/std__assert` + `.npmrc`; `bun.lock` committed |
| Type check | `deno publish`'s own check | `tsc -p tsconfig.json` over the published `.d.ts` + `scripts/`; `types: ["node"]` so a `Bun.*` API fails it |
| Tests | `tests/run_tests.js`, a plain script, 26 assertions | `tests/loader.test.js` on `node:test` + `@std/assert`: the same 26 assertions as **24 tests** (two pairs are one sequence each). Runs unchanged under `bun test`, `node --test`, `deno test` |
| Scripts | `Deno.*` | `node:` builtins only (run on Bun, Node, Deno). `sync-version.ts` (a no-op) deleted — one manifest, nothing to sync |
| CI | publish job only, `deno lint` | `ci.yml`: gates (tsc, manifest, browser, Bun tests, deno lint, publish dry run) + runtimes matrix (Node 22.18 floor, 22, 24, Bun 1.4.3, Deno 2.x). `publish.yml`: Bun gate first, then `deno publish` DIRECTLY (F2), then the `rekorLogId` provenance check |
| CI form | `run:` steps only | **still `run:` steps only** — this org's policy (see [overview.md](overview.md)); Bun via `bun.sh/install`, Node via the fnm install script, Deno via `deno.land/install.sh` |

## A real bug the migration surfaced: the loader never worked on Node with local files

Measured 2026-10-12, before the change: `node tests/run_tests.js` on Node 24.21.0 threw at the
FIRST load. Node's `fetch` rejects `file:` URLs, the `.wit` probe swallowed that as "no WIT", and
the `.wasm` fetch then threw. The README claimed "Node.js 18+" all along. Bun and Deno passed
26/26 because their `fetch` reads `file:` URLs.

**Fix (`universal-wasm-loader.js` `readFileUrl`):** a `file:` URL on a host with `process` is read
with `node:fs/promises`, imported DEFERRED inside the function, so the module still loads in a
browser. A missing `.wit` file (`ENOENT`) is "no WIT" exactly as a 404 is; any other read error
now throws instead of falling back. A missing `.wasm` file throws `wasmImport: file not found`.
After: 26/26 on Deno 2.9.7, Bun 1.4.3, Node 22.23.3 and Node 24.21.0. Patch-level; NOT released.

**Claim changed:** README + JSDoc now say **Node.js 22.18+** (the tested floor: the current LTS
lines are 22 and 24 on 2026-10-12, and 22.18 is the floor binaryang uses for type stripping). 18
and 20 are past end of life and were never actually working for local files.

## Checks, each inverted (2026-10-12)

- **Tests:** `add(3,4)` expected 8 → Bun 23 pass / 1 fail, Node 24 23/1, Deno "Test failed"; all
  exit 1. Reverted.
- **`bun run manifest`:** a `deno.json` carrying `"version"` → exit 1, names it.
- **`bun run check`:** a script calling `Bun.file()` → `TS2868 Cannot find name 'Bun'`.
- **`bun run browser`:** ⚠️ **the bundle check ALONE MISSED a top-level
  `import { readFile } from "node:fs/promises"`**: Bun 1.4.3's browser target replaces it with
  `var { readFile } = (() => ({}))` — it builds and holds no `node:` import. So the script also
  reads every shipped `.js` in `publish.include` as SOURCE (top-level `node:` import or re-export;
  `Deno.` / `Bun.` outside a comment line). Both mutants are then caught, the comment line is not.
  **binaryang's `check-browser.ts` has the same blind spot for `node:fs*`** — reported to the
  owner/workspace, not written there.
- **`bun run lts`:** v22 24/24, v24 24/24 (lines read from Node's schedule.json).

## Trap: `bun run test:node` with no Node on PATH runs BUN

Measured 2026-10-12 (this machine: Node only through fnm, nothing on PATH): `bun run` maps
`node` to Bun, so `node --test …` ran under Bun and failed with "Cannot use describe outside of the
test runner". It fails loudly, so it cannot pass by mistake. With a Node on PATH
(`fnm exec --using=24 bun run test:node`) it is 24/24. CI's Node legs call
`fnm exec … node --test` directly, never through `bun run`.

## `deno lint` and `no-sloppy-imports` (🔁 superseded 2026-10-13: Biome replaced `deno lint`, [linting.md](linting.md))

In this tree `deno lint` (2.9.7) reports `no-sloppy-imports` on `abi.d.ts`'s
`import type { WitFunc } from "./wit-parser.js"`. `main` linted clean. The trigger did not
isolate in a scratch copy (it appeared and disappeared with `deno.json` present/absent in
different combinations); cause UNMEASURED. The import is correct TypeScript and `tsc` accepts it,
so CI runs `deno lint --rules-exclude=no-sloppy-imports` — every other recommended rule still
gates. **Open:** a Deno-free linter replaces `deno lint` before ~2027-10 (binaryang has not chosen
one either); the dropped rule list at that point is "recommended" minus what the new linter has.

## Still on Deno, by design

- `deno publish` (JSR has no other publisher that keeps provenance; F2).
- The Deno leg of the runtime matrix (consumers still use Deno). (`deno lint` until 2026-10-13.)

## Merged and pushed (2026-10-12)

Merged `--no-ff` to `main` as `dd6a9ab` and pushed (owner: "proceed"). **CI run 38286753099
passed on the first run, all six jobs:** Gates, plus tests on Node 22.18 (floor), Node 22, Node 24,
Bun 1.4.3 and Deno 2.x. The `run:`-only workflow was accepted (no `startup_failure`).
**The GitHub repo moved** to `jrmarcum/universalWasmLoader-js` (the old `universalWasmLoader`
URL redirects); the local `origin` now points at the new URL.

## Open items

1. ✅ **Proved by a real release, 2026-10-12** (owner: "bump the release"): `bun run bump minor`
   → 1.1.0 (`7452370`), `bun run release` tagged `v1.1.0` and pushed. Publish run 38287910144
   succeeded, its `rekorLogId` step included; checked independently, cache-busted:
   `api.jsr.io` shows 1.1.0 with **rekorLogId 3232619821**, latest 1.1.0, **score 100**. CI on
   the same commit: success. Trap met: `scripts/publish.ts` spawns plain `git`, which refuses this
   exFAT repo (dubious ownership). Cause: the global `safe.directory` entries for every loader
   still named the OLD `GithubProjects/universalWasmLoader/…` path. For 1.1.0 it ran with
   `GIT_CONFIG_COUNT=1`, `GIT_CONFIG_KEY_0=safe.directory`, `GIT_CONFIG_VALUE_0=<repo path>` in its
   environment. **Fixed the same day:** the current path was added to the global config, as
   binaryang's was, and plain `git` works here now. At the owner's request the current paths of the
   other nine loaders were added too, plus the two vendored JS-loader repos under `-py/upstream`
   and `-rs/upstream`; `git rev-parse` succeeds in all eleven. The old `GithubProjects/` entries
   were left in place (harmless).
2. ✅ **Node 26** (LTS on 2026-10-28): CI leg added 2026-10-12, after 26.11.1 passed 24/24
   locally ([open-work.md](open-work.md)).
3. ✅ DECIDED (owner, 2026-10-12): **relative paths keep resolving against the LOADER's URL;
   do not change the built-in behaviour.** `new URL(cleanPath, import.meta.url)` in `wasmImport`
   uses the loader module's own `import.meta.url`. Owner: "we should probably have all of the
   modules in the same place, but the end user may decide that they would rather have it a
   wasm_module folder or some other folder." So the README now documents the actual behaviour,
   and gives the pattern for a caller-chosen folder:
   `wasmImport(new URL("./wasm_modules/mod.wasm", import.meta.url))`. Measured 2026-10-12 from
   a scratch folder on Bun, Node 24 and Deno: plain load, `@1` pin and `@2` mismatch all behave.
   ✅ DECIDED (owner, 2026-10-12): **`SPEC.md` stays unchanged.** Its `wasmPath` row ("resolved
   relative to the calling module") remains the contract for the other-language ports. Owner: "The
   other loaders are not associated with node, so keeping them the same is desirable." The JS
   loader's resolution against its own `import.meta.url` is an ACCEPTED JS-specific difference,
   documented in the README only. Do not "fix" either side to match the other.
4. **Browser RUN** (not just bundle) is unmeasured, as in binaryang.
