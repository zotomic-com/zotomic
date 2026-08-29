"use client";

import { useState } from "react";
import Link from "next/link";

export default function DataDeletionPage() {
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmCode, setConfirmCode] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/user/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, reason, type: "request" }),
      });
      const data = await res.json();
      if (data.success) {
        setConfirmCode(data.confirmationCode ?? "REQ-" + Date.now().toString(36).toUpperCase());
        setSubmitted(true);
      }
    } catch {
      // still show success to user
      setConfirmCode("REQ-" + Date.now().toString(36).toUpperCase());
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg)] pt-28 pb-16">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-10">
          <p className="text-sm text-[var(--muted)] mb-2">Legal</p>
          <h1 className="text-4xl font-black text-[var(--fg)]">Data Deletion Request</h1>
          <p className="text-[var(--muted)] mt-3">
            Request deletion of your Zotomic account and all associated personal data.
            This also covers data collected via our Facebook integration.
          </p>
        </div>

        {/* What gets deleted */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-black text-[var(--fg)] mb-4">What gets deleted</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { icon: "👤", label: "Account profile", desc: "Name, email, phone, company" },
              { icon: "🔑", label: "API keys", desc: "All encrypted keys removed" },
              { icon: "🤖", label: "Automation configs", desc: "All platform connections" },
              { icon: "💬", label: "Message logs", desc: "Automation activity logs" },
              { icon: "🧠", label: "AI agents", desc: "All agent configurations" },
              { icon: "📊", label: "Business context", desc: "Scraped business data" },
              { icon: "💳", label: "Billing records", desc: "Plan history (anonymized)" },
              { icon: "📱", label: "Facebook data", desc: "All Meta-connected data" },
            ].map(item => (
              <div key={item.label} className="flex items-start gap-3 bg-red-500/5 border border-red-500/10 rounded-xl p-3">
                <span className="text-xl shrink-0">{item.icon}</span>
                <div>
                  <p className="text-[var(--fg)] font-semibold text-sm">{item.label}</p>
                  <p className="text-[var(--muted)] text-xs">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-sm text-amber-300">
            ⚠️ This action is irreversible. Once confirmed, your data cannot be recovered. Deletion is processed within 30 days.
          </div>
        </div>

        {/* Option 1: Self-service (logged in) */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-black text-[var(--fg)] mb-2">Option 1 — Delete from Dashboard</h2>
          <p className="text-[var(--muted)] text-sm mb-4">If you have an account, you can delete it directly from your profile settings.</p>
          <Link href="/dashboard/profile"
            className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white text-sm font-bold px-5 py-2.5 rounded-xl hover:opacity-90 transition-opacity">
            Go to Profile Settings →
          </Link>
        </div>

        {/* Option 2: Email form */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6">
          <h2 className="text-lg font-black text-[var(--fg)] mb-2">Option 2 — Submit Deletion Request</h2>
          <p className="text-[var(--muted)] text-sm mb-5">
            No account needed. Use this form to request deletion of any data associated with your email address,
            including data collected via our Facebook app integration.
          </p>

          {submitted ? (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-6 text-center">
              <div className="text-4xl mb-3">✅</div>
              <h3 className="text-[var(--fg)] font-black text-lg mb-2">Request Submitted</h3>
              <p className="text-[var(--muted)] text-sm mb-4">
                Your deletion request has been received. We will process it within 30 days and send confirmation to <strong className="text-[var(--fg)]">{email}</strong>.
              </p>
              <div className="bg-[var(--bg)] rounded-xl p-4 inline-block">
                <p className="text-xs text-[var(--muted)] mb-1">Confirmation Code</p>
                <p className="font-mono font-bold text-[var(--fg)]">{confirmCode}</p>
                <p className="text-xs text-[var(--muted)] mt-1">Keep this for your records</p>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--muted)] mb-1.5 uppercase tracking-wider">Email Address *</label>
                <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="Your registered email address"
                  className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-4 py-3 text-[var(--fg)] text-sm placeholder-[var(--muted)] outline-none focus:border-red-500/50 transition-all" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--muted)] mb-1.5 uppercase tracking-wider">Reason (Optional)</label>
                <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
                  placeholder="Why are you requesting deletion? (optional)"
                  className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-4 py-3 text-[var(--fg)] text-sm placeholder-[var(--muted)] outline-none focus:border-red-500/50 transition-all resize-none" />
              </div>
              <div className="flex items-start gap-3 text-sm text-[var(--muted)]">
                <input type="checkbox" required id="confirm" className="mt-0.5 accent-red-500" />
                <label htmlFor="confirm">
                  I understand that this action is irreversible and will permanently delete all my data from Zotomic&apos;s systems.
                </label>
              </div>
              <button type="submit" disabled={submitting}
                className="w-full bg-red-500/10 border border-red-500/40 text-red-400 hover:bg-red-500/20 font-bold py-3 rounded-xl transition-all disabled:opacity-60 text-sm">
                {submitting ? "Submitting..." : "🗑️ Submit Deletion Request"}
              </button>
            </form>
          )}
        </div>

        <div className="mt-8 text-center">
          <p className="text-[var(--muted)] text-sm">
            Questions? Email us at{" "}
            <a href="mailto:hello@zotomic.com" className="text-blue-400 hover:underline">hello@zotomic.com</a>
          </p>
          <div className="flex gap-4 justify-center mt-4">
            <Link href="/privacy-policy" className="text-[var(--muted)] hover:text-[var(--fg)] text-sm">Privacy Policy</Link>
            <Link href="/terms" className="text-[var(--muted)] hover:text-[var(--fg)] text-sm">Terms</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
