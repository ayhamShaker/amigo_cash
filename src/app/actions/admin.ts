"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/forms";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { encrypt } from "@/lib/crypto";
import { requireAdminAction } from "@/server/admin-guard";
import { audit } from "@/server/audit";
import { requestIp } from "@/server/request";
import { adjustBalance, releaseDueHolds } from "@/server/ledger";
import { approveWithdrawal, markWithdrawalPaid, rejectWithdrawal } from "@/server/withdrawals";
import { adminReverseConversion, buildSignedUrl, handlePostback, SIGNATURE_MODES, type SignatureMode } from "@/server/postback";
import { decrypt } from "@/lib/crypto";
import { postAdminReply, setConversationStatus } from "@/server/chat";
import { getSettings, METHOD_IDS, saveSettings, siteSettingsSchema, type SiteSettings } from "@/server/settings";
import { bool, dollarsToCents, int, str } from "@/server/action-utils";
import { normalisePromo } from "@/server/rewards";
import { clearTotp } from "@/server/auth";
import { notify } from "@/server/notify";
import { formatCoins, formatUsd } from "@/lib/money";
import { ipInAllowList } from "@/lib/ip";

/**
 * Links pasted on a phone often carry spaces, invisible direction marks or
 * full-width brackets. Normalise them before checking the link.
 */
