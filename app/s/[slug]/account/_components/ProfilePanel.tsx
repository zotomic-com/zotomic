"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { CUSTOMER_EVENTS, type Prefs } from "@/lib/notify-events";
import {
  changePasswordAction,
  logoutAction,
  saveNotificationPrefsAction,
  updateProfileAction,
} from "../actions";

const input =
  "w-full rounded-[var(--sf-radius)] border border-[var(--sf-line)] bg-[var(--sf-bg)] px-3 py-2.5 text-sm outline-none focus:border-[var(--sf-accent)]";
const primary = "rounded-full bg-[var(--sf-accent)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[var(--sf-radius-lg)] border border-[var(--sf-line)] p-4">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-[var(--sf-muted)]">{title}</h2>
      {children}
    </section>
  );
}

export function ProfilePanel({
  slug,
  basePath,
  profile,
  prefs,
}: {
  slug: string;
  basePath: string;
  profile: { name: string; email: string; phone: string };
  prefs: Prefs;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [profileMsg, setProfileMsg] = useState("");
  const [pwMsg, setPwMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [prefMsg, setPrefMsg] = useState("");

  return (
    <div className="space-y-4">
      <Card title="Your details">
        <form
          action={(fd) =>
            start(async () => {
              await updateProfileAction(slug, fd);
              setProfileMsg("Saved");
              router.refresh();
            })
          }
          className="grid gap-2.5 sm:grid-cols-2"
        >
          <input name="name" defaultValue={profile.name} placeholder="Name" className={input} />
          <input name="phone" defaultValue={profile.phone} placeholder="Phone" className={input} inputMode="tel" />
          <p className="text-xs text-[var(--sf-muted)] sm:col-span-2">
            {profile.email} <span className="opacity-60">· email can&apos;t be changed here</span>
          </p>
          <div className="flex items-center gap-3 sm:col-span-2">
            <button className={primary} disabled={pending}>
              Save
            </button>
            {profileMsg && <span className="text-xs text-emerald-600">{profileMsg}</span>}
          </div>
        </form>
      </Card>

      <Card title="Password">
        <form
          action={(fd) =>
            start(async () => {
              setPwMsg(null);
              const res = await changePasswordAction(
                slug,
                String(fd.get("current") ?? ""),
                String(fd.get("next") ?? ""),
              );
              if ("error" in res) setPwMsg({ tone: "err", text: res.error });
              else {
                setPwMsg({ tone: "ok", text: "Password updated." });
                (document.getElementById("pw-form") as HTMLFormElement | null)?.reset();
              }
            })
          }
          id="pw-form"
          className="grid gap-2.5 sm:grid-cols-2"
        >
          <input name="current" type="password" placeholder="Current password" autoComplete="current-password" className={input} />
          <input name="next" type="password" placeholder="New password (min 8)" minLength={8} autoComplete="new-password" className={input} />
          <div className="flex items-center gap-3 sm:col-span-2">
            <button className={primary} disabled={pending}>
              Change password
            </button>
            {pwMsg && (
              <span className={`text-xs ${pwMsg.tone === "ok" ? "text-emerald-600" : "text-red-600"}`}>
                {pwMsg.text}
              </span>
            )}
          </div>
        </form>
      </Card>

      <Card title="Email preferences">
        <form
          action={(fd) =>
            start(async () => {
              await saveNotificationPrefsAction(slug, fd);
              setPrefMsg("Saved");
              router.refresh();
            })
          }
          className="space-y-3"
        >
          {CUSTOMER_EVENTS.map((e) => (
            <label key={e.key} className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                name={e.key}
                defaultChecked={!!prefs[e.key]?.email}
                className="mt-0.5 h-4 w-4 accent-[var(--sf-accent)]"
              />
              <span>
                <span className="font-medium">{e.label}</span>
                <span className="block text-xs text-[var(--sf-muted)]">{e.hint}</span>
              </span>
            </label>
          ))}
          <div className="flex items-center gap-3">
            <button className={primary} disabled={pending}>
              Save preferences
            </button>
            {prefMsg && <span className="text-xs text-emerald-600">{prefMsg}</span>}
          </div>
        </form>
      </Card>

      <button
        onClick={() =>
          start(async () => {
            await logoutAction();
            router.push(basePath || "/");
            router.refresh();
          })
        }
        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--sf-line)] px-4 py-2.5 text-sm font-semibold"
      >
        <LogOut className="h-4 w-4" /> Sign out
      </button>
    </div>
  );
}
