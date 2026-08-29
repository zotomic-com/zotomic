import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms & Conditions | Zotomic",
  description: "Zotomic's terms and conditions for using our web development and AI automation services.",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[var(--bg)] pt-28 pb-16">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-10">
          <p className="text-sm text-[var(--muted)] mb-2">Legal</p>
          <h1 className="text-4xl font-black text-[var(--fg)]">Terms & Conditions</h1>
          <p className="text-[var(--muted)] mt-3">Last updated: May 3, 2025</p>
        </div>

        <div className="space-y-6 text-[var(--muted)] leading-relaxed">

          {[
            {
              title: "1. Acceptance of Terms",
              content: `By accessing or using Zotomic's website and services, you agree to be bound by these Terms & Conditions. If you do not agree to these terms, you may not use our services. We reserve the right to modify these terms at any time, and continued use after changes constitutes acceptance.`
            },
            {
              title: "2. Services Description",
              content: `Zotomic provides web development, AI automation, social media automation, and related digital services. Our SaaS platform ("Platform") enables businesses to automate customer messaging, social media content, and business outreach using artificial intelligence.`
            },
            {
              title: "3. Account Registration",
              items: [
                "You must provide accurate and complete registration information",
                "You are responsible for maintaining the security of your account credentials",
                "You must be at least 18 years old to create an account",
                "One person may not maintain more than one account",
                "We reserve the right to terminate accounts that violate these terms"
              ]
            },
            {
              title: "4. Subscription Plans & Payments",
              content: `Our services are offered on subscription plans:`,
              items: [
                "Free Plan: Limited to Facebook Messenger automation, 50 replies/day",
                "Starter Plan: ৳2,000/month — Facebook + Instagram, 2 agents, 100 replies/day",
                "Growth Plan: ৳5,000/month — All platforms, 5 agents, 300 replies/day",
                "Business Plan: ৳12,000/month — Unlimited agents, 1,000 replies/day",
              ],
              note: "Payment is required in advance. Plans auto-renew monthly unless cancelled."
            },
            {
              title: "5. Acceptable Use Policy",
              content: "You agree NOT to use our services to:",
              items: [
                "Spam, harass, or send unsolicited bulk messages",
                "Violate Meta/Facebook Community Standards or Terms of Service",
                "Send messages that are deceptive, fraudulent, or misleading",
                "Collect user data without proper consent",
                "Conduct illegal activities of any kind",
                "Impersonate other businesses or individuals",
                "Exceed platform rate limits or abuse API access"
              ]
            },
            {
              title: "6. AI & Automation Features",
              content: "Regarding AI automation:",
              items: [
                "You are responsible for providing accurate business information to train the AI",
                "You are responsible for the content generated and sent by AI agents on your behalf",
                "You must comply with Meta's Messaging Policies when using automation features",
                "Daily message limits are enforced to comply with platform guidelines",
                "We are not liable for AI-generated content that causes harm or violates third-party policies"
              ]
            },
            {
              title: "7. API Keys & Third-Party Services",
              items: [
                "You retain ownership of your API keys (Gemini, OpenAI, Meta)",
                "By providing API keys, you authorize us to use them solely to provide our services",
                "We encrypt all API keys with AES-256 before storage",
                "You are responsible for costs incurred through your API keys",
                "Revoking API keys disconnects the associated automation features"
              ]
            },
            {
              title: "8. Intellectual Property",
              content: "All content on Zotomic's website (code, design, text, logos) is owned by Zotomic and protected by copyright. You may not copy, reproduce, or redistribute our platform without written permission. Content you create using our platform remains your property."
            },
            {
              title: "9. Limitation of Liability",
              content: "To the maximum extent permitted by law, Zotomic shall not be liable for any indirect, incidental, special, or consequential damages, including but not limited to: loss of revenue, loss of data, loss of business opportunity, or damages resulting from AI-generated content. Our total liability shall not exceed the amount you paid us in the last 3 months."
            },
            {
              title: "10. Termination",
              items: [
                "You may cancel your subscription at any time from the dashboard",
                "We may terminate accounts that violate these terms without refund",
                "Upon termination, your data will be deleted within 30 days",
                "You may request immediate data deletion via our Data Deletion page"
              ]
            },
            {
              title: "11. Governing Law",
              content: "These Terms are governed by the laws of Bangladesh. Any disputes shall be resolved in the courts of Dhaka, Bangladesh."
            },
            {
              title: "12. Contact",
              content: "For questions about these Terms: hello@zotomic.com | Dhaka, Bangladesh"
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
              {section.note && (
                <p className="mt-3 text-sm bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-2 text-amber-300">{section.note}</p>
              )}
            </div>
          ))}
        </div>

        <div className="mt-10 flex gap-4 flex-wrap">
          <Link href="/privacy-policy" className="text-[var(--muted)] hover:text-[var(--fg)] text-sm transition-colors">Privacy Policy →</Link>
          <Link href="/refund-policy" className="text-[var(--muted)] hover:text-[var(--fg)] text-sm transition-colors">Refund Policy →</Link>
        </div>
      </div>
    </div>
  );
}
