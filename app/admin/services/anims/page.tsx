import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/admin-server";
import { listAnims, type AnimLibraryRow } from "@/lib/videos/anim-library";
import { approveAnim, rejectAnim, removeAnim } from "./actions";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Animation Library — Admin" };

function AnimCard({ row }: { row: AnimLibraryRow }) {
  const d = row.definition ?? ({} as AnimLibraryRow["definition"]);
  const frames = Array.isArray(d.frames) ? d.frames : [];
  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-bold text-fg">{row.slug}</span>
          <Badge tone={row.status === "approved" ? "success" : row.status === "rejected" ? "danger" : "warning"}>
            {row.status}
          </Badge>
          {d.loop ? <Badge tone="info">loop {d.cycle ?? "?"}s</Badge> : <Badge>one-shot</Badge>}
          <span className="text-xs text-fg-subtle">{new Date(row.created_at).toLocaleString()}</span>
        </div>

        {row.checks?.visual && (
          <p className="text-xs text-fg-muted">
            <span className="font-semibold">Written for:</span> “{row.checks.sceneTitle}” — {row.checks.visual}
          </p>
        )}
        <div className="flex flex-wrap gap-1.5">
          {(row.keywords ?? []).map((k) => (
            <span key={k} className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-fg-muted">
              {k}
            </span>
          ))}
        </div>

        {row.checks?.rejected?.length > 0 && (
          <p className="text-xs text-warning">
            Same run rejected: {row.checks.rejected.join(" · ")}
          </p>
        )}

        <details className="text-xs text-fg-muted">
          <summary className="cursor-pointer select-none font-semibold text-fg">
            Keyframes ({frames.length})
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto rounded bg-surface-2 p-2 text-[11px] leading-relaxed">
{JSON.stringify(d, null, 2)}
          </pre>
        </details>

        <div className="flex flex-wrap gap-2 pt-1">
          {row.status !== "approved" && (
            <form action={approveAnim}>
              <input type="hidden" name="id" value={row.id} />
              <button className="rounded-lg bg-success px-3 py-1.5 text-xs font-bold text-white hover:opacity-90">
                Approve into library
              </button>
            </form>
          )}
          {row.status !== "rejected" && (
            <form action={rejectAnim}>
              <input type="hidden" name="id" value={row.id} />
              <button className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-fg-muted hover:bg-surface-2">
                Reject
              </button>
            </form>
          )}
          <form action={removeAnim}>
            <input type="hidden" name="id" value={row.id} />
            <button className="rounded-lg px-3 py-1.5 text-xs font-bold text-danger hover:bg-danger-soft">
              Delete
            </button>
          </form>
        </div>
      </CardBody>
    </Card>
  );
}

export default async function AdminAnimsPage() {
  await requireAdmin();
  const rows = await listAnims();
  const pending = rows.filter((r) => r.status === "pending");
  const approved = rows.filter((r) => r.status === "approved");
  const rejected = rows.filter((r) => r.status === "rejected");

  return (
    <div className="space-y-4">
      <Link href="/admin/services" className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Service tools
      </Link>
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-navy">Animation Library</h1>
        <p className="text-sm text-fg-muted">
          AI-written stick-figure animations (keyframe DSL). Gemini authors + debugs them per video
          (write-once); approving here makes them permanent library entries that future videos reuse
          without an AI call (verify-once).
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-fg-muted">
          Pending review {pending.length ? `(${pending.length})` : ""}
        </h2>
        {pending.length ? (
          pending.map((row) => <AnimCard key={row.id} row={row} />)
        ) : (
          <Card><CardBody className="text-sm text-fg-muted">No animations waiting for review.</CardBody></Card>
        )}
      </section>

      {approved.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-fg-muted">Approved ({approved.length})</h2>
          {approved.map((row) => <AnimCard key={row.id} row={row} />)}
        </section>
      )}

      {rejected.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-fg-muted">Rejected ({rejected.length})</h2>
          {rejected.map((row) => <AnimCard key={row.id} row={row} />)}
        </section>
      )}
    </div>
  );
}
