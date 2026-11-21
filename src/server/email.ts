import "server-only";
import { env } from "@/lib/env";

export type Mail = { to: string; subject: string; text: string; html?: string };

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Plain, readable HTML version of a text email, with one optional button. */
export function simpleHtml(text: string, button?: { label: string; url: string }) {
  const paras = text.split("\n\n").map((p) => `<p style="margin:0 0 14px">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("");
  const btn = button
    ? `<p style="margin:20px 0"><a href="${escapeHtml(button.url)}" style="background:#0284C7;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:700">${escapeHtml(button.label)}</a></p>`
    : "";
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#151823;max-width:520px">
<p style="font-size:20px;font-weight:800;margin:0 0 18px">amigo <span style="background:#0284C7;color:#fff;font-size:11px;padding:3px 6px;border-radius:3px">CASH</span></p>
${paras}${btn}<p style="color:#5F6678;font-size:12px;margin-top:28px">Amigo Cash</p></div>`;
}

/**
 * Sends through Resend when RESEND_API_KEY is set. Without a key (local
 * development) the email is written to the server log instead.
 * Returns true when the provider accepted the message.
 */
export async function sendEmail(mail: Mail): Promise<boolean> {
  const e = env();
  if (!e.RESEND_API_KEY) {
    if (e.NODE_ENV !== "production") console.info(`[email:dev] to=${mail.to} subject="${mail.subject}"\n${mail.text}`);
    return e.NODE_ENV !== "production";
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${e.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: e.EMAIL_FROM, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html ?? simpleHtml(mail.text) }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error(`[email] provider returned ${res.status}`);
    return res.ok;
  } catch (err) {
    console.error("[email] send failed", (err as Error).message);
    return false;
  }
}
