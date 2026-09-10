/**
 * External-service connectors for the admin assistant. Token-based (paste a
 * token), stored AES-encrypted, toggled on/off in /admin/assistants. The agent
 * gets a connector's tools only while it is enabled. Server-only.
 */
import "server-only";
import { getAdminSupabase } from "@/lib/supabase";
import { decrypt } from "@/lib/auth";

export type ConnectorProvider = "slack" | "notion" | "sentry" | "google";
export const CONNECTOR_PROVIDERS: ConnectorProvider[] = ["slack", "notion", "sentry", "google"];

export const CONNECTOR_META: Record<
  ConnectorProvider,
  { name: string; tokenLabel: string; setup: string; configFields: { key: string; label: string }[]; oauth?: boolean }
> = {
  slack: {
    name: "Slack",
    tokenLabel: "Bot User OAuth Token (xoxb-…)",
    setup:
      "api.slack.com/apps → Create app → OAuth & Permissions → add bot scopes chat:write, channels:read, channels:history, groups:read, groups:history → Install to workspace → copy the Bot User OAuth Token. Invite the bot to any channel you want it to post in.",
    configFields: [],
  },
  notion: {
    name: "Notion",
    tokenLabel: "Internal Integration Secret (ntn_… / secret_…)",
    setup:
      "notion.so/my-integrations → New integration (internal) → copy the secret. Then open each page/database you want Zotomic to use → ••• → Connections → add your integration.",
    configFields: [],
  },
  sentry: {
    name: "Sentry",
    tokenLabel: "Auth Token",
    setup:
      "sentry.io → Settings → Developer Settings → Auth Tokens (or User Settings → Auth Tokens) → create with scopes project:read, event:read, org:read. Fill in your org + project slugs below.",
    configFields: [
      { key: "org", label: "Org slug" },
      { key: "project", label: "Project slug" },
    ],
  },
  google: {
    name: "Google (Sheets / Drive / Gmail / Calendar)",
    tokenLabel: "—",
    setup:
      "Needs a Google Cloud OAuth client first (client id + secret, redirect URI https://zotomic.com/api/connectors/google/callback, Sheets/Drive/Gmail/Calendar APIs enabled). Then Connect via Google here.",
    configFields: [],
    oauth: true,
  },
};

export interface Connector {
  id: string;
  provider: ConnectorProvider;
  label: string | null;
  token: string;
  config: Record<string, unknown>;
  meta: Record<string, unknown> | null;
}

export async function getConnector(provider: ConnectorProvider): Promise<Connector | null> {
  const { data } = await getAdminSupabase()
    .from("admin_connectors")
    .select("id, provider, label, secret, config, meta")
    .eq("provider", provider)
    .eq("enabled", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const token = decrypt((data.secret as string) ?? "") || "";
  if (!token) return null;
  return {
    id: data.id as string,
    provider,
    label: (data.label as string) ?? null,
    token,
    config: (data.config as Record<string, unknown>) ?? {},
    meta: (data.meta as Record<string, unknown>) ?? null,
  };
}

/** Which connectors are currently switched on — used to filter the tool list. */
export async function enabledConnectorProviders(): Promise<Set<ConnectorProvider>> {
  const { data } = await getAdminSupabase()
    .from("admin_connectors")
    .select("provider")
    .eq("enabled", true);
  return new Set((data ?? []).map((r) => r.provider as ConnectorProvider));
}

export async function touchConnector(id: string, ok: boolean, error?: string): Promise<void> {
  try {
    await getAdminSupabase()
      .from("admin_connectors")
      .update({ last_used_at: new Date().toISOString(), status: ok ? "ok" : `error: ${(error ?? "").slice(0, 140)}` })
      .eq("id", id);
  } catch {
    /* best effort */
  }
}

/* ─────────────────────────────  Slack  ───────────────────────────── */

async function slackCall(token: string, method: string, body?: Record<string, unknown>) {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(12_000),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || `Slack ${method} failed`);
  return data;
}

