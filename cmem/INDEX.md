# cmem — Portable Project Memory for universal-wasm-loader

This folder is the **authoritative, portable project memory** for `universal-wasm-loader`. It lives
inside the project tree, so it travels with the repo and is committed to git (unlike a machine-local
`CLAUDE.md`). Keep files small and single-topic — one focused topic file per domain.

## Policy

- **`cmem/` is the single home for ALL project memory.** When the owner (or anyone) says "**update
  the project memory**," update the matching `cmem/` topic file with the latest decisions, found
  bugs, design changes, and current state — then add/refresh its one-line pointer in the table below.
  Convert relative dates to absolute; update existing entries rather than duplicating.
- **`README.md` and `SPEC.md` are NOT project memory.** They are the public, user-facing docs (how to
  use the loader; the cross-language conformance spec). Keep internal decision logs / bug
  post-mortems out of them — those live here in `cmem/`.

### The "update the project memory" trigger (binding on every agent)

When the owner says **"update the project memory"** (or any clear synonym — "update memory", "record
this", "remember this for the project"), the required action is BOTH of:

1. **Revise all relevant `cmem/` files** — fold the latest decisions, found bugs, design changes, and
   current state into the matching topic file(s); refresh the one-line pointer in the Files table;
   convert relative dates to absolute; update existing entries instead of duplicating.
2. **Sync `README.md` / `SPEC.md` where, and only where, the change is user-relevant** — i.e. update
   the user-facing API surface, usage, the conformance spec, and status so they *match* the new
   reality. Do NOT copy internal decision logs / bug post-mortems into them.

### The "look for code issues" trigger (binding on every agent)

When the owner says **"look for code issues"** (or a clear synonym — "code audit", "audit the code",
"hunt for bugs"), perform a **comprehensive audit** across both tested AND untested paths for:
(1) workarounds / temporary hacks (still-needed vs. stale); (2) dead code (unused exports/helpers,
duplicates); (3) bugs (wrong ABI marshalling, off-by-one pointer/length math, endianness, missing
`cabi_post` calls, fall-back paths that mask errors); and (4) silent fall-throughs (returning a
default instead of erroring). Report `file:line` + severity, fix the safe/clear ones, and keep the
reference test suite green (`bun run gate`, plus `bun run test:node` / `test:deno`).

## Files

| File | What it holds |
| --- | --- |
| [open-work.md](open-work.md) | **Start here for what is left**: dated items (Node 26 leg, `deno lint` replacement), unmeasured gaps, the workspace letters H6/H7, hand-overs |
| [best-practices.md](best-practices.md) | METHOD rules: this repo's own (§ L) + the workspace's 28 ★ convergent rules, copied verbatim and stamped 2026-10-12 |
| [working-rules.md](working-rules.md) | The checklist: git, the gate (= CI's steps), the tooling hard rules in their Bun form, boundaries |
| [design-decisions.md](design-decisions.md) | 🔒 Invariants kept in full: the six design principles, the architectural decisions, the load path, WIT name conventions |
| [compat-gate.md](compat-gate.md) | The compatibility gate (H6): surface snapshot, floor, previous-tag tests, where each runs, the inversion record |
| [overview.md](overview.md) | What this loader is, the API surface, ABI it implements, conformance/SPEC status, test suite, and the release flow |
| [bun-migration.md](bun-migration.md) | 2026-10-12 move off Deno to Bun (+ Node): `jsr.json` manifest, `bun run` scripts, `node:test` suite, CI matrix, the Node `file:` URL bug it surfaced, open items |
