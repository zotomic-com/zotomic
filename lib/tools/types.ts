import type { SupabaseClient } from "@supabase/supabase-js";

export type RiskLevel = "read" | "write" | "consequential";

export interface ToolContext {
  businessId: string;
  userId: string;
  role: "owner" | "staff";
  db: SupabaseClient;
  currency: string;
}

export interface JsonSchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
}

export interface ToolDef {
  name: string;
  description: string;
  risk: RiskLevel;
  /** minimum plan; undefined = all plans */
  requiredPlan?: "business" | "pro";
  parameters: JsonSchema;
  /** credit units charged when this tool runs */
  creditCost: number;
  handler: (ctx: ToolContext, args: Record<string, unknown>) => Promise<unknown>;
}

export interface ToolResult {
  tool: string;
  ok: boolean;
  data?: unknown;
  error?: string;
}
