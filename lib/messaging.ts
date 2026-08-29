import { randomBytes, timingSafeEqual, createHmac } from "crypto";
import { getAdminSupabase } from "@/lib/supabase";
import { encrypt, decrypt } from "@/lib/auth";
import { getPlatformSetting } from "@/lib/platform-settings";

export type MessagingProviderId = "messenger" | "whatsapp" | "instagram";

export interface MessagingProviderDef {
  id: MessagingProviderId;
  name: string;
  blurb: string;
  /** Meta webhook `object` value that routes to this provider */
  webhookObject: string;
  idLabel: string;
  fields: { key: string; label: string; type: "text" | "password"; help?: string; optional?: boolean }[];
}

export const MESSAGING_PROVIDERS: Record<MessagingProviderId, MessagingProviderDef> = {
  messenger: {
    id: "messenger",
    name: "Facebook Messenger",
    blurb: "Receive messages people send to your Facebook Page.",
    webhookObject: "page",
    idLabel: "Facebook Page ID",
    fields: [
      { key: "page_id", label: "Page ID", type: "text" },
      { key: "page_access_token", label: "Page access token", type: "password" },
      { key: "app_secret", label: "App secret (optional, verifies webhooks)", type: "password", optional: true },
    ],
  },
  whatsapp: {
    id: "whatsapp",
    name: "WhatsApp Business",
    blurb: "Receive messages sent to your WhatsApp Business number.",
    webhookObject: "whatsapp_business_account",
    idLabel: "WhatsApp phone-number ID",
    fields: [
      { key: "phone_number_id", label: "Phone number ID", type: "text" },
      { key: "access_token", label: "Access token", type: "password" },
      { key: "app_secret", label: "App secret (optional, verifies webhooks)", type: "password", optional: true },
    ],
  },
  instagram: {
    id: "instagram",
    name: "Instagram DMs",
    blurb: "Receive Instagram direct messages for a connected professional account.",
    webhookObject: "instagram",
    idLabel: "Instagram account ID",
    fields: [
      { key: "ig_account_id", label: "Instagram account ID", type: "text" },
      { key: "page_access_token", label: "Page access token", type: "password" },
      { key: "app_secret", label: "App secret (optional, verifies webhooks)", type: "password", optional: true },
    ],
  },
};

export function messagingProvider(id: string): MessagingProviderDef | null {
  return MESSAGING_PROVIDERS[id as MessagingProviderId] ?? null;
}

export interface StoredChannel {
  id: string;
  provider: MessagingProviderId;
  externalId: string | null;
  displayName: string | null;
  verifyToken: string;
  status: string;
  lastEventAt: string | null;
  lastError: string | null;
}

export async function listChannels(businessId: string): Promise<StoredChannel[]> {
  const db = getAdminSupabase();
  const { data } = await db
    .from("messaging_channels")
    .select("id, provider, external_id, display_name, verify_token, status, last_event_at, last_error")
    .eq("business_id", businessId);
  return (data ?? []).map((d) => ({
    id: d.id as string,
    provider: d.provider as MessagingProviderId,
    externalId: (d.external_id as string) ?? null,
    displayName: (d.display_name as string) ?? null,
    verifyToken: d.verify_token as string,
    status: d.status as string,
    lastEventAt: (d.last_event_at as string) ?? null,
    lastError: (d.last_error as string) ?? null,
  }));
}

export async function loadChannelCreds(
  businessId: string,
  provider: string,
): Promise<Record<string, string>> {
  const db = getAdminSupabase();
  const { data } = await db
    .from("messaging_channels")
    .select("credentials_encrypted")
    .eq("business_id", businessId)
    .eq("provider", provider)
    .maybeSingle();
  if (!data?.credentials_encrypted) return {};
  try {
    return JSON.parse(decrypt(data.credentials_encrypted as string) || "{}");
  } catch {
    return {};
  }
}

export async function saveChannel(args: {
  businessId: string;
  provider: MessagingProviderId;
  externalId: string;
  displayName?: string | null;
  creds: Record<string, string>;
}): Promise<StoredChannel> {
  const db = getAdminSupabase();
  const { data: existing } = await db
    .from("messaging_channels")
    .select("id, verify_token")
    .eq("business_id", args.businessId)
    .eq("provider", args.provider)
    .maybeSingle();

  const verify_token = (existing?.verify_token as string) || `zt_${randomBytes(18).toString("hex")}`;

  const { data } = await db
    .from("messaging_channels")
    .upsert(
      {
        business_id: args.businessId,
        provider: args.provider,
        external_id: args.externalId || null,
        display_name: args.displayName ?? null,
        verify_token,
        credentials_encrypted: encrypt(JSON.stringify(args.creds)),
        status: "connected",
        last_error: null,
      },
      { onConflict: "business_id,provider" },
    )
    .select("id, provider, external_id, display_name, verify_token, status, last_event_at, last_error")
    .single();

  return {
    id: data!.id as string,
    provider: data!.provider as MessagingProviderId,
    externalId: (data!.external_id as string) ?? null,
    displayName: (data!.display_name as string) ?? null,
    verifyToken: data!.verify_token as string,
    status: data!.status as string,
    lastEventAt: (data!.last_event_at as string) ?? null,
    lastError: (data!.last_error as string) ?? null,
  };
}

