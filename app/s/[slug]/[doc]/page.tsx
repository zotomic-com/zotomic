import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStoreBySlug } from "@/lib/storefront/store";
import { storeBasePath } from "@/lib/storefront/base-path";
import { STORE_DOC_PAGES, type StoreDocSlug } from "@/lib/storefront/config";

export const revalidate = 300;

function isDoc(x: string): x is StoreDocSlug {
  return (STORE_DOC_PAGES as readonly string[]).includes(x);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; doc: string }>;
}): Promise<Metadata> {
  const { slug, doc } = await params;
  if (!isDoc(doc)) return {};
  const store = await getStoreBySlug(slug);
  const page = store?.config.pages[doc];
  return { title: page?.title ?? doc };
}

export default async function StoreDocPage({
  params,
}: {
  params: Promise<{ slug: string; doc: string }>;
}) {
  const { slug, doc } = await params;
  if (!isDoc(doc)) notFound();

  const store = await getStoreBySlug(slug);
  if (!store) notFound();

  const page = store.config.pages[doc];
  if (!page || page.enabled === false) notFound();

  const basePath = await storeBasePath(slug);

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-extrabold tracking-tight">{page.title}</h1>
      <div className="mt-6 space-y-4 text-sm leading-relaxed text-[var(--sf-muted)]">
        {(page.body || "").split(/\n{2,}/).map((para, i) => (
          <p key={i} className="whitespace-pre-line">
            {para}
          </p>
        ))}
      </div>
      <p className="mt-10 text-xs text-[var(--sf-muted)]">
        Questions?{" "}
        <a href={`${basePath}/contact`} className="underline">
          Contact us
        </a>
        .
      </p>
    </div>
  );
}
