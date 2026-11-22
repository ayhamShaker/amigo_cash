import "server-only";
import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { isLocale, type Locale } from "@/i18n/config";
import { makeT } from "@/i18n/t";
import { currentUser } from "@/server/session";

export async function pageLocale(params: Promise<{ locale: string }>): Promise<{ locale: Locale; t: ReturnType<typeof makeT> }> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return { locale, t: makeT(locale) };
}

export async function requireMember(locale: Locale, path: string) {
  const u = await currentUser();
  if (!u) redirect(`/${locale}/login?next=${encodeURIComponent(`/${locale}${path}`)}`);
  return u;
}

export async function themeCookie(): Promise<"light" | "dark" | "system"> {
  const v = (await cookies()).get("amigo_theme")?.value;
  return v === "light" || v === "dark" ? v : "system";
}

export function pwLabels(t: ReturnType<typeof makeT>) {
  return { show: t("Show password"), hide: t("Hide password") };
}
