/**
 * Publish script — bumps a git tag and pushes it so GitHub Actions can publish
 * to JSR with OIDC provenance. Never runs `deno publish` locally.
 *
 * Usage: deno task publish
 */
import denoJson from "../deno.json" with { type: "json" };

const version = denoJson.version;
const tag = `v${version}`;

async function run(cmd: string[]): Promise<void> {
  const p = new Deno.Command(cmd[0], { args: cmd.slice(1) });
  const { code, stderr } = await p.output();
  if (code !== 0) {
    console.error(new TextDecoder().decode(stderr));
    Deno.exit(code);
  }
}

console.log(`Publishing ${tag} via GitHub Actions…`);

await run(["deno", "run", "--allow-read", "--allow-write", "scripts/sync-version.ts"]);

const status = new Deno.Command("git", { args: ["diff", "--cached", "--quiet"] });
const { code: diffCode } = await status.output();
if (diffCode !== 0) {
  await run(["git", "commit", "-m", `bump version to ${tag}`]);
}

await run(["git", "tag", "-f", tag]);
await run(["git", "push"]);
await run(["git", "push", "origin", tag]);

console.log(`\nTag ${tag} pushed. GitHub Actions will publish to JSR with provenance.`);
