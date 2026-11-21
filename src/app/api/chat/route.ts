import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { currentUser } from "@/server/session";
import { findConversation, listMessages, markReadByUser, postUserMessage, startGuestConversation } from "@/server/chat";
import { sameOrigin } from "@/server/origin";
import { rateLimit } from "@/server/rate-limit";
import { requestIp, secureCookies } from "@/server/request";
import { isLocale } from "@/i18n/config";
import { EMAIL_RE, normaliseEmail } from "@/server/auth";

export const dynamic = "force-dynamic";
const GUEST_COOKIE = "amigo_chat";

async function conversationForRequest() {
  const user = await currentUser();
  if (user) return { user, conv: await findConversation({ userId: user.id }) };
  const token = (await cookies()).get(GUEST_COOKIE)?.value;
  return { user: null, conv: token ? await findConversation({ guestToken: token }) : null };
}

/**
 * Poll: new messages since `after`, plus the unread count for the badge.
 * `started` is true for signed-in members even before their first message, so
 * the widget never asks a member for their name and email.
 */
export async function GET(req: NextRequest) {
  const { user, conv } = await conversationForRequest();
  if (!conv) return NextResponse.json({ messages: [], unread: 0, started: !!user });
  const afterRaw = req.nextUrl.searchParams.get("after");
  const after = afterRaw && !Number.isNaN(Date.parse(afterRaw)) ? new Date(afterRaw) : undefined;
  const open = req.nextUrl.searchParams.get("open") === "1";
  const messages = await listMessages(conv.id, after);
  if (open && conv.unreadUser > 0) await markReadByUser(conv.id);
  return NextResponse.json({ messages, unread: open ? 0 : conv.unreadUser, started: true });
}

const body = z.discriminatedUnion("type", [
  z.object({ type: z.literal("start"), name: z.string().min(2).max(40), email: z.string().max(254), locale: z.string() }),
  z.object({ type: z.literal("message"), body: z.string().min(1).max(2000), locale: z.string() }),
]);

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const locale = isLocale(parsed.data.locale) ? parsed.data.locale : "en";
  const ip = await requestIp();
  const { user, conv } = await conversationForRequest();

  if (parsed.data.type === "start") {
    if (user || conv) return NextResponse.json({ ok: true });
    if (!(await rateLimit(`chat-start:${ip ?? "none"}`, 5, 3600))) return NextResponse.json({ error: "rate" }, { status: 429 });
    const email = normaliseEmail(parsed.data.email);
    if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "email" }, { status: 400 });
    const name = parsed.data.name.trim().replace(/[<>]/g, "");
    const { token } = await startGuestConversation(name, email, locale);
    (await cookies()).set(GUEST_COOKIE, token, { httpOnly: true, secure: secureCookies(), sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
    return NextResponse.json({ ok: true });
  }

  if (!user && !conv) return NextResponse.json({ error: "no conversation" }, { status: 400 });
  const r = await postUserMessage({
    conversationId: conv?.id,
    userId: user?.id,
    body: parsed.data.body,
    locale,
    rateKey: user?.id ?? `guest:${conv?.id}:${ip ?? ""}`,
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error === "RATE_LIMIT" ? 429 : 400 });
  return NextResponse.json({ ok: true });
}
