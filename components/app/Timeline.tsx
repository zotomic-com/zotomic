const fmt = (d: string) =>
  new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export interface TimelineEvent {
  id: string;
  action: string;
  summary: string | null;
  at: string;
  actor?: string | null;
}

/** Compact activity feed (usually from audit_logs). */
export function Timeline({ events }: { events: TimelineEvent[] }) {
  if (!events.length) return <p className="text-sm text-fg-subtle">No activity yet.</p>;
  return (
    <ol className="relative space-y-3 border-l border-border pl-4">
      {events.map((e) => (
        <li key={e.id} className="relative">
          <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-border-strong" />
          <p className="text-sm text-fg">
            {e.summary || e.action.replace(/[._]/g, " ")}
          </p>
          <p className="text-xs text-fg-subtle">
            {fmt(e.at)}
            {e.actor ? ` · ${e.actor}` : ""}
          </p>
        </li>
      ))}
    </ol>
  );
}
