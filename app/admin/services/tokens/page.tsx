import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin-server";
import { listServiceTokens } from "@/lib/services/tool-tokens";
import { PageHeader } from "@/components/app/PageHeader";
import TokensManager from "./TokensManager";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Service Tokens — Admin" };

export default async function AdminServiceTokensPage() {
  await requireAdmin();
  const tokens = await listServiceTokens();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Service Tokens"
        subtitle="Platform-issued access tokens for Text to Audio & Online Downloader. Users can only use and reveal tokens addressed to them — they can never create, edit or delete tokens."
      />
      <TokensManager tokens={tokens} />
    </div>
  );
}
