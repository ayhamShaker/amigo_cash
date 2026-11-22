import "server-only";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { randomToken, sha256 } from "@/lib/crypto";
import { makeT } from "@/i18n/t";
import { isLocale, type Locale } from "@/i18n/config";
import { rateLimit } from "./rate-limit";
import { sendEmail, simpleHtml } from "./email";
import { notify } from "./notify";

export const CHAT_MAX_LEN = 2000;

export type ChatMsg = { id: string; sender: "USER" | "ADMIN" | "BOT" | "SYSTEM"; authorName: string | null; body: string; emailed: boolean; createdAt: string };

function toMsg(m: { id: string; sender: ChatMsg["sender"]; authorName: string | null; body: string; emailed: boolean; createdAt: Date }): ChatMsg {
  return { id: m.id, sender: m.sender, authorName: m.authorName, body: m.body, emailed: m.emailed, createdAt: m.createdAt.toISOString() };
}

export function cleanBody(input: string): string {
  // keep line breaks, drop other control characters
  return input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, CHAT_MAX_LEN);
}

/** Finds the conversation for a member, or for a guest by their chat token. */
export async function findConversation(who: { userId: string } | { guestToken: string }) {
  if ("userId" in who) return db.chatConversation.findFirst({ where: { userId: who.userId }, orderBy: { updatedAt: "desc" } });
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(who.guestToken)) return null;
  return db.chatConversation.findUnique({ where: { guestTokenHash: sha256(who.guestToken) } });
}

export async function startGuestConversation(name: string, email: string, locale: Locale) {
  const token = randomToken(24);
  const conv = await db.chatConversation.create({
    data: { guestName: name.slice(0, 40), guestEmail: email.slice(0, 254), guestTokenHash: sha256(token), locale },
  });
  return { conv, token };
}

export async function listMessages(conversationId: string, after?: Date) {
  const rows = await db.chatMessage.findMany({
    where: { conversationId, ...(after ? { createdAt: { gt: after } } : {}) },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  return rows.map(toMsg);
}

/** A member or guest writes to support. The first message gets an automatic reply. */
export async function postUserMessage(args: { conversationId?: string; userId?: string; body: string; locale: Locale; rateKey: string }) {
  const body = cleanBody(args.body);
  if (!body) return { ok: false as const, error: "EMPTY" as const };
  if (!(await rateLimit(`chat:${args.rateKey}`, 20, 60))) return { ok: false as const, error: "RATE_LIMIT" as const };
  let convId = args.conversationId;
  if (!convId) {
    if (!args.userId) return { ok: false as const, error: "NO_CONVERSATION" as const };
    const existing = await db.chatConversation.findFirst({ where: { userId: args.userId }, orderBy: { updatedAt: "desc" } });
    convId = existing?.id ?? (await db.chatConversation.create({ data: { userId: args.userId, locale: args.locale } })).id;
  }
  const t = makeT(args.locale);
  const id = convId;
  await db.$transaction(async (tx) => {
    await tx.chatMessage.create({ data: { conversationId: id, sender: "USER", body } });
    const hasBot = await tx.chatMessage.count({ where: { conversationId: id, sender: "BOT" } });
    const conv = await tx.chatConversation.update({
      where: { id },
      data: { unreadAdmin: { increment: 1 }, status: "OPEN", locale: args.locale },
      include: { user: { select: { email: true } } },
    });
    if (!hasBot) {
      const email = conv.user?.email ?? conv.guestEmail ?? "";
      await tx.chatMessage.create({
        data: { conversationId: id, sender: "BOT", body: t("Thanks! An agent will reply here in a few minutes. If you leave, we will email the answer to {e}.", { e: email }) },
      });
    }
  });
  return { ok: true as const, conversationId: id };
}

export async function markReadByUser(conversationId: string) {
  await db.chatConversation.update({ where: { id: conversationId }, data: { unreadUser: 0 } });
}

/** Admin reply: shown live in the chat window and also sent by email. */
export async function postAdminReply(conversationId: string, adminName: string, bodyRaw: string) {
  const body = cleanBody(bodyRaw);
  if (!body) return { ok: false as const };
  const conv = await db.chatConversation.findUniqueOrThrow({ where: { id: conversationId }, include: { user: { select: { email: true, locale: true } } } });
  const msg = await db.chatMessage.create({ data: { conversationId, sender: "ADMIN", authorName: adminName.slice(0, 40), body } });
  await db.chatConversation.update({ where: { id: conversationId }, data: { unreadUser: { increment: 1 }, unreadAdmin: 0 } });

  if (conv.userId) await notify(conv.userId, "support", { k: "Support replied to your message." }, "/help?chat=1");
  const to = conv.user?.email ?? conv.guestEmail;
  let emailed = false;
  if (to) {
    const locale: Locale = isLocale(conv.locale) ? conv.locale : "en";
    const t = makeT(locale);
    const url = `${env().APP_URL}/${locale}/help?chat=1`;
    const text = `${t("Amigo Cash support replied to your message:")}\n\n${body}\n\n${t("Reply in the live chat on the site:")} ${url}`;
    emailed = await sendEmail({ to, subject: t("New reply from support"), text, html: simpleHtml(`${t("Amigo Cash support replied to your message:")}\n\n${body}`, { label: t("Open live chat"), url }) });
    if (emailed) await db.chatMessage.update({ where: { id: msg.id }, data: { emailed: true } });
  }
  return { ok: true as const, emailed, to };
}

export async function setConversationStatus(conversationId: string, status: "OPEN" | "CLOSED") {
  await db.$transaction([
    db.chatConversation.update({ where: { id: conversationId }, data: { status } }),
    db.chatMessage.create({ data: { conversationId, sender: "SYSTEM", body: status === "CLOSED" ? "Conversation closed" : "Conversation reopened" } }),
  ]);
}
