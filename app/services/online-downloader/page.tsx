import type { Metadata } from "next";
import { getSessionUser } from "@/lib/tenant-server";
import { listMyServiceTokens } from "@/lib/services/tool-tokens";
import { ToolPageHero, AccessGate, MyTokensPanel } from "@/components/site/service-tools";
import OnlineDownloaderClient from "./OnlineDownloaderClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Online Downloader — save videos from YouTube, TikTok, Instagram & Facebook",
  description:
    "Paste a video link and download it in the quality you choose — or extract the audio as MP3. Free for Zotomic accounts, paid by bKash or Nagad for bigger limits.",
};

export default async function OnlineDownloaderPage() {
  const user = await getSessionUser();
  const tokens = user ? await listMyServiceTokens(user.email) : [];

  return (
    <>
      <ToolPageHero
        eyebrow="Service"
        title="Online Downloader"
        subtitle="Paste a link from YouTube, TikTok, Instagram or Facebook — pick a quality (up to 4K) or extract the audio as MP3, and download straight to your device."
      />
      {user ? (
        <div className="mx-auto max-w-3xl space-y-4 px-4 pb-16 sm:px-6">
          <OnlineDownloaderClient />
          <MyTokensPanel
            email={user.email}
            tokens={tokens.map((t) => ({ prefix: t.prefix, token: t.token, label: t.label, services: t.services, expiresAt: t.expiresAt }))}
          />
        </div>
      ) : (
        <AccessGate />
      )}
    </>
  );
}
