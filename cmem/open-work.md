# Open work — universal-wasm-loader

Re-derived 2026-10-12, after the 1.1.0 release. Details live in the linked files; this file only
lists what is still open. Close an item by striking it here with the commit that closed it.

## Dated

- **Node 26 becomes LTS on 2026-10-28** → add a CI leg in `.github/workflows/ci.yml` (`runtimes`)
  and `fnm install 26` locally (`bun run lts` FAILS naming it until then, on purpose). The loader is
  plain JS, so Node 26's removal of `--experimental-transform-types` does not affect it.
  [bun-migration.md](bun-migration.md) item 2.
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

- **H6 (every repo)**: SemVer is met (`bun run bump` edits a plain `X.Y.Z`). Still open: the
  compatibility gate (for the loaders: run the PREVIOUS tag's tests against new source, plus a
  `SPEC.md` version assertion; `../../cmem/open-work.md` § "the compatibility gate"), the ★ rules
  block copied into a `best-practices.md`, the memory layout per `../../cmem/memory-conventions.md`.
- **H7 (all loaders)**: one `wasmtk modc` run regenerates every loader's fixtures, stamped (S4/L3);
  L1–L8. Which L-items apply to the JS loader is NOT yet checked (L2 "cut the tracked pointers" may
  mean trimming `CLAUDE.md` to a pointer).

## To hand over (not this repo's to fix)

- **binaryang `scripts/check-browser.ts`**: Bun 1.4.3's browser target replaces a top-level
  `node:fs` import with an empty-object stub, so a bundle-only check passes code that breaks in a
  page. This repo's check adds a source scan ([bun-migration.md](bun-migration.md) § "Checks").
  Reported to the owner 2026-10-12.
- **Workspace `cmem/local/environment.md`** still says every repo needs a `safe.directory` entry;
  for all ten loaders' current paths that is done (2026-10-12).
