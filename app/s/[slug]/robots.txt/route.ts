import { getStoreBySlug } from "@/lib/storefront/store";

const AI_BOTS = ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended", "CCBot", "anthropic-ai"];

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  const origin = new URL(req.url).origin;

  const lines = ["User-agent: *", "Allow: /", "Disallow: /cart", "Disallow: /checkout", "Disallow: /order/"];

  if (store && !store.config.seo.allowAiCrawlers) {
    for (const bot of AI_BOTS) lines.push("", `User-agent: ${bot}`, "Disallow: /");
  }

  lines.push("", `Sitemap: ${origin}/sitemap.xml`);
  return new Response(lines.join("\n"), { headers: { "content-type": "text/plain" } });
}
