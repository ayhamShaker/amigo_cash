/** Accepts only same-site paths like "/en/cashout"; anything else falls back to the earn page. */
export function safeNextPublic(next: string | undefined, locale: string): string {
  if (next && /^\/(en|es|ar|hi)(\/[A-Za-z0-9/_-]*)?$/.test(next) && !next.includes("//")) return next;
  return `/${locale}/earn`;
}