function cleanUrl(v: string): string {
  return v
    .normalize("NFKC") // full-width ｛ ｝ → { }
    .replace(/[\s\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, "")
    .replace(/%7Buser_id%7D/gi, "{user_id}");
}

const FAIL = "ما تم الحفظ. تأكد من القيم وجرب مرة ثانية.";

async function ctx() {
  const admin = await requireAdminAction();
  return { admin, ip: await requestIp() };
}

/* ---------------- users ---------------- */

export async function adjustBalanceAction(_p: FormState, fd: FormData): Promise<FormState> {
  const { admin, ip } = await ctx();
  const userId = str(fd, "userId", 40);
  const coins = int(fd, "coins");
  const reason = str(fd, "reason", 200) || "Balance adjustment by support";
  if (!coins || Math.abs(coins) > 10_000_000) return { error: "أدخل عدد كوينز صحيح (موجب للإضافة، سالب للخصم)." };
  await db.$transaction((tx) => adjustBalance(tx, userId, coins, reason));
  await audit({ actorId: admin.id, action: "user.adjust_balance", targetType: "user", targetId: userId, data: { coins, reason }, ip });
  await notify(
    userId,
    "balance",
    coins > 0 ? { k: "Support added {c} coins to your balance: {r}", a: { c: formatCoins(coins), r: reason } } : { k: "Support removed {c} coins from your balance: {r}", a: { c: formatCoins(-coins), r: reason } },
    "/activity",
  );
  revalidatePath(`/admin/users/${userId}`);
  return { ok: `تم تعديل الرصيد ${coins > 0 ? "+" : ""}${formatCoins(coins)}` };
}

export async function setUserStatusAction(_p: FormState, fd: FormData): Promise<FormState> {
  const { admin, ip } = await ctx();
  const userId = str(fd, "userId", 40);
  const status = str(fd, "status", 10) === "BANNED" ? "BANNED" : "ACTIVE";
  if (userId === admin.id) return { error: "ما فيك تحظر حسابك." };
  await db.user.update({ where: { id: userId }, data: { status } });
  if (status === "BANNED") await db.session.deleteMany({ where: { userId } });
  await audit({ actorId: admin.id, action: status === "BANNED" ? "user.ban" : "user.unban", targetType: "user", targetId: userId, ip });
  revalidatePath(`/admin/users/${userId}`);
  return { ok: status === "BANNED" ? "تم حظر الحساب وتسجيل خروجه من كل الأجهزة." : "تم رفع الحظر." };
}

export async function clearFlagsAction(_p: FormState, fd: FormData): Promise<FormState> {
  const { admin, ip } = await ctx();
  const userId = str(fd, "userId", 40);
  await db.user.update({ where: { id: userId }, data: { flags: [], riskScore: 0 } });
  await audit({ actorId: admin.id, action: "user.clear_flags", targetType: "user", targetId: userId, ip });
  revalidatePath(`/admin/users/${userId}`);
  return { ok: "تم وضع الحساب كموثوق." };
}

export async function releaseUserHoldsAction(_p: FormState, fd: FormData): Promise<FormState> {
  const { admin, ip } = await ctx();
  const userId = str(fd, "userId", 40);
  await db.ledgerEntry.updateMany({ where: { userId, bucket: "PENDING", releasedAt: null, amount: { gt: 0 } }, data: { releaseAt: new Date() } });
  const n = await releaseDueHolds({ userId });
  await audit({ actorId: admin.id, action: "user.release_holds", targetType: "user", targetId: userId, data: { coins: n }, ip });
  revalidatePath(`/admin/users/${userId}`);
  return { ok: `تم تحرير ${formatCoins(n)} كوين.` };
}

export async function setRoleAction(_p: FormState, fd: FormData): Promise<FormState> {
  const { admin, ip } = await ctx();
  const userId = str(fd, "userId", 40);
  const role = str(fd, "role", 10) === "ADMIN" ? "ADMIN" : "USER";
  if (userId === admin.id) return { error: "ما فيك تغيّر صلاحيات حسابك." };
  await db.user.update({ where: { id: userId }, data: { role } });
  await db.session.deleteMany({ where: { userId } });
  await audit({ actorId: admin.id, action: role === "ADMIN" ? "user.make_admin" : "user.remove_admin", targetType: "user", targetId: userId, ip });
  revalidatePath(`/admin/users/${userId}`);
  return { ok: role === "ADMIN" ? "صار مدير. لازم يفعّل التحقق بخطوتين قبل ما يدخل اللوحة." : "تمت إزالة صلاحية المدير." };
}

export async function confirmEmailAction(_p: FormState, fd: FormData): Promise<FormState> {
  const { admin, ip } = await ctx();
  const userId = str(fd, "userId", 40);
  await db.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  await audit({ actorId: admin.id, action: "user.confirm_email", targetType: "user", targetId: userId, ip });
  await notify(userId, "account", { k: "Your email is confirmed. You can cash out once you reach the minimum." }, "/cashout");
  revalidatePath(`/admin/users/${userId}`);
  return { ok: "تم تأكيد إيميل العضو يدوياً." };
}

export async function resetTwoFactorAction(_p: FormState, fd: FormData): Promise<FormState> {
  const { admin, ip } = await ctx();
  const userId = str(fd, "userId", 40);
  if (userId === admin.id) return { error: "ما فيك تلغي التحقق بخطوتين لحسابك من هون." };
  if (str(fd, "confirm", 10) !== "RESET") return { error: "اكتب RESET للتأكيد." };
  await clearTotp(userId);
  await audit({ actorId: admin.id, action: "user.reset_2fa", targetType: "user", targetId: userId, ip });
  revalidatePath(`/admin/users/${userId}`);
  return { ok: "تم إلغاء التحقق بخطوتين وتسجيل خروجه من كل الأجهزة. خليه يفعّله من جديد بعد ما يدخل." };
}

/* ---------------- withdrawals ---------------- */

export async function withdrawalAction(_p: FormState, fd: FormData): Promise<FormState> {
  const { admin, ip } = await ctx();
  const id = str(fd, "id", 40);
  const op = str(fd, "op", 10);
  let ok = false;
  if (op === "approve") ok = await approveWithdrawal(id, admin.id);
  else if (op === "paid") ok = await markWithdrawalPaid(id, admin.id, str(fd, "txRef", 200));
  else if (op === "reject") {
    const reason = str(fd, "reason", 200);
    if (!reason) return { error: "اختر سبب الرفض." };
    ok = await rejectWithdrawal(id, admin.id, reason);
  }
  if (!ok) return { error: "هالطلب انعالج من قبل أو حالته ما بتسمح بهالعملية." };
  await audit({ actorId: admin.id, action: `withdrawal.${op}`, targetType: "withdrawal", targetId: id, ip });
  const w = await db.withdrawal.findUnique({ where: { id }, select: { userId: true, amountCents: true, feeCents: true, note: true, txRef: true } });
  if (w) {
    const v = formatUsd(w.amountCents - w.feeCents);
    if (op === "approve") await notify(w.userId, "withdrawal", { k: "Your withdrawal of {v} was approved. It will be sent soon.", a: { v } }, "/cashout");
    if (op === "paid") await notify(w.userId, "withdrawal", { k: "Your withdrawal of {v} was sent. Reference: {ref}", a: { v, ref: w.txRef ?? "—" } }, "/cashout");
    if (op === "reject") await notify(w.userId, "withdrawal", { k: "Your withdrawal of {v} was rejected and the coins are back in your balance. Reason: {r}", a: { v, r: w.note ?? "" } }, "/cashout");
  }
  revalidatePath("/admin/withdrawals");
  return { ok: op === "approve" ? "تمت الموافقة. أرسل المبلغ وبعدين اضغط «تم الدفع»." : op === "paid" ? "تم تسجيل الدفع." : "تم الرفض وإرجاع الرصيد للمستخدم." };
}

/* ---------------- offers ---------------- */

function parseSteps(text: string) {
  const steps = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [label, pct] = l.split("|").map((s) => s.trim());
      return { label: (label ?? "").slice(0, 120), pct: Number((pct ?? "").replace("%", "")) };
    });
  if (!steps.length || steps.some((s) => !s.label || !Number.isFinite(s.pct) || s.pct <= 0)) return null;
  const total = steps.reduce((a, s) => a + s.pct, 0);
  return Math.abs(total - 100) < 0.01 ? steps : null;
}