export async function removeChannel(businessId: string, provider: string) {
  const db = getAdminSupabase();
  await db.from("messaging_channels").delete().eq("business_id", businessId).eq("provider", provider);
}

/** Webhook GET handshake: find a channel whose verify token matches. */
export async function findChannelByVerifyToken(token: string) {
  const db = getAdminSupabase();
  const { data } = await db
    .from("messaging_channels")
    .select("id, business_id, provider")
    .eq("verify_token", token)
    .maybeSingle();
  return data ?? null;
}

/** Verify the X-Hub-Signature-256 header against the channel's (or platform) app secret. */
export async function verifyMetaSignature(
  businessId: string,
  provider: string,
  rawBody: string,
  header: string | null,
): Promise<boolean> {
  if (!header) return false;
  const creds = await loadChannelCreds(businessId, provider);
  const secret = creds.app_secret || (await getPlatformSetting("meta_app_secret")) || "";
  if (!secret) return true; // nothing to verify against — accept (logged upstream)
  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(header);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

interface ParsedInbound {
  externalMessageId: string | null;
  threadKey: string | null;
  senderName: string | null;
  body: string | null;
  attachments: unknown[];
}

/** Extract inbound messages from a Meta webhook payload for a given provider. */
export function parseInbound(provider: string, payload: unknown): ParsedInbound[] {
  const out: ParsedInbound[] = [];
  const body = payload as { entry?: unknown[] };
  const entries = Array.isArray(body?.entry) ? body.entry : [];

  for (const entryRaw of entries) {
    const entry = entryRaw as Record<string, unknown>;

    if (provider === "messenger" || provider === "instagram") {
      const messaging = Array.isArray(entry.messaging) ? (entry.messaging as Record<string, unknown>[]) : [];
      for (const m of messaging) {
        const msg = m.message as { mid?: string; text?: string; attachments?: unknown[] } | undefined;
        if (!msg) continue;
        const sender = (m.sender as { id?: string })?.id ?? null;
        out.push({
          externalMessageId: msg.mid ?? null,
          threadKey: sender,
          senderName: null,
          body: msg.text ?? null,
          attachments: Array.isArray(msg.attachments) ? msg.attachments : [],
        });
      }
    }

    if (provider === "whatsapp") {
      const changes = Array.isArray(entry.changes) ? (entry.changes as Record<string, unknown>[]) : [];
      for (const ch of changes) {
        const value = ch.value as
          | { messages?: Record<string, unknown>[]; contacts?: { profile?: { name?: string } }[] }
          | undefined;
        const messages = Array.isArray(value?.messages) ? value!.messages : [];
        const contactName = value?.contacts?.[0]?.profile?.name ?? null;
        for (const msg of messages) {
          const text = (msg.text as { body?: string })?.body ?? null;
          out.push({
            externalMessageId: (msg.id as string) ?? null,
            threadKey: (msg.from as string) ?? null,
            senderName: contactName,
            body: text,
            attachments: [],
          });
        }
      }
    }
  }
  return out;
}

export async function recordInbound(
  businessId: string,
  channelId: string | null,
  provider: string,
  msgs: ParsedInbound[],
  raw: unknown,
) {
  if (msgs.length === 0) return;
  const db = getAdminSupabase();
  await db.from("messaging_messages").insert(
    msgs.map((m) => ({
      business_id: businessId,
      channel_id: channelId,
      provider,
      direction: "in",
      external_message_id: m.externalMessageId,
      thread_key: m.threadKey,
      sender_name: m.senderName,
      body: m.body,
      attachments: m.attachments,
      raw,
    })),
  );

  await db
    .from("messaging_channels")
    .update({ last_event_at: new Date().toISOString(), status: "connected", last_error: null })
    .eq("business_id", businessId)
    .eq("provider", provider);

  // one dashboard notification per burst
  const { data: owner } = await db
    .from("business_members")
    .select("user_id")
    .eq("business_id", businessId)
    .eq("role", "owner")
    .maybeSingle();
  const preview = msgs.find((m) => m.body)?.body ?? "New message";
  await db.from("notifications").insert({
    business_id: businessId,
    user_id: owner?.user_id ?? null,
    type: "message",
    title: `New ${provider} message`,
    body: preview.slice(0, 140),
    href: "/app/messages",
  });
}
