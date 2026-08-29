import Link from "next/link";
import { CloudCog, Headphones, Lock, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/Logo";

const TRUST = [
  { icon: ShieldCheck, title: "Secure & Private", text: "Your data is protected with enterprise-grade security." },
  { icon: CloudCog, title: "Reliable", text: "Built on modern, scalable infrastructure you can trust." },
  { icon: Lock, title: "You're in Control", text: "You own your data. Always." },
  { icon: Headphones, title: "Support That Cares", text: "We're here to help you succeed." },
];

const COLS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Intelligence", href: "/intelligence" },
      { label: "Assistant", href: "/assistant" },
      { label: "Storefront", href: "/storefront" },
      { label: "Pricing", href: "/pricing" },
      { label: "How it works", href: "/how-it-works" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Contact", href: "/contact" },
      { label: "Help", href: "/help" },
      { label: "FAQ", href: "/faq" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", href: "/privacy-policy" },
      { label: "Terms", href: "/terms" },
      { label: "Refund policy", href: "/refund-policy" },
      { label: "Data deletion", href: "/data-deletion" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      {/* Trust strip */}
      <div className="bg-primary-soft">
        <div className="mx-auto grid max-w-5xl gap-6 px-4 py-8 sm:grid-cols-2 lg:grid-cols-4 sm:px-6">
          {TRUST.map((t) => (
            <div key={t.title} className="flex items-start gap-3">
              <t.icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-bold text-fg">{t.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">{t.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Links */}
      <div className="bg-surface">
        <div className="mx-auto grid max-w-5xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-4 sm:px-6">
          <div>
            <Logo />
            <p className="mt-3 max-w-xs text-xs leading-relaxed text-fg-muted">
              Business intelligence, without the complexity. See what&apos;s happening, understand
              why, and act with confidence.
            </p>
          </div>
          {COLS.map((c) => (
            <div key={c.title}>
              <p className="mb-3 text-xs font-bold uppercase tracking-widest text-fg-subtle">
                {c.title}
              </p>
              <ul className="space-y-2">
                {c.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-sm text-fg-muted transition-colors hover:text-fg">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-2 border-t border-border px-4 py-6 text-xs text-fg-subtle sm:flex-row sm:px-6">
          <p>&copy; {new Date().getFullYear()} Zotomic. All rights reserved.</p>
          <p>See. Understand. Act.</p>
        </div>
      </div>
    </footer>
  );
}
