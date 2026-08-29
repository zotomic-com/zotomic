import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Refund & Return Policy | Zotomic",
  description: "Zotomic's refund and return policy for all subscription plans and services.",
};

export default function RefundPolicyPage() {
  return (
    <div className="min-h-screen bg-[var(--bg)] pt-28 pb-16">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-10">
          <p className="text-sm text-[var(--muted)] mb-2">Legal</p>
          <h1 className="text-4xl font-black text-[var(--fg)]">Refund & Return Policy</h1>
          <p className="text-[var(--muted)] mt-3">Last updated: May 3, 2025</p>
        </div>

        <div className="space-y-6 text-[var(--muted)] leading-relaxed">

          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-6">
            <h2 className="text-lg font-black text-emerald-400 mb-3">📋 Summary</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { label: "Refund Window", value: "7 days from payment", icon: "📅" },
                { label: "Conditions", value: "Service not used / technical failure", icon: "✅" },
                { label: "Process", value: "Email within 7 days", icon: "📧" },
              ].map(item => (
                <div key={item.label} className="bg-white/5 rounded-xl p-4 text-center">
                  <div className="text-2xl mb-1">{item.icon}</div>
                  <p className="text-[var(--fg)] font-bold text-sm">{item.value}</p>
                  <p className="text-xs text-[var(--muted)] mt-1">{item.label}</p>
                </div>
              ))}
            </div>
          </div>

          {[
            {
              title: "1. Subscription Plans",
              content: "Zotomic offers monthly subscription plans. All fees are charged in advance on a monthly basis.",
              items: [
                "Free Plan: No charge — no refund applicable",
                "Starter Plan: ৳2,000/month",
                "Growth Plan: ৳5,000/month",
                "Business Plan: ৳12,000/month",
                "Custom Development Projects: Separate agreement applies"
              ]
            },
            {
              title: "2. Refund Eligibility",
              content: "You are eligible for a full refund within 7 days of payment if:",
              items: [
                "The service was not accessible due to a technical fault on our end",
                "The service was fundamentally different from what was described",
                "You contacted us within 7 days of the payment date",
                "The features paid for were not delivered as described"
              ],
              warning: "Refunds will NOT be issued for: change of mind after use, violation of our Terms of Service, issues caused by your own API keys or third-party platforms (Meta, Google), or partial month usage after cancellation."
            },
            {
              title: "3. Custom Development Projects",
              items: [
                "A deposit of 50% is required to begin any custom project",
                "Deposits are non-refundable once development begins",
                "Final payment is due upon delivery",
                "Revision requests within the agreed scope are included",
                "Additional revisions beyond scope will be quoted separately"
              ]
            },
            {
              title: "4. How to Request a Refund",
              content: "To request a refund:",
              items: [
                "Email hello@zotomic.com with subject 'Refund Request'",
                "Include your registered email address",
                "Include your payment date and payment method (bKash/Nagad/Stripe transaction ID)",
                "Describe the reason for the refund request"
              ],
              note: "We will respond within 2 business days. Approved refunds are processed within 5-7 business days via the original payment method."
            },
            {
              title: "5. Cancellation Policy",
              items: [
                "You may cancel your subscription at any time from the dashboard",
                "Cancellation takes effect at the end of the current billing period",
                "You will continue to have access to paid features until the period ends",
                "No partial refunds for unused days in the current period (unless covered by Section 2)"
              ]
            },
            {
              title: "6. Payment Methods",
              content: "We currently accept:",
              items: [
                "bKash (Bangladesh)",
                "Nagad (Bangladesh)",
                "Stripe (International card payments — coming soon)",
                "Bank Transfer (for Business plans — contact us)"
              ]
            },
            {
              title: "7. Contact",
              content: "Refund inquiries: hello@zotomic.com | WhatsApp: +880XXXXXXXXXX | Dhaka, Bangladesh"
            }
          ].map((section) => (
            <div key={section.title} className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6">
              <h2 className="text-lg font-black text-[var(--fg)] mb-3">{section.title}</h2>
              {section.content && <p className="mb-3">{section.content}</p>}
              {section.items && (
                <ul className="list-disc list-inside space-y-1.5">
                  {section.items.map((item, i) => <li key={i}>{item}</li>)}
                </ul>
              )}
              {section.warning && (
                <div className="mt-3 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-300">
                  ⚠️ {section.warning}
                </div>
              )}
              {section.note && (
                <p className="mt-3 text-sm bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-2 text-blue-300">💡 {section.note}</p>
              )}
            </div>
          ))}
        </div>

        <div className="mt-10 flex gap-4 flex-wrap">
          <Link href="/privacy-policy" className="text-[var(--muted)] hover:text-[var(--fg)] text-sm transition-colors">Privacy Policy →</Link>
          <Link href="/terms" className="text-[var(--muted)] hover:text-[var(--fg)] text-sm transition-colors">Terms & Conditions →</Link>
        </div>
      </div>
    </div>
  );
}
