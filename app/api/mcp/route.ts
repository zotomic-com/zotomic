/**
 * Zotomic as an MCP server. An admin generates a token in /admin/assistants
 * ("Zotomic as an MCP server") and adds `https://zotomic.com/api/mcp` + that
 * token to their MCP client (Claude Desktop, Cursor, …). The client then gets
 * Zotomic's admin tools.
 *
 * Streamable-HTTP transport, non-streaming (plain JSON responses). Read-tier
 * tools always; consequential tools only when the token has the "write" scope.
 * Capability + connector gates still apply.
 */
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { getAdminSupabase } from "@/lib/supabase";
import { ADMIN_TOOLS } from "@/lib/tools/admin-registry";
import { getAssistantCaps } from "@/lib/ai/assistant-powers";
import { enabledConnectorProviders } from "@/lib/ai/connectors";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

const PROTOCOL = "2025-06-18";

async function authToken(req: NextRequest): Promise<{ adminId: string; write: boolean } | null> {
  const hdr = req.headers.get("authorization") || "";
  const m = hdr.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const hash = createHash("sha256").update(m[1].trim()).digest("hex");
  const db = getAdminSupabase();
  const { data } = await db
    .from("admin_mcp_tokens")
    .select("id, scopes, enabled, created_by")
    .eq("token_hash", hash)
    .maybeSingle();
  if (!data || !data.enabled) return null;
  await db.from("admin_mcp_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  return { adminId: (data.created_by as string) ?? "", write: ((data.scopes as string[]) ?? []).includes("write") };
}

function rpc(id: unknown, result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id, result });
}
function rpcErr(id: unknown, code: number, message: string) {
  return NextResponse.json({ jsonrpc: "2.0", id, error: { code, message } });
}

export async function GET() {
  // some clients probe with GET; we only do request/response
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}

export async function POST(req: NextRequest) {
  const auth = await authToken(req);
  if (!auth) return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "Unauthorized" } }, { status: 401 });

  let body: { jsonrpc?: string; id?: unknown; method?: string; params?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return rpcErr(null, -32700, "Parse error");
  }
  const { id, method, params } = body;

  if (method === "initialize") {
    return rpc(id, {
      protocolVersion: PROTOCOL,
      capabilities: { tools: {} },
      serverInfo: { name: "zotomic", version: "1.0.0" },
      instructions:
        "Zotomic platform admin tools. Read tools are free to call. Consequential tools (suspend a store, grant credits, run SQL, deploy, post to Slack…) apply real changes — confirm with the human first. Capabilities and connectors are gated in the Zotomic dashboard.",
    });
  }
  if (method === "notifications/initialized" || method === "notifications/cancelled") {
    return new NextResponse(null, { status: 202 });
  }
  if (method === "ping") return rpc(id, {});

  if (method === "tools/list") {
    const [caps, conns] = await Promise.all([getAssistantCaps(), enabledConnectorProviders()]);
    const tools = ADMIN_TOOLS.filter((t) => {
      if (t.risk === "consequential" && !auth.write) return false;
      if (t.requiresCap && !caps[t.requiresCap]) return false;
      if (t.requiresConnector && !conns.has(t.requiresConnector)) return false;
      return true;
    }).map((t) => ({
      name: t.name,
      description:
        t.description +
        (t.risk === "consequential" ? " [WRITES — confirm with the human before calling]" : ""),
      inputSchema: t.parameters,
    }));
    return rpc(id, { tools });
  }

  if (method === "tools/call") {
    const name = String(params?.name ?? "");
    const args = (params?.arguments as Record<string, unknown>) ?? {};
    const tool = ADMIN_TOOLS.find((t) => t.name === name);
    if (!tool) return rpcErr(id, -32602, `Unknown tool: ${name}`);
    if (tool.risk === "consequential" && !auth.write) {
      return rpc(id, { content: [{ type: "text", text: `Refused: "${name}" makes changes and this token is read-only.` }], isError: true });
    }
    const caps = await getAssistantCaps();
    if (tool.requiresCap && !caps[tool.requiresCap]) {
      return rpc(id, { content: [{ type: "text", text: `The "${tool.requiresCap}" power is turned off in the Zotomic dashboard.` }], isError: true });
    }
    if (tool.requiresConnector) {
      const conns = await enabledConnectorProviders();
      if (!conns.has(tool.requiresConnector)) {
        return rpc(id, { content: [{ type: "text", text: `The ${tool.requiresConnector} connector is turned off.` }], isError: true });
      }
    }
    try {
      const out = await tool.handler(auth.adminId, args);
      const isErr = !!(out && typeof out === "object" && "error" in out);
      return rpc(id, { content: [{ type: "text", text: JSON.stringify(out, null, 2) }], isError: isErr });
    } catch (e) {
      return rpc(id, { content: [{ type: "text", text: `Tool failed: ${(e as Error).message}` }], isError: true });
    }
  }

  return rpcErr(id, -32601, `Method not found: ${method}`);
}
