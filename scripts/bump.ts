/**
 * Increments the `version` field in deno.json, then runs sync-version.ts to propagate
 * the new version to any secondary manifests (currently a no-op for this package).
 *
 * Run via:  deno task bump            # patch:  1.0.5 → 1.0.6
 *           deno task bump minor      # minor:  1.0.5 → 1.1.0
 *           deno task bump major      # major:  1.0.5 → 2.0.0
 *
 * Unlike `update-version` (which only re-propagates the EXISTING deno.json version), this
 * RAISES the deno.json version first. Must be run from the project root (deno task does this).
 */

const root = Deno.cwd();
const denoJsonPath = `${root}/deno.json`;

const kind = (Deno.args[0] ?? "patch").toLowerCase();
if (kind !== "patch" && kind !== "minor" && kind !== "major") {
  console.error(`❌ bump: unknown release kind "${kind}" — use patch | minor | major`);
  Deno.exit(1);
}

const text = await Deno.readTextFile(denoJsonPath);
const m = text.match(/("version"\s*:\s*)"(\d+)\.(\d+)\.(\d+)"/);
if (!m) {
  console.error('❌ bump: could not find a "version": "X.Y.Z" field in deno.json');
  Deno.exit(1);
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

// Targeted replace so the rest of deno.json's formatting is untouched.
const updated = text.replace(/("version"\s*:\s*)"\d+\.\d+\.\d+"/, `$1"${to}"`);
await Deno.writeTextFile(denoJsonPath, updated);
console.log(`✅ deno.json     → ${to}  (${kind} bump from ${from})`);

// Propagate the freshly-written version to any secondary manifests (no-op today).
await import("./sync-version.ts");
