/**
 * Regenerate the reference fixtures from ONE `wasmtk modc` run and stamp them (workspace letter
 * H7 / divergence S4, 2026-10-12). This repo's `tests/` is the reference set every other loader
 * port copies byte for byte; `tests/fixtures.json` is the stamp they verify against.
 *
 * Usage (needs Deno: wasmtk is a Deno project):
 *
 * ```sh
 * bun scripts/regen-fixtures.ts <wasmtk-checkout>
 * ```
 *
 * The checkout must be CLEAN (no modified tracked file) so the stamped commit is exactly what
 * built the bytes. Use a scratch clone, never the sibling repo itself (Deno writes into the tree
 * it runs in). Each fixture is built from the checkout's own
 * `tests/module/bindgen_fixtures/<name>.ts`; `init_check` is hand-written WAT in this repo and is
 * stamped but not regenerated.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

/** The wasmtk-built fixtures, in the order the suite uses them. */
export const GENERATED = ["math_50", "booleans_50", "strings_50", "imports_50", "wasi_io_50"];
/** Fixtures written by hand in this repo (stamped, never regenerated). */
export const HAND_WRITTEN = ["init_check.wat", "init_check.wasm"];

export const sha256 = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");

function run(cmd: string, args: string[], cwd: string): string {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", maxBuffer: 1 << 26 });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} (exit ${r.status}): ${(r.stderr || r.stdout || r.error?.message || "").trim()}`);
  }
  return r.stdout.trim();
}

const isMain = process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url).replace(/\\/g, "/") === process.argv[1].replace(/\\/g, "/");
if (isMain) {
  const wasmtk = process.argv[2] ? resolve(process.argv[2]) : "";
  if (!wasmtk) {
    console.error("usage: bun scripts/regen-fixtures.ts <wasmtk-checkout>");
    process.exit(2);
  }
  const root = fileURLToPath(new URL("..", import.meta.url));
  const tests = join(root, "tests");

  const dirty = run("git", ["status", "--porcelain", "--untracked-files=no"], wasmtk);
  if (dirty !== "") {
    console.error(`the wasmtk checkout has modified tracked files; the stamp would lie:\n${dirty}`);
    process.exit(1);
  }
  const commit = run("git", ["rev-parse", "HEAD"], wasmtk);
  const describe = run("git", ["describe", "--tags", "--always"], wasmtk);
  const committed = run("git", ["log", "-1", "--format=%cI"], wasmtk);

  // Sources are stamped by git BLOB id at the commit: canonical whatever the checkout's line endings.
  const sources: Record<string, string> = {};
  for (const name of GENERATED) {
    const src = `tests/module/bindgen_fixtures/${name}.ts`;
    sources[`${name}.ts`] = run("git", ["rev-parse", `${commit}:${src}`], wasmtk);
    run("deno", ["run", "-A", "--no-lock", "--config", "deno.json", "main.ts", "modc", src, "-n", join(tests, `${name}.wasm`)], wasmtk);
    // modc also writes the intermediate <name>.wat; it is not part of the reference set.
    rmSync(join(tests, `${name}.wat`), { force: true });
    console.log(`built ${name}.wasm + ${name}.wit`);
  }

  const files: Record<string, string> = {};
  for (const name of GENERATED) for (const ext of ["wasm", "wit"]) files[`${name}.${ext}`] = sha256(join(tests, `${name}.${ext}`));
  for (const f of HAND_WRITTEN) files[f] = sha256(join(tests, f));

  const stamp = {
    $comment: "Reference fixtures for every universal-wasm-loader port: copy these bytes unmodified (SPEC §7) " +
      "and verify them against this file. Written by scripts/regen-fixtures.ts; do not edit by hand.",
    generator: {
      tool: "wasmtk modc",
      repository: "https://github.com/jrmarcum/wasmtk",
      commit,
      describe,
      committed,
      command: "deno run -A --no-lock --config deno.json main.ts modc tests/module/bindgen_fixtures/<name>.ts -n <name>.wasm",
    },
    sourcesAreGitBlobIds: true,
    sources,
    handWritten: HAND_WRITTEN,
    files,
  };
  writeFileSync(join(tests, "fixtures.json"), `${JSON.stringify(stamp, null, 2)}\n`);
  console.log(`tests/fixtures.json: ${Object.keys(files).length} files stamped from wasmtk ${describe}`);
}
