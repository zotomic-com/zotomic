// Brevo (Sendinblue) Email Integration

const BREVO_API = "https://api.brevo.com/v3";

interface EmailOptions {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  fromName?: string;
}

export async function sendBrevoEmail(apiKey: string, opts: EmailOptions): Promise<boolean> {
  if (!apiKey) return false;

  const payload = {
    sender: {
      email: opts.from ?? "hello@zotomic.com",
      name: opts.fromName ?? "Zotomic",
    },
    to: [{ email: opts.to, name: opts.toName ?? opts.to }],
    subject: opts.subject,
    htmlContent: opts.html,
    ...(opts.text ? { textContent: opts.text } : {}),
  };

  try {
    const res = await fetch(`${BREVO_API}/smtp/email`, {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
        "accept": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const err = await res.json();
      console.error("Brevo error:", err);
      return false;
    }
    return true;
  } catch (e) {
    console.error("Brevo send error:", e);
    return false;
  }
}

// Email Templates
export function welcomeEmail(name: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#060b18;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px">
    <div style="text-align:center;margin-bottom:32px">
      <span style="font-size:32px;font-weight:900;background:linear-gradient(90deg,#3b82f6,#7c3aed);-webkit-background-clip:text;-webkit-text-fill-color:transparent">Zotomic</span>
    </div>
    <div style="background:#0d1526;border:1px solid rgba(255,255,255,0.08);border-radius:20px;padding:32px">
      <h1 style="color:#fff;font-size:24px;margin:0 0 8px">Welcome, ${name}! 🎉</h1>
      <p style="color:#94a3b8;font-size:15px;line-height:1.6">Your Zotomic account is ready. Start automating your business with AI-powered tools.</p>
      <div style="margin:24px 0">
        <a href="https://zotomic.com/dashboard" style="display:inline-block;background:linear-gradient(90deg,#3b82f6,#7c3aed);color:#fff;text-decoration:none;padding:12px 28px;border-radius:12px;font-weight:700;font-size:14px">
          Go to Dashboard →
        </a>
      </div>
      <p style="color:#64748b;font-size:13px">Start with the free plan: Facebook Messenger automation with 50 AI replies/day, no credit card needed.</p>
    </div>
    <p style="text-align:center;color:#334155;font-size:12px;margin-top:24px">
      © 2025 Zotomic · <a href="https://zotomic.com/privacy-policy" style="color:#475569">Privacy</a> · <a href="https://zotomic.com/data-deletion" style="color:#475569">Unsubscribe</a>
    </p>
  </div>
</body>
</html>`;
}

export function leadNotificationEmail(lead: { name: string; email: string; phone?: string; plan?: string; message?: string }): string {
  return `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:20px;background:#060b18;font-family:sans-serif">
  <div style="max-width:500px;margin:0 auto;background:#0d1526;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:24px">
    <h2 style="color:#fff;margin:0 0 16px">🔥 New Lead: ${lead.name}</h2>
    <table style="width:100%;color:#94a3b8;font-size:14px">
      <tr><td style="padding:4px 0;color:#64748b">Email:</td><td>${lead.email}</td></tr>
      <tr><td style="padding:4px 0;color:#64748b">Phone:</td><td>${lead.phone ?? "N/A"}</td></tr>
      <tr><td style="padding:4px 0;color:#64748b">Plan:</td><td>${lead.plan ?? "Not specified"}</td></tr>
      ${lead.message ? `<tr><td style="padding:4px 0;color:#64748b">Message:</td><td>${lead.message}</td></tr>` : ""}
    </table>
    <a href="https://zotomic.com/admin/leads" style="display:inline-block;margin-top:16px;background:linear-gradient(90deg,#3b82f6,#7c3aed);color:#fff;text-decoration:none;padding:10px 20px;border-radius:10px;font-size:13px;font-weight:700">
      View in Admin →
    </a>
  </div>
</body>
</html>`;
}

export function planUpgradeEmail(name: string, plan: string): string {
  const emoji = plan === "starter" ? "🚀" : plan === "growth" ? "📈" : "🏆";
  return `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:20px;background:#060b18;font-family:sans-serif">
  <div style="max-width:500px;margin:0 auto;background:#0d1526;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:32px;text-align:center">
    <div style="font-size:48px;margin-bottom:16px">${emoji}</div>
    <h1 style="color:#fff;font-size:22px;margin:0 0 8px">You're on ${plan.charAt(0).toUpperCase() + plan.slice(1)}!</h1>
    <p style="color:#94a3b8;font-size:14px;margin:0 0 24px">Your plan has been activated. All features are now unlocked.</p>
    <a href="https://zotomic.com/dashboard" style="display:inline-block;background:linear-gradient(90deg,#3b82f6,#7c3aed);color:#fff;text-decoration:none;padding:12px 28px;border-radius:12px;font-weight:700;font-size:14px">
      Open Dashboard →
    </a>
  </div>
</body>
</html>`;
}
