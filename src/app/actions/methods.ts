"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/forms";
import { requireAdminAction } from "@/server/admin-guard";
import { audit } from "@/server/audit";
import { requestIp } from "@/server/request";
import { getSettings, saveSettings, siteSettingsSchema } from "@/server/settings";
import { bool, dollarsToCents, str } from "@/server/action-utils";
import { ADDRESS_KIND_KEYS, ADDRESS_KINDS, BUILTIN_ICONS, isSafeMethodImage, US_UK_PRESETS, type AddressKind, type PayMethod } from "@/lib/methods";

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
const MAX_IMAGE_BYTES = 100 * 1024;

async function ctx() {
  const admin = await requireAdminAction();
  return { admin, ip: await requestIp() };
}

/** The icon chosen in the form: an uploaded file wins over a built-in icon. */
async function pickImage(fd: FormData, current: string): Promise<{ image: string } | { error: string }> {
  const file = fd.get("imageFile");
  if (file instanceof File && file.size > 0) {
    if (!IMAGE_TYPES.includes(file.type)) return { error: "الصورة لازم تكون PNG أو JPG أو WEBP أو SVG." };
    if (file.size > MAX_IMAGE_BYTES) return { error: "الصورة كبيرة. لازم تكون أقل من 100 كيلوبايت." };
    const b64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    return { image: `data:${file.type};base64,${b64}` };
  }
  const icon = str(fd, "icon", 20);
  if (icon && (BUILTIN_ICONS as readonly string[]).includes(icon)) return { image: `/methods/${icon}.svg` };
  return { image: current };
}

function readFields(fd: FormData, base: PayMethod): PayMethod | { error: string } {
  const kind = str(fd, "kind", 20) as AddressKind;
  if (!ADDRESS_KIND_KEYS.includes(kind)) return { error: "اختار نوع العنوان." };
  const minCents = dollarsToCents(str(fd, "min", 12));
  const feeCents = dollarsToCents(str(fd, "fee", 12) || "0");
  if (minCents === null || minCents < 50) return { error: "الحد الأدنى لازم يكون 0.50$ أو أكتر." };
  if (feeCents === null || feeCents >= minCents) return { error: "الرسوم لازم تكون أقل من الحد الأدنى." };
  const name = str(fd, "name", 40);
  if (!name) return { error: "اكتب اسم الطريقة." };
  return {
    ...base,
    name,
    sub: str(fd, "sub", 60),
    kind,
    field: str(fd, "field", 60) || ADDRESS_KINDS[kind].label,
    placeholder: str(fd, "placeholder", 80) || ADDRESS_KINDS[kind].placeholder,
    enabled: bool(fd, "enabled"),
    minCents,
    feeCents,
  };
}

async function store(methods: PayMethod[], adminId: string, ip: string | null, action: string, data: Record<string, unknown>): Promise<FormState | null> {
  const cur = await getSettings();
  const parsed = siteSettingsSchema.safeParse({ ...cur, methods });
  if (!parsed.success) return { error: "ما تم الحفظ. تأكد من القيم وجرب مرة ثانية." };
  await saveSettings(parsed.data);
  await audit({ actorId: adminId, action, data, ip });
  revalidatePath("/", "layout");
  return null;
}

export async function saveMethodAction(_p: FormState, fd: FormData): Promise<FormState> {
  const { admin, ip } = await ctx();
  const id = str(fd, "id", 24);
  const cur = await getSettings();
  const idx = cur.methods.findIndex((m) => m.id === id);
  if (idx < 0) return { error: "الطريقة مو موجودة. حدث الصفحة." };
  const img = await pickImage(fd, cur.methods[idx]!.image);
  if ("error" in img) return img;
  const next = readFields(fd, { ...cur.methods[idx]!, image: img.image });
  if ("error" in next) return next;
  const list = cur.methods.map((m, i) => (i === idx ? next : m));
  const err = await store(list, admin.id, ip, "method.update", { id, name: next.name, enabled: next.enabled, minCents: next.minCents, feeCents: next.feeCents, kind: next.kind });
  return err ?? { ok: `تم حفظ ${next.name}.` };
}

