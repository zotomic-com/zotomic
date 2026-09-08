"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-server";
import { getAdminSupabase } from "@/lib/supabase";
import { sendEmailResult } from "@/lib/email";
import {
  buildInvoicePdf,
  getInvoice,
  invoiceTotal,
  nextInvoiceNumber,
  renderInvoiceHtml,
  type InvoiceLineItem,
} from "@/lib/admin-invoices";

export interface InvoiceInput {
  businessId?: string | null;
  recipientName?: string | null;
  recipientEmail?: string | null;
  currency?: string;
  issuedOn?: string | null;
  dueDate?: string | null;
  notes?: string | null;
  status?: "draft" | "open";
  items: InvoiceLineItem[];
}

type Result = { error: string } | { ok: true; id: string };

const clean = (s: string | null | undefined) => (s ? String(s).trim().slice(0, 500) : null);

function normItems(items: InvoiceLineItem[]) {
  return (items ?? [])
    .map((it) => ({
      description: String(it.description ?? "").trim().slice(0, 300),
      quantity: Math.max(0, Number(it.quantity) || 0),
      unit_price: Math.round((Number(it.unitPrice) || 0) * 100) / 100,
    }))
    .filter((it) => it.description && it.quantity > 0);
}

async function audit(actorId: string, action: string, invoiceId: string, summary?: string) {
  await getAdminSupabase().from("audit_logs").insert({
    actor_id: actorId,
    actor_type: "admin",
    action,
    target_type: "invoice",
    target_id: invoiceId,
    summary: summary ?? null,
  });
}

