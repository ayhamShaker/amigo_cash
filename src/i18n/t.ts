import es from "./es.json";
import ar from "./ar.json";
import stepPatterns from "./step-patterns.json";
import { intlTag, type Locale } from "./config";

/**
 * Messages are keyed by their English text. English needs no dictionary;
 * a missing translation falls back to English (scripts/check-i18n.ts reports gaps).
 */
const DICTS: Record<Exclude<Locale, "en">, Record<string, string>> = { es, ar };
const PATTERNS = (stepPatterns as [string, string, string][]).map(([src, esT, arT]) => ({ re: new RegExp(src), es: esT, ar: arT }));

export type Vars = Record<string, string | number>;
export type T = (key: string, vars?: Vars) => string;

export function fill(s: string, vars?: Vars): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (vars[k] !== undefined ? String(vars[k]) : m));
}

export function makeT(locale: Locale): T {
  if (locale === "en") return (key, vars) => fill(key, vars);
  const dict = DICTS[locale];
  return (key, vars) => fill(dict[key] ?? key, vars);
}

/**
 * Translates free text that may come from data (offer steps, network kinds,
 * reasons). Exact matches first, then the known step patterns ("Reach level 20").
 */
export function translateData(locale: Locale, text: string): string {
  if (locale === "en" || !text) return text;
  const dict = DICTS[locale];
  if (dict[text]) return dict[text]!;
  for (const p of PATTERNS) if (p.re.test(text)) return text.replace(p.re, locale === "es" ? p.es : p.ar);
  return text;
}

/** Renders a ledger description ({ k, a }) in the member's language. */
export function describe(locale: Locale, desc: unknown): string {
  if (!desc || typeof desc !== "object") return String(desc ?? "");
  const d = desc as { k?: string; a?: Vars };
  const args: Vars = {};
  for (const [k, v] of Object.entries(d.a ?? {})) args[k] = typeof v === "string" ? translateData(locale, v) : v;
  return makeT(locale)(d.k ?? "", args);
}

export function formatDate(locale: Locale, d: Date): string {
  return d.toLocaleDateString(intlTag(locale), { day: "2-digit", month: "short", year: "numeric" });
}

export function timeAgo(locale: Locale, d: Date, now = Date.now()): string {
  const s = Math.max(1, Math.round((now - d.getTime()) / 1000));
  const [n, unit] = s < 60 ? [s, 0] : s < 3600 ? [Math.round(s / 60), 1] : s < 86400 ? [Math.round(s / 3600), 2] : [Math.round(s / 86400), 3];
  if (locale === "es") return `hace ${n} ${["s", "min", "h", "d"][unit]}`;
  if (locale === "ar") return `قبل ${n} ${["ث", "د", "س", "يوم"][unit]}`;
  return `${n}${["s", "m", "h", "d"][unit]} ago`;
}
