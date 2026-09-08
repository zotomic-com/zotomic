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
    <div className="group flex flex-col">
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
          hasVariants: product.hasVariants,
        }}
        currency={currency}
        href={href}
        storeSlug={storeSlug}
      />

      <Link href={href} className="mt-4 block">
        <p className="line-clamp-1 text-sm font-medium">{product.name}</p>
        {product.category && (
          <p className="mt-0.5 text-xs text-[var(--sf-muted)]">{product.category}</p>
        )}
        <p className="mt-1 text-sm">
          {onSale ? (
            <>
              <span className="font-bold">{money(product.salePrice!, currency)}</span>{" "}
              <span className="text-xs text-[var(--sf-muted)] line-through">{money(product.price, currency)}</span>
            </>
          ) : (
            <span className="font-bold">{money(product.price, currency)}</span>
          )}
        </p>
      </Link>

      {storeSlug ? (
        <div className="mt-2">
          <QuickAdd
            product={{ id: product.id, name: product.name, price, image: product.imageUrls[0] ?? null, slug: product.slug }}
            currency={currency}
            storeSlug={storeSlug}
            basePath={basePath}
            hasVariants={product.hasVariants}
            soldOut={soldOut}
          />
        </div>
      ) : null}
    </div>
  );
}