export async function createInvoice(input: InvoiceInput): Promise<Result> {
  const admin = await requireAdmin();
  const db = getAdminSupabase();

  const items = normItems(input.items);
  if (!items.length) return { error: "Add at least one line item." };
  if (!input.businessId && !clean(input.recipientEmail)) {
    return { error: "Pick a business or enter a recipient email." };
  }

  const total = invoiceTotal(items.map((i) => ({ quantity: i.quantity, unitPrice: i.unit_price })));

  let row: { id: string } | null = null;
  for (let attempt = 0; attempt < 4 && !row; attempt++) {
    const number = await nextInvoiceNumber();
    const { data, error } = await db
      .from("invoices")
      .insert({
        kind: "manual",
        invoice_number: number,
        business_id: input.businessId || null,
        recipient_name: clean(input.recipientName),
        recipient_email: clean(input.recipientEmail),
        currency: (input.currency || "BDT").toUpperCase().slice(0, 3),
        amount: total,
        status: input.status === "open" ? "open" : "draft",
        issued_on: input.issuedOn || new Date().toISOString().slice(0, 10),
        due_date: input.dueDate || null,
        notes: clean(input.notes),
        created_by: admin.id,
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") continue; // invoice_number race — retry
      return { error: error.message };
    }
    row = data;
  }
  if (!row) return { error: "Could not allocate an invoice number, try again." };

  await db.from("invoice_line_items").insert(
    items.map((it, i) => ({ invoice_id: row!.id, ...it, position: i })),
  );

  await audit(admin.id, "invoice.created", row.id, `Manual invoice for ${total}`);
  revalidatePath("/admin/invoices");
  return { ok: true, id: row.id };
}

export async function updateInvoice(id: string, input: InvoiceInput): Promise<Result> {
  const admin = await requireAdmin();
  const db = getAdminSupabase();

  const { data: existing } = await db.from("invoices").select("status, kind").eq("id", id).maybeSingle();
  if (!existing) return { error: "Invoice not found." };
  if (existing.status === "paid") return { error: "This invoice is paid. Void it instead of editing." };
  if (existing.kind !== "manual") return { error: "Only manually-created invoices can be edited." };

  const items = normItems(input.items);
  if (!items.length) return { error: "Add at least one line item." };
  const total = invoiceTotal(items.map((i) => ({ quantity: i.quantity, unitPrice: i.unit_price })));

  const { error } = await db
    .from("invoices")
    .update({
      business_id: input.businessId || null,
      recipient_name: clean(input.recipientName),
      recipient_email: clean(input.recipientEmail),
      currency: (input.currency || "BDT").toUpperCase().slice(0, 3),
      amount: total,
      issued_on: input.issuedOn || undefined,
      due_date: input.dueDate || null,
      notes: clean(input.notes),
      ...(input.status ? { status: input.status } : {}),
    })
    .eq("id", id);
  if (error) return { error: error.message };

  await db.from("invoice_line_items").delete().eq("invoice_id", id);
  await db.from("invoice_line_items").insert(items.map((it, i) => ({ invoice_id: id, ...it, position: i })));

  await audit(admin.id, "invoice.updated", id);
  revalidatePath("/admin/invoices");
  revalidatePath(`/admin/invoices/${id}`);
  return { ok: true, id };
}

export async function deleteInvoice(id: string): Promise<{ error: string } | { ok: true }> {
  const admin = await requireAdmin();
  const db = getAdminSupabase();
  const { data: inv } = await db.from("invoices").select("status, kind, invoice_number").eq("id", id).maybeSingle();
  if (!inv) return { error: "Invoice not found." };
  if (inv.status === "paid") return { error: "Paid invoices can't be deleted — void it instead to keep the record." };
  if (inv.kind !== "manual") return { error: "Subscription invoices can't be deleted here." };

  await db.from("invoices").delete().eq("id", id);
  await audit(admin.id, "invoice.deleted", id, inv.invoice_number as string);
  revalidatePath("/admin/invoices");
  return { ok: true };
}

export async function setInvoiceStatus(
  id: string,
  status: "draft" | "open" | "paid" | "void",
): Promise<{ error: string } | { ok: true }> {
  const admin = await requireAdmin();
  const db = getAdminSupabase();
  await db
    .from("invoices")
    .update({ status, ...(status === "paid" ? { paid_at: new Date().toISOString(), confirmed_by: admin.id } : {}) })
    .eq("id", id);
  await audit(admin.id, `invoice.status_${status}`, id);
  revalidatePath("/admin/invoices");
  revalidatePath(`/admin/invoices/${id}`);
  return { ok: true };
}

export async function sendInvoice(
  id: string,
  overrideEmail?: string,
): Promise<{ error: string } | { ok: true }> {
  const admin = await requireAdmin();
  const db = getAdminSupabase();

  const inv = await getInvoice(id);
  if (!inv) return { error: "Invoice not found." };

  let to = (overrideEmail ?? "").trim() || inv.recipientEmail || "";
  if (!to && inv.businessId) {
    const { data: owner } = await db
      .from("business_members")
      .select("users(email)")
      .eq("business_id", inv.businessId)
      .eq("role", "owner")
      .maybeSingle();
    to = ((Array.isArray(owner?.users) ? owner?.users[0] : owner?.users) as { email?: string } | null)?.email ?? "";
    if (!to) {
      const { data: biz } = await db.from("businesses").select("contact_email").eq("id", inv.businessId).maybeSingle();
      to = (biz?.contact_email as string) ?? "";
    }
  }
  if (!to) return { error: "No recipient email — add one to the invoice or type one in." };

  let attachments;
  try {
    const pdf = await buildInvoicePdf(inv);
    attachments = [{ filename: `${inv.invoiceNumber}.pdf`, content: pdf, contentType: "application/pdf" }];
  } catch (e) {
    console.error("invoice pdf build failed, sending without attachment:", (e as Error).message);
  }

  const sent = await sendEmailResult({
    to,
    account: "invoice",
    subject: `Invoice ${inv.invoiceNumber} from Zotomic`,
    html: renderInvoiceHtml(inv),
    attachments,
  });
  if (!sent.ok) return { error: sent.error };

  await db
    .from("invoices")
    .update({ sent_at: new Date().toISOString(), ...(inv.status === "draft" ? { status: "open" } : {}) })
    .eq("id", id);
  await audit(admin.id, "invoice.sent", id, `to ${to}`);
  revalidatePath("/admin/invoices");
  revalidatePath(`/admin/invoices/${id}`);
  return { ok: true };
}
