"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { moderateReview } from "./actions";

export interface ReviewRow {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  reviewer_name: string | null;
  status: "pending" | "approved" | "hidden";
  created_at: string;
  product: string;
}

const TONE = { pending: "warning", approved: "success", hidden: "neutral" } as const;

export function ReviewsClient({ reviews }: { reviews: ReviewRow[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [tab, setTab] = useState<"pending" | "approved" | "hidden">("pending");

  const filtered = reviews.filter((r) => r.status === tab);

  const act = (id: string, status: "approved" | "hidden") =>
    start(async () => {
      const res = await moderateReview(id, status);
      if (res.error) toast(res.error, "error");
      else {
        toast(status === "approved" ? "Review approved" : "Review hidden", "success");
        router.refresh();
      }
    });

  const counts = {
    pending: reviews.filter((r) => r.status === "pending").length,
    approved: reviews.filter((r) => r.status === "approved").length,
    hidden: reviews.filter((r) => r.status === "hidden").length,
  };

  return (
    <div className="space-y-4">
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "pending", label: `Pending (${counts.pending})` },
          { value: "approved", label: `Approved (${counts.approved})` },
          { value: "hidden", label: `Hidden (${counts.hidden})` },
        ]}
      />

      {filtered.length === 0 ? (
        <EmptyState
          title={`No ${tab} reviews`}
          description={
            tab === "pending"
              ? "Verified-buyer reviews land here after an order is marked delivered."
              : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <div key={r.id} className="rounded border border-border bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star
                        key={n}
                        className="h-3.5 w-3.5 text-warning"
                        fill={r.rating >= n ? "currentColor" : "none"}
                      />
                    ))}
                  </span>
                  <span className="text-xs font-semibold text-fg">{r.product}</span>
                  <Badge tone={TONE[r.status]}>{r.status}</Badge>
                </div>
                <span className="text-xs text-fg-subtle">
                  {r.reviewer_name} · {new Date(r.created_at).toLocaleDateString("en-US")}
                </span>
              </div>
              {r.title && <p className="mt-2 text-sm font-semibold text-fg">{r.title}</p>}
              {r.body && <p className="mt-1 text-sm text-fg-muted">{r.body}</p>}
              <div className="mt-3 flex gap-2">
                {r.status !== "approved" && (
                  <Button size="sm" onClick={() => act(r.id, "approved")} disabled={pending}>
                    Approve
                  </Button>
                )}
                {r.status !== "hidden" && (
                  <Button size="sm" variant="outline" onClick={() => act(r.id, "hidden")} disabled={pending}>
                    Hide
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
