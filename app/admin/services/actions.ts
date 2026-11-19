"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-server";
import { getAdminSupabase } from "@/lib/supabase";
import {
  createServiceToken,
  updateServiceToken,
  deleteServiceToken,
  listServiceTokens,
} from "@/lib/services/tool-tokens";
import {
  upsertServiceAccess,
  deleteServiceAccess,
} from "@/lib/services/tool-access";
import { updateServiceCard } from "@/lib/service-cards";

/* ── engine cookies.txt upload (YouTube bot-check fix) ───────────────────── */

const RENDER_API_BASE = "https://api.render.com/v1";

function renderApiConfig(): { key: string; serviceId: string } | null {
  const key = process.env.RENDER_API_KEY;
  const serviceId = process.env.RENDER_SERVICE_ID;
  if (!key || !serviceId) return null;
  return { key, serviceId };
}

/** Basic sanity checks so a wrong file never wipes the working env var. */
function validateCookiesFile(raw: string): string | null {
  const text = raw.trim();
  if (!text) return "The file is empty.";
  const looksNetscape =
    /# Netscape HTTP Cookie File/i.test(text) || /^\S+\t\S+\t\d+\t\S+\t\S+\t\S+\t.+$/m.test(text);
  if (!looksNetscape) {
    return "This does not look like a cookies.txt file (Netscape format). Export it with the “Get cookies.txt LOCALLY” browser extension.";
  }
  if (!/\.?youtube\.com/i.test(text)) {
    return "The file has no youtube.com cookies — YouTube downloads need a cookies.txt exported from youtube.com.";
  }
  return null;
}

