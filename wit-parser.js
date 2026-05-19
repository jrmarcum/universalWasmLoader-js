// @ts-self-types="./wit-parser.d.ts"

/** Convert kebab-case WIT name to camelCase JS name. */
export function kebabToCamel(name) {
  return name.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
}

/** Convert kebab-case WIT import name to the underscore WASM import key. */
export function kebabToWasmImportKey(name) {
  return name.replace(/-/g, "_");
}

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

function parseWitParams(raw) {
  if (!raw.trim()) return [];
  return raw.split(",").map(part => {
    const colon = part.indexOf(":");
    if (colon < 0) return null;
    const rawName = part.slice(0, colon).trim();
    const type = parseWitType(part.slice(colon + 1));
    return { name: kebabToCamel(rawName), type };
  }).filter(Boolean);
}

function parseWitFuncs(body, keyword) {
  const funcs = [];
  const re = new RegExp(
    `\\b${keyword}\\s+([\\w-]+)\\s*:\\s*func\\s*\\(([^)]*)\\)(?:\\s*->\\s*([\\w-]+))?\\s*;`,
    "g",
  );
  let m;
  while ((m = re.exec(body)) !== null) {
    const name = m[1];
    const params = parseWitParams(m[2]);
    const result = m[3] ? parseWitType(m[3]) : null;
    funcs.push({ name, tsName: kebabToCamel(name), params, result });
  }
  return funcs;
}

/**
 * Parse a WIT source string produced by wasmtk.
 *
 * @param {string} src
 * @returns {{ packageName: string, worldName: string, imports: Array<{name:string,tsName:string,params:Array,result:string|null}>, exports: Array<{name:string,tsName:string,params:Array,result:string|null}> }}
 */
export function parseWit(src) {
  const pkgMatch = src.match(/package\s+([\w:/-]+)\s*;/);
  const packageName = pkgMatch ? pkgMatch[1] : "";

  const worldMatch = src.match(/world\s+([\w-]+)\s*\{([\s\S]*)\}/);
  const worldName = worldMatch ? worldMatch[1] : "";
  const worldBody = worldMatch ? worldMatch[2] : "";

  return {
    packageName,
    worldName,
    imports: parseWitFuncs(worldBody, "import"),
    exports: parseWitFuncs(worldBody, "export"),
  };
}
