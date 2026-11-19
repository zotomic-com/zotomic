import { NextRequest, NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase";
import { engineFetch, resolveToolCaller } from "@/lib/services/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/converter/refund — give back the quota credit for a failed job.
 *
 * A conversion is charged when it is authorized (that is what stops people
 * from bypassing the daily quota). If the engine then reports `error`, the
 * browser calls this route and we delete that one usage row.
 *
 * The engine is asked directly with the server's API key, so a caller cannot
 * refund a job that actually succeeded, or a job that never existed.
 */
export async function POST(req: NextRequest) {
  const res = await resolveToolCaller(req, "converter");
  if (!res.caller) return NextResponse.json({ error: res.error }, { status: res.status ?? 403 });
  const caller = res.caller;

  let body: { jobId?: string; mode?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const jobId = String(body.jobId ?? "").trim();
  if (!/^[a-f0-9]{8,32}$/i.test(jobId)) {
    return NextResponse.json({ error: "Invalid job id." }, { status: 400 });
  }

  if (body.mode !== "site") {
    let failed = false;
    try {
      const r = await engineFetch(`/api/progress/${jobId}`, { timeoutMs: 12_000 });
      if (r.ok) {
        const job = (await r.json()) as { status?: string };
        failed = job.status === "error";
      }
    } catch {
      // Engine unreachable — do not refund on a guess.
      return NextResponse.json({ refunded: false, reason: "engine-unreachable" });
    }
    if (!failed) return NextResponse.json({ refunded: false, reason: "job-not-failed" });
  }

  const db = getAdminSupabase();
  let query = db
    .from("service_usage")
    .select("id, meta")
    .eq("service", "converter")
    .eq("action", "convert")
    .eq("ok", true)
    .gte("created_at", new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString());

  if (caller.tokenId) query = query.eq("token_id", caller.tokenId);
  else if (caller.email) query = query.eq("user_email", caller.email);
  else if (caller.ip) query = query.eq("ip", caller.ip).is("user_email", null);
  else return NextResponse.json({ refunded: false });

  const { data, error } = await query;
  if (error) return NextResponse.json({ refunded: false, reason: error.message }, { status: 500 });

  const match = (data ?? []).find((r) => (r.meta as Record<string, unknown> | null)?.jobId === jobId);
  if (!match) return NextResponse.json({ refunded: false, reason: "no-charge-found" });

  const del = await db.from("service_usage").delete().eq("id", match.id as string);
  if (del.error) return NextResponse.json({ refunded: false, reason: del.error.message }, { status: 500 });
  return NextResponse.json({ refunded: true });
}
