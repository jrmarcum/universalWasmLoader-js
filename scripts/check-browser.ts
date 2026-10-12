/**
 * Every export loads in a BROWSER (Bun migration, 2026-10-12; adapted from binaryang's
 * `scripts/check-browser.ts`). For each export in `jsr.json`, bundle it for the browser target
 * and fail when:
 *
 * - the bundle does not build, or
 * - it still IMPORTS a `node:` builtin at the top level (`from "node:…"` or `require("node:…")`).
 *
 * A deferred `import("node:…")` inside a function is allowed: a browser evaluates it only if that
 * function runs. The loader has exactly one: `readFileUrl` reads `file:` URLs from disk, a path a
 * page never takes.
 *
 * Bundling is not running: it proves the export LOADS, not that it works in a page.
 *
 * ⚠️ The bundle alone is NOT enough, measured 2026-10-12 with Bun 1.4.3: for the browser target
 * Bun REPLACES a top-level `import { readFile } from "node:fs/promises"` with an empty-object stub
 * (`var { readFile } = (() => ({}))`), so the bundle builds and holds no `node:` import while the
 * module is broken in a page (and JSR's published file, which is not bundled, keeps the import).
 * So every shipped `.js` file in `publish.include` is ALSO read as source, and fails on:
 *
 * - a top-level `import … from "node:…"`, `import "node:…"` or `export … from "node:…"`;
 * - a `Deno.` or `Bun.` reference outside a comment line: the package must run on every runtime.
 *
 * ```sh
 * bun run browser
 * ```
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

/** A top-level import of a `node:` builtin in bundled output. `import("node:…")` is not one. */
const STATIC_NODE = /(?:\bfrom\s*|\brequire\(\s*)["']node:[\w/]+["']/g;

/** A top-level static import or re-export of a `node:` builtin, in SOURCE. */
const SOURCE_STATIC_NODE = /^\s*(?:import|export)\b[^(;]*?["']node:[\w/]+["']/gm;

/** A runtime-specific global, outside a comment line. */
const RUNTIME_GLOBAL = /^(?!\s*(?:\/\/|\/?\*)).*\b(Deno|Bun)\./gm;

const root = fileURLToPath(new URL("..", import.meta.url));
const cfg = JSON.parse(readFileSync(join(root, "jsr.json"), "utf8")) as {
  exports: string | Record<string, string>;
  publish: { include: string[] };
};
const exports = typeof cfg.exports === "string" ? { ".": cfg.exports } : cfg.exports;
const out = mkdtempSync(join(tmpdir(), "uwl-browser-"));
const problems: string[] = [];
try {
  for (const [sub, file] of Object.entries(exports)) {
    const target = join(out, `${sub === "." ? "root" : sub.slice(2).replace(/\//g, "_")}.js`);
    const r = spawnSync(
      "bun",
      ["build", join(root, file), "--target=browser", "--format=esm", `--outfile=${target}`],
      { encoding: "utf8" },
    );
    if (r.status !== 0) {
      const why = `${r.stderr}${r.stdout}`.split("\n").find((l) => /error/i.test(l)) ?? "";
      problems.push(`${sub}: does not bundle for the browser: ${why.trim()}`);
      continue;
    }
    const found = [...new Set(readFileSync(target, "utf8").match(STATIC_NODE) ?? [])];
    if (found.length > 0) problems.push(`${sub}: imports ${found.join(", ")} at the top level`);
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}
const shipped = cfg.publish.include.filter((f) => f.endsWith(".js"));
for (const file of shipped) {
  const src = readFileSync(join(root, file), "utf8");
  for (const m of src.match(SOURCE_STATIC_NODE) ?? []) {
    problems.push(`${file}: top-level ${m.trim()}`);
  }
  for (const m of src.matchAll(RUNTIME_GLOBAL)) {
    problems.push(`${file}: uses ${m[1]}. (${m[0].trim().slice(0, 80)})`);
  }
}
const total = Object.keys(exports).length;
if (problems.length > 0) {
  console.log(["Shipped code that does not load in a browser:", ...problems].join("\n"));
  process.exit(1);
}
console.log(
  `all ${total} exports bundle for the browser, and none of the ${shipped.length} shipped ` +
    "files imports node: at the top level or uses Deno./Bun.",
);
