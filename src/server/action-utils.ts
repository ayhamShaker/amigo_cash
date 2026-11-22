import "server-only";
import { isLocale, type Locale } from "@/i18n/config";
import { makeT, type T } from "@/i18n/t";

export function localeFrom(fd: FormData): Locale {
  const v = fd.get("locale");
  return typeof v === "string" && isLocale(v) ? v : "en";
}

export function tFrom(fd: FormData): { locale: Locale; t: T } {
  const locale = localeFrom(fd);
  return { locale, t: makeT(locale) };
}

/** A string field, trimmed and cut to `max` characters. Non-strings become "". */
export function str(fd: FormData, name: string, max = 200): string {
  const v = fd.get(name);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/** Raw string (passwords are not trimmed). */
export function raw(fd: FormData, name: string, max = 200): string {
  const v = fd.get(name);
  return typeof v === "string" ? v.slice(0, max) : "";
}

export function int(fd: FormData, name: string): number | null {
  const v = str(fd, name, 20);
  if (!/^-?\d+$/.test(v)) return null;
  const n = Number(v);
  return Number.isSafeInteger(n) ? n : null;
}

export function bool(fd: FormData, name: string): boolean {
  const v = fd.get(name);
  return v === "on" || v === "true" || v === "1";
}

/** Dollars typed by a person ("12.50") to cents, or null. */
export function dollarsToCents(v: string): number | null {
  const m = /^(\d{1,6})(?:[.,](\d{1,2}))?$/.exec(v.trim());
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
}

/** Only allow redirects back into our own site. */
export function safeNext(next: string, locale: Locale): string {
  if (/^\/(en|es|ar)(\/[A-Za-z0-9/_-]*)?$/.test(next) && !next.includes("//")) return next;
  return `/${locale}/earn`;
}
