import "server-only";
import { redirect } from "next/navigation";
import { currentUser, type SessionUser } from "./session";

/**
 * Admin pages and actions require an ADMIN account with two-factor login on.
 * Pages redirect; actions throw (the form shows a generic error).
 */
export async function requireAdminPage(): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) redirect("/en/login?next=/en/account");
  if (u.role !== "ADMIN") redirect("/en/earn");
  if (!u.totpEnabled) redirect(`/${u.locale === "ar" ? "ar" : "en"}/account?admin2fa=1`);
  return u;
}

export async function requireAdminAction(): Promise<SessionUser> {
  const u = await currentUser();
  if (!u || u.role !== "ADMIN" || !u.totpEnabled) throw new Error("Forbidden");
  return u;
}
