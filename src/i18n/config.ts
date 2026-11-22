export const LOCALES = ["en", "es", "ar", "hi"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

export function isLocale(v: string | undefined | null): v is Locale {
  return !!v && (LOCALES as readonly string[]).includes(v);
}

export const LOCALE_LABEL: Record<Locale, string> = { en: "EN", es: "ES", ar: "AR", hi: "HI" };
export const LOCALE_NAME: Record<Locale, string> = { en: "English", es: "Español", ar: "العربية", hi: "हिन्दी" };

export function dirOf(locale: Locale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}

/** BCP 47 tag used for number and date formatting. Arabic keeps Western digits. */
export function intlTag(locale: Locale): string {
  return locale === "es" ? "es-AR" : locale === "ar" ? "ar-u-nu-latn" : locale === "hi" ? "hi-IN-u-nu-latn" : "en-GB";
}
