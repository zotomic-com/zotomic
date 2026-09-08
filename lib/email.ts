import nodemailer, { type Transporter } from "nodemailer";

/**
 * Email adapter — Gmail / Google Workspace SMTP via App Passwords.
 *
 * Four sending identities, each authenticating as itself:
 *   invoice  invoice@zotomic.com  — customer order invoices & confirmations
 *   admin    admin@zotomic.com    — Zotomic-issued invoices + internal alerts
 *   support  support@zotomic.com  — store-owner account mail (resets, billing, reports)
 *   info     info@zotomic.com     — general / post-purchase (review invites, newsletter)
 *
 * Each account reads MAIL_<ACCOUNT>_USER / MAIL_<ACCOUNT>_PASS. If an account is
 * not configured it falls back to the legacy GMAIL_USER / GMAIL_APP_PASSWORD
 * single account. If nothing is configured, sends are logged and skipped (never
 * throws), so the app works without mail.
 */

export type MailAccount = "invoice" | "admin" | "support" | "info";

interface AccountCfg {
  user?: string;
  pass?: string;
  from: string;
}

function accountCfg(a: MailAccount): AccountCfg {
  const e = process.env;
  switch (a) {
    case "invoice":
      return { user: e.MAIL_INVOICE_USER, pass: e.MAIL_INVOICE_PASS, from: `"Zotomic Invoices" <${e.MAIL_INVOICE_USER || "invoice@zotomic.com"}>` };
    case "admin":
      return { user: e.MAIL_ADMIN_USER, pass: e.MAIL_ADMIN_PASS, from: `"Zotomic" <${e.MAIL_ADMIN_USER || "admin@zotomic.com"}>` };
    case "support":
      return { user: e.MAIL_SUPPORT_USER, pass: e.MAIL_SUPPORT_PASS, from: `"Zotomic Support" <${e.MAIL_SUPPORT_USER || "support@zotomic.com"}>` };
    case "info":
      return { user: e.MAIL_INFO_USER, pass: e.MAIL_INFO_PASS, from: `"Zotomic" <${e.MAIL_INFO_USER || "info@zotomic.com"}>` };
  }
}

function legacyCfg(): AccountCfg {
  return {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
    from: process.env.EMAIL_FROM ?? process.env.GMAIL_USER ?? "",
  };
}

const transports = new Map<string, Transporter>();

function transportFor(account?: MailAccount): { t: Transporter | null; from: string } {
  const want = account ? accountCfg(account) : null;
  if (want?.user && want.pass) {
    if (!transports.has(want.user)) {
      transports.set(want.user, nodemailer.createTransport({ service: "gmail", auth: { user: want.user, pass: want.pass } }));
    }
    return { t: transports.get(want.user) ?? null, from: want.from };
  }
  const leg = legacyCfg();
  if (leg.user && leg.pass) {
    if (!transports.has(leg.user)) {
      transports.set(leg.user, nodemailer.createTransport({ service: "gmail", auth: { user: leg.user, pass: leg.pass } }));
    }
    // legacy transport can't send *as* another address — use the legacy From
    return { t: transports.get(leg.user) ?? null, from: leg.from };
  }
  return { t: null, from: want?.from ?? leg.from };
}

export function emailConfigured(account?: MailAccount): boolean {
  if (account) {
    const c = accountCfg(account);
    if (c.user && c.pass) return true;
  }
  return !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
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

export async function sendEmail({ to, subject, html, text, replyTo, from, account, attachments }: SendArgs): Promise<boolean> {
  const { t, from: accountFrom } = transportFor(account);
  if (!t) {
    console.info(`[email skipped — not configured] account=${account ?? "default"} to=${to} subject="${subject}"`);
    return false;
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
    return true;
  } catch (e) {
    console.error("email send failed:", (e as Error).message);
    return false;
  }
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
