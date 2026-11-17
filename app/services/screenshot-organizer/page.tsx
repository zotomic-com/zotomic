import type { Metadata } from "next";
import { getSessionUser } from "@/lib/tenant-server";
import { listMyServiceTokens } from "@/lib/services/tool-tokens";
import { ToolPageHero, MyTokensPanel } from "@/components/site/service-tools";
import ScreenshotOrganizerClient from "./ScreenshotOrganizerClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Screenshot Organizer — Zotomic AI reads, links and organizes your screenshots",
  description:
    "Drop screenshots or connect your screenshots folder — Zotomic AI extracts the key info, recovers hidden links, organizes everything into named groups and gives you a copyable links file. Originals never leave your device.",
};

export default async function ScreenshotOrganizerPage() {
  const user = await getSessionUser();
  const tokens = user ? await listMyServiceTokens(user.email) : [];

  return (
    <>
      <ToolPageHero
        eyebrow="Service"
        title="Screenshot Organizer"
        subtitle="Take a screenshot right here, drop your screenshots, or connect your screenshots folder — Zotomic AI reads every image, extracts the key info, recovers links that don't even show a URL, and organizes everything into named groups."
      />
      <div className="mx-auto max-w-5xl space-y-4 px-4 pb-16 sm:px-6">
        <ScreenshotOrganizerClient signedIn={!!user} />
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
