import nodemailer, { type Transporter } from "nodemailer";

/**
 * Email adapter — one Gmail account (`zotomic.com@gmail.com`) with four
 * "Send mail as" aliases. Every send authenticates as the ONE account
 * (MAIL_AUTH_USER / MAIL_AUTH_PASS, falling back to GMAIL_USER /
 * GMAIL_APP_PASSWORD) and just varies the From address:
 *   invoice  invoice@zotomic.com  — customer order invoices & confirmations
 *   admin    admin@zotomic.com    — Zotomic-issued invoices + internal alerts
 *   support  support@zotomic.com  — store-owner account mail (resets, billing, reports)
 *   info     info@zotomic.com     — general / post-purchase (review invites, newsletter)
 *
 * Each alias's From address can be overridden with MAIL_<ACCOUNT>_FROM (or the
 * legacy MAIL_<ACCOUNT>_USER). If auth isn't configured, sends are logged and
 * skipped (never throws), so the app works without mail.
 */

export type MailAccount = "invoice" | "admin" | "support" | "info";

const ALIAS: Record<MailAccount, { addr: string; label: string }> = {
  invoice: { addr: "invoice@zotomic.com", label: "Zotomic Invoices" },
  admin: { addr: "admin@zotomic.com", label: "Zotomic" },
  support: { addr: "support@zotomic.com", label: "Zotomic Support" },
  info: { addr: "info@zotomic.com", label: "Zotomic" },
};

function fromFor(a: MailAccount): string {
  const key = a.toUpperCase();
  const addr = process.env[`MAIL_${key}_FROM`] || process.env[`MAIL_${key}_USER`] || ALIAS[a].addr;
  return `"${ALIAS[a].label}" <${addr}>`;
}

function authCreds(): { user: string; pass: string } | null {
  const user = process.env.MAIL_AUTH_USER || process.env.GMAIL_USER;
  const pass = process.env.MAIL_AUTH_PASS || process.env.GMAIL_APP_PASSWORD;
  return user && pass ? { user, pass } : null;
}

const transports = new Map<string, Transporter>();

function transportFor(account?: MailAccount): { t: Transporter | null; from: string } {
  const from = account
    ? fromFor(account)
    : process.env.EMAIL_FROM ?? process.env.MAIL_AUTH_USER ?? process.env.GMAIL_USER ?? "";
  const c = authCreds();
  if (!c) return { t: null, from };
  if (!transports.has(c.user)) {
    transports.set(c.user, nodemailer.createTransport({ service: "gmail", auth: { user: c.user, pass: c.pass } }));
  }
  return { t: transports.get(c.user) ?? null, from };
}

export function emailConfigured(_account?: MailAccount): boolean {
  return !!authCreds();
}

export interface EmailAttachment {
  filename: string;
  content: Buffer | Uint8Array;
  contentType?: string;
}

export interface SendArgs {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  /** explicit From — must be the authenticating account or a verified alias */
  from?: string;
  /** which sending identity to use; omit for the legacy default account */
  account?: MailAccount;
  attachments?: EmailAttachment[];
}

/** Detailed send — returns why it failed so callers can surface it. */
export async function sendEmailResult(
  { to, subject, html, text, replyTo, from, account, attachments }: SendArgs,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { t, from: accountFrom } = transportFor(account);
  if (!t) {
    console.info(`[email skipped — not configured] account=${account ?? "default"} to=${to}`);
    return { ok: false, error: "Mail is not configured (MAIL_AUTH_USER / MAIL_AUTH_PASS)." };
  }
  try {
    await t.sendMail({
      from: from ?? accountFrom,
      to,
      subject,
      html,
      text: text ?? html.replace(/<[^>]+>/g, " "),
      replyTo: replyTo ?? process.env.SUPPORT_EMAIL,
      attachments: attachments?.map((a) => ({
        filename: a.filename,
        content: Buffer.isBuffer(a.content) ? a.content : Buffer.from(a.content),
        contentType: a.contentType,
      })),
    });
    return { ok: true };
  } catch (e) {
    const msg = (e as Error).message || String(e);
    console.error("email send failed:", msg);
    return { ok: false, error: `SMTP: ${msg}` };
  }
}

export async function sendEmail(args: SendArgs): Promise<boolean> {
  return (await sendEmailResult(args)).ok;
}

export const NOTIFICATION_EMAIL =
  process.env.NOTIFICATION_EMAIL ?? process.env.MAIL_ADMIN_USER ?? process.env.GMAIL_USER ?? "";

/* ── shared shell ─────────────────────────────────────────────────────────── */
export function emailLayout(bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a">
  <div style="max-width:560px;margin:0 auto;padding:24px">
    <div style="font-weight:800;font-size:18px;color:#15803d;letter-spacing:-.02em">ZOTOMIC</div>
    <div style="background:#fff;border:1px solid #e8edf2;border-radius:14px;padding:24px;margin-top:12px">
      ${bodyHtml}
    </div>
    <p style="color:#94a3b8;font-size:12px;margin-top:16px">Sent by Zotomic · See. Understand. Act.</p>
  </div>
</body></html>`;
}
