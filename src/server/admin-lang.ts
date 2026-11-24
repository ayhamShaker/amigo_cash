import "server-only";
import { cookies } from "next/headers";

export type AdminLang = "ar" | "en";
export const ADMIN_LANG_COOKIE = "amigo_admin_lang";

export async function adminLang(): Promise<AdminLang> {
  const jar = await cookies();
  const explicit = jar.get(ADMIN_LANG_COOKIE)?.value;
  if (explicit === "en" || explicit === "ar") return explicit;
  const site = jar.get("amigo_locale")?.value;
  return site === "en" ? "en" : "ar";
}

export function makeAt(lang: AdminLang) {
  return (ar: string, en: string) => (lang === "en" ? en : ar);
}
