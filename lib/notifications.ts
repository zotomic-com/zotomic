// Notification service — Email via Resend, WhatsApp via WhatsApp Business API

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

interface WhatsAppPayload {
  to: string; // phone with country code e.g. 8801712345678
  message: string;
}

// ── EMAIL via Resend ──────────────────────────────────────────────────────────
export async function sendEmail(payload: EmailPayload): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("RESEND_API_KEY not set — email skipped");
    return false;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: payload.from ?? `Zotomic <noreply@${process.env.EMAIL_DOMAIN ?? "zotomic.com"}>`,
        to: [payload.to],
        subject: payload.subject,
        html: payload.html,
      }),
    });
    return res.ok;
  } catch (e) {
    console.error("Email send failed:", e);
    return false;
  }
}

// ── WHATSAPP via WhatsApp Business Cloud API ──────────────────────────────────
export async function sendWhatsApp(payload: WhatsAppPayload): Promise<boolean> {
  const token = process.env.WHATSAPP_API_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  if (!token || !phoneId) {
    console.warn("WhatsApp credentials not set — WA message skipped");
    return false;
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${phoneId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: payload.to,
          type: "text",
          text: { body: payload.message },
        }),
      }
    );
    return res.ok;
  } catch (e) {
    console.error("WhatsApp send failed:", e);
    return false;
  }
}

// ── EMAIL TEMPLATES ───────────────────────────────────────────────────────────
export function leadNotificationEmail(data: {
  name: string;
  email: string;
  phone?: string;
  plan: string;
  business?: string;
  message: string;
}): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Inter,sans-serif;background:#0f172a;color:#f1f5f9;margin:0;padding:24px;">
  <div style="max-width:560px;margin:0 auto;">
    <div style="background:linear-gradient(135deg,#3b82f6,#7c3aed);padding:2px;border-radius:16px;">
      <div style="background:#1e293b;border-radius:14px;padding:32px;">
        <h1 style="margin:0 0 4px;font-size:22px;font-weight:800;">🔔 New Lead!</h1>
        <p style="margin:0 0 24px;color:#94a3b8;font-size:14px;">Someone just filled the contact form on Zotomic</p>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:8px 0;color:#94a3b8;font-size:13px;width:120px;">Name</td><td style="padding:8px 0;font-weight:600;">${data.name}</td></tr>
          <tr><td style="padding:8px 0;color:#94a3b8;font-size:13px;">Email</td><td style="padding:8px 0;"><a href="mailto:${data.email}" style="color:#3b82f6;">${data.email}</a></td></tr>
          <tr><td style="padding:8px 0;color:#94a3b8;font-size:13px;">Phone</td><td style="padding:8px 0;">${data.phone ?? "—"}</td></tr>
          <tr><td style="padding:8px 0;color:#94a3b8;font-size:13px;">Plan</td><td style="padding:8px 0;"><span style="background:#3b82f620;color:#3b82f6;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:700;">${data.plan}</span></td></tr>
          <tr><td style="padding:8px 0;color:#94a3b8;font-size:13px;">Business</td><td style="padding:8px 0;">${data.business ?? "—"}</td></tr>
        </table>
        <div style="margin-top:20px;background:#0f172a;border-radius:10px;padding:16px;">
          <p style="margin:0 0 8px;color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Message</p>
          <p style="margin:0;line-height:1.6;">${data.message}</p>
        </div>
        <a href="${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://zotomic.com'}/admin" style="display:inline-block;margin-top:24px;background:linear-gradient(135deg,#3b82f6,#7c3aed);color:white;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:700;font-size:14px;">View in Admin →</a>
      </div>
    </div>
    <p style="text-align:center;margin-top:16px;color:#475569;font-size:12px;">Zotomic Admin Notification</p>
  </div>
</body>
</html>`;
}

export function leadConfirmationEmail(name: string, plan: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Inter,sans-serif;background:#f8fafc;margin:0;padding:24px;">
  <div style="max-width:560px;margin:0 auto;">
    <div style="background:linear-gradient(135deg,#3b82f6,#7c3aed);padding:2px;border-radius:16px;">
      <div style="background:white;border-radius:14px;padding:40px;text-align:center;">
        <div style="font-size:48px;margin-bottom:16px;">🎉</div>
        <h1 style="margin:0 0 8px;font-size:24px;font-weight:800;background:linear-gradient(135deg,#3b82f6,#7c3aed);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">We got your message!</h1>
        <p style="margin:0 0 24px;color:#64748b;line-height:1.6;">Hi ${name}, thank you for reaching out about our <strong>${plan}</strong> plan. We'll get back to you within <strong>24 hours</strong>.</p>
        <div style="background:#f8fafc;border-radius:10px;padding:20px;margin-bottom:24px;text-align:left;">
          <p style="margin:0 0 8px;font-weight:700;font-size:14px;">What happens next?</p>
          <p style="margin:0 0 6px;color:#64748b;font-size:13px;">✓ Our team reviews your requirements</p>
          <p style="margin:0 0 6px;color:#64748b;font-size:13px;">✓ We'll send you a WhatsApp/email within 24 hours</p>
          <p style="margin:0;color:#64748b;font-size:13px;">✓ We'll discuss your project and send a proposal</p>
        </div>
        <a href="https://wa.me/${process.env.WHATSAPP_NUMBER ?? '880100000000'}" style="display:inline-block;background:#25D366;color:white;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:700;font-size:14px;">💬 Chat on WhatsApp</a>
      </div>
    </div>
  </div>
</body>
</html>`;
}

export function affiliateWelcomeEmail(name: string, code: string, siteUrl: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Inter,sans-serif;background:#f8fafc;margin:0;padding:24px;">
  <div style="max-width:560px;margin:0 auto;">
    <div style="background:linear-gradient(135deg,#3b82f6,#7c3aed);padding:2px;border-radius:16px;">
      <div style="background:white;border-radius:14px;padding:40px;text-align:center;">
        <div style="font-size:48px;margin-bottom:16px;">🤝</div>
        <h1 style="margin:0 0 8px;font-size:24px;font-weight:800;">Welcome to Zotomic Affiliates!</h1>
        <p style="margin:0 0 24px;color:#64748b;">Hi ${name}, your affiliate application is under review. Once approved, you can start earning.</p>
        <div style="background:linear-gradient(135deg,#3b82f620,#7c3aed20);border:1px solid #7c3aed40;border-radius:12px;padding:20px;margin-bottom:24px;">
          <p style="margin:0 0 4px;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Your Referral Code</p>
          <p style="margin:0;font-size:28px;font-weight:900;letter-spacing:0.1em;background:linear-gradient(135deg,#3b82f6,#7c3aed);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">${code}</p>
          <p style="margin:8px 0 0;font-size:12px;color:#64748b;">Your link: ${siteUrl}?ref=${code}</p>
        </div>
        <a href="${siteUrl}/affiliate/dashboard" style="display:inline-block;background:linear-gradient(135deg,#3b82f6,#7c3aed);color:white;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:700;font-size:14px;">View Dashboard →</a>
      </div>
    </div>
  </div>
</body>
</html>`;
}