export async function addMethodAction(_p: FormState, fd: FormData): Promise<FormState> {
  const { admin, ip } = await ctx();
  const cur = await getSettings();
  if (cur.methods.length >= 30) return { error: "وصلت للحد الأقصى (30 طريقة)." };
  const name = str(fd, "name", 40);
  let id = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 20) || "method";
  if (id.length < 2) id = `${id}-m`;
  let n = 2;
  const base = id;
  while (cur.methods.some((m) => m.id === id)) id = `${base}-${n++}`;
  const img = await pickImage(fd, "/methods/usdt.svg");
  if ("error" in img) return img;
  if (!isSafeMethodImage(img.image)) return { error: "الصورة مو مقبولة." };
  const next = readFields(fd, { id, name, sub: "", kind: "text", field: "", placeholder: "", image: img.image, enabled: true, minCents: 100, feeCents: 0 });
  if ("error" in next) return next;
  const err = await store([...cur.methods, next], admin.id, ip, "method.add", { id, name: next.name });
  return err ?? { ok: `تمت إضافة ${next.name}.` };
}

export async function moveMethodAction(fd: FormData) {
  const { admin, ip } = await ctx();
  const id = str(fd, "id", 24);
  const dir = str(fd, "dir", 4) === "up" ? -1 : 1;
  const cur = await getSettings();
  const i = cur.methods.findIndex((m) => m.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= cur.methods.length) return;
  const list = [...cur.methods];
  [list[i], list[j]] = [list[j]!, list[i]!];
  await store(list, admin.id, ip, "method.move", { id, dir });
}

export async function deleteMethodAction(_p: FormState, fd: FormData): Promise<FormState> {
  const { admin, ip } = await ctx();
  const id = str(fd, "id", 24);
  const cur = await getSettings();
  const m = cur.methods.find((x) => x.id === id);
  if (!m) return { error: "الطريقة مو موجودة." };
  if (cur.methods.length <= 1) return { error: "لازم تضل طريقة وحدة على الأقل." };
  const err = await store(
    cur.methods.filter((x) => x.id !== id),
    admin.id,
    ip,
    "method.delete",
    { id, name: m.name },
  );
  return err ?? { ok: `تم حذف ${m.name}. السحوبات القديمة بتضل محفوظة.` };
}

export async function addPresetMethodAction(_p: FormState, fd: FormData): Promise<FormState> {
  const { admin, ip } = await ctx();
  const id = str(fd, "preset", 24);
  const preset = US_UK_PRESETS.find((p) => p.id === id);
  if (!preset) return { error: "الطريقة غير موجودة." };
  const cur = await getSettings();
  if (cur.methods.some((m) => m.id === preset.id)) return { error: `${preset.name} مضافة من قبل.` };
  if (cur.methods.length >= 30) return { error: "وصلت للحد الأقصى (30 طريقة)." };
  const err = await store([...cur.methods, preset], admin.id, ip, "method.add_preset", { id: preset.id, name: preset.name });
  return err ?? { ok: `تمت إضافة ${preset.name} بنجاح.` };
}

export async function setAllMethodsMinAction(_p: FormState, fd: FormData): Promise<FormState> {
  const { admin, ip } = await ctx();
  const minCents = dollarsToCents(str(fd, "min", 12));
  if (minCents === null || minCents < 50) return { error: "الحد الأدنى لازم يكون 0.50$ أو أكتر." };
  const cur = await getSettings();
  const list = cur.methods.map((m) => ({
    ...m,
    minCents,
    feeCents: Math.min(m.feeCents, Math.max(0, minCents - 1)),
  }));
  const err = await store(list, admin.id, ip, "method.set_all_min", { minCents });
  return err ?? { ok: `تم تعيين الحد الأدنى لكل الطرق إلى $${(minCents / 100).toFixed(2)}.` };
}
