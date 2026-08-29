import Link from "next/link";
import { money } from "@/lib/money";
import { cldUrl } from "@/lib/cloudinary";
import type { StoreProduct } from "@/lib/storefront/store";
import { WishlistHeart } from "./WishlistHeart";

export function ProductCard({
  product,
  currency,
  basePath,
  storeSlug,
}: {
  product: StoreProduct;
  currency: string;
  basePath: string;
  storeSlug?: string;
}) {
  const onSale = product.salePrice != null && product.salePrice < product.price;
  const soldOut = product.trackInventory && product.stockQty <= 0;
  const price = onSale ? product.salePrice! : product.price;

  return (
    <Link
      href={`${basePath}/products/${product.slug}`}
      className="group block overflow-hidden rounded-[var(--sf-radius)] border border-[var(--sf-line)] bg-[var(--sf-bg)]"
    >
      <div className="relative aspect-square bg-[var(--sf-card)]">
        {product.imageUrls[0] ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={cldUrl(product.imageUrls[0], 600)}
            alt={product.name}
            width={600}
            height={600}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-[var(--sf-muted)]">No image</div>
        )}
        {soldOut && (
          <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-xs font-semibold text-white">
            Sold out
          </span>
        )}
        {onSale && !soldOut && (
          <span className="absolute left-2 top-2 rounded-full bg-[var(--sf-accent)] px-2 py-0.5 text-xs font-semibold text-white">
            Sale
          </span>
        )}
        {storeSlug && (
          <WishlistHeart
            storeSlug={storeSlug}
            item={{ id: product.id, name: product.name, price, image: product.imageUrls[0] ?? null, slug: product.slug }}
            size={18}
            className="absolute right-2 top-2 rounded-full bg-[var(--sf-bg)]/80 p-1.5 text-[var(--sf-fg)] backdrop-blur"
          />
        )}
      </div>
      <div className="p-3">
        <p className="line-clamp-1 text-sm font-medium">{product.name}</p>
        <p className="mt-1 text-sm">
          {onSale ? (
            <>
              <span className="font-semibold">{money(product.salePrice!, currency)}</span>{" "}
              <span className="text-[var(--sf-muted)] line-through">{money(product.price, currency)}</span>
            </>
          ) : (
            <span className="font-semibold">{money(product.price, currency)}</span>
          )}
        </p>
      </div>
    </Link>
  );
}
