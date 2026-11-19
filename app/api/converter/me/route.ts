import { NextRequest, NextResponse } from "next/server";
import { resolveToolCaller, quotaStatus } from "@/lib/services/tools";
import { listConvTypes } from "@/lib/services/converter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/converter/me — caller identity, plan, remaining quota, live type list. */
export async function GET(req: NextRequest) {
  const res = await resolveToolCaller(req, "converter");
  if (!res.caller) return NextResponse.json({ error: res.error }, { status: res.status ?? 403 });

  const quota = await quotaStatus(res.caller, "converter");
  const types = await listConvTypes({ onlyEnabled: true });

  return NextResponse.json({
    email: res.caller.email,
    isAdmin: res.caller.isAdmin,
    plan: res.caller.plan,
    quota,
    types: types.map((t) => ({
      slug: t.slug,
      label: t.label,
      group: t.group,
      description: t.description,
      accept: t.accept,
      multiple: t.multiple,
      needsFile: t.needsFile,
      options: t.options,
    })),
  });
}
