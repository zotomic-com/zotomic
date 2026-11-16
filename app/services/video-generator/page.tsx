import type { Metadata } from "next";
import { getSessionUser } from "@/lib/tenant-server";
import { listMyServiceTokens } from "@/lib/services/tool-tokens";
import { ToolPageHero, MyTokensPanel } from "@/components/site/service-tools";
import VideoGeneratorClient from "./VideoGeneratorClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Video Generator — turn any script into a narrated video",
  description:
    "Paste a script and get a ready-to-post vertical video: neural voice narration, word-synced captions and an animated background. Free to use without an account — paid plans get bigger limits.",
};

export default async function VideoGeneratorPage() {
  const user = await getSessionUser();
  const tokens = user ? await listMyServiceTokens(user.email) : [];

  return (
    <>
      <ToolPageHero
        eyebrow="Service"
        title="Video Generator"
        subtitle="Paste a script or a timestamped storyboard (Gemini/ChatGPT style) — pick a stick-figure character to act it out, with neural narration and word-synced captions. No editing, no signup needed."
      />
      <div className="mx-auto max-w-3xl space-y-4 px-4 pb-16 sm:px-6">
        <VideoGeneratorClient />
        {user && (
          <MyTokensPanel
            email={user.email}
            tokens={tokens.map((t) => ({ prefix: t.prefix, token: t.token, label: t.label, services: t.services, expiresAt: t.expiresAt }))}
          />
        )}
      </div>
    </>
  );
}
