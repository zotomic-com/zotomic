import Link from "next/link";
import { money } from "@/lib/money";
import type { StoreProduct } from "@/lib/storefront/store";

export function ProductCard({
  product,
  currency,
  basePath,
}: {
  product: StoreProduct;
  currency: string;
  basePath: string;
}) {
  const onSale = product.salePrice != null && product.salePrice < product.price;
  const soldOut = product.trackInventory && product.stockQty <= 0;

  return (
    <Link
      href={`${basePath}/products/${product.slug}`}
      className="group block overflow-hidden rounded-[var(--sf-radius)] border border-[var(--sf-line)] bg-[var(--sf-bg)]"
    >
      <div className="relative aspect-square bg-[var(--sf-card)]">
        {product.imageUrls[0] ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={product.imageUrls[0]}
            alt={product.name}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-[var(--sf-muted)]">
            No image
          </div>
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
