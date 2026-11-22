import type { Metadata } from "next";
import { requireAdminPage } from "@/server/admin-guard";
import { db } from "@/lib/db";
import { ActionForm, Submit } from "@/components/forms";
import { adminReplyAction, chatStatusAction } from "@/app/actions/admin";
import { agoAr } from "@/components/admin-ui";
import { LOCALE_NAME, isLocale } from "@/i18n/config";
import { QuickReplies } from "@/components/quick-replies";

export const metadata: Metadata = { title: "الدعم المباشر" };

export default async function ChatAdminPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const list = await db.chatConversation.findMany({
    orderBy: [{ unreadAdmin: "desc" }, { updatedAt: "desc" }],
    take: 60,
    include: { user: { select: { id: true, name: true, email: true } }, messages: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  const selId = sp.c && list.some((c) => c.id === sp.c) ? sp.c : list[0]?.id;
  const conv = selId
    ? await db.chatConversation.findUnique({ where: { id: selId }, include: { user: { select: { id: true, name: true, email: true } }, messages: { orderBy: { createdAt: "asc" }, take: 300 } } })
    : null;
  if (conv && conv.unreadAdmin > 0) await db.chatConversation.update({ where: { id: conv.id }, data: { unreadAdmin: 0 } });
  const nameOf = (c: { user: { name: string } | null; guestName: string | null }) => c.user?.name ?? c.guestName ?? "زائر";
  const emailOf = (c: { user: { email: string } | null; guestEmail: string | null }) => c.user?.email ?? c.guestEmail ?? "";

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>الدعم المباشر</h1>
          <p className="small muted">محادثات لايف مع الأعضاء والزوار. ردك بيوصل فورا بنافذة الشات عندهم، وبينبعتلهم كمان إيميل إنك رديت. الصفحة بتتحدث لحالها.</p>
        </div>
      </div>
      <div className="inbox">
        <div className="inbox-list">
          {list.length ? (
            list.map((c) => (
              <a key={c.id} className={`inbox-item ${c.id === selId ? "on" : ""}`} href={`/admin/chat?c=${c.id}`}>
                <span className="avatar" style={{ width: 34, height: 34, fontSize: 13, background: "var(--accent)" }}>
                  {nameOf(c)[0]?.toUpperCase()}
                </span>
                <span className="grow" style={{ minWidth: 0 }}>
                  <span className="row between">
                    <b className="small">{nameOf(c)}</b>
                    <span className="tiny muted">{agoAr(c.updatedAt)}</span>
                  </span>
                  <span className="tiny muted ell" dir="auto">
                    {c.messages[0]?.body ?? ""}
                  </span>
                </span>
                {c.unreadAdmin > 0 && c.id !== selId ? <span className="badge">{c.unreadAdmin}</span> : c.status === "CLOSED" ? <span className="pill">مغلقة</span> : null}
              </a>
            ))
          ) : (
            <div className="empty">ما في محادثات لسا.</div>
          )}
        </div>
        <div className="inbox-thread">
          {conv ? (
            <>
              <div className="row between wr" style={{ paddingBottom: 12, borderBottom: "1px solid var(--line)" }}>
                <div>
                  <b>{nameOf(conv)}</b> {conv.user ? null : <span className="pill">زائر</span>}
                  <div className="tiny muted" dir="ltr" style={{ textAlign: "right" }}>
                    {emailOf(conv)} · {isLocale(conv.locale) ? LOCALE_NAME[conv.locale] : conv.locale}
                  </div>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  {conv.user ? (
                    <a className="btn ghost sm" href={`/admin/users/${conv.user.id}`}>
                      ملف العضو
                    </a>
                  ) : null}
                  <ActionForm action={chatStatusAction}>
                    <input type="hidden" name="conversationId" value={conv.id} />
                    <input type="hidden" name="status" value={conv.status === "OPEN" ? "CLOSED" : "OPEN"} />
                    <Submit className="btn ghost sm">{conv.status === "OPEN" ? "إغلاق المحادثة" : "إعادة فتح"}</Submit>
                  </ActionForm>
                </div>
              </div>
              <div className="thread" dir="ltr">
                {conv.messages.map((m) =>
                  m.sender === "USER" ? (
                    <div key={m.id} className="msg them" dir="auto">
                      {m.body}
                      <span className="ts">{agoAr(m.createdAt)}</span>
                    </div>
                  ) : m.sender === "SYSTEM" ? (
                    <div key={m.id} className="msg sys">
                      {m.body}
                    </div>
                  ) : (
                    <div key={m.id} className="msg me" dir="auto">
                      {m.body}
                      <span className="ts">
                        {m.sender === "BOT" ? "رد تلقائي · " : `${m.authorName ?? ""} · `}
                        {agoAr(m.createdAt)}
                        {m.emailed ? ` · ✉ إيميل أرسل` : ""}
                      </span>
                    </div>
                  ),
                )}
              </div>
              <ActionForm action={adminReplyAction} className="stack" resetOnOk>
                <input type="hidden" name="conversationId" value={conv.id} />
                <QuickReplies
                  target="ar-text"
                  replies={
                    conv.locale === "es"
                      ? ["¡Hola! Ya lo reviso.", "Tus monedas ya están en tu saldo.", "Tu retiro ya fue enviado.", "Apagá la VPN y probá de nuevo."]
                      : conv.locale === "ar"
                        ? ["أهلا! خليني أتحقق من الموضوع.", "العملات صارت برصيدك.", "تم إرسال السحب.", "أوقف الـ VPN وجرب مرة ثانية."]
                        : conv.locale === "hi"
                          ? ["नमस्ते! मैं अभी देखता हूँ।", "आपके कॉइन अब आपके बैलेंस में हैं।", "आपकी निकासी भेज दी गई है।", "कृपया VPN बंद करके फिर कोशिश करें।"]
                          : ["Hi! Let me check that for you.", "Your coins are now in your balance.", "Your withdrawal has been sent.", "Please turn off your VPN and try again."]
                  }
                />
                <div className="row" style={{ alignItems: "flex-end" }}>
                  <textarea className="input grow" id="ar-text" name="body" rows={2} dir="auto" placeholder="اكتب ردك… (يفضل بلغة العضو)" maxLength={2000} />
                  <Submit>إرسال</Submit>
                </div>
              </ActionForm>
            </>
          ) : (
            <div className="empty">اختر محادثة</div>
          )}
        </div>
      </div>
    </>
  );
}
