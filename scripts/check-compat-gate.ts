/**
 * Self-test of the compatibility gate (letter H6, 2026-10-12; workspace best-practices 2.1: a gate
 * that has never failed has not been shown to gate anything). Pure checks of `floorOf`, `bumpKind`
 * and `surfaceOf` on synthetic trees; the end-to-end refusals (`bun run bump patch` on a removed
 * export, red previous-tag tests) are recorded in cmem/compat-gate.md.
 *
 * ```sh
 * bun run compat:selftest
 * ```
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { bumpKind, floorOf, type Kind } from "./compat.ts";
import { type Surface, surfaceOf } from "./surface.ts";

let passed = 0;
const failures: string[] = [];
function check(name: string, fn: () => boolean): void {
  let ok = false;
  try {
    ok = fn();
  } catch (e) {
    failures.push(`${name}: threw ${(e as Error).message}`);
    return;
  }
  if (ok) passed++;
  else failures.push(name);
}
function throws(fn: () => unknown, pattern: RegExp): boolean {
  try {
    fn();
    return false;
  } catch (e) {
    return pattern.test((e as Error).message);
  }
}

const base: Surface = {
  spec: "3.0.0",
  exports: { ".": "./a.js" },
  symbols: { "function f": "export declare function f(): void;", "type T": "export type T = number;" },
};
const floor = (s: Partial<Surface>): Kind => floorOf(base, { ...base, ...s }).floor;

// Rule 2 — the floor.
check("identical surface → patch", () => floor({}) === "patch");
check("symbol added → minor", () => floor({ symbols: { ...base.symbols, "function g": "g" } }) === "minor");
check("symbol removed → major", () => floor({ symbols: { "type T": base.symbols["type T"]! } }) === "major");
check("symbol changed → major", () => floor({ symbols: { ...base.symbols, "type T": "export type T = string;" } }) === "major");
check("export added → minor", () => floor({ exports: { ...base.exports, "./x": "./x.js" } }) === "minor");
check("export removed → major", () => floor({ exports: {} }) === "major");
check("SPEC patch → patch", () => floor({ spec: "3.0.1" }) === "patch");
check("SPEC minor → minor", () => floor({ spec: "3.1.0" }) === "minor");
check("SPEC major → major", () => floor({ spec: "4.0.0" }) === "major");
check("SPEC lowered → major", () => floor({ spec: "2.9.0" }) === "major");
check("added + removed → major", () => floor({ symbols: { "function f": base.symbols["function f"]!, "function g": "g" } }) === "major");
check("reasons name the symbol", () =>
  floorOf(base, { ...base, symbols: { "type T": base.symbols["type T"]! } }).reasons.some((r) => r.includes("function f")));

// Version arithmetic.
check("1.0.8 → 1.0.9 is patch", () => bumpKind("1.0.8", "1.0.9") === "patch");
check("1.0.8 → 1.1.0 is minor", () => bumpKind("1.0.8", "1.1.0") === "minor");
check("1.9.9 → 2.0.0 is major", () => bumpKind("1.9.9", "2.0.0") === "major");
check("1.1.0 → 1.10.0 is minor (no carry)", () => bumpKind("1.1.0", "1.10.0") === "minor");
check("same version throws", () => throws(() => bumpKind("1.1.0", "1.1.0"), /does not raise/));
check("lower version throws", () => throws(() => bumpKind("1.1.0", "1.0.9"), /does not raise/));

// Rule 1 — the generator, on synthetic trees.
const dirs: string[] = [];
function tree(dts: string, opts: { pragma?: boolean } = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "uwl-surface-"));
  dirs.push(dir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "jsr.json"), JSON.stringify({ exports: "./a.js" }));
  writeFileSync(join(dir, "SPEC.md"), "# Spec\n\nVersion: 3.0.0\n");
  writeFileSync(join(dir, "a.js"), opts.pragma === false ? "export const x = 1;\n" : '// @ts-self-types="./a.d.ts"\n');
  writeFileSync(join(dir, "a.d.ts"), dts);
  return dir;
}
const DTS = [
  "/** doc */",
  "export type T = Record<string, number>;",
  "export declare function f(a: string, b?: number): void;",
  "export declare function f(a: number): void;",
  "export declare class C {",
  "  constructor(x: string);",
  "  /** m */ m(): Promise<void>;",
  "}",
  "",
].join("\n");
try {
  check("keys symbols, class members and overloads", () => {
    const keys = Object.keys(surfaceOf(tree(DTS)).symbols).join(",");
    return keys === "C#constructor,C#m,class C,function f,function f~2,type T";
  });
  check("reformatting and comments do not change the surface", () => {
    const reformatted = DTS.replace("void;", "void ;").replace("(a: string, b?: number)", "(\n  a: string,\n  b?: number,\n)")
      .replace("/** doc */", "// line comment\n/* block */");
    return JSON.stringify(surfaceOf(tree(DTS))) === JSON.stringify(surfaceOf(tree(reformatted)));
  });
  check("a changed parameter changes the surface", () =>
    JSON.stringify(surfaceOf(tree(DTS))) !== JSON.stringify(surfaceOf(tree(DTS.replace("b?: number", "b: number")))));
  check("SPEC version is read", () => surfaceOf(tree(DTS)).spec === "3.0.0");
  check("a re-export FAILS loudly", () => throws(() => surfaceOf(tree(`export * from "./b.js";\n`)), /re-exports/));
  check("an export without @ts-self-types FAILS loudly", () =>
    throws(() => surfaceOf(tree(DTS, { pragma: false })), /no @ts-self-types/));
  check("an unknown declaration FAILS loudly", () => throws(() => surfaceOf(tree("export foo bar;\n")), /cannot key/));
} finally {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
}

console.log(`compat gate self-test: ${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  for (const f of failures) console.log(`  FAILED: ${f}`);
  process.exit(1);
}
