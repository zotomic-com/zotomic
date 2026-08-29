import { NextRequest, NextResponse } from "next/server";
import { resolveTenant, isTenantError } from "@/lib/tenant";
import { generateReport } from "@/lib/reports/generate";

export const maxDuration = 120;

/** On-demand: regenerate the current business's latest weekly report. */
export async function POST(req: NextRequest) {
  const tenant = await resolveTenant(req);
  if (isTenantError(tenant)) return tenant;

  const result = await generateReport(tenant.businessId, { force: true });
  return NextResponse.json(result, { status: result.status === "ready" ? 200 : 500 });
}
