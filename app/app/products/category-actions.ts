"use server";

import { revalidatePath } from "next/cache";
import { requireBusiness, writeAudit } from "@/lib/app-actions";

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50);
}

export async function createCategory(name: string): Promise<{ ok: true } | { error: string }> {
  const { businessId, user, db } = await requireBusiness();
  const clean = name.trim().slice(0, 60);
  if (clean.length < 2) return { error: "Enter a category name." };
  const slug = slugify(clean) || `cat-${Math.random().toString(36).slice(2, 6)}`;

  const { data: dupe } = await db
    .from("product_categories")
    .select("id")
    .eq("business_id", businessId)
    .eq("slug", slug)
    .maybeSingle();
  if (dupe) return { error: "That category already exists." };

  const { data: max } = await db
    .from("product_categories")
    .select("sort")
    .eq("business_id", businessId)
    .order("sort", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await db.from("product_categories").insert({
    business_id: businessId,
    name: clean,
    slug,
    sort: (max?.sort ?? 0) + 1,
  });
  if (error) return { error: "Could not create the category." };

  await writeAudit(businessId, user.id, "category.created", { summary: `Created category "${clean}"` });
  revalidatePath("/app/products");
  return { ok: true };
}

export async function renameCategory(id: string, name: string): Promise<{ ok: true } | { error: string }> {
  const { businessId, user, db } = await requireBusiness();
  const clean = name.trim().slice(0, 60);
  if (clean.length < 2) return { error: "Enter a category name." };

  const { data: cat } = await db
    .from("product_categories")
    .select("name")
    .eq("business_id", businessId)
    .eq("id", id)
    .maybeSingle();
  if (!cat) return { error: "Category not found." };

  const { error } = await db
    .from("product_categories")
    .update({ name: clean, slug: slugify(clean) || undefined })
    .eq("business_id", businessId)
    .eq("id", id);
  if (error) return { error: "Could not rename — that name may be taken." };

  // keep the denormalised product.category text in sync
  await db
    .from("products")
    .update({ category: clean })
    .eq("business_id", businessId)
    .eq("category", cat.name);

  await writeAudit(businessId, user.id, "category.renamed", { summary: `Renamed "${cat.name}" → "${clean}"` });
  revalidatePath("/app/products");
  return { ok: true };
}

export async function deleteCategory(id: string): Promise<{ ok: true } | { error: string }> {
  const { businessId, user, db } = await requireBusiness();
  const { data: cat } = await db
    .from("product_categories")
    .select("name")
    .eq("business_id", businessId)
    .eq("id", id)
    .maybeSingle();
  if (!cat) return { error: "Category not found." };

  // products keep working — they just fall back to uncategorised
  await db
    .from("products")
    .update({ category: null })
    .eq("business_id", businessId)
    .eq("category", cat.name);

  await db.from("product_categories").delete().eq("business_id", businessId).eq("id", id);
  await writeAudit(businessId, user.id, "category.deleted", {
    summary: `Deleted category "${cat.name}" (products moved to Uncategorised)`,
  });
  revalidatePath("/app/products");
  return { ok: true };
}

export async function reorderCategory(id: string, direction: "up" | "down"): Promise<{ ok: true } | { error: string }> {
  const { businessId, db } = await requireBusiness();
  const { data: all } = await db
    .from("product_categories")
    .select("id, sort")
    .eq("business_id", businessId)
    .order("sort");
  const list = all ?? [];
  const i = list.findIndex((c) => c.id === id);
  if (i < 0) return { error: "Category not found." };
  const j = direction === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= list.length) return { ok: true };

  await Promise.all([
    db.from("product_categories").update({ sort: list[j].sort }).eq("id", list[i].id),
    db.from("product_categories").update({ sort: list[i].sort }).eq("id", list[j].id),
  ]);
  revalidatePath("/app/products");
  return { ok: true };
}
