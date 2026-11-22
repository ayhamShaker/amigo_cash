/**
 * Lists every t("…") key used in src/ that has no Spanish or Arabic translation.
 * Run: npm run i18n:check   (exits 1 when something is missing)
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const es = JSON.parse(readFileSync("src/i18n/es.json", "utf8")) as Record<string, string>;
const ar = JSON.parse(readFileSync("src/i18n/ar.json", "utf8")) as Record<string, string>;
const hi = JSON.parse(readFileSync("src/i18n/hi.json", "utf8")) as Record<string, string>;

function walk(dir: string, out: string[] = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) {
      if (!["generated", "admin"].includes(f)) walk(p, out);
    } else if (/\.(ts|tsx)$/.test(f)) out.push(p);
  }
  return out;
}

const keys = new Set<string>();
const re = /\bt\(\s*(["'`])((?:\\.|(?!\1).)+)\1/g;
for (const file of walk("src")) {
  if (file.includes("/actions/admin") || file.includes("admin-")) continue;
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(re)) if (!m[2]!.includes("${")) keys.add(m[2]!.replace(/\\'/g, "'").replace(/\\"/g, '"'));
}
const missing = [...keys].filter((k) => !es[k] || !ar[k] || !hi[k]).sort();
if (missing.length) {
  console.log(`${missing.length} keys without a translation:\n`);
  for (const k of missing) console.log(JSON.stringify(k));
  process.exit(1);
}
console.log(`All ${keys.size} keys are translated.`);