export async function slackVerify(token: string): Promise<{ team?: string; user?: string }> {
  const d = await slackCall(token, "auth.test");
  return { team: d.team, user: d.user };
}
export async function slackListChannels(token: string): Promise<{ name: string; id: string }[]> {
  const d = await slackCall(token, "conversations.list?types=public_channel,private_channel&limit=200&exclude_archived=true");
  return (d.channels ?? []).map((c: { name: string; id: string }) => ({ name: c.name, id: c.id })).slice(0, 100);
}
export async function slackPost(token: string, channel: string, text: string): Promise<{ ts: string }> {
  const ch = channel.replace(/^#/, "");
  const d = await slackCall(token, "chat.postMessage", { channel: ch, text, unfurl_links: false });
  return { ts: d.ts };
}
export async function slackHistory(token: string, channel: string, limit = 20): Promise<{ user: string; text: string; ts: string }[]> {
  let id = channel.replace(/^#/, "");
  if (!/^[CGD][A-Z0-9]+$/.test(id)) {
    const chans = await slackListChannels(token);
    id = chans.find((c) => c.name === id)?.id ?? id;
  }
  const d = await slackCall(token, `conversations.history?channel=${encodeURIComponent(id)}&limit=${Math.min(50, limit)}`);
  return (d.messages ?? []).map((m: { user?: string; text?: string; ts: string }) => ({ user: m.user ?? "?", text: m.text ?? "", ts: m.ts }));
}

/* ─────────────────────────────  Notion  ───────────────────────────── */

async function notionCall(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || `Notion ${res.status}`);
  return data;
}

export async function notionVerify(token: string): Promise<{ name?: string }> {
  const d = await notionCall(token, "/users/me");
  return { name: d?.bot?.owner?.workspace ? "workspace" : d?.name };
}

const plain = (rich: { plain_text?: string }[] = []) => rich.map((r) => r.plain_text ?? "").join("");

export async function notionSearch(token: string, query: string): Promise<{ id: string; title: string; type: string; url: string }[]> {
  const d = await notionCall(token, "/search", { method: "POST", body: JSON.stringify({ query, page_size: 15 }) });
  return (d.results ?? []).map((r: Record<string, unknown>) => {
    const props = (r.properties ?? {}) as Record<string, { title?: { plain_text?: string }[] }>;
    const titleProp = Object.values(props).find((p) => p.title);
    const title =
      plain(titleProp?.title) ||
      plain((r as { title?: { plain_text?: string }[] }).title) ||
      "(untitled)";
    return { id: r.id as string, title, type: r.object as string, url: (r.url as string) ?? "" };
  });
}

export async function notionReadPage(token: string, pageId: string): Promise<{ title: string; markdown: string }> {
  const id = pageId.replace(/-/g, "");
  const page = await notionCall(token, `/pages/${id}`);
  const props = (page.properties ?? {}) as Record<string, { title?: { plain_text?: string }[] }>;
  const titleProp = Object.values(props).find((p) => p.title);
  const title = plain(titleProp?.title) || "(untitled)";

  let cursor: string | undefined;
  const lines: string[] = [];
  do {
    const d = await notionCall(token, `/blocks/${id}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`);
    for (const b of d.results ?? []) {
      const t = b.type as string;
      const rt = (b[t]?.rich_text ?? []) as { plain_text?: string }[];
      const txt = plain(rt);
      if (t === "heading_1") lines.push(`# ${txt}`);
      else if (t === "heading_2") lines.push(`## ${txt}`);
      else if (t === "heading_3") lines.push(`### ${txt}`);
      else if (t === "bulleted_list_item") lines.push(`- ${txt}`);
      else if (t === "numbered_list_item") lines.push(`1. ${txt}`);
      else if (t === "to_do") lines.push(`- [${b.to_do?.checked ? "x" : " "}] ${txt}`);
      else if (t === "code") lines.push("```\n" + txt + "\n```");
      else if (txt) lines.push(txt);
    }
    cursor = d.has_more ? d.next_cursor : undefined;
  } while (cursor);

  return { title, markdown: lines.join("\n\n").slice(0, 40_000) };
}

function mdToBlocks(markdown: string) {
  return markdown
    .split("\n")
    .filter((l) => l.trim() !== "")
    .slice(0, 90)
    .map((line) => {
      const rich = (text: string) => [{ type: "text", text: { content: text.slice(0, 1900) } }];
      if (line.startsWith("### ")) return { type: "heading_3", heading_3: { rich_text: rich(line.slice(4)) } };
      if (line.startsWith("## ")) return { type: "heading_2", heading_2: { rich_text: rich(line.slice(3)) } };
      if (line.startsWith("# ")) return { type: "heading_1", heading_1: { rich_text: rich(line.slice(2)) } };
      if (/^[-*]\s+/.test(line)) return { type: "bulleted_list_item", bulleted_list_item: { rich_text: rich(line.replace(/^[-*]\s+/, "")) } };
      return { type: "paragraph", paragraph: { rich_text: rich(line) } };
    });
}

export async function notionAppend(token: string, pageId: string, markdown: string): Promise<void> {
  await notionCall(token, `/blocks/${pageId.replace(/-/g, "")}/children`, {
    method: "PATCH",
    body: JSON.stringify({ children: mdToBlocks(markdown) }),
  });
}

export async function notionCreatePage(
  token: string,
  parentPageId: string,
  title: string,
  markdown: string,
): Promise<{ id: string; url: string }> {
  const d = await notionCall(token, "/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { page_id: parentPageId.replace(/-/g, "") },
      properties: { title: { title: [{ text: { content: title.slice(0, 200) } }] } },
      children: mdToBlocks(markdown),
    }),
  });
  return { id: d.id, url: d.url };
}

