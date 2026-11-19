"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-server";
import {
  createConvType,
  deleteConvType,
  listConvTypes,
  updateConvType,
  type ConvGroup,
  type ConvOption,
} from "@/lib/services/converter";

function str(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

function bool(form: FormData, key: string): boolean {
  return form.get(key) === "on" || form.get(key) === "true";
}

function parseOptions(raw: string): ConvOption[] {
  if (!raw.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Options must be valid JSON.");
  }
  if (!Array.isArray(parsed)) throw new Error("Options must be a JSON array.");
  return parsed.filter((o): o is ConvOption => !!o && typeof o === "object" && typeof (o as ConvOption).id === "string");
}

function readType(form: FormData) {
  const group = (str(form, "group") || "image") as ConvGroup;
  return {
    slug: str(form, "slug"),
    label: str(form, "label"),
    group: (["image", "video", "audio"] as ConvGroup[]).includes(group) ? group : ("image" as ConvGroup),
    description: str(form, "description") || null,
    accept: str(form, "accept"),
    multiple: bool(form, "multiple"),
    needsFile: bool(form, "needsFile"),
    enabled: bool(form, "enabled"),
    sortOrder: Number(str(form, "sortOrder") || "0"),
    options: parseOptions(str(form, "options")),
  };
}

export async function createTypeAction(formData: FormData) {
  await requireAdmin();
  const input = readType(formData);
  if (!input.slug || !input.label) throw new Error("Slug and label are required.");
  await createConvType(input);
  revalidatePath("/admin/services/converter");
  revalidatePath("/services/converter");
}

export async function updateTypeAction(formData: FormData) {
  await requireAdmin();
  const id = str(formData, "id");
  if (!id) return;
  const input = readType(formData);
  await updateConvType(id, input);
  revalidatePath("/admin/services/converter");
  revalidatePath("/services/converter");
}

export async function toggleTypeAction(formData: FormData) {
  await requireAdmin();
  const id = str(formData, "id");
  const enabled = bool(formData, "enabled");
  if (!id) return;
  await updateConvType(id, { enabled });
  revalidatePath("/admin/services/converter");
  revalidatePath("/services/converter");
}

export async function deleteTypeAction(formData: FormData) {
  await requireAdmin();
  const id = str(formData, "id");
  if (!id) return;
  await deleteConvType(id);
  revalidatePath("/admin/services/converter");
  revalidatePath("/services/converter");
}

export async function moveTypeAction(formData: FormData) {
  await requireAdmin();
  const id = str(formData, "id");
  const direction = str(formData, "direction");
  if (!id) return;
  const all = await listConvTypes();
  const index = all.findIndex((t) => t.id === id);
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || swapIndex < 0 || swapIndex >= all.length) return;
  const a = all[index];
  const b = all[swapIndex];
  await updateConvType(a.id, { sortOrder: b.sortOrder });
  await updateConvType(b.id, { sortOrder: a.sortOrder });
  revalidatePath("/admin/services/converter");
  revalidatePath("/services/converter");
}