export async function uploadEngineCookiesAction(
  raw: string,
): Promise<{ ok: boolean; error?: string; deployId?: string }> {
  const admin = await requireAdmin();
  const cfg = renderApiConfig();
  if (!cfg) return { ok: false, error: "RENDER_API_KEY / RENDER_SERVICE_ID are not configured on the server." };

  const invalid = validateCookiesFile(raw);
  if (invalid) return { ok: false, error: invalid };

  const H = {
    Authorization: `Bearer ${cfg.key}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  // 1. Store the cookies as the engine's YTDLP_COOKIES env var (secret value).
  const put = await fetch(`${RENDER_API_BASE}/services/${cfg.serviceId}/env-vars/YTDLP_COOKIES`, {
    method: "PUT",
    headers: H,
    body: JSON.stringify({ value: raw }),
  });
  if (!put.ok) {
    return { ok: false, error: `Render rejected the env update (HTTP ${put.status}). Cookies were not changed.` };
  }

  // 2. Env changes need a deploy to take effect — start one automatically.
  const dep = await fetch(`${RENDER_API_BASE}/services/${cfg.serviceId}/deploys`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ clearCache: "do_not_clear" }),
  });
  if (!dep.ok) {
    return { ok: false, error: `Cookies were saved, but starting the deploy failed (HTTP ${dep.status}). Trigger a manual deploy in the Render dashboard.` };
  }
  const deploy = (await dep.json()) as { id?: string };
  await audit(admin.id, "services.cookies_updated", "Engine cookies.txt updated on Render — deploy started", deploy.id);
  return { ok: true, deployId: deploy.id };
}

/** Status shown on the admin dashboard: env var present + last deploy. */
export async function engineCookiesStatusAction(): Promise<{
  configured: boolean;
  deploy?: { id: string; status: string; commit: string | null; createdAt: string } | null;
  error?: string;
}> {
  await requireAdmin();
  const cfg = renderApiConfig();
  if (!cfg) return { configured: false, error: "RENDER_API_KEY / RENDER_SERVICE_ID are not configured." };
  const H = { Authorization: `Bearer ${cfg.key}`, Accept: "application/json" };

  const [envRes, depRes] = await Promise.all([
    fetch(`${RENDER_API_BASE}/services/${cfg.serviceId}/env-vars/YTDLP_COOKIES`, { headers: H }),
    fetch(`${RENDER_API_BASE}/services/${cfg.serviceId}/deploys?limit=1`, { headers: H }),
  ]);

  let deploy: { id: string; status: string; commit: string | null; createdAt: string } | null = null;
  if (depRes.ok) {
    const list = (await depRes.json()) as Array<{ deploy?: { id: string; status: string; commit?: { id?: string }; createdAt?: string } }>;
    const d = list[0]?.deploy;
    if (d) deploy = { id: d.id, status: d.status, commit: d.commit?.id?.slice(0, 7) ?? null, createdAt: d.createdAt ?? "" };
  }
  return { configured: envRes.ok, deploy };
}

async function audit(adminId: string, action: string, summary: string, targetId?: string) {
  await getAdminSupabase().from("audit_logs").insert({
    actor_id: adminId,
    action,
    summary,
    target_id: targetId ?? null,
  });
}

function revalidateServices() {
  revalidatePath("/admin/services");
  revalidatePath("/admin/services/tokens");
  revalidatePath("/admin/services/access");
  revalidatePath("/services/text-to-audio");
  revalidatePath("/services/online-downloader");
}

/* ── tokens ──────────────────────────────────────────────────────────────── */

export async function createServiceTokenAction(input: {
  userEmail: string;
  label?: string;
  services: "downloader" | "text_to_audio" | "video_generator" | "screenshot_organizer" | "converter" | "both" | "all";
  dailyLimit?: number | null;
  expiresAt?: string | null;
}): Promise<{ ok: boolean; token?: string; error?: string }> {
  const admin = await requireAdmin();
  const email = input.userEmail.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, error: "Enter a valid user email." };
  }
  const { token } = await createServiceToken({
    userEmail: email,
    label: input.label,
    services: input.services,
    dailyLimit: input.dailyLimit ?? null,
    expiresAt: input.expiresAt || null,
  });
  await audit(admin.id, "services.token_created", `Service token created for ${email}`, email);
  revalidateServices();
  return { ok: true, token };
}

export async function updateServiceTokenAction(
  id: string,
  patch: {
    label?: string | null;
    services?: "downloader" | "text_to_audio" | "video_generator" | "screenshot_organizer" | "converter" | "both" | "all";
    status?: "active" | "revoked";
    dailyLimit?: number | null;
    expiresAt?: string | null;
  },
): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireAdmin();
  await updateServiceToken(id, patch);
  await audit(admin.id, "services.token_updated", `Service token updated (${patch.status ?? "edited"})`, id);
  revalidateServices();
  return { ok: true };
}

export async function deleteServiceTokenAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireAdmin();
  await deleteServiceToken(id);
  await audit(admin.id, "services.token_deleted", "Service token deleted", id);
  revalidateServices();
  return { ok: true };
}

export async function listServiceTokensAction() {
  await requireAdmin();
  return listServiceTokens();
}

/** Admin "reveal" — returns the full plaintext token for copying. */
export async function revealServiceTokenAction(id: string): Promise<string | null> {
  await requireAdmin();
  const { data } = await getAdminSupabase()
    .from("service_tokens")
    .select("token")
    .eq("id", id)
    .maybeSingle();
  return (data?.token as string) ?? null;
}

/* ── access ──────────────────────────────────────────────────────────────── */

export async function upsertServiceAccessAction(input: {
  userEmail: string;
  service: "downloader" | "text_to_audio" | "video_generator" | "screenshot_organizer" | "converter" | "both" | "all";
  mode: "plan" | "allow" | "block";
  dailyLimit?: number | null;
  maxQuality?: string | null;
  note?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireAdmin();
  const email = input.userEmail.trim().toLowerCase();
  if (!/^[^@\s]+(,[^@\s]+)*$/.test(email.replace(/\s/g, "").replace(/,/g, ","))) {
    return { ok: false, error: "Enter one or more valid emails separated by commas." };
  }
  if (input.mode === "allow" && (input.dailyLimit == null || input.dailyLimit < 1)) {
    return { ok: false, error: "Explicit grants need a daily limit (1 or more)." };
  }
  await upsertServiceAccess(
    { ...input, userEmail: email },
    admin.id,
  );
  await audit(admin.id, "services.access_updated", `Access for ${email} set to ${input.mode}`, email);
  revalidateServices();
  return { ok: true };
}

export async function deleteServiceAccessAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireAdmin();
  await deleteServiceAccess(id);
  await audit(admin.id, "services.access_deleted", "Access rule removed", id);
  revalidateServices();
  return { ok: true };
}

/* ── service cards (enable/disable the public cards) ─────────────────────── */

export async function setServiceToolLiveAction(
  id: string,
  href: string,
  live: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireAdmin();
  await updateServiceCard(id, {
    status: live ? "live" : "coming_soon",
    href: live ? href : null,
  });
  await audit(
    admin.id,
    live ? "services.tool_live" : "services.tool_disabled",
    `${href} set ${live ? "live" : "to coming soon"}`,
    id,
  );
  revalidateServices();
  revalidatePath("/services");
  return { ok: true };
}