export async function saveOfferAction(_p: FormState, fd: FormData): Promise<FormState> {
  const { admin, ip } = await ctx();
  const id = str(fd, "id", 40);
  const steps = parseSteps(str(fd, "steps", 4000));
  if (!steps) return { error: "المراحل: كل سطر «اسم المرحلة | النسبة»، ومجموع النسب لازم يكون 100." };
  const payoutCents = dollarsToCents(str(fd, "payout", 12));
  if (payoutCents === null || payoutCents <= 0) return { error: "اكتب كم بتدفع الشبكة بالدولار، مثلاً 12.50" };
  const trackingUrl = cleanUrl(str(fd, "trackingUrl", 1000));
  try {
    const u = new URL(trackingUrl.replaceAll("{user_id}", "x"));
    if (u.protocol !== "https:" || !trackingUrl.includes("{user_id}")) throw new Error();
  } catch {
    return { error: "رابط التتبع لازم يبدأ بـ https:// ويحتوي {user_id}" };
  }
  const color = /^#[0-9a-fA-F]{6}$/.test(str(fd, "color", 7)) ? str(fd, "color", 7) : "#0284C7";
  const networkId = str(fd, "networkId", 40);
  if (!(await db.network.findUnique({ where: { id: networkId } }))) return { error: "اختر شبكة." };
  const data = {
    title: str(fd, "title", 80),
    networkId,
    category: ["game", "app", "signup", "finance", "trial"].includes(str(fd, "category", 10)) ? str(fd, "category", 10) : "game",
    payoutCents,
    color,
    countries: str(fd, "countries", 200).toUpperCase().split(/[\s,]+/).filter((c) => /^[A-Z]{2}$/.test(c)),
    platform: str(fd, "platform", 40) || "Android · iOS",
    days: Math.min(365, Math.max(1, int(fd, "days") ?? 14)),
    description: str(fd, "description", 300),
    steps,
    trackingUrl,
    active: bool(fd, "active"),
    featured: bool(fd, "featured"),
  };
  if (!data.title) return { error: "اكتب اسم العرض." };
  const saved = id ? await db.offer.update({ where: { id }, data }) : await db.offer.create({ data });
  await audit({ actorId: admin.id, action: id ? "offer.update" : "offer.create", targetType: "offer", targetId: saved.id, data: { title: data.title, payoutCents }, ip });
  revalidatePath("/admin/offers");
  return { ok: "تم حفظ العرض." };
}

export async function deleteOfferAction(_p: FormState, fd: FormData): Promise<FormState> {
  const { admin, ip } = await ctx();
  const id = str(fd, "id", 40);
  if (str(fd, "confirm", 10) !== "DELETE") return { error: "اكتب DELETE للتأكيد." };
  await db.offer.delete({ where: { id } });
  await audit({ actorId: admin.id, action: "offer.delete", targetType: "offer", targetId: id, ip });
  revalidatePath("/admin/offers");
  return { ok: "تم حذف العرض." };
}

