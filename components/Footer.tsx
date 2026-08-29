import Link from "next/link";
import { CloudCog, Headphones, Lock, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/Logo";

const TRUST = [
  { icon: ShieldCheck, title: "Secure & Private", text: "Enterprise-grade security." },
  { icon: CloudCog, title: "Reliable", text: "Modern, scalable infrastructure." },
  { icon: Lock, title: "You're in Control", text: "You own your data. Always." },
  { icon: Headphones, title: "Support That Cares", text: "We're here to help you succeed." },
];

const COLS = [
  {
    title: "Product",
    links: [
      { label: "How it works", href: "/how-it-works" },
      { label: "Features", href: "/features" },
      { label: "Storefront", href: "/storefront" },
      { label: "Pricing", href: "/pricing" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Contact", href: "/contact" },
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

export default function Footer() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-6 border-b border-border py-10 sm:grid-cols-2 lg:grid-cols-4">
          {TRUST.map((t) => (
            <div key={t.title} className="flex items-start gap-3">
              <t.icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-bold text-fg">{t.title}</p>
                <p className="text-xs text-fg-muted">{t.text}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="grid gap-8 py-10 sm:grid-cols-2 lg:grid-cols-4">
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
                    <Link
                      href={l.href}
                      className="text-sm text-fg-muted transition-colors hover:text-fg"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex flex-col items-center justify-between gap-2 border-t border-border py-6 text-xs text-fg-subtle sm:flex-row">
          <p>&copy; {new Date().getFullYear()} Zotomic. All rights reserved.</p>
          <p>See. Understand. Act.</p>
        </div>
      </div>
    </footer>
  );
}
