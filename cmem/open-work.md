# Open work — universal-wasm-loader

Re-derived 2026-10-12, after the 1.1.0 release. Details live in the linked files; this file only
lists what is still open. Close an item by striking it here with the commit that closed it.

## Dated

- ✅ **Node 26** (LTS on 2026-10-28): installed in fnm (26.11.1) and measured 2026-10-12: suite
  24/24, `compat.ts`, the gate self-test and `how-to-use.js` all pass. CI leg added the same day.
  `bun run lts` adds it by itself on 2026-10-28 (it reads Node's schedule). Remaining on that
  date: confirm `bun run lts` shows 3 lines.
- **Replace `deno lint` before Deno's end (~2027-10)** with a Deno-free linter; list the dropped
  rules when doing so. CI runs `deno lint --rules-exclude=no-sloppy-imports`; why that rule began
  firing on `abi.d.ts` is UNMEASURED. binaryang has not chosen a linter either.
  [bun-migration.md](bun-migration.md) § "`deno lint` and `no-sloppy-imports`".
- **Publishing still needs Deno** (`deno publish`, F2 of binaryang's exit guide). By design; JSR's
  to solve before ~2027-10. Re-check when JSR ships a non-Deno publisher that keeps provenance.

## Unmeasured

- **Browser RUN**: `bun run browser` proves the export BUNDLES and the shipped source has no
  top-level `node:` import; nothing loads a module in a headless browser yet (same gap in binaryang).

## Workspace letters (`../../cmem/handoffs.md`)

- ✅ **H6 (every repo), DONE 2026-10-12 on branch `h6`** (owner: "lets implement the H6 item"):
  SemVer was already met; the ★ block `4048256` ([best-practices.md](best-practices.md)); the
  compatibility gate `f3da283` ([compat-gate.md](compat-gate.md)); the memory layout (`CLAUDE.md`
  → pointer, [design-decisions.md](design-decisions.md), [working-rules.md](working-rules.md),
  `.gitattributes` LF pin) in the commit after. The workspace letter closes when the owner closes it.
  Not done: Rule 3's CONSUMER half — no known consumer runs a suite ([compat-gate.md](compat-gate.md)).
- **H7 (all loaders)** — this repo's part DONE 2026-10-12 on branch `h7`: the reference set is
  regenerated from wasmtk `f50c8e4` and stamped (`tests/fixtures.json`, `bun run fixtures`;
  [fixtures.md](fixtures.md)). L1–L8 are all other ports' items (none names -js). ⏳ Waiting on:
  the owner pushing wasmtk `main` so `f50c8e4` is pinnable; then the nine ports copy the set
  (hand-over table in [fixtures.md](fixtures.md)).

## To hand over (not this repo's to fix)

- 🔴 **wasmtk 2.0.3 on JSR builds wrong fixtures** (`f64` for `s32` in `math_50.wit`; every bool
  function fails; 9/24 red). Fixed at wasmtk HEAD `f50c8e4`, unreleased. [fixtures.md](fixtures.md).
- **The nine ports**: copy the stamped fixture set and fix their L-items; table in
  [fixtures.md](fixtures.md).

- **binaryang `scripts/check-browser.ts`**: Bun 1.4.3's browser target replaces a top-level
  `node:fs` import with an empty-object stub, so a bundle-only check passes code that breaks in a
  page. This repo's check adds a source scan ([bun-migration.md](bun-migration.md) § "Checks").
  Reported to the owner 2026-10-12.
- **Workspace `cmem/local/environment.md`** still says every repo needs a `safe.directory` entry;
  for all ten loaders' current paths that is done (2026-10-12).
