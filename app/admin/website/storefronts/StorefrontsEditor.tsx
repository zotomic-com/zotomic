"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Crown, Flame, Sparkles } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { storeAvatarGradient, type PublishedStorefront } from "@/lib/storefront/directory";
import { setBusinessFeaturedAction } from "../actions";

function StoreRow({ store }: { store: PublishedStorefront }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();

  const toggleFeatured = (checked: boolean) =>
    start(async () => {
      await setBusinessFeaturedAction(store.businessId, checked);
      toast(checked ? "Marked featured" : "Featured removed", "success");
      router.refresh();
    });

  return (
    <Card>
      <CardBody className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {store.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={store.logoUrl} alt={store.name} className="h-10 w-10 shrink-0 rounded-full object-cover" />
          ) : (
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-sm font-bold text-white ${storeAvatarGradient(store.slug)}`}
            >
              {store.name.charAt(0).toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-fg">{store.name}</p>
            <p className="truncate text-xs text-fg-subtle">/{store.slug}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {store.isHot && (
              <Badge tone="danger">
                <Flame className="h-3 w-3" /> Hot
              </Badge>
            )}
            {store.isNew && (
              <Badge tone="success">
                <Sparkles className="h-3 w-3" /> New
              </Badge>
            )}
          </div>
        </div>
        <label className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-fg-muted">
          <input
            type="checkbox"
            checked={store.isFeatured}
            onChange={(e) => toggleFeatured(e.target.checked)}
            disabled={pending}
            className="h-3.5 w-3.5 accent-[var(--primary)]"
          />
          <Crown className="h-3.5 w-3.5 text-warning" /> Featured
        </label>
      </CardBody>
    </Card>
  );
}

export function StorefrontsEditor({ stores }: { stores: PublishedStorefront[] }) {
  if (!stores.length) {
    return <p className="text-sm text-fg-subtle">No published storefronts yet.</p>;
  }
  return (
    <div className="space-y-3">
      {stores.map((s) => (
        <StoreRow key={s.businessId} store={s} />
      ))}
    </div>
  );
}
