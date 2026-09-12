import type { Metadata } from "next";
import { PageHero } from "@/components/site/marketing";
import { getStructuralPage } from "@/lib/site-content";
import { getContactTopics } from "@/lib/contact-topics";
import { siteIcon } from "@/lib/site-icons";
import { ContactFormClient } from "./ContactFormClient";

export async function generateMetadata(): Promise<Metadata> {
  const c = await getStructuralPage("contact");
  return { title: c.seoTitle, description: c.seoDescription };
}

export default async function ContactPage() {
  const [c, topics] = await Promise.all([getStructuralPage("contact"), getContactTopics()]);

  return (
    <>
      <PageHero eyebrow={c.badge} title={c.title} subtitle={c.subtitle} />

      <div className="mx-auto grid max-w-5xl gap-6 px-4 pb-16 sm:px-6 lg:grid-cols-3">
        <div className="space-y-3">
          {c.items.map((i, idx) => {
            const Icon = siteIcon(i.icon);
            return (
              <div key={idx} className="flex items-center gap-3 rounded-lg border border-border bg-surface p-4 shadow-sm">
                <Icon className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">{i.title}</p>
                  <p className="text-sm font-medium text-fg">{i.text}</p>
                </div>
              </div>
            );
          })}
        </div>

        <ContactFormClient topics={topics.map((t) => t.label)} />
      </div>
    </>
  );
}
