/**
 * Release script — tags the jsr.json version and pushes it so GitHub Actions can publish
 * to JSR with OIDC provenance. Never runs `deno publish` locally.
 *
 * Usage: bun run release
 *
 * Written on `node:` builtins only, so it runs on Bun, Node and Deno alike.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";

const manifestPath = fileURLToPath(new URL("../jsr.json", import.meta.url));
const { version } = JSON.parse(readFileSync(manifestPath, "utf8")) as { version: string };
const tag = `v${version}`;

/** Run a command; on failure print its stderr and exit with its code. */
function run(cmd: string, args: string[]): void {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  if (r.status !== 0) {
    console.error(r.error?.message ?? r.stderr);
    process.exit(r.status ?? 1);
  }
}

console.log(`Publishing ${tag} via GitHub Actions…`);

const staged = spawnSync("git", ["diff", "--cached", "--quiet"]);
if (staged.status !== 0) {
  run("git", ["commit", "-m", `bump version to ${tag}`]);
}

run("git", ["tag", "-f", tag]);
run("git", ["push"]);
run("git", ["push", "origin", tag]);

console.log(`\nTag ${tag} pushed. GitHub Actions will publish to JSR with provenance.`);
