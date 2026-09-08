import Link from "next/link";
import { money } from "@/lib/money";
import { badgeFor, type StoreProduct } from "@/lib/storefront/store";
import { QuickAdd } from "./QuickAdd";
import { ProductCardMedia } from "./ProductCardMedia";

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
  const href = `${basePath}/products/${product.slug}`;
  const stockLeft = product.trackInventory ? product.stockQty : null;

  return (
    <div className="group overflow-hidden rounded-[var(--sf-radius)] border border-[var(--sf-line)] bg-[var(--sf-bg)]">
      <ProductCardMedia
        product={{
          id: product.id,
          name: product.name,
          slug: product.slug,
          price: product.price,
          salePrice: onSale ? product.salePrice : null,
          image: product.imageUrls[0] ?? null,
          description: product.description,
          rating: product.rating,
          reviewCount: product.reviewCount,
          sold: product.sold,
          stockLeft,
          badge: badgeFor(product),
        }}
        currency={currency}
        href={href}
        storeSlug={storeSlug}
      />

      <Link href={href} className="block px-3 pt-3">
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
      </Link>

      <div className="px-3 pb-3">
        {storeSlug ? (
          <QuickAdd
            product={{ id: product.id, name: product.name, price, image: product.imageUrls[0] ?? null, slug: product.slug }}
            currency={currency}
            storeSlug={storeSlug}
            basePath={basePath}
            hasVariants={product.hasVariants}
            soldOut={soldOut}
          />
        ) : null}
      </div>
    </div>
  );
}
