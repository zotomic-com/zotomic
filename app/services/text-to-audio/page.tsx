import type { Metadata } from "next";
import { getSessionUser } from "@/lib/tenant-server";
import { listMyServiceTokens } from "@/lib/services/tool-tokens";
import { ToolPageHero, AccessGate, MyTokensPanel } from "@/components/site/service-tools";
import TextToAudioClient from "./TextToAudioClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Text to Audio — free neural voices",
  description:
    "Turn any text into natural speech with 300+ neural voices in dozens of languages. Free for Zotomic accounts, paid by bKash or Nagad for bigger limits.",
};

export default async function TextToAudioPage() {
  const user = await getSessionUser();
  const tokens = user ? await listMyServiceTokens(user.email) : [];

  return (
    <>
      <ToolPageHero
        eyebrow="Service"
        title="Text to Audio"
        subtitle="Turn any text into natural, human-sounding speech. 300+ neural voices, dozens of languages — paste, pick a voice, download the MP3."
      />
      {user ? (
        <div className="mx-auto max-w-3xl space-y-4 px-4 pb-16 sm:px-6">
          <TextToAudioClient />
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
