// @ts-self-types="./wit-parser.d.ts"
/** @import { ParsedWit, WitFunc, WitParam, WitType } from "./wit-parser.js" */

/**
 * Convert kebab-case WIT name to camelCase JS name.
 * @param {string} name
 * @returns {string}
 */
export function kebabToCamel(name) {
  return name.replace(/-([a-z0-9])/g, (_, /** @type {string} */ c) => c.toUpperCase());
}

/**
 * Convert kebab-case WIT import name to the underscore WASM import key.
 * @param {string} name
 * @returns {string}
 */
export function kebabToWasmImportKey(name) {
  return name.replace(/-/g, "_");
}

/**
 * @param {string} raw
 * @returns {WitType}
 */
function parseWitType(raw) {
  switch (raw.trim()) {
    case "s32":    return "s32";
    case "s64":    return "s64";
    case "f32":    return "f32";
    case "f64":    return "f64";
    case "bool":   return "bool";
    case "string": return "string";
    default:       return "s32";
  }
}

/**
 * @param {string} raw
 * @returns {WitParam[]}
 */
function parseWitParams(raw) {
  if (!raw.trim()) return [];
  return raw.split(",").map(part => {
    const colon = part.indexOf(":");
    if (colon < 0) return null;
    const rawName = part.slice(0, colon).trim();
    const type = parseWitType(part.slice(colon + 1));
    return { name: kebabToCamel(rawName), type };
  }).filter((p) => p !== null);
}

/**
 * @param {string} body
 * @param {"import" | "export"} keyword
 * @returns {WitFunc[]}
 */
function parseWitFuncs(body, keyword) {
  /** @type {WitFunc[]} */
  const funcs = [];
  const re = new RegExp(
    `\\b${keyword}\\s+([\\w-]+)\\s*:\\s*func\\s*\\(([^)]*)\\)(?:\\s*->\\s*([\\w-]+))?\\s*;`,
    "g",
  );
  let m;
  while ((m = re.exec(body)) !== null) {
    // Groups 1 and 2 always participate when the regex matches; group 3 is optional.
    const name = /** @type {string} */ (m[1]);
    const params = parseWitParams(/** @type {string} */ (m[2]));
    const result = m[3] ? parseWitType(m[3]) : null;
    funcs.push({ name, tsName: kebabToCamel(name), params, result });
  }
  return funcs;
}

/**
 * Parse a WIT source string produced by wasmtk.
 *
 * @param {string} src
 * @returns {ParsedWit}
 */
export function parseWit(src) {
  const pkgMatch = src.match(/package\s+([\w:/-]+)\s*;/);
  const packageName = pkgMatch?.[1] ?? "";

  const worldMatch = src.match(/world\s+([\w-]+)\s*\{([\s\S]*)\}/);
  const worldName = worldMatch?.[1] ?? "";
  const worldBody = worldMatch?.[2] ?? "";

  return {
    packageName,
    worldName,
    imports: parseWitFuncs(worldBody, "import"),
    exports: parseWitFuncs(worldBody, "export"),
  };
}
