import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStoreBySlug } from "@/lib/storefront/store";
import { ContactForm } from "./ContactForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Contact" };

export default async function StoreContactPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();
  const c = store.config.contact;

  const rows = [
    ["Phone", c.phone],
    ["WhatsApp", c.whatsapp],
    ["Email", c.email],
    ["Address", c.address],
    ["Hours", c.hours],
  ].filter(([, v]) => v);

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-extrabold tracking-tight">Contact {store.name}</h1>

      {rows.length > 0 && (
        <dl className="mt-6 space-y-3">
          {rows.map(([k, v]) => (
            <div key={k} className="flex gap-4 border-b border-[var(--sf-line)] pb-3 text-sm">
              <dt className="w-24 shrink-0 font-semibold">{k}</dt>
              <dd className="text-[var(--sf-muted)]">{v}</dd>
            </div>
          ))}
        </dl>
      )}

      <h2 className="mt-10 text-sm font-bold uppercase tracking-widest text-[var(--sf-muted)]">
        Send a message
      </h2>
      <div className="mt-4">
        <ContactForm slug={slug} />
      </div>

      {c.mapEmbedUrl && (
        <iframe
          src={c.mapEmbedUrl}
          className="mt-8 aspect-video w-full rounded-[var(--sf-radius)] border border-[var(--sf-line)]"
          loading="lazy"
          title="Map"
        />
      )}
    </div>
  );
}