/* ---------------- networks ---------------- */

export async function saveNetworkAction(_p: FormState, fd: FormData): Promise<FormState> {
  const { admin, ip } = await ctx();
  const isNew = str(fd, "isNew", 5) === "1";
  const id = str(fd, "id", 30).toLowerCase();
  if (!/^[a-z0-9-]{2,30}$/.test(id)) return { error: "المعرّف: أحرف إنجليزية صغيرة وأرقام فقط، مثل torox" };
  const mode = str(fd, "signatureMode", 20) as SignatureMode;
  if (!SIGNATURE_MODES.includes(mode)) return { error: FAIL };
  const shareRaw = str(fd, "userShare", 3);
  const userShare = shareRaw === "" ? null : Math.max(0, Math.min(100, Number(shareRaw)));
  if (userShare !== null && !Number.isFinite(userShare)) return { error: FAIL };
  const allowedIps = str(fd, "allowedIps", 1000).split(/[\s,]+/).filter(Boolean);
  if (allowedIps.some((e) => !ipInAllowList(e.split("/")[0] ?? "", [e]))) return { error: "قائمة الـ IP فيها قيمة غلط." };
  const wallUrl = cleanUrl(str(fd, "wallUrl", 1000));
  if (wallUrl && (!wallUrl.startsWith("https://") || !wallUrl.includes("{user_id}"))) return { error: "رابط جدار العروض لازم يبدأ بـ https:// ويحتوي {user_id}" };
  const secret = str(fd, "secret", 200);
  const data = {
    name: str(fd, "name", 40) || id,
    kind: str(fd, "kind", 40) || "Mixed offers",
    enabled: bool(fd, "enabled"),
    userShare,
    signatureMode: mode,
    allowedIps,
    wallUrl: wallUrl || null,
    ...(secret ? { secretEnc: encrypt(secret, env().ENCRYPTION_KEY) } : {}),
  };
  if (isNew) {
    if (await db.network.findUnique({ where: { id } })) return { error: "في شبكة بنفس المعرّف." };
    await db.network.create({ data: { id, ...data } });
  } else {
    await db.network.update({ where: { id }, data });
  }
  await audit({ actorId: admin.id, action: isNew ? "network.create" : "network.update", targetType: "network", targetId: id, data: { enabled: data.enabled, userShare, mode, secretChanged: !!secret }, ip });
  revalidatePath("/admin/networks");
  return { ok: `تم حفظ إعدادات ${data.name}.` };
}

/* ---------------- postbacks ---------------- */

/**
 * Sends a correctly signed "offer completed" postback through the real
 * pipeline, using the secret stored for the network. Credits real coins to the
 * chosen member (reversible from the postback log).
 */
export async function sendTestPostbackAction(_p: FormState, fd: FormData): Promise<FormState> {
  const { admin, ip } = await ctx();
  const networkId = str(fd, "networkId", 30);
  const who = str(fd, "member", 254);
  const payout = dollarsToCents(str(fd, "payout", 12) || "1");
  if (payout === null || payout <= 0 || payout > 10_000) return { error: "اكتب مبلغ بين 0.01 و 100 دولار." };
  const network = await db.network.findUnique({ where: { id: networkId } });
  if (!network?.secretEnc) return { error: "احفظ سر الـ Postback لهالشبكة أولاً." };
  const member = await db.user.findFirst({ where: { OR: [{ id: who }, { email: who.toLowerCase() }] }, select: { id: true, name: true } });
  if (!member) return { error: "ما لقيت عضو بهالإيميل أو الرقم." };
  const url = buildSignedUrl(network.signatureMode as SignatureMode, decrypt(network.secretEnc, env().ENCRYPTION_KEY), `${env().APP_URL}/api/postback/${network.id}`, {
    subid: member.id,
    txid: `admin-test-${Date.now()}`,
    payout: (payout / 100).toFixed(2),
    status: "1",
    offer: "Test offer",
  });
  const r = await handlePostback(network.id, url, ip, { adminTest: true });
  await audit({ actorId: admin.id, action: "postback.test", targetType: "network", targetId: network.id, data: { member: member.id, payoutCents: payout, outcome: r.outcome }, ip });
  revalidatePath("/admin/networks");
  if (r.outcome === "credited") return { ok: `✓ وصل التأكيد وانضاف الرصيد لـ ${member.name}. شوفه بسجل التأكيدات.` };
  if (r.outcome === "refused") return { error: `الشبكة رفضت: ${r.reason === "network disabled" ? "الشبكة متوقفة، فعّلها أولاً" : r.reason}` };
  if (r.outcome === "rejected") return { error: `انسجّل بس ما انضاف رصيد: ${r.reason === "user banned" ? "العضو محظور" : r.reason}` };
  return { ok: "انسجّل." };
}

