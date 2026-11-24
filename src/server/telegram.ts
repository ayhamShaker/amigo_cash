import "server-only";
import { env } from "@/lib/env";

/**
 * Sends a plain-text alert to the owner's Telegram chat.
 * Switched off silently when TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is empty.
 * Never throws so a Telegram outage never interrupts money or chat flows.
 */
export async function notifyAdminTelegram(text: string): Promise<boolean> {
  const e = env();
  if (!e.TELEGRAM_BOT_TOKEN || !e.TELEGRAM_CHAT_ID) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${encodeURIComponent(e.TELEGRAM_BOT_TOKEN)}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: e.TELEGRAM_CHAT_ID,
        text: text.slice(0, 3900),
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) {
      console.warn(`[telegram] HTTP ${res.status}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`[telegram] ${(err as Error).message}`);
    return false;
  }
}
