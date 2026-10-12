/**
 * The test suite on EVERY current Node LTS line (owner, 2026-10-12: "We should support and test
 * all currently available lts versions"); adapted from binaryang's `scripts/check-lts.ts`.
 *
 * Which lines: Node's own release schedule (`nodejs/Release`'s `schedule.json`), every line whose
 * LTS has started and whose end of life has not come. That is decided by the date, never by a
 * list here, so a line ENTERS this check the day it becomes LTS (Node 26 on 2026-10-28).
 *
 * How: each line runs `node --test tests/loader.test.js` through fnm (`fnm exec --using=<major>`),
 * so no Node switches globally and no path is machine-specific. Every line must report the same
 * test count with zero failures. A line fnm does not have installed FAILS the check, naming the
 * command that installs it, and is never silently skipped.
 *
 * CI does not run this: its `runtimes` matrix covers the same lines.
 *
 * ```sh
 * bun run lts
 * ```
 */
import { spawnSync } from "node:child_process";
import process from "node:process";

const SCHEDULE = "https://raw.githubusercontent.com/nodejs/Release/main/schedule.json";

/** One line of Node's release schedule. */
interface ReleaseLine {
  start: string;
  lts?: string;
  maintenance?: string;
  end: string;
  codename?: string;
}

/** The majors whose LTS has started on `today` (YYYY-MM-DD) and whose end of life has not come. */
function currentLtsMajors(schedule: Record<string, ReleaseLine>, today: string): number[] {
  return Object.entries(schedule)
    .filter(([, l]) => l.lts !== undefined && l.lts <= today && today <= l.end)
    .map(([k]) => Number(k.replace(/^v/, "")))
    .filter((n) => Number.isInteger(n))
    .sort((a, b) => a - b);
}

/** The majors fnm has installed, from `fnm list` (`* v24.21.0 default`, `v22.23.3`, `system`). */
function installedMajors(fnmList: string): Set<number> {
  return new Set([...fnmList.matchAll(/\bv(\d+)\.\d+\.\d+/g)].map((m) => Number(m[1])));
}

function fnm(args: string[]) {
  return spawnSync("fnm", args, { encoding: "utf8", maxBuffer: 1 << 26 });
}

if (fnm(["--version"]).status !== 0) {
  console.error("bun run lts needs fnm (https://fnm.vercel.app): `scoop install fnm`, then");
  console.error("`fnm install <major>` for each current LTS line.");
  process.exit(2);
}
let schedule: Record<string, ReleaseLine>;
try {
  const res = await fetch(SCHEDULE);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  schedule = await res.json() as Record<string, ReleaseLine>;
} catch (e) {
  console.error(`cannot read Node's release schedule (${SCHEDULE}): ${(e as Error).message}`);
  process.exit(2);
}
const today = new Date().toISOString().slice(0, 10);
const majors = currentLtsMajors(schedule, today);
const have = installedMajors(fnm(["list"]).stdout ?? "");
console.log(`current Node LTS lines on ${today}: ${majors.map((m) => `v${m}`).join(", ")}`);

const counts = new Map<number, number>();
const problems: string[] = [];
for (const m of majors) {
  if (!have.has(m)) {
    problems.push(`v${m}: not installed in fnm -- run \`fnm install ${m}\``);
    continue;
  }
  const r = fnm([
    "exec",
    `--using=${m}`,
    "node",
    "--test",
    "--test-reporter=tap",
    "tests/loader.test.js",
  ]);
  const out = `${r.stdout ?? ""}`;
  const field = (name: string) => Number(out.match(new RegExp(`^# ${name} (\\d+)$`, "m"))?.[1]);
  const tests = field("tests");
  const pass = field("pass");
  if (r.status !== 0 || !Number.isInteger(tests) || tests === 0 || pass !== tests) {
    problems.push(`v${m}: exit ${r.status}, ${pass} of ${tests} tests passed`);
    continue;
  }
  counts.set(m, tests);
  console.log(`  v${m}  ${pass}/${tests} pass`);
}
const distinct = new Set(counts.values());
if (distinct.size > 1) problems.push(`the lines disagree on the test count: ${[...distinct]}`);
if (problems.length > 0) {
  console.log(["", "FAILED:", ...problems.map((p) => `  ${p}`)].join("\n"));
  process.exit(1);
}
console.log(`every current LTS line passes the suite (${majors.length} lines)`);
