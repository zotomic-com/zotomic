import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/site/marketing";
import { getServiceCards } from "@/lib/service-cards";
import { siteIcon } from "@/lib/site-icons";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Services",
  description: "Domain, hosting, web design, web development and automation services from Zotomic.",
};

export default async function ServicesPage() {
  const cards = await getServiceCards();

  return (
    <>
      <PageHero
        eyebrow="Services"
        title="Everything your store needs, in one place"
        subtitle="Domains, hosting, web design and more — buy directly from Zotomic, paid by bKash or Nagad."
      />
      <div className="mx-auto grid max-w-5xl gap-4 px-4 pb-16 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
        {cards.map((c) => {
          const Icon = siteIcon(c.icon);
          const isLive = c.status === "live" && c.href;
          const body = (
            <>
              <Icon className="h-6 w-6 text-primary" />
              <p className="mt-3 flex items-center gap-2 font-bold text-fg">
                {c.title}
                {!isLive && (
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">
                    Coming soon
                  </span>
                )}
              </p>
              <p className="mt-1 text-sm text-fg-muted">{c.description}</p>
            </>
          );
          return isLive ? (
            <Link
              key={c.id}
              href={c.href as string}
              className="group rounded-lg border border-border bg-surface p-5 shadow-sm transition-colors hover:border-primary"
            >
              {body}
            </Link>
          ) : (
            <div key={c.id} className="rounded-lg border border-border bg-surface p-5 opacity-70">
              {body}
            </div>
          );
        })}
      </div>
    </>
  );
}
