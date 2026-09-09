"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { CHANNEL_LABEL, type Channel, type EventDef, type Prefs } from "@/lib/notify-events";

export function NotificationMatrix({
  events,
  initial,
  onSave,
  note,
}: {
  events: EventDef[];
  initial: Prefs;
  onSave: (prefs: Prefs) => Promise<{ ok: true } | { error: string }>;
  note?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [prefs, setPrefs] = useState<Prefs>(initial);

  const channels = useMemo(() => {
    const set = new Set<Channel>();
    events.forEach((e) => e.channels.forEach((c) => set.add(c)));
    return (["in_app", "email", "telegram"] as Channel[]).filter((c) => set.has(c));
  }, [events]);

  const dirty = JSON.stringify(prefs) !== JSON.stringify(initial);

  const toggle = (event: string, ch: Channel) =>
    setPrefs((p) => ({ ...p, [event]: { ...p[event], [ch]: !p[event]?.[ch] } }));

  const save = () =>
    start(async () => {
      const res = await onSave(prefs);
      if ("error" in res) return toast(res.error, "error");
      toast("Notifications updated", "success");
      router.refresh();
    });

  return (
    <div className="space-y-3">
      {note && <p className="text-xs text-fg-subtle">{note}</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-subtle">
              <th className="py-2 pr-3 text-left font-semibold">Event</th>
              {channels.map((c) => (
                <th key={c} className="w-20 py-2 text-center font-semibold">
                  {CHANNEL_LABEL[c]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.key} className="border-b border-border last:border-0">
                <td className="py-2.5 pr-3">
                  <p className="font-medium text-fg">{e.label}</p>
                  <p className="text-xs text-fg-subtle">{e.hint}</p>
                </td>
                {channels.map((c) => (
                  <td key={c} className="text-center">
                    {e.channels.includes(c) ? (
                      <input
                        type="checkbox"
                        checked={!!prefs[e.key]?.[c]}
                        onChange={() => toggle(e.key, c)}
                        className="h-4 w-4"
                      />
                    ) : (
                      <span className="text-fg-subtle">—</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {dirty && (
        <div className="flex justify-end">
          <Button size="sm" onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save notification settings"}
          </Button>
        </div>
      )}
    </div>
  );
}
