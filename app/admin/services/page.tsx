import type { Metadata } from "next";
import Link from "next/link";
import { AudioLines, Download, KeyRound, ShieldCheck, Activity } from "lucide-react";
import { requireAdmin, adminDb } from "@/lib/admin-server";
import { getAllServiceCards } from "@/lib/service-cards";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import CookiesUploader from "./CookiesUploader";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Service Tools — Admin" };

const TOOL_HREFS: Record<string, string> = {
  "Text to Audio": "/services/text-to-audio",
  "Online Downloader": "/services/online-downloader",
  "Video Generator": "/services/video-generator",
};

function Stat({ icon: Icon, label, value, tone }: { icon: typeof Activity; label: string; value: string | number; tone?: string }) {
  return (
    <Card>
      <CardBody className="flex items-center gap-3">
        <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${tone ?? "bg-primary-soft"}`}>
          <Icon className="h-5 w-5 text-primary" />
        </span>
        <div>
          <p className="text-2xl font-extrabold tracking-tight text-navy">{value}</p>
          <p className="text-xs text-fg-muted">{label}</p>
        </div>
      </CardBody>
    </Card>
  );
}

export default async function AdminServicesPage() {
  await requireAdmin();
  const db = adminDb();

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const [cards, tokens, usageToday, accessRows] = await Promise.all([
    getAllServiceCards(),
    db.from("service_tokens").select("id, status").then(
      (r) => r.data as Array<{ id: string; status: string }> | null,
    ),
    db
      .from("service_usage")
      .select("id", { count: "exact", head: true })
      .gte("created_at", todayStart.toISOString())
      .eq("ok", true)
      .then((r) => r.count ?? 0),
    db.from("service_access").select("id").then((r) => (r.data as Array<{ id: string }>) ?? null),
  ]);

  const toolCards = cards.filter((c) => TOOL_HREFS[c.title]);
  const activeTokens = (tokens ?? []).filter((t) => t.status === "active").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-navy">Service Tools</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Text to Audio &amp; Online Downloader — engine status, tokens, access and usage.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Activity} label="Successful calls today (UTC)" value={usageToday} />
        <Stat icon={KeyRound} label="Active tokens" value={activeTokens} />
        <Stat icon={ShieldCheck} label="Access rules" value={accessRows?.length ?? 0} />
        <Stat icon={Download} label="Tools live" value={toolCards.filter((c) => c.status === "live").length} />
      </div>

      <Card>
        <CardBody className="space-y-3">
          <p className="text-sm font-bold text-fg">Public service cards</p>
          <ul className="divide-y divide-border">
            {toolCards.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <span className="flex items-center gap-2 text-sm font-semibold text-fg">
                  {c.title}
                  <Badge tone={c.status === "live" ? "success" : "neutral"}>
                    {c.status === "live" ? "live" : "coming soon"}
                  </Badge>
                </span>
                <span className="flex items-center gap-3 text-xs text-fg-muted">
                  {TOOL_HREFS[c.title]}
                  <Link
                    href={`/admin/website/services`}
                    className="text-primary hover:underline"
                  >
                    Edit card
                  </Link>
                  <Link href={TOOL_HREFS[c.title]} className="text-primary hover:underline">
                    Open page
                  </Link>
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-fg-subtle">
            Flip a card to live/coming-soon from its editor, or use the buttons on the tokens &amp; access pages.
          </p>
        </CardBody>
      </Card>

      <CookiesUploader />

      <div className="grid gap-3 sm:grid-cols-3">
        <Link
          href="/admin/services/tokens"
          className="rounded-lg border border-border bg-surface p-5 shadow-sm transition-colors hover:border-primary"
        >
          <KeyRound className="h-5 w-5 text-primary" />
          <p className="mt-2 text-sm font-bold text-fg">Tokens</p>
          <p className="mt-1 text-sm text-fg-muted">Create, edit, revoke or delete platform-issued tokens.</p>
        </Link>
        <Link
          href="/admin/services/access"
          className="rounded-lg border border-border bg-surface p-5 shadow-sm transition-colors hover:border-primary"
        >
          <ShieldCheck className="h-5 w-5 text-primary" />
          <p className="mt-2 text-sm font-bold text-fg">Access</p>
          <p className="mt-1 text-sm text-fg-muted">Grant extra quota or block any user per service.</p>
        </Link>
        <Link
          href="/admin/services/usage"
          className="rounded-lg border border-border bg-surface p-5 shadow-sm transition-colors hover:border-primary"
        >
          <AudioLines className="h-5 w-5 text-primary" />
          <p className="mt-2 text-sm font-bold text-fg">Usage</p>
          <p className="mt-1 text-sm text-fg-muted">Every call — who, when, which service, allowed or blocked.</p>
        </Link>
      </div>
    </div>
  );
}
