import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/admin-server";
import { listConvAnims, type ConvAdminRow, type ConvType } from "@/lib/services/converter";
import { approveConvAnim, rejectConvAnim, removeConvAnim } from "./actions";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Converter Library — Admin" };

function ConvCard({ row }: { row: ConvAdminRow }) {
  const d = row.definition ?? ({} as any);
  const keywords = Array.isArray(row.definition?.keywords) ? row.definition.keywords : [];
  const status = row.status;
  const checks = row.checks ?? {};
  const authored = checks.authored ?? 0;
  const rejected = Array.isArray(checks.rejected) ? checks.rejected : [];

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-bold text-fg">{row.convType}</span>
          <Badge tone={status === "approved" ? "success" : status === "rejected" ? "danger" : "warning"}>
            {status}
          </Badge>
          <span className="text-xs text-fg-subtle">{new Date(row.created_at).toLocaleString()}</span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {keywords.map((k: string) => (
            <span key={k} className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-fg-muted">
              {k}
            </span>
          ))}
        </div>

        {authored > 0 && (
          <p className="text-xs text-fg-muted">
            <span className="font-authored">Authored:</span> {authored} conversion(s)
          </p>
        )}

        {rejected.length > 0 && (
          <p className="text-xs text-warning">
            Same run rejected: {rejected.join(" · ")}
          </p>
        )}

        <details className="text-xs text-fg-muted">
          <summary className="cursor-pointer select-none font-semibold text-fg">
            Definition
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto rounded bg-surface-2 p-2 text-[11px] leading-relaxed">
{JSON.stringify(d, null, 2)}
          </pre>
        </details>

        <div className="flex flex-wrap gap-2 pt-1">
          {status !== "approved" && (
            <form action={approveConvAnim}>
              <input type="hidden" name="id" value={row.id} />
              <button className="rounded-lg bg-success px-3 py-1.5 text-xs font-bold text-white hover:opacity-90">
                Approve into library
              </button>
            </form>
          )}
          {status !== "rejected" && (
            <form action={rejectConvAnim}>
              <input type="hidden" name="id" value={row.id} />
              <button className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-fg-muted hover:bg-surface-2">
                Reject
              </button>
            </form>
          )}
          <form action={removeConvAnim}>
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

export default async function AdminConverterPage() {
  await requireAdmin();
  const rows = await listConvAnims();
  const pending = rows.filter((r) => r.status === "pending");
  const approved = rows.filter((r) => r.status === "approved");
  const rejected = rows.filter((r) => r.status === "rejected");

  return (
    <div className="space-y-4">
      <Link href="/admin/services" className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Service tools
      </Link>
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-navy">Converter Library</h1>
        <p className="text-sm text-fg-muted">
          AI‑written converter definitions (write‑once‑verify‑once). Gemini authors +
          debugs them per video (write‑once); approving here makes them permanent library
          entries that future videos reuse without an AI call (verify‑once).
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-fg-muted">
          Pending review {pending.length ? `(${pending.length})` : ""}
        </h2>
        {pending.length ? (
          pending.map((r: ConvAdminRow) => <ConvCard key={r.id} row={r} />)
        ) : (
          <Card><CardBody className="text-sm text-fg-muted">No converter definitions waiting for review.</CardBody></Card>
        )}
      </section>

      {approved.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-fg-muted">Approved ({approved.length})</h2>
          {approved.map((r: ConvAdminRow) => <ConvCard key={r.id} row={r} />)}
        </section>
      )}

      {rejected.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-fg-muted">Rejected ({rejected.length})</h2>
          {rejected.map((r: ConvAdminRow) => <ConvCard key={r.id} row={r} />)}
        </section>
      )}
    </div>
  );
}