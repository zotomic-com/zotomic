import Link from "next/link";
import { requireAdmin } from "@/lib/admin-server";
import { AssistantActivityPanel } from "../assistant-activity/AssistantActivityPanel";
import { StorefrontAssistantsPanel } from "../storefront-assistants/StorefrontAssistantsPanel";
import { AdminChat } from "./AdminChat";
import { TelegramBots } from "./TelegramBots";
import { WebSearchKeys } from "./WebSearchKeys";
import { listTelegramBots, listSearchKeys } from "./actions";

export const dynamic = "force-dynamic";

const TABS = [
  { value: "chat", label: "Admin chat" },
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

  const [{ bots, webhookUrl }, searchKeys] =
    tab === "chat"
      ? await Promise.all([listTelegramBots(), listSearchKeys()])
      : ([
          { bots: [], webhookUrl: "" },
          { keys: [], providers: [] },
        ] as [Awaited<ReturnType<typeof listTelegramBots>>, Awaited<ReturnType<typeof listSearchKeys>>]);

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

      {tab === "chat" && (
        <div className="space-y-5">
          <AdminChat />
          <WebSearchKeys keys={searchKeys.keys} providers={searchKeys.providers} />
          <TelegramBots bots={bots} webhookUrl={webhookUrl} />
        </div>
      )}
      {tab === "storefront" && <StorefrontAssistantsPanel />}
      {tab === "activity" && <AssistantActivityPanel />}
    </div>
  );
}
