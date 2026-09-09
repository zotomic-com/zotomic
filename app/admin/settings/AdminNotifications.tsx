"use client";

import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { NotificationMatrix } from "@/components/app/NotificationMatrix";
import { ADMIN_EVENTS, type Prefs } from "@/lib/notify-events";
import { saveAdminNotificationPrefs } from "./actions";

export function AdminNotifications({ prefs }: { prefs: Prefs }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your notifications</CardTitle>
      </CardHeader>
      <CardBody>
        <NotificationMatrix
          events={ADMIN_EVENTS}
          initial={prefs}
          onSave={saveAdminNotificationPrefs}
          note="Telegram alerts use the bots connected under Assistants → Telegram."
        />
      </CardBody>
    </Card>
  );
}
