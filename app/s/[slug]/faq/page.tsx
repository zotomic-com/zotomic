import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStoreBySlug } from "@/lib/storefront/store";

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  return { title: store?.config.pages.faq?.title ?? "FAQ" };
}

export default async function StoreFaqPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();

  const faq = store.config.pages.faq;
  if (!faq || faq.enabled === false) notFound();
  const items = (faq.items ?? []).filter((i) => i.q);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((i) => ({
      "@type": "Question",
      name: i.q,
      acceptedAnswer: { "@type": "Answer", text: i.a },
    })),
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      {items.length > 0 && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      )}
      <h1 className="text-2xl font-extrabold tracking-tight">{faq.title || "FAQ"}</h1>
      <dl className="mt-8 divide-y divide-[var(--sf-line)]">
        {items.length ? (
          items.map((i, idx) => (
            <div key={idx} className="py-4">
              <dt className="text-sm font-semibold">{i.q}</dt>
              <dd className="mt-1 whitespace-pre-line text-sm text-[var(--sf-muted)]">{i.a}</dd>
            </div>
          ))
        ) : (
          <p className="py-4 text-sm text-[var(--sf-muted)]">No questions yet.</p>
        )}
      </dl>
    </div>
  );
}
