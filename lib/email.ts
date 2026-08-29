import nodemailer, { type Transporter } from "nodemailer";

/**
 * Email adapter — Gmail SMTP via an App Password. If GMAIL_APP_PASSWORD is not
 * set, sends are logged and skipped (never throws), so the app works without
 * mail configured.
 */

let transporter: Transporter | null | undefined;

function getTransport(): Transporter | null {
  if (transporter !== undefined) return transporter;
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    transporter = null;
    return null;
  }
  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
  return transporter;
}

export function emailConfigured(): boolean {
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
  /** override the From (must be the Gmail account or a verified "send mail as" alias) */
  from?: string;
  attachments?: EmailAttachment[];
}

export async function sendEmail({ to, subject, html, text, replyTo, from, attachments }: SendArgs): Promise<boolean> {
  const t = getTransport();
  if (!t) {
    console.info(`[email skipped — no GMAIL_APP_PASSWORD] to=${to} subject="${subject}"`);
    return false;
  }
  try {
    await t.sendMail({
      from: from ?? process.env.EMAIL_FROM ?? process.env.GMAIL_USER,
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

export const NOTIFICATION_EMAIL = process.env.NOTIFICATION_EMAIL ?? process.env.GMAIL_USER ?? "";

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
