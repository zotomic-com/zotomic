import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdmin, adminDb } from "@/lib/admin-server";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import ScreenshotsManager from "./ScreenshotsManager";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Screenshot Organizer — Admin" };

export default async function AdminScreenshotsPage() {
  await requireAdmin();
  const db = adminDb();

  const cutoff = new Date(Date.now() - 24 * 3600_000).toISOString();
  const [{ data: sessions }, { data: counts }, { data: itemsCount }] = await Promise.all([
    db
      .from("screenshot_sessions")
      .select("id, owner_email, owner_ip, title, created_at, expires_at")
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(50),
    db.from("screenshot_groups").select("id, session_id, name"),
    db.from("screenshot_items").select("id, session_id"),
  ]);

  const sessionsOut = (sessions ?? []).map((s) => {
    const sid = (s as { id: string }).id;
    return {
      id: sid,
      title: (s as { title: string }).title,
      owner_email: (s as { owner_email: string | null }).owner_email,
      owner_ip: (s as { owner_ip: string | null }).owner_ip,
      created_at: (s as { created_at: string }).created_at,
      expires_at: (s as { expires_at: string }).expires_at,
      groups: (counts ?? []).filter((g) => (g as { session_id: string }).session_id === sid).length,
      items: (itemsCount ?? []).filter((i) => (i as { session_id: string }).session_id === sid).length,
    };
  });

  return (
    <div className="space-y-4">
      <Link href="/admin/services" className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Service tools
      </Link>
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-navy">Screenshot Organizer</h1>
        <p className="text-sm text-fg-muted">
          Sessions from the last 24 hours (older ones are auto-purged). Add, rename and delete groups; edit or delete screenshots.
        </p>
      </div>
      <Card>
        <CardBody className="py-3 text-sm text-fg-muted">
          <Badge tone="info">{sessionsOut.length} session{sessionsOut.length === 1 ? "" : "s"}</Badge>{" "}
          <Badge tone="neutral">{(itemsCount ?? []).length} screenshots</Badge>{" "}
          <Badge tone="neutral">{(counts ?? []).length} groups</Badge>
        </CardBody>
      </Card>
      <ScreenshotsManager sessions={sessionsOut} />
    </div>
  );
}
