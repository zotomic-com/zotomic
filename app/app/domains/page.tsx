import Link from "next/link";
import { Network } from "lucide-react";
import { requireUser } from "@/lib/app-actions";
import { PageHeader } from "@/components/app/PageHeader";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DomainRow } from "./DomainRow";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "neutral" | "success" | "danger" | "warning" | "info"> = {
  pending: "warning",
  registering: "info",
  transferring: "info",
  active: "success",
  grace: "warning",
  dropped: "danger",
  failed: "danger",
  cancelled: "neutral",
};

export default async function AppDomainsPage() {
  const { user, businessId, db } = await requireUser();

  const { data } = await db
    .from("domain_cart_items")
    .select("*, domain_cart_orders!inner(user_id, status)")
    .eq("domain_cart_orders.user_id", user.id)
    .neq("domain_cart_orders.status", "cancelled")
    .order("created_at", { ascending: false });

  const items = (data ?? []).map((row) => ({
    id: row.id as string,
    domainName: row.domain_name as string,
    status: row.status as string,
    expiresAt: (row.expires_at as string) ?? null,
    autoRenew: row.auto_renew as boolean,
    lastError: (row.last_error as string) ?? null,
  }));

  return (
    <div className="space-y-5">
      <PageHeader title="Domain" subtitle="Every domain you've bought or transferred through Zotomic." />

      {!businessId && (
        <Card>
          <CardBody className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-fg">Haven&apos;t set up your store yet?</p>
              <p className="text-sm text-fg-muted">You can still buy and manage domains here — set up a store whenever you&apos;re ready.</p>
            </div>
            <Link href="/onboarding">
              <Button size="sm" variant="outline">Set up your store</Button>
            </Link>
          </CardBody>
        </Card>
      )}

      <div className="flex gap-2">
        <Link href="/domains">
          <Button size="sm">Buy a domain</Button>
        </Link>
        {businessId ? (
          <Link href="/app/integrations">
            <Button size="sm" variant="outline">Add a domain you already own</Button>
          </Link>
        ) : (
          <Button size="sm" variant="outline" disabled title="Create a store first to point a domain at it">
            Add a domain you already own
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <Card>
          <CardBody className="flex flex-col items-center py-10 text-center">
            <Network className="h-8 w-8 text-fg-subtle" />
            <p className="mt-3 text-sm text-fg-muted">No domains yet.</p>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <DomainRow key={item.id} item={item} statusTone={STATUS_TONE[item.status] ?? "neutral"} />
          ))}
        </div>
      )}
    </div>
  );
}
