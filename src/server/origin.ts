import "server-only";
import { env } from "@/lib/env";

/**
 * CSRF guard for JSON route handlers: browsers always send Origin on POST, so a
 * request whose Origin is not our own site is refused. (Server Actions do this
 * check themselves.)
 */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    const allowed = new URL(env().APP_URL).origin;
    const reqHost = req.headers.get("host");
    const o = new URL(origin);
    return o.origin === allowed || (!!reqHost && o.host === reqHost);
  } catch {
    return false;
  }
}
