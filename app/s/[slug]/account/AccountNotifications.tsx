"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CUSTOMER_EVENTS, type Prefs } from "@/lib/notify-events";
import { saveNotificationPrefsAction } from "./actions";

export function AccountNotifications({ slug, prefs }: { slug: string; prefs: Prefs }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <section className="mt-10">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-[var(--sf-muted)]">Email preferences</h2>
      <form
        action={(fd) =>
          start(async () => {
            await saveNotificationPrefsAction(slug, fd);
            router.refresh();
          })
        }
        className="space-y-3 rounded-[var(--sf-radius)] border border-[var(--sf-line)] p-4"
      >
        {CUSTOMER_EVENTS.map((e) => (
          <label key={e.key} className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              name={e.key}
              defaultChecked={!!prefs[e.key]?.email}
              className="mt-0.5 h-4 w-4"
            />
            <span>
              <span className="font-medium">{e.label}</span>
              <span className="block text-xs text-[var(--sf-muted)]">{e.hint}</span>
            </span>
          </label>
        ))}
        <button
          type="submit"
          disabled={pending}
          className="rounded-[var(--sf-radius)] bg-[var(--sf-accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save preferences"}
        </button>
      </form>
    </section>
  );
}
