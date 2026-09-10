/**
 * Dev-ops powers for the admin assistant: read the Zotomic repo, open a
 * branch + PR (optionally merge it), run a SQL migration, trigger a Vercel
 * deploy. Every one of these is capability-gated (admin_assistant_settings)
 * AND confirmed per call; SQL / deploy / merge also need a typed word.
 * Server-only.
 */
import "server-only";

const GH_API = "https://api.github.com";
const VERCEL_API = "https://api.vercel.com";

const SLUG_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

/** Which repo a git tool targets — an explicit `owner/repo` or the default. */
export function repoSlug(override?: string): string {
  const o = (override ?? "").trim();
  if (o && SLUG_RE.test(o)) return o;
  return process.env.GITHUB_REPO || "zotomic-com/zotomic";
}
function ghToken(): string | null {
  return process.env.GITHUB_TOKEN || null;
}
function ghHeaders() {
  return {
    Authorization: `Bearer ${ghToken()}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "zotomic-admin-assistant",
  };
}

async function gh<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; error: string; status: number }> {
  if (!ghToken()) return { ok: false, error: "GitHub isn't connected (no token).", status: 0 };
  try {
    const res = await fetch(`${GH_API}${path}`, {
      ...init,
      headers: { ...ghHeaders(), ...(init?.headers ?? {}) },
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok) {
      return { ok: false, status: res.status, error: (data as { message?: string })?.message || `GitHub ${res.status}` };
    }
    return { ok: true, data: data as T };
  } catch (e) {
    return { ok: false, error: (e as Error).message, status: 0 };
  }
}

/* ── repo reads (coding context) ──────────────────────────────────────────── */

export async function repoReadFile(
  path: string,
  ref?: string,
  repo?: string,
): Promise<{ ok: true; path: string; content: string; sha: string; size: number } | { error: string }> {
  const p = path.replace(/^\/+/, "");
  const r = await gh<{ content?: string; encoding?: string; sha?: string; size?: number; type?: string }>(
    `/repos/${repoSlug(repo)}/contents/${encodeURI(p)}${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`,
  );
  if (!r.ok) return { error: r.error };
  if (r.data.type !== "file" || !r.data.content) return { error: `${p} is not a file.` };
  const content = Buffer.from(r.data.content, (r.data.encoding as BufferEncoding) || "base64").toString("utf8");
  return { ok: true, path: p, content: content.slice(0, 200_000), sha: r.data.sha ?? "", size: r.data.size ?? content.length };
}

export async function repoListDir(
  path = "",
  ref?: string,
  repo?: string,
): Promise<{ ok: true; entries: { path: string; type: string; size: number }[] } | { error: string }> {
  const p = path.replace(/^\/+/, "");
  const r = await gh<{ path: string; type: string; size?: number }[]>(
    `/repos/${repoSlug(repo)}/contents/${encodeURI(p)}${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`,
  );
  if (!r.ok) return { error: r.error };
  if (!Array.isArray(r.data)) return { error: `${p || "/"} is a file, not a directory.` };
  return {
    ok: true,
    entries: r.data.map((e) => ({ path: e.path, type: e.type, size: e.size ?? 0 })).slice(0, 300),
  };
}

export async function repoSearchCode(
  query: string,
  repo?: string,
): Promise<{ ok: true; matches: { path: string; url: string }[] } | { error: string }> {
  const q = `${query} repo:${repoSlug(repo)}`;
  const r = await gh<{ items?: { path: string; html_url: string }[] }>(`/search/code?q=${encodeURIComponent(q)}&per_page=20`);
  if (!r.ok) return { error: r.error };
  return { ok: true, matches: (r.data.items ?? []).map((i) => ({ path: i.path, url: i.html_url })) };
}

/* ── branch + PR ─────────────────────────────────────────────────────────── */

export interface RepoChange {
  path: string;
  /** full new file content; null = delete the file */
  content: string | null;
}

export async function openPullRequest(input: {
  branch: string;
  title: string;
  body?: string;
  base?: string;
  repo?: string;
  changes: RepoChange[];
}): Promise<{ ok: true; number: number; url: string; branch: string } | { error: string }> {
  const repo = repoSlug(input.repo);
  const base = input.base || "main";
  const branch = input.branch.replace(/[^a-zA-Z0-9._/-]/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || `zotomic/${Date.now()}`;
  const changes = input.changes.filter((c) => c.path && c.path !== ".");
  if (!changes.length) return { error: "No file changes to commit." };
  if (changes.length > 40) return { error: "Too many files in one PR (max 40)." };

  const refR = await gh<{ object: { sha: string } }>(`/repos/${repo}/git/ref/heads/${base}`);
  if (!refR.ok) return { error: `Couldn't read ${base}: ${refR.error}` };
  const baseSha = refR.data.object.sha;

  const commitR = await gh<{ tree: { sha: string } }>(`/repos/${repo}/git/commits/${baseSha}`);
  if (!commitR.ok) return { error: commitR.error };
  const baseTree = commitR.data.tree.sha;

  const tree: { path: string; mode: "100644"; type: "blob"; sha: string | null }[] = [];
  for (const c of changes) {
    const path = c.path.replace(/^\/+/, "");
    if (c.content === null) {
      tree.push({ path, mode: "100644", type: "blob", sha: null });
      continue;
    }
    const blobR = await gh<{ sha: string }>(`/repos/${repo}/git/blobs`, {
      method: "POST",
      body: JSON.stringify({ content: Buffer.from(c.content, "utf8").toString("base64"), encoding: "base64" }),
    });
    if (!blobR.ok) return { error: `blob for ${path}: ${blobR.error}` };
    tree.push({ path, mode: "100644", type: "blob", sha: blobR.data.sha });
  }

  const treeR = await gh<{ sha: string }>(`/repos/${repo}/git/trees`, {
    method: "POST",
    body: JSON.stringify({ base_tree: baseTree, tree }),
  });
  if (!treeR.ok) return { error: treeR.error };

  const newCommitR = await gh<{ sha: string }>(`/repos/${repo}/git/commits`, {
    method: "POST",
    body: JSON.stringify({
      message: `${input.title}\n\nvia Zotomic admin assistant`,
      tree: treeR.data.sha,
      parents: [baseSha],
    }),
  });
  if (!newCommitR.ok) return { error: newCommitR.error };

  const branchR = await gh(`/repos/${repo}/git/refs`, {
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: newCommitR.data.sha }),
  });
  if (!branchR.ok) return { error: `create branch: ${branchR.error}` };

  const prR = await gh<{ number: number; html_url: string }>(`/repos/${repo}/pulls`, {
    method: "POST",
    body: JSON.stringify({
      title: input.title.slice(0, 200),
      head: branch,
      base,
      body: `${input.body ?? ""}\n\n---\n🤖 Opened by the Zotomic admin assistant.`.trim(),
    }),
  });
  if (!prR.ok) return { error: `open PR: ${prR.error}` };

  return { ok: true, number: prR.data.number, url: prR.data.html_url, branch };
}

export async function mergePullRequest(
  number: number,
  method: "squash" | "merge" | "rebase" = "squash",
  repo?: string,
): Promise<{ ok: true; sha: string } | { error: string }> {
  const r = await gh<{ sha: string; merged: boolean }>(`/repos/${repoSlug(repo)}/pulls/${number}/merge`, {
    method: "PUT",
    body: JSON.stringify({ merge_method: method }),
  });
  if (!r.ok) return { error: r.error };
  if (!r.data.merged) return { error: "GitHub reported the PR was not merged." };
  return { ok: true, sha: r.data.sha };
}

export async function getPullRequest(
  number: number,
  repo?: string,
): Promise<{ ok: true; title: string; state: string; mergeable: boolean | null; url: string; changedFiles: number } | { error: string }> {
  const r = await gh<{ title: string; state: string; mergeable: boolean | null; html_url: string; changed_files: number }>(
    `/repos/${repoSlug(repo)}/pulls/${number}`,
  );
  if (!r.ok) return { error: r.error };
  return {
    ok: true,
    title: r.data.title,
    state: r.data.state,
    mergeable: r.data.mergeable,
    url: r.data.html_url,
    changedFiles: r.data.changed_files,
  };
}

/* ── SQL migration (direct Postgres, superuser) ───────────────────────────── */

const SQL_FORBIDDEN = [
  /\bdrop\s+database\b/i,
  /\bdrop\s+schema\b/i,
  /\b(create|alter|drop)\s+role\b/i,
  /\b(create|alter|drop)\s+user\b/i,
  /\bdrop\s+owned\b/i,
  /\breassign\s+owned\b/i,
  /\balter\s+system\b/i,
  /\bgrant\s+/i,
  /\brevoke\s+/i,
  /\bcopy\b.*\bto\s+program\b/i,
  /\bpg_read_file\b/i,
  /\bpg_ls_dir\b/i,
];
// unqualified DML — a DELETE/UPDATE/TRUNCATE that isn't scoped
const UNQUALIFIED_DML =
  /(\bdelete\s+from\s+[a-z0-9_."]+\s*;)|(\bupdate\s+[a-z0-9_."]+\s+set\b(?:(?!\bwhere\b)[\s\S])*?;)|(\btruncate\b)/i;

export function checkSql(sql: string): { ok: true } | { error: string } {
  const s = sql.trim();
  if (!s) return { error: "Empty SQL." };
  if (s.length > 20_000) return { error: "SQL is too long (20 KB max)." };
  for (const re of SQL_FORBIDDEN) {
    if (re.test(s)) return { error: `Refused — the SQL contains a blocked operation (${re.source}).` };
  }
  if (UNQUALIFIED_DML.test(s)) {
    return { error: "Refused — an unqualified DELETE/UPDATE/TRUNCATE (no WHERE). Add a WHERE clause or scope it." };
  }
  return { ok: true };
}

export async function runSql(
  sql: string,
): Promise<{ ok: true; statements: number; lastRows: number; notices: string[] } | { error: string }> {
  const gate = checkSql(sql);
  if ("error" in gate) return gate;
  const conn = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
  if (!conn) return { error: "No database connection string is configured." };

  const { Client } = await import("pg");
  const client = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false }, statement_timeout: 30_000 });
  const notices: string[] = [];
  client.on("notice", (n) => notices.push(n.message ?? String(n)));
  try {
    await client.connect();
    await client.query("SET lock_timeout = '10s'");
    const res = await client.query(sql);
    const results = Array.isArray(res) ? res : [res];
    const last = results[results.length - 1];
    // reload PostgREST so new columns/tables are visible to the app immediately
    try {
      await client.query("NOTIFY pgrst, 'reload schema'");
    } catch {
      /* ignore */
    }
    return { ok: true, statements: results.length, lastRows: last?.rowCount ?? 0, notices: notices.slice(0, 10) };
  } catch (e) {
    return { error: `SQL failed: ${(e as Error).message}` };
  } finally {
    await client.end().catch(() => {});
  }
}

