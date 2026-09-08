import { requireAdmin, adminDb } from "@/lib/admin-server";
import { PageHeader } from "@/components/app/PageHeader";
import { CreditsAdminClient } from "./CreditsAdminClient";

export const dynamic = "force-dynamic";

export default async function AdminCreditsPage() {
  await requireAdmin();
  const db = adminDb();

  const [{ data: purchases }, { data: businesses }, { data: accounts }] = await Promise.all([
    db
      .from("credit_purchases")
      .select("id, business_id, pack_id, credits, amount, currency, method, txn_id, status, note, submitted_at, resolved_at")
      .order("submitted_at", { ascending: false })
      .limit(50),
    db.from("businesses").select("id, name").order("name"),
    db.from("credit_accounts").select("business_id, allowance_balance, purchased_balance, lifetime_purchased, lifetime_spent"),
  ]);

  const nameMap = new Map((businesses ?? []).map((b) => [b.id as string, b.name as string]));
  const accMap = new Map(
    (accounts ?? []).map((a) => [
      a.business_id as string,
      {
        balance: Number(a.allowance_balance) + Number(a.purchased_balance),
        purchased: Number(a.purchased_balance),
        lifetimeSpent: Number(a.lifetime_spent),
      },
    ]),
  );

  const rows = (purchases ?? []).map((p) => ({
    id: p.id as string,
    business: nameMap.get(p.business_id as string) ?? "—",
    businessId: p.business_id as string,
    credits: Number(p.credits),
    amount: Number(p.amount),
    currency: (p.currency as string) ?? "BDT",
    method: p.method as string,
    txnId: p.txn_id as string,
    status: p.status as string,
    note: (p.note as string) ?? "",
    submittedAt: p.submitted_at as string,
  }));

  const storeList = (businesses ?? []).map((b) => ({
    id: b.id as string,
    name: b.name as string,
    balance: accMap.get(b.id as string)?.balance ?? 0,
    purchased: accMap.get(b.id as string)?.purchased ?? 0,
    lifetimeSpent: accMap.get(b.id as string)?.lifetimeSpent ?? 0,
  }));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Credits"
        subtitle="Confirm assistant-credit top-ups and adjust any store's balance."
      />
      <CreditsAdminClient purchases={rows} stores={storeList} />
    </div>
  );
}
