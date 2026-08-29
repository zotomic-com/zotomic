import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | Zotomic",
  description: "Zotomic's privacy policy — how we collect, use, and protect your data.",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-[var(--bg)] pt-28 pb-16">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-10">
          <p className="text-sm text-[var(--muted)] mb-2">Legal</p>
          <h1 className="text-4xl font-black text-[var(--fg)]">Privacy Policy</h1>
          <p className="text-[var(--muted)] mt-3">Last updated: May 3, 2025</p>
        </div>

        <div className="prose-zotomic space-y-8 text-[var(--muted)] leading-relaxed">

          <section className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6">
            <h2 className="text-xl font-black text-[var(--fg)] mb-4">1. Introduction</h2>
            <p>Zotomic (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) is a web development and AI automation service provider based in Bangladesh. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our website at <strong className="text-[var(--fg)]">zotomic.com</strong> and our SaaS platform.</p>
            <p className="mt-3">By accessing or using our services, you agree to the terms of this Privacy Policy. If you do not agree, please discontinue use of our services.</p>
          </section>

          <section className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6">
            <h2 className="text-xl font-black text-[var(--fg)] mb-4">2. Information We Collect</h2>
            <h3 className="text-base font-bold text-[var(--fg)] mb-2">2.1 Information You Provide</h3>
            <ul className="list-disc list-inside space-y-1 mb-4">
              <li>Account registration data (name, email, phone, business name)</li>
              <li>AI and social media API keys you provide for automation (encrypted)</li>
              <li>Business information (website URL, business description)</li>
              <li>Payment information (processed by third-party providers)</li>
              <li>Support communications</li>
            </ul>
            <h3 className="text-base font-bold text-[var(--fg)] mb-2">2.2 Automatically Collected Information</h3>
            <ul className="list-disc list-inside space-y-1 mb-4">
              <li>Log data (IP address, browser type, pages visited, timestamps)</li>
              <li>Cookies and similar tracking technologies</li>
              <li>Usage analytics (features used, session duration)</li>
            </ul>
            <h3 className="text-base font-bold text-[var(--fg)] mb-2">2.3 Third-Party Data</h3>
            <ul className="list-disc list-inside space-y-1">
              <li>Facebook/Meta API data (messages, page information) — only when you connect your accounts</li>
              <li>Google/Gemini API usage data — when you use AI automation features</li>
            </ul>
          </section>

          <section className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6">
            <h2 className="text-xl font-black text-[var(--fg)] mb-4">3. How We Use Your Information</h2>
            <ul className="list-disc list-inside space-y-2">
              <li>Provide, operate, and maintain our services</li>
              <li>Process your AI automation requests using your provided API keys</li>
              <li>Send service-related notifications and updates</li>
              <li>Respond to support requests</li>
              <li>Improve our platform through analytics</li>
              <li>Comply with legal obligations</li>
              <li>Prevent fraud and abuse</li>
            </ul>
            <div className="mt-4 bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
              <p className="text-sm"><strong className="text-blue-400">Note on API Keys:</strong> Your AI API keys (Gemini, OpenAI) are encrypted with AES-256 before storage and are only used to make AI requests on your behalf. We never share or use your API keys for any other purpose.</p>
            </div>
          </section>

          <section className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6">
            <h2 className="text-xl font-black text-[var(--fg)] mb-4">4. Data Sharing and Disclosure</h2>
            <p>We do not sell, trade, or rent your personal information. We may share data with:</p>
            <ul className="list-disc list-inside space-y-2 mt-3">
              <li><strong className="text-[var(--fg)]">Service Providers:</strong> Supabase (database), Vercel (hosting), Google (AI services) — only as necessary to provide our services</li>
              <li><strong className="text-[var(--fg)]">Meta/Facebook:</strong> When you use our Messenger/Instagram automation features</li>
              <li><strong className="text-[var(--fg)]">Legal Requirements:</strong> When required by law or to protect our rights</li>
            </ul>
          </section>

          <section className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6">
            <h2 className="text-xl font-black text-[var(--fg)] mb-4">5. Data Security</h2>
            <ul className="list-disc list-inside space-y-2">
              <li>All data transmitted using TLS/HTTPS encryption</li>
              <li>API keys encrypted with AES-256-CBC before database storage</li>
              <li>Passwords hashed with bcrypt (cost factor 12)</li>
              <li>JWT tokens with 7-day expiry stored in httpOnly cookies</li>
              <li>Row-level security enabled on all database tables</li>
            </ul>
          </section>

          <section className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6">
            <h2 className="text-xl font-black text-[var(--fg)] mb-4">6. Your Rights</h2>
            <p>You have the right to:</p>
            <ul className="list-disc list-inside space-y-2 mt-3">
              <li>Access the personal data we hold about you</li>
              <li>Correct inaccurate data</li>
              <li>Request deletion of your account and all associated data</li>
              <li>Export your data in a portable format</li>
              <li>Opt out of marketing communications</li>
              <li>Withdraw consent for data processing at any time</li>
            </ul>
            <div className="mt-4">
              <Link href="/data-deletion" className="inline-flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-colors px-4 py-2 rounded-xl text-sm font-semibold">
                🗑️ Delete My Account & Data
              </Link>
            </div>
          </section>

          <section className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6">
            <h2 className="text-xl font-black text-[var(--fg)] mb-4">7. Facebook / Meta Data</h2>
            <p>When you use our Facebook/Instagram automation features:</p>
            <ul className="list-disc list-inside space-y-2 mt-3">
              <li>We access your Facebook Page messages only to provide AI auto-reply services</li>
              <li>Message content is not stored beyond 24 hours in our logs</li>
              <li>You can revoke access at any time by disconnecting your Facebook account in the dashboard</li>
              <li>We comply with Meta&apos;s Platform Terms and Developer Policies</li>
            </ul>
            <p className="mt-3">For Facebook data deletion requests, visit our <Link href="/data-deletion" className="text-blue-400 hover:underline">Data Deletion page</Link>.</p>
          </section>

          <section className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6">
            <h2 className="text-xl font-black text-[var(--fg)] mb-4">8. Cookies</h2>
            <p>We use the following cookies:</p>
            <ul className="list-disc list-inside space-y-2 mt-3">
              <li><strong className="text-[var(--fg)]">auth_token:</strong> HttpOnly session cookie for authentication (7-day expiry)</li>
              <li><strong className="text-[var(--fg)]">theme:</strong> Stores dark/light mode preference</li>
            </ul>
            <p className="mt-3">We do not use third-party advertising cookies.</p>
          </section>

          <section className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6">
            <h2 className="text-xl font-black text-[var(--fg)] mb-4">9. Children&apos;s Privacy</h2>
            <p>Our services are not directed to individuals under 18 years of age. We do not knowingly collect personal information from minors.</p>
          </section>

          <section className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6">
            <h2 className="text-xl font-black text-[var(--fg)] mb-4">10. Contact Us</h2>
            <p>For privacy-related inquiries:</p>
            <div className="mt-3 space-y-1">
              <p><strong className="text-[var(--fg)]">Email:</strong> hello@zotomic.com</p>
              <p><strong className="text-[var(--fg)]">Address:</strong> Dhaka, Bangladesh</p>
            </div>
          </section>
        </div>

        <div className="mt-10 flex gap-4 flex-wrap">
          <Link href="/terms" className="text-[var(--muted)] hover:text-[var(--fg)] text-sm transition-colors">Terms & Conditions →</Link>
          <Link href="/refund-policy" className="text-[var(--muted)] hover:text-[var(--fg)] text-sm transition-colors">Refund Policy →</Link>
          <Link href="/data-deletion" className="text-[var(--muted)] hover:text-[var(--fg)] text-sm transition-colors">Data Deletion →</Link>
        </div>
      </div>
    </div>
  );
}