/* ── Vercel deploy ───────────────────────────────────────────────────────── */

function vercelToken(): string | null {
  return process.env.VERCEL_DEPLOY_TOKEN || process.env.VERCEL_API_TOKEN || null;
}

export async function triggerDeploy(
  ref = "main",
): Promise<{ ok: true; id: string; url: string } | { error: string }> {
  const token = vercelToken();
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_TEAM_ID;
  if (!token || !projectId) return { error: "Vercel isn't configured for deploys." };

  try {
    // resolve the linked GitHub repo id
    const projRes = await fetch(
      `${VERCEL_API}/v9/projects/${projectId}${teamId ? `?teamId=${teamId}` : ""}`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) },
    );
    const proj = (await projRes.json()) as { name?: string; link?: { repoId?: number; type?: string } };
    if (!proj.link?.repoId) return { error: "The Vercel project isn't linked to a GitHub repo." };

    const res = await fetch(`${VERCEL_API}/v13/deployments${teamId ? `?teamId=${teamId}` : ""}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: proj.name ?? "zotomic",
        project: projectId,
        target: "production",
        gitSource: { type: "github", repoId: proj.link.repoId, ref },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const data = (await res.json()) as { id?: string; url?: string; error?: { message?: string } };
    if (!res.ok || !data.id) return { error: data.error?.message || `Vercel ${res.status}` };
    return { ok: true, id: data.id, url: data.url ? `https://${data.url}` : "" };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
