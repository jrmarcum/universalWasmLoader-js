/**
 * jsr.json is the package's ONE manifest (Bun migration, 2026-10-12). Fails when:
 *
 * - a `deno.json` / `deno.jsonc` comes back carrying `name`, `version` or `exports`: while one
 *   exists, `deno publish` takes the package from it and silently ignores jsr.json;
 * - `package.json` carries `name` or `version`: a second version source (it is dev-only and
 *   private; JSR does not publish it);
 * - a file named by jsr.json's `exports` or `publish.include` does not exist, or the export is not
 *   in the include list.
 *
 * ```sh
 * bun run manifest
 * ```
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (f: string) => JSON.parse(readFileSync(join(root, f), "utf8")) as Record<string, unknown>;
const problems: string[] = [];

for (const f of ["deno.json", "deno.jsonc"]) {
  if (!existsSync(join(root, f))) continue;
  // deno.jsonc may hold comments; a plain field search is enough to find the three keys.
  const text = readFileSync(join(root, f), "utf8");
  for (const key of ["name", "version", "exports"]) {
    if (new RegExp(`"${key}"\\s*:`).test(text)) {
      problems.push(`${f} carries "${key}": it would win over jsr.json in \`deno publish\``);
    }
  }
}

const pkg = read("package.json");
for (const key of ["name", "version"]) {
  if (key in pkg) problems.push(`package.json carries "${key}": jsr.json is the one manifest`);
}

const jsr = read("jsr.json") as {
  name?: string;
  version?: string;
  exports?: string | Record<string, string>;
  publish?: { include?: string[] };
};
if (!jsr.name || !jsr.version) problems.push('jsr.json lacks "name" or "version"');
const include = jsr.publish?.include ?? [];
const exportFiles = typeof jsr.exports === "string"
  ? [jsr.exports]
  : Object.values(jsr.exports ?? {});
for (const f of [...exportFiles, ...include]) {
  if (!existsSync(join(root, f))) problems.push(`jsr.json names ${f}, which does not exist`);
}
for (const f of exportFiles) {
  if (!include.includes(f.replace(/^\.\//, ""))) {
    problems.push(`export ${f} is not in jsr.json publish.include`);
  }
}

if (problems.length > 0) {
  console.log(["Manifest problems:", ...problems.map((p) => `  ${p}`)].join("\n"));
  process.exit(1);
}
console.log(`jsr.json is the one manifest: ${jsr.name}@${jsr.version}, ${include.length} files`);
