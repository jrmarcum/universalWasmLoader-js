/**
 * The compatibility gate (workspace `layout-and-packaging.md` § "The compatibility gate"; letter
 * H6, 2026-10-12). "Backward compatible" is a gate result, never a judgment made at bump time.
 *
 * - Rule 2, the FLOOR: the surface (`surface.ts`) at the last release tag against the surface of
 *   the working tree. Anything removed or changed → major; anything added → minor; nothing →
 *   patch. `SPEC.md`'s version moves the floor by its own level (a SPEC major is a loader major).
 *   A changed signature counts as MAJOR even when it widens: the gate cannot tell widening from
 *   narrowing, so it errs high; a human may still choose major.
 * - Rule 3, BEHAVIOUR: the previous tag's `tests/` (its fixtures and test file, unmodified) run
 *   against the NEW source. Required green for a patch or minor.
 *
 * ```sh
 * bun run compat             # report: last tag, floor and why, previous-tag tests
 * bun run compat --against v1.0.8   # the same against an older release
 * bun run compat --release   # on a tag: the jsr.json bump since the previous tag must meet the floor
 * ```
 * `bun run bump` runs the same checks before it raises the version.
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { render, type Surface, surfaceOf } from "./surface.ts";

export type Kind = "patch" | "minor" | "major";
export const RANK: Record<Kind, number> = { patch: 0, minor: 1, major: 2 };
const KINDS: Kind[] = ["patch", "minor", "major"];

export const root = fileURLToPath(new URL("..", import.meta.url));

/** The level by which `to` raises `from` (X.Y.Z); throws when it does not raise it. */
export function bumpKind(from: string, to: string): Kind {
  const [a, b] = [from, to].map((v) => v.split(".").map(Number));
  for (let i = 0; i < 3; i++) {
    if (b![i]! > a![i]!) return KINDS[2 - i]!;
    if (b![i]! < a![i]!) break;
  }
  throw new Error(`version ${to} does not raise ${from}`);
}

/** The minimum bump the change from `old` to `cur` requires, and the entries that set it. */
export function floorOf(old: Surface, cur: Surface): { floor: Kind; reasons: string[] } {
  const reasons: string[] = [];
  let floor: Kind = "patch";
  const raise = (k: Kind, why: string) => {
    reasons.push(`${k}: ${why}`);
    if (RANK[k] > RANK[floor]) floor = k;
  };
  if (old.spec !== cur.spec) {
    try {
      raise(bumpKind(old.spec, cur.spec), `SPEC.md ${old.spec} → ${cur.spec}`);
    } catch {
      raise("major", `SPEC.md ${old.spec} → ${cur.spec} (lowered)`);
    }
  }
  for (const [label, a, b] of [
    ["export", old.exports, cur.exports],
    ["symbol", old.symbols, cur.symbols],
  ] as const) {
    for (const k of Object.keys(a)) {
      if (!(k in b)) raise("major", `${label} removed: ${k}`);
      else if (a[k] !== b[k]) raise("major", `${label} changed: ${k}\n      was: ${a[k]}\n      now: ${b[k]}`);
    }
    for (const k of Object.keys(b)) if (!(k in a)) raise("minor", `${label} added: ${k}`);
  }
  return { floor, reasons };
}

