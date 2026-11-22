"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/forms";
import { db } from "@/lib/db";
import { requireAdminAction } from "@/server/admin-guard";
import { audit } from "@/server/audit";
import { requestIp } from "@/server/request";
import { bool, int, str } from "@/server/action-utils";
import { SLUG_RE } from "@/server/marketing";

async function ctx() {
  const admin = await requireAdminAction();
  return { admin, ip: await requestIp() };
}

type Fields = { name: string; slug: string; platform: string; bonusCoins: number; notes: string; userId: string | null };

async function readFields(fd: FormData, selfId?: string): Promise<Fields | { error: string }> {
  const name = str(fd, "name", 40);
  if (name.length < 2) return { error: "اكتب اسم المؤثر." };
  const slug = str(fd, "slug", 30).toLowerCase();
  if (!SLUG_RE.test(slug)) return { error: "الرابط لازم يكون حروف إنجليزية صغيرة وأرقام وشرطة (-)، من 2 لـ 30 حرف. مثال: jake-plays" };
  const taken = await db.creator.findUnique({ where: { slug }, select: { id: true } });
  if (taken && taken.id !== selfId) return { error: "هالرابط مستعمل لمؤثر تاني." };
  const bonusCoins = int(fd, "bonusCoins") ?? 0;
  if (bonusCoins < 0 || bonusCoins > 10_000) return { error: "مكافأة المؤثر لازم تكون بين 0 و 10,000 عملة." };
  const email = str(fd, "account", 254).toLowerCase();
  let userId: string | null = null;
  if (email) {
    const u = await db.user.findUnique({ where: { email }, select: { id: true, creatorAccount: { select: { id: true } } } });
    if (!u) return { error: "ما في عضو بهالإيميل. خلي المؤثر يسجل بالموقع أول، أو اترك الخانة فاضية." };
    if (u.creatorAccount && u.creatorAccount.id !== selfId) return { error: "هالعضو مربوط بمؤثر تاني." };
    userId = u.id;
  }
  return { name, slug, platform: str(fd, "platform", 30), bonusCoins, notes: str(fd, "notes", 300), userId };
}

export async function createCreatorAction(_p: FormState, fd: FormData): Promise<FormState> {
  const { admin, ip } = await ctx();
  const f = await readFields(fd);
  if ("error" in f) return f;
  const c = await db.creator.create({ data: f });
  await audit({ actorId: admin.id, action: "creator.create", targetType: "creator", targetId: c.id, data: { slug: f.slug, name: f.name, bonusCoins: f.bonusCoins }, ip });
  revalidatePath("/admin/marketing");
  return { ok: `تمت إضافة ${f.name}. رابطه: /c/${f.slug}` };
}

export async function updateCreatorAction(_p: FormState, fd: FormData): Promise<FormState> {
  const { admin, ip } = await ctx();
  const id = str(fd, "id", 40);
  const cur = await db.creator.findUnique({ where: { id }, select: { id: true } });
  if (!cur) return { error: "المؤثر مو موجود. حدث الصفحة." };
  const f = await readFields(fd, id);
  if ("error" in f) return f;
  await db.creator.update({ where: { id }, data: { ...f, active: bool(fd, "active") } });
  await audit({ actorId: admin.id, action: "creator.update", targetType: "creator", targetId: id, data: { slug: f.slug, bonusCoins: f.bonusCoins, active: bool(fd, "active") }, ip });
  revalidatePath("/admin/marketing");
  return { ok: "تم الحفظ." };
}
