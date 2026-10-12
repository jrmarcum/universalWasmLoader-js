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

## `deno lint` and `no-sloppy-imports`

In this tree `deno lint` (2.9.7) reports `no-sloppy-imports` on `abi.d.ts`'s
`import type { WitFunc } from "./wit-parser.js"`. `main` linted clean. The trigger did not
isolate in a scratch copy (it appeared and disappeared with `deno.json` present/absent in
different combinations); cause UNMEASURED. The import is correct TypeScript and `tsc` accepts it,
so CI runs `deno lint --rules-exclude=no-sloppy-imports` — every other recommended rule still
gates. **Open:** a Deno-free linter replaces `deno lint` before ~2027-10 (binaryang has not chosen
one either); the dropped rule list at that point is "recommended" minus what the new linter has.

## Still on Deno, by design

- `deno publish` (JSR has no other publisher that keeps provenance; F2).
- `deno lint` (above) and the Deno leg of the runtime matrix (consumers still use Deno).

## Open items

1. **A real release** proves the new `publish.yml` (Bun gate + `deno publish` + `rekorLogId`).
   Not done: nothing is tagged or pushed without the owner. The version line stays 1.0.8.
2. **Node 26 becomes LTS on 2026-10-28**: add a CI leg (the loader is plain JS, so no
   type-stripping issue; `bun run lts` will name it as missing in fnm until installed).
3. **Relative paths resolve against the LOADER's URL, not the caller's** (pre-existing, not
   touched): `new URL(cleanPath, import.meta.url)` in `wasmImport` uses the loader module's own
   `import.meta.url`. From an installed package `wasmImport("./mod.wasm")` therefore looks inside
   `node_modules/…`; the README's "resolved relative to the calling module" is not what happens.
   Every test passes absolute `URL`s, so the suite cannot see it. 🗓️ OWNER: fix (an API-visible
   behaviour change) or document "pass `new URL('./mod.wasm', import.meta.url)`".
4. **Browser RUN** (not just bundle) is unmeasured, as in binaryang.
