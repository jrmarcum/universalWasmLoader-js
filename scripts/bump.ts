/**
 * Increments the `version` field in jsr.json, the package's one manifest (Bun migration,
 * 2026-10-12; deno.json before that).
 *
 * Run via:  bun run bump            # patch:  1.0.5 → 1.0.6
 *           bun run bump minor      # minor:  1.0.5 → 1.1.0
 *           bun run bump major      # major:  1.0.5 → 2.0.0
 *
 * Written on `node:` builtins only, so it runs on Bun, Node and Deno alike.
 */
import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";

const manifestPath = fileURLToPath(new URL("../jsr.json", import.meta.url));

const kind = (process.argv[2] ?? "patch").toLowerCase();
if (kind !== "patch" && kind !== "minor" && kind !== "major") {
  console.error(`❌ bump: unknown release kind "${kind}" — use patch | minor | major`);
  process.exit(1);
}

const text = readFileSync(manifestPath, "utf8");
const m = text.match(/("version"\s*:\s*)"(\d+)\.(\d+)\.(\d+)"/);
if (!m) {
  console.error('❌ bump: could not find a "version": "X.Y.Z" field in jsr.json');
  process.exit(1);
}

let [major, minor, patch] = [Number(m[2]), Number(m[3]), Number(m[4])];
const from = `${major}.${minor}.${patch}`;
if (kind === "major") {
  major += 1;
  minor = 0;
  patch = 0;
} else if (kind === "minor") {
  minor += 1;
  patch = 0;
} else {
  patch += 1;
}
const to = `${major}.${minor}.${patch}`;

// Targeted replace so the rest of jsr.json's formatting is untouched.
const updated = text.replace(/("version"\s*:\s*)"\d+\.\d+\.\d+"/, `$1"${to}"`);
writeFileSync(manifestPath, updated);
console.log(`✅ jsr.json → ${to}  (${kind} bump from ${from})`);
