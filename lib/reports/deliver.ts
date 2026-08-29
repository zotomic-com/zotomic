import { getAdminSupabase } from "@/lib/supabase";
import { sendEmail, emailLayout } from "@/lib/email";
import { sendTelegram } from "@/lib/telegram";

const ASSISTANT_FROM = process.env.EMAIL_ASSISTANT_FROM ?? "Zotomic Assistant <Assistant@zotomic.com>";

interface ReportRow {
  id: string;
  period_start: string;
  period_end: string;
  summary: string | null;
  status: string;
}

async function latestReport(businessId: string): Promise<ReportRow | null> {
  const db = getAdminSupabase();
  const { data } = await db
    .from("reports")
    .select("id, period_start, period_end, summary, status")
    .eq("business_id", businessId)
    .order("period_end", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as ReportRow) ?? null;
}

async function insights(reportId: string): Promise<string[]> {
  const db = getAdminSupabase();
  const { data } = await db
    .from("insights")
    .select("severity, title, body")
    .eq("report_id", reportId)
    .order("severity", { ascending: false })
    .limit(6);
  return (data ?? []).map((i) => `• ${i.title}${i.body ? ` — ${i.body}` : ""}`);
}

async function record(businessId: string, reportId: string | null, channel: "telegram" | "email", target: string, ok: boolean, error?: string) {
  const db = getAdminSupabase();
  await db.from("report_deliveries").insert({ business_id: businessId, report_id: reportId, channel, target, ok, error: error ?? null });
}

export async function deliverReportTelegram(businessId: string): Promise<{ ok: boolean; message: string }> {
  const db = getAdminSupabase();
  const report = await latestReport(businessId);
  if (!report || report.status !== "ready" || !report.summary) {
    return { ok: false, message: "There's no finished report to send yet." };
  }
  const { data: biz } = await db.from("businesses").select("name, telegram_chat_id").eq("id", businessId).single();
  const chatId = biz?.telegram_chat_id as string | undefined;
  if (!chatId) return { ok: false, message: "No Telegram chat ID is set. Add one in Settings → Notifications." };

  const lines = await insights(report.id);
  const text = [
    `<b>${biz?.name} — Weekly Report</b>`,
    `${report.period_start} to ${report.period_end}`,
    "",
    report.summary,
    lines.length ? "\n" + lines.join("\n") : "",
  ]
    .filter(Boolean)
    .join("\n");

  const res = await sendTelegram(chatId, text);
  await record(businessId, report.id, "telegram", chatId, res.ok, res.error);
  return res.ok
    ? { ok: true, message: "Sent the latest report to your Telegram." }
    : { ok: false, message: res.error ?? "Telegram delivery failed." };
}

export async function deliverReportEmail(businessId: string, toOverride?: string): Promise<{ ok: boolean; message: string }> {
  const db = getAdminSupabase();
  const report = await latestReport(businessId);
  if (!report || report.status !== "ready" || !report.summary) {
    return { ok: false, message: "There's no finished report to send yet." };
  }
  const { data: biz } = await db.from("businesses").select("name").eq("id", businessId).single();
  let to = toOverride?.trim();
  if (!to) {
    const { data: owner } = await db
      .from("business_members")
      .select("users(email)")
      .eq("business_id", businessId)
      .eq("role", "owner")
      .maybeSingle();
    to = ((Array.isArray(owner?.users) ? owner?.users[0] : owner?.users) as { email?: string } | null)?.email ?? "";
  }
  if (!to) return { ok: false, message: "No email address to send to." };

  const lines = await insights(report.id);
  const ok = await sendEmail({
    to,
    from: ASSISTANT_FROM,
    subject: `${biz?.name} — Weekly Report (${report.period_start} to ${report.period_end})`,
    html: emailLayout(`
      <h1 style="font-size:18px;margin:0 0 4px">Weekly Report</h1>
      <p style="color:#94a3b8;font-size:13px;margin:0 0 12px">${report.period_start} to ${report.period_end}</p>
      <p style="color:#475569;line-height:1.6;margin:0 0 16px">${report.summary}</p>
      ${lines.length ? `<ul style="color:#475569;font-size:14px;padding-left:18px">${lines.map((l) => `<li>${l.replace(/^• /, "")}</li>`).join("")}</ul>` : ""}
      <a href="${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/app/intelligence" style="display:inline-block;margin-top:12px;background:#15803d;color:#fff;text-decoration:none;padding:10px 20px;border-radius:10px;font-weight:600;font-size:14px">Open in Zotomic →</a>
    `),
  });
  await record(businessId, report.id, "email", to, ok);
  return ok
    ? { ok: true, message: `Emailed the report to ${to}.` }
    : { ok: false, message: "Email delivery failed (is Gmail configured?)." };
}
