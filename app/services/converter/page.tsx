import type { Metadata } from "next";
import { getSessionUser } from "@/lib/tenant-server";
import { listMyServiceTokens } from "@/lib/services/tool-tokens";
import { ToolPageHero, MyTokensPanel } from "@/components/site/service-tools";
import { listConvTypes, CONV_GROUPS } from "@/lib/services/converter";
import ConverterClient from "./ConverterClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Converter — images, video and audio in one place",
  description:
    "Convert images to PDF, PDF to images, video to GIF or MP3, trim and compress clips, transcribe audio and more. Free to use without an account — paid plans get bigger daily limits.",
};

export default async function ConverterPage() {
  const user = await getSessionUser();
  const [tokens, types] = await Promise.all([
    user ? listMyServiceTokens(user.email) : Promise.resolve([]),
    listConvTypes({ onlyEnabled: true }),
  ]);

  return (
    <>
      <ToolPageHero
        eyebrow="Service"
        title="Converter"
        subtitle="One place for the file conversions you actually need — images to PDF, PDF to images, video to GIF or MP3, trim and compress, transcribe audio. Pick a converter, drop a file, download the result. No signup needed."
      />
      <div className="mx-auto max-w-3xl space-y-4 px-4 pb-16 sm:px-6">
        <ConverterClient
          types={types}
          groups={CONV_GROUPS.map((g) => ({ id: g.id, label: g.label, blurb: g.blurb }))}
        />
        {user && (
          <MyTokensPanel
            email={user.email}
            tokens={tokens.map((t) => ({
              prefix: t.prefix,
              token: t.token,
              label: t.label,
              services: t.services,
              expiresAt: t.expiresAt,
            }))}
          />
        )}
      </div>
    </>
  );
}