/* ─────────────────────────────  Sentry  ───────────────────────────── */

async function sentryCall(token: string, path: string) {
  const res = await fetch(`https://sentry.io/api/0${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data as { detail?: string })?.detail || `Sentry ${res.status}`);
  return data;
}

export async function sentryVerify(token: string, org: string, project: string): Promise<{ ok: true }> {
  await sentryCall(token, `/projects/${org}/${project}/`);
  return { ok: true };
}

export async function sentryIssues(
  token: string,
  org: string,
  project: string,
  query = "is:unresolved",
  limit = 15,
): Promise<{ id: string; title: string; culprit: string; count: number; users: number; lastSeen: string; permalink: string }[]> {
  const d = await sentryCall(
    token,
    `/projects/${org}/${project}/issues/?query=${encodeURIComponent(query)}&limit=${Math.min(25, limit)}&statsPeriod=14d`,
  );
  return (d as Record<string, unknown>[]).map((i) => ({
    id: i.id as string,
    title: i.title as string,
    culprit: (i.culprit as string) ?? "",
    count: Number(i.count ?? 0),
    users: Number(i.userCount ?? 0),
    lastSeen: i.lastSeen as string,
    permalink: (i.permalink as string) ?? "",
  }));
}

export async function sentryIssueDetail(token: string, org: string, issueId: string): Promise<Record<string, unknown>> {
  const d = await sentryCall(token, `/organizations/${org}/issues/${issueId}/`);
  return {
    title: (d as { title?: string }).title,
    culprit: (d as { culprit?: string }).culprit,
    level: (d as { level?: string }).level,
    status: (d as { status?: string }).status,
    count: (d as { count?: string }).count,
    firstSeen: (d as { firstSeen?: string }).firstSeen,
    lastSeen: (d as { lastSeen?: string }).lastSeen,
    permalink: (d as { permalink?: string }).permalink,
    metadata: (d as { metadata?: unknown }).metadata,
  };
}