function git(args: string[]): string {
  const r = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${(r.stderr || r.error?.message || "").trim()}`);
  return r.stdout.trim();
}

/** The newest release tag reachable from `rev`. */
export function lastTag(rev = "HEAD"): string {
  return git(["describe", "--tags", "--abbrev=0", "--match", "v[0-9]*", rev]);
}

/** Extract the tree of `tag` into a fresh directory inside the repo (so node_modules resolves). */
function extract(tag: string, dir: string): void {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const tar = join(dir, "tree.tar");
  git(["archive", "--format=tar", "-o", tar, tag]);
  const r = spawnSync("tar", ["-xf", tar, "-C", dir], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`tar: ${r.stderr}`);
  rmSync(tar);
}

/** Surface of a release tag, generated from its own tree. */
export function surfaceAt(tag: string): Surface {
  const dir = join(root, ".compat", "tag");
  try {
    extract(tag, dir);
    return surfaceOf(dir);
  } finally {
    rmSync(join(root, ".compat"), { recursive: true, force: true });
  }
}

/**
 * Rule 3: the previous tag's `tests/` against the NEW shipped files. Builds `.compat/` holding the
 * current `publish.include` files plus the tag's `tests/`, then runs the tag's suite there with the
 * runtime running this script. Returns the counts it read from the suite's OUTPUT.
 */
export function previousTests(tag: string): { ok: boolean; summary: string } {
  const base = join(root, ".compat");
  const tagDir = join(base, "tag");
  const run = join(base, "run");
  try {
    extract(tag, tagDir);
    mkdirSync(run, { recursive: true });
    const include = (JSON.parse(readFileSync(join(root, "jsr.json"), "utf8")) as {
      publish: { include: string[] };
    }).publish.include;
    for (const f of include) cpSync(join(root, f), join(run, f));
    cpSync(join(tagDir, "tests"), join(run, "tests"), { recursive: true });

    const bun = process.versions.bun !== undefined;
    const exe = process.execPath;
    let r;
    if (existsSync(join(run, "tests", "loader.test.js"))) {
      const file = join(run, "tests", "loader.test.js");
      r = bun
        ? spawnSync(exe, ["test", file], { cwd: root, encoding: "utf8" })
        : spawnSync(exe, ["--test", "--test-reporter=tap", file], { cwd: root, encoding: "utf8" });
      const out = `${r.stdout}\n${r.stderr}`;
      const pass = Number(out.match(/^\s*(\d+) pass$/m)?.[1] ?? out.match(/^# pass (\d+)$/m)?.[1]);
      const fail = Number(out.match(/^\s*(\d+) fail$/m)?.[1] ?? out.match(/^# fail (\d+)$/m)?.[1]);
      const ok = r.status === 0 && pass > 0 && fail === 0;
      return { ok, summary: `${tag} tests/loader.test.js: ${pass} pass, ${fail} fail (exit ${r.status})` };
    }
    if (existsSync(join(run, "tests", "run_tests.js"))) {
      r = spawnSync(exe, [join(run, "tests", "run_tests.js")], { cwd: root, encoding: "utf8" });
      const m = `${r.stdout}\n${r.stderr}`.match(/(\d+) tests: (\d+) passed, (\d+) failed/);
      const ok = r.status === 0 && m !== null && Number(m[2]) > 0 && m[3] === "0";
      return { ok, summary: `${tag} tests/run_tests.js: ${m ? `${m[2]} of ${m[1]} passed` : "no summary line"} (exit ${r.status})` };
    }
    return { ok: false, summary: `${tag}: no tests/loader.test.js or tests/run_tests.js` };
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

/** Everything the gate needs to judge a bump of `kind` against `tag`. */
export function evaluate(tag: string): {
  floor: Kind;
  reasons: string[];
  tests: { ok: boolean; summary: string };
  surfaceCurrent: boolean;
} {
  const cur = surfaceOf(root);
  const committed = existsSync(join(root, "api-surface.json"))
    ? readFileSync(join(root, "api-surface.json"), "utf8").replace(/\r\n/g, "\n")
    : "";
  const { floor, reasons } = floorOf(surfaceAt(tag), cur);
  return { floor, reasons, tests: previousTests(tag), surfaceCurrent: committed === render(cur) };
}

/** Print the evaluation; return the problems that block a bump of `kind` (none = allowed). */
export function judge(tag: string, kind: Kind | null): string[] {
  const e = evaluate(tag);
  console.log(`compatibility gate against ${tag}`);
  console.log(`  floor: ${e.floor}`);
  for (const r of e.reasons) console.log(`    ${r}`);
  console.log(`  previous-tag tests: ${e.tests.ok ? "green" : "RED"} — ${e.tests.summary}`);
  console.log(`  api-surface.json: ${e.surfaceCurrent ? "current" : "STALE"}`);
  const problems: string[] = [];
  if (!e.surfaceCurrent) problems.push("api-surface.json is stale: re-baseline it in its own commit first (`bun run surface`)");
  if (kind !== null) {
    if (RANK[kind] < RANK[e.floor]) problems.push(`a ${kind} bump is below the floor (${e.floor})`);
    if (kind !== "major" && !e.tests.ok) {
      problems.push(`the previous tag's tests are red, so a ${kind} is not allowed: classify each failure (a test that must change is a surface change)`);
    }
  }
  return problems;
}

const isMain = process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url).replace(/\\/g, "/") === process.argv[1].replace(/\\/g, "/");
if (isMain) {
  const version = (JSON.parse(readFileSync(join(root, "jsr.json"), "utf8")) as { version: string }).version;
  let problems: string[];
  if (process.argv.includes("--release")) {
    // On the tag being published: compare with the release before it.
    const tag = lastTag("HEAD^");
    const kind = bumpKind(tag.replace(/^v/, ""), version);
    console.log(`release ${tag} → v${version} is a ${kind}`);
    problems = judge(tag, kind);
  } else {
    const at = process.argv.indexOf("--against");
    problems = judge(at > 0 && process.argv[at + 1] ? process.argv[at + 1]! : lastTag(), null);
  }
  if (problems.length > 0) {
    console.log(["", "BLOCKED:", ...problems.map((p) => `  ${p}`)].join("\n"));
    process.exit(1);
  }
}
