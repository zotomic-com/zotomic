import Link from "next/link";
import { requireAdmin } from "@/lib/admin-server";
import { AssistantActivityPanel } from "../assistant-activity/AssistantActivityPanel";
import { StorefrontAssistantsPanel } from "../storefront-assistants/StorefrontAssistantsPanel";
import { AdminChat } from "./AdminChat";
import { TelegramBots } from "./TelegramBots";
import { WebSearchKeys } from "./WebSearchKeys";
import { AssistantPowers } from "./AssistantPowers";
import { ConnectorsPanel } from "./ConnectorsPanel";
import { SkillsPanel } from "./SkillsPanel";
import { McpPanel } from "./McpPanel";
import {
  listTelegramBots,
  listSearchKeys,
  getAssistantPowers,
  listConnectors,
  listSkillsAction,
  listMcpTokens,
} from "./actions";

export const dynamic = "force-dynamic";

const TABS = [
  { value: "chat", label: "Admin chat" },
  { value: "setup", label: "Setup" },
  { value: "storefront", label: "Storefront assistants" },
  { value: "activity", label: "Owner assistant activity" },
] as const;

type Tab = (typeof TABS)[number]["value"];

export default async function AdminAssistantsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireAdmin();
  const { tab: raw } = await searchParams;
  const tab: Tab = TABS.some((t) => t.value === raw) ? (raw as Tab) : "chat";

  const setup =
    tab === "setup"
      ? await Promise.all([
          getAssistantPowers(),
          listConnectors(),
          listSkillsAction(),
          listMcpTokens(),
          listSearchKeys(),
          listTelegramBots(),
        ])
      : null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-fg">Assistants</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Your own Zotomic assistant, the store-owner assistant usage, and every storefront chatbot.
        </p>
      </div>

      <div className="inline-flex gap-1 rounded-sm border border-border bg-surface-2 p-1">
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={`/admin/assistants?tab=${t.value}`}
            className={`rounded-[8px] px-3 py-1.5 text-sm font-medium transition-colors ${
              t.value === tab ? "bg-surface text-fg shadow-sm" : "text-fg-muted hover:text-fg"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "chat" && <AdminChat />}

      {tab === "setup" && setup && (
        <div className="space-y-5">
          <AssistantPowers
            caps={setup[0].caps}
            labels={setup[0].labels}
            recent={setup[0].recent}
            envReady={setup[0].envReady}
          />
          <ConnectorsPanel connectors={setup[1].connectors} providers={setup[1].providers} />
          <SkillsPanel skills={setup[2]} />
          <McpPanel tokens={setup[3].tokens} url={setup[3].url} />
          <WebSearchKeys keys={setup[4].keys} providers={setup[4].providers} />
          <TelegramBots bots={setup[5].bots} webhookUrl={setup[5].webhookUrl} />
        </div>
      )}

      {tab === "storefront" && <StorefrontAssistantsPanel />}
      {tab === "activity" && <AssistantActivityPanel />}
    </div>
  );
}
