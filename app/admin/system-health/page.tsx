import { CheckCircle2, XCircle } from "lucide-react";
import { requireAdmin } from "@/lib/admin-server";
import { getAdminSupabase } from "@/lib/supabase";
import { geminiConfigured } from "@/lib/ai/gemini";
import { cloudinaryConfigured } from "@/lib/cloudinary";
import { emailConfigured } from "@/lib/email";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

async function check(name: string, fn: () => Promise<boolean>) {
  const start = Date.now();
  let ok = false;
  try {
    ok = await fn();
  } catch {
    ok = false;
  }
  return { name, ok, ms: Date.now() - start };
}

export default async function AdminSystemHealthPage() {
  await requireAdmin();

  const results = await Promise.all([
    check("Database (Supabase)", async () => {
      const db = getAdminSupabase();
      const { error } = await db.from("businesses").select("id", { head: true, count: "exact" });
      return !error;
    }),
    check("AI narrative (Gemini)", async () => {
      if (!geminiConfigured()) return false;
      const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?key=" + process.env.GEMINI_API_KEY, {
        signal: AbortSignal.timeout(8000),
      });
      return r.ok;
    }),
    check("Media (Cloudinary)", async () => {
      if (!cloudinaryConfigured()) return false;
      const r = await fetch(`https://res.cloudinary.com/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload/sample`, {
        method: "HEAD",
        signal: AbortSignal.timeout(8000),
      });
      return r.status < 500;
    }),
    check("Email (Gmail SMTP)", async () => emailConfigured()),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-fg">System Health</h1>
        <p className="mt-1 text-sm text-fg-muted">Live checks of platform dependencies.</p>
      </div>
      <Card className="divide-y divide-border">
        {results.map((r) => (
          <div key={r.name} className="flex items-center justify-between px-5 py-3.5">
            <div className="flex items-center gap-2.5">
              {r.ok ? (
                <CheckCircle2 className="h-4 w-4 text-success" />
              ) : (
                <XCircle className="h-4 w-4 text-danger" />
              )}
              <span className="text-sm font-medium text-fg">{r.name}</span>
            </div>
            <span className="text-xs text-fg-subtle">
              {r.ok ? `${r.ms} ms` : "not configured / unreachable"}
            </span>
          </div>
        ))}
      </Card>
    </div>
  );
}