export async function reverseConversionAction(_p: FormState, fd: FormData): Promise<FormState> {
  const { admin, ip } = await ctx();
  const id = str(fd, "id", 40);
  const coins = await adminReverseConversion(id);
  if (!coins) return { error: "هالعملية مستردة من قبل أو مرفوضة." };
  await audit({ actorId: admin.id, action: "conversion.reverse", targetType: "conversion", targetId: id, data: { coins }, ip });
  revalidatePath("/admin/postbacks");
  return { ok: `تم الاسترداد وخصم ${formatCoins(coins)} كوين.` };
}

/* ---------------- promos ---------------- */

export async function createPromoAction(_p: FormState, fd: FormData): Promise<FormState> {
  const { admin, ip } = await ctx();
  const code = normalisePromo(str(fd, "code", 40));
  const coins = int(fd, "coins");
  const maxUses = int(fd, "maxUses");
  if (!code || code.length < 3) return { error: "الكود لازم يكون 3 أحرف أو أكثر (إنجليزي وأرقام)." };
  if (!coins || coins <= 0 || coins > 1_000_000 || !maxUses || maxUses <= 0 || maxUses > 1_000_000) return { error: FAIL };
  if (await db.promoCode.findUnique({ where: { code } })) return { error: "الكود موجود." };
  await db.promoCode.create({ data: { code, coins, maxUses } });
  await audit({ actorId: admin.id, action: "promo.create", targetType: "promo", targetId: code, data: { coins, maxUses }, ip });
  revalidatePath("/admin/promos");
  return { ok: `تم إنشاء الكود ${code}.` };
}

export async function togglePromoAction(_p: FormState, fd: FormData): Promise<FormState> {
  const { admin, ip } = await ctx();
  const code = normalisePromo(str(fd, "code", 40));
  const active = bool(fd, "active");
  await db.promoCode.update({ where: { code }, data: { active } });
  await audit({ actorId: admin.id, action: active ? "promo.enable" : "promo.disable", targetType: "promo", targetId: code, ip });
  revalidatePath("/admin/promos");
  return { ok: active ? "الكود مفعّل." : "الكود متوقف." };
}

/* ---------------- chat ---------------- */

export async function adminReplyAction(_p: FormState, fd: FormData): Promise<FormState> {
  const { admin, ip } = await ctx();
  const id = str(fd, "conversationId", 40);
  const body = str(fd, "body", 2000);
  if (!body) return { error: "اكتب الرد." };
  const r = await postAdminReply(id, admin.name, body);
  await audit({ actorId: admin.id, action: "chat.reply", targetType: "chat", targetId: id, ip });
  revalidatePath("/admin/chat");
  return { ok: r.emailed ? `وصل الرد + انبعت إيميل إلى ${r.to}` : "وصل الرد بالشات. الإيميل ما انبعت (تأكد من إعدادات الإيميل)." };
}

export async function chatStatusAction(_p: FormState, fd: FormData): Promise<FormState> {
  await ctx();
  const id = str(fd, "conversationId", 40);
  const status = str(fd, "status", 10) === "CLOSED" ? "CLOSED" : "OPEN";
  await setConversationStatus(id, status);
  revalidatePath("/admin/chat");
  return { ok: status === "CLOSED" ? "تم إغلاق المحادثة." : "تمت إعادة فتح المحادثة." };
}

/* ---------------- settings ---------------- */

