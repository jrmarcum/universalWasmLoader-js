/**
 * The fixtures in `tests/` are exactly the stamped reference set (workspace letter H7 / S4,
 * 2026-10-12). Fails when a stamped file is missing or its bytes differ from `tests/fixtures.json`,
 * or when `tests/` holds a `.wasm` / `.wit` / `.wat` the stamp does not list.
 *
 * Another port verifies its own copy against this repo's stamp with the same rule: every file in
 * `files` present, sha256-identical.
 *
 * ```sh
 * bun run fixtures
 * ```
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { sha256 } from "./regen-fixtures.ts";

const tests = fileURLToPath(new URL("../tests", import.meta.url));
const stamp = JSON.parse(readFileSync(join(tests, "fixtures.json"), "utf8")) as {
  generator: { describe: string; commit: string };
  files: Record<string, string>;
};

const problems: string[] = [];
for (const [file, hash] of Object.entries(stamp.files)) {
  const p = join(tests, file);
  if (!existsSync(p)) problems.push(`${file}: missing`);
  else if (sha256(p) !== hash) problems.push(`${file}: bytes differ from the stamp`);
}
for (const f of readdirSync(tests)) {
  if (/\.(wasm|wit|wat)$/.test(f) && !(f in stamp.files)) problems.push(`${f}: not in the stamp`);
}

if (problems.length > 0) {
  console.log(["Fixtures do not match tests/fixtures.json:", ...problems.map((p) => `  ${p}`)].join("\n"));
  console.log("Regenerate with `bun scripts/regen-fixtures.ts <wasmtk-checkout>`; never edit a fixture by hand.");
  process.exit(1);
}
console.log(
  `${Object.keys(stamp.files).length} fixtures match the stamp (wasmtk ${stamp.generator.describe}, ` +
    `${stamp.generator.commit.slice(0, 11)})`,
);
