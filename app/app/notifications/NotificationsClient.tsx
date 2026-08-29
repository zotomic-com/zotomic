"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { markAllNotificationsRead, markNotificationRead } from "./actions";

export interface NotifRow {
  id: string;
  title: string;
  body: string | null;
  href: string | null;
  read: boolean;
  createdAt: string;
}

export function NotificationsClient({ notifications }: { notifications: NotifRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const unread = notifications.filter((n) => !n.read).length;

  const refresh = () => router.refresh();

  if (notifications.length === 0) {
    return <EmptyState icon={Bell} title="You're all caught up" description="New notifications will show here." />;
  }

  return (
    <div className="space-y-4">
      {unread > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-fg-muted">{unread} unread</span>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => start(async () => (await markAllNotificationsRead(), refresh()))}
          >
            Mark all read
          </Button>
        </div>
      )}
      <div className="card divide-y divide-border">
        {notifications.map((n) => {
          const Row = (
            <div
              className={`flex items-start justify-between gap-3 px-4 py-3 ${n.read ? "opacity-60" : ""}`}
              onClick={() => !n.read && start(async () => (await markNotificationRead(n.id), refresh()))}
            >
              <div>
                <p className="text-sm font-semibold text-fg">
                  {!n.read && <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-primary align-middle" />}
                  {n.title}
                </p>
                {n.body && <p className="mt-0.5 text-sm text-fg-muted">{n.body}</p>}
              </div>
              <span className="shrink-0 text-xs text-fg-subtle">
                {new Date(n.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            </div>
          );
          return n.href ? (
            <Link key={n.id} href={n.href} className="block hover:bg-surface-2">
              {Row}
            </Link>
          ) : (
            <div key={n.id} className="cursor-pointer hover:bg-surface-2">
              {Row}
            </div>
          );
        })}
      </div>
    </div>
  );
}