export async function saveSettingsAction(_p: FormState, fd: FormData): Promise<FormState> {
  const { admin, ip } = await ctx();
  const cur = await getSettings();
  const num = (k: string, fallback: number) => {
    const v = int(fd, k);
    return v === null ? fallback : v;
  };
  const cents = (k: string, fallback: number) => dollarsToCents(str(fd, k, 12)) ?? fallback;
  const next: SiteSettings = {
    ...cur,
    coinsPerUsd: num("coinsPerUsd", cur.coinsPerUsd),
    userSharePct: num("userSharePct", cur.userSharePct),
    referralPct: num("referralPct", cur.referralPct),
    welcomeBonus: num("welcomeBonus", cur.welcomeBonus),
    inviteBonus: num("inviteBonus", cur.inviteBonus),
    dailyMin: num("dailyMin", cur.dailyMin),
    dailyMax: num("dailyMax", cur.dailyMax),
    maintenance: bool(fd, "maintenance"),
    registrationOpen: bool(fd, "registrationOpen"),
    bannerEnabled: bool(fd, "bannerEnabled"),
    bannerText: { en: str(fd, "banner_en", 200), es: str(fd, "banner_es", 200), ar: str(fd, "banner_ar", 200) },
    prizesCents: str(fd, "prizes", 200).split(",").map((s) => dollarsToCents(s.trim()) ?? 0).slice(0, 20),
    supportEmail: str(fd, "supportEmail", 254) || cur.supportEmail,
    methods: Object.fromEntries(
      METHOD_IDS.map((m) => [m, { enabled: bool(fd, `on_${m}`), minCents: cents(`min_${m}`, cur.methods[m].minCents), feeCents: cents(`fee_${m}`, cur.methods[m].feeCents) }]),
    ) as SiteSettings["methods"],
  };
  const parsed = siteSettingsSchema.safeParse(next);
  if (!parsed.success) return { error: `${FAIL} (${parsed.error.issues[0]?.path.join(".")})` };
  if (parsed.data.dailyMax < parsed.data.dailyMin) return { error: "أعلى قيمة للصندوق اليومي لازم تكون أكبر من الأدنى." };
  await saveSettings(parsed.data);
  await audit({ actorId: admin.id, action: "settings.update", data: { before: cur, after: parsed.data }, ip });
  revalidatePath("/", "layout");
  return { ok: "تم حفظ الإعدادات وتطبيقها على الموقع." };
}

/** Fraud and payout-safety rules (separate form, so the site settings form cannot reset them). */
export async function saveFraudRulesAction(_p: FormState, fd: FormData): Promise<FormState> {
  const { admin, ip } = await ctx();
  const cur = await getSettings();
  const num = (k: string, fallback: number) => int(fd, k) ?? fallback;
  const next: SiteSettings = {
    ...cur,
    holdThresholdCents: dollarsToCents(str(fd, "holdThreshold", 12)) ?? cur.holdThresholdCents,
    holdDays: num("holdDays", cur.holdDays),
    blockVpn: bool(fd, "blockVpn"),
    maxAccountsPerDevice: num("maxAccountsPerDevice", cur.maxAccountsPerDevice),
    autoBanRisk: num("autoBanRisk", cur.autoBanRisk),
    firstWithdrawalManual: bool(fd, "firstWithdrawalManual"),
    autoApproveUnderCents: dollarsToCents(str(fd, "autoApproveUnder", 12)) ?? cur.autoApproveUnderCents,
    requireVerifiedEmailToWithdraw: bool(fd, "requireVerifiedEmailToWithdraw"),
  };
  const parsed = siteSettingsSchema.safeParse(next);
  if (!parsed.success) return { error: `${FAIL} (${parsed.error.issues[0]?.path.join(".")})` };
  await saveSettings(parsed.data);
  await audit({ actorId: admin.id, action: "fraud_rules.update", data: { before: pickFraud(cur), after: pickFraud(parsed.data) }, ip });
  revalidatePath("/admin/fraud");
  return { ok: "تم حفظ القواعد." };
}

function pickFraud(s: SiteSettings) {
  const { holdThresholdCents, holdDays, blockVpn, maxAccountsPerDevice, autoBanRisk, firstWithdrawalManual, autoApproveUnderCents, requireVerifiedEmailToWithdraw } = s;
  return { holdThresholdCents, holdDays, blockVpn, maxAccountsPerDevice, autoBanRisk, firstWithdrawalManual, autoApproveUnderCents, requireVerifiedEmailToWithdraw };
}
