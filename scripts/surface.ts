/**
 * The package SURFACE — what consumers can depend on — generated, never hand-written
 * (compatibility gate Rule 1, workspace `layout-and-packaging.md`; letter H6, 2026-10-12).
 *
 * The surface of this loader is:
 * - the `exports` map of the manifest (`jsr.json`; `deno.json` at tags before 1.1.0);
 * - every top-level declaration in the `.d.ts` each export names through `@ts-self-types`, one key
 *   per symbol and one per class/interface member, whitespace-normalized, comments dropped;
 * - the `SPEC.md` version (the cross-language contract this loader is the reference for).
 *
 * The generator FAILS on a declaration form it cannot key (a re-export, `export *`, an export
 * with no `@ts-self-types`), never skips it: an unseen symbol is an unchecked one.
 *
 * ```sh
 * bun run surface           # rewrite api-surface.json
 * bun run surface --check   # fail if api-surface.json is not what the source generates
 * ```
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

/** The generated surface. Keys are sorted so the JSON diffs cleanly. */
export interface Surface {
  spec: string;
  exports: Record<string, string>;
  symbols: Record<string, string>;
}

/** Drop comments, collapse whitespace, and tidy the spacing a reformat would change. */
function normalize(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/([([{<]) /g, "$1")
    .replace(/ ([)\]}>,;])/g, "$1")
    .replace(/,([)\]}>])/g, "$1")
    .trim();
}

/** Split `src` at `;` (and at a closing `}` for class/interface) on brace/paren depth 0. */
function statements(src: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "{" || c === "(" || c === "[") depth++;
    else if (c === "}" || c === ")" || c === "]") {
      depth--;
      if (depth < 0) throw new Error(`unbalanced "${c}" at offset ${i}`);
      if (c === "}" && depth === 0) {
        const head = src.slice(start, i);
        if (/^\s*(?:export\s+)?(?:declare\s+)?(?:abstract\s+)?(?:class|interface|namespace|enum)\b/.test(head)) {
          out.push(src.slice(start, i + 1));
          start = i + 1;
        }
      }
    } else if (c === ";" && depth === 0) {
      out.push(src.slice(start, i + 1));
      start = i + 1;
    }
  }
  if (src.slice(start).trim() !== "") throw new Error(`unterminated declaration: ${src.slice(start).trim().slice(0, 80)}`);
  return out.map((s) => s.trim()).filter((s) => s !== "" && s !== ";");
}

const MEMBER_NAME =
  /^(?:(?:readonly|static|public|protected|private|abstract|declare|get|set)\s+)*(constructor|[A-Za-z_$][\w$]*|\[[^\]]+\]|"[^"]*")/;

/** Key every member of a class/interface body: `Owner#name` (`#name~2` for an overload). */
function members(owner: string, body: string, add: (key: string, text: string) => void): void {
  let depth = 0;
  let start = 0;
  const parts: string[] = [];
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === "{" || c === "(" || c === "[") depth++;
    else if (c === "}" || c === ")" || c === "]") depth--;
    else if (c === ";" && depth === 0) {
      parts.push(body.slice(start, i));
      start = i + 1;
    }
  }
  if (body.slice(start).trim() !== "") parts.push(body.slice(start));
  for (const part of parts.map((p) => p.trim()).filter(Boolean)) {
    const m = part.match(MEMBER_NAME);
    if (!m) throw new Error(`${owner}: cannot key member "${part.slice(0, 80)}"`);
    add(`${owner}#${m[1]}`, normalize(part));
  }
}

