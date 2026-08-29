"use client";

import { BarChart3 } from "lucide-react";
import { useApp } from "./context";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export default function DashboardPage() {
  const { user, business } = useApp();
  const first = user?.name?.split(" ")[0] ?? "there";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-extrabold text-fg">Good day, {first} 👋</h1>
        <p className="mt-1 text-sm text-fg-muted">
          {business
            ? `Here's what's happening with ${business.name}.`
            : "Finish onboarding to see your business intelligence."}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Revenue" value="—" unavailableReason="No orders imported yet" />
        <StatCard label="Orders" value="—" unavailableReason="No orders imported yet" />
        <StatCard label="Estimated Profit" value="—" unavailableReason="Add product costs" />
        <StatCard label="Returns" value="—" unavailableReason="No orders imported yet" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Weekly Intelligence</CardTitle>
        </CardHeader>
        <CardBody>
          <EmptyState
            icon={BarChart3}
            title="Your first report is on its way"
            description="Once you connect a data source or import orders, Zotomic generates a weekly report here — with what changed, why it matters, and what to do."
            action={{ label: "Go to onboarding", href: "/onboarding" }}
          />
        </CardBody>
      </Card>

      <p className="text-center text-xs text-fg-subtle">
        Dashboard scaffold — full build lands in Phase 2.
      </p>
    </div>
  );
}
