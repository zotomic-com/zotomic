import Link from "next/link";
import { Logo } from "@/components/Logo";
import { siteIcon } from "@/lib/site-icons";
import type { NavLink } from "@/lib/site-nav";

const SECTION_TITLES: Record<string, string> = {
  product: "Product",
  company: "Company",
  legal: "Legal",
};
const SECTION_ORDER = ["product", "company", "legal"];

const DEFAULT_TRUST = [
  { icon: "ShieldCheck", title: "Secure & Private", text: "Your data is protected with enterprise-grade security." },
  { icon: "CloudCog", title: "Reliable", text: "Built on modern, scalable infrastructure you can trust." },
  { icon: "Lock", title: "You're in Control", text: "You own your data. Always." },
  { icon: "Headphones", title: "Support That Cares", text: "We're here to help you succeed." },
];
const DEFAULT_TAGLINE =
  "Business intelligence, without the complexity. See what's happening, understand why, and act with confidence.";
const DEFAULT_COPYRIGHT = "Zotomic. All rights reserved.";

interface Branding {
  logoUrl: string;
  footerTagline: string;
  footerCopyright: string;
  footerTrust: { icon: string; title: string; text: string }[];
}

export function SiteFooter({ nav, branding }: { nav: NavLink[]; branding?: Branding }) {
  const trust = branding?.footerTrust?.length ? branding.footerTrust : DEFAULT_TRUST;
  const tagline = branding?.footerTagline || DEFAULT_TAGLINE;
  const copyright = branding?.footerCopyright || DEFAULT_COPYRIGHT;
  const columns = SECTION_ORDER.map((section) => ({
    section,
    title: SECTION_TITLES[section] ?? section,
    links: nav.filter((l) => l.section === section),
  })).filter((c) => c.links.length > 0);

  return (
    <footer className="border-t border-border">
      {/* Trust strip */}
      <div className="bg-primary-soft">
        <div className="mx-auto grid max-w-5xl gap-6 px-4 py-8 sm:grid-cols-2 lg:grid-cols-4 sm:px-6">
          {trust.map((t) => {
            const Icon = siteIcon(t.icon);
            return (
              <div key={t.title} className="flex items-start gap-3">
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-bold text-fg">{t.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">{t.text}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Links */}
      <div className="bg-surface">
        <div className="mx-auto grid max-w-5xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-4 sm:px-6">
          <div>
            <Logo src={branding?.logoUrl} />
            <p className="mt-3 max-w-xs text-xs leading-relaxed text-fg-muted">{tagline}</p>
          </div>
          {columns.map((c) => (
            <div key={c.section}>
              <p className="mb-3 text-xs font-bold uppercase tracking-widest text-fg-subtle">{c.title}</p>
              <ul className="space-y-2">
                {c.links.map((l) => (
                  <li key={l.id}>
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
          <p>
            &copy; {new Date().getFullYear()} {copyright}
          </p>
          <p>See. Understand. Act.</p>
        </div>
      </div>
    </footer>
  );
}