/** Key every top-level declaration of one `.d.ts` file. */
function declarations(file: string, src: string, add: (key: string, text: string) => void): void {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  for (const stmt of statements(code)) {
    if (/^export\s*(?:\*|\{|type\s*\{)/.test(stmt) || /^export\s+default\b/.test(stmt)) {
      throw new Error(`${file}: re-exports and default exports are not keyed yet: "${stmt.slice(0, 80)}"`);
    }
    if (/^import\b/.test(stmt)) {
      add(`${file} import ${normalize(stmt)}`, normalize(stmt));
      continue;
    }
    const m = stmt.match(
      /^(export\s+)?(?:declare\s+)?(?:abstract\s+)?(function|class|interface|type|const|let|var|enum|namespace)\s+([A-Za-z_$][\w$]*)/,
    );
    const [, exported, kind, name] = m ?? [];
    if (!kind || !name) throw new Error(`${file}: cannot key declaration "${stmt.slice(0, 80)}"`);
    const key = `${exported ? "" : "(internal) "}${kind} ${name}`;
    if (kind === "class" || kind === "interface") {
      const open = stmt.indexOf("{");
      add(key, normalize(stmt.slice(0, open)));
      members(name, stmt.slice(open + 1, stmt.lastIndexOf("}")), add);
    } else {
      add(key, normalize(stmt));
    }
  }
}

/** Generate the surface of the package tree at `root` (the working tree or an extracted tag). */
export function surfaceOf(root: string): Surface {
  const manifestFile = ["jsr.json", "deno.json"].find((f) => existsSync(join(root, f)));
  if (!manifestFile) throw new Error(`${root}: no jsr.json or deno.json`);
  const manifest = JSON.parse(readFileSync(join(root, manifestFile), "utf8")) as {
    exports?: string | Record<string, string>;
  };
  if (!manifest.exports) throw new Error(`${manifestFile}: no "exports"`);
  const exports = typeof manifest.exports === "string" ? { ".": manifest.exports } : manifest.exports;

  const symbols: Record<string, string> = {};
  const add = (key: string, text: string) => {
    let k = key;
    for (let n = 2; k in symbols; n++) k = `${key}~${n}`;
    symbols[k] = text;
  };
  const seen = new Set<string>();
  for (const [sub, file] of Object.entries(exports)) {
    const js = readFileSync(join(root, file), "utf8");
    const selfTypes = js.match(/@ts-self-types\s*=\s*"([^"]+)"/)?.[1];
    if (!selfTypes) throw new Error(`export "${sub}" (${file}) has no @ts-self-types: its surface is unknown`);
    const dts = join(file, "..", selfTypes).replace(/\\/g, "/");
    if (seen.has(dts)) continue;
    seen.add(dts);
    declarations(dts, readFileSync(join(root, dts), "utf8"), add);
  }

  const spec = readFileSync(join(root, "SPEC.md"), "utf8").match(/^Version:\s*(\d+\.\d+\.\d+)/m)?.[1];
  if (!spec) throw new Error('SPEC.md: no "Version: X.Y.Z" line');

  const sorted = (o: Record<string, string>) =>
    Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  return { spec, exports: sorted(exports), symbols: sorted(symbols) };
}

/** The canonical file text of a surface. */
export function render(s: Surface): string {
  return `${JSON.stringify(s, null, 2)}\n`;
}

const isMain = process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url).replace(/\\/g, "/") === process.argv[1].replace(/\\/g, "/");
if (isMain) {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const target = join(root, "api-surface.json");
  const text = render(surfaceOf(root));
  const n = Object.keys(JSON.parse(text).symbols).length;
  if (process.argv.includes("--check")) {
    const committed = existsSync(target) ? readFileSync(target, "utf8").replace(/\r\n/g, "\n") : "";
    if (committed !== text) {
      console.log("api-surface.json is not what the source generates.");
      console.log("An intended surface change is re-baselined in its OWN commit (`bun run surface`),");
      console.log("with the reason in the message, before any bump (compatibility gate Rule 5).");
      process.exit(1);
    }
    console.log(`api-surface.json is current: ${n} symbols`);
  } else {
    writeFileSync(target, text);
    console.log(`api-surface.json written: ${n} symbols`);
  }
}
