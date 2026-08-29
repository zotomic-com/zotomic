"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Upload, PencilLine, Share2 } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

const TYPES = [
  "Fashion & Apparel",
  "Electronics & Gadgets",
  "Food & Grocery",
  "Health & Beauty",
  "Home & Living",
  "Handmade & Crafts",
  "Services",
  "Other",
];
const CURRENCIES = ["BDT", "USD", "INR", "PKR", "EUR", "GBP"];
const TIMEZONES = ["Asia/Dhaka", "Asia/Kolkata", "Asia/Karachi", "UTC", "Europe/London", "America/New_York"];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    type: TYPES[0],
    currency: "BDT",
    timezone: "Asia/Dhaka",
  });

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.user) router.replace("/login");
        else if (d.businesses?.length) router.replace("/app");
      });
  }, [router]);

  const finish = async (dataPath: "manual" | "csv" | "facebook" | "skip") => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (res.ok && d.success) {
        router.push(dataPath === "skip" ? "/app" : `/app?setup=${dataPath}`);
      } else {
        setError(d.error ?? "Something went wrong");
        setBusy(false);
      }
    } catch {
      setError("Something went wrong. Please try again.");
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center bg-app px-4 py-10">
      <Logo />
      <div className="mt-8 w-full max-w-lg">
        <div className="mb-6 flex items-center gap-2">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className={`h-1.5 flex-1 rounded-full ${n <= step ? "bg-primary" : "bg-border"}`}
            />
          ))}
        </div>

        <div className="card p-6">
          {step === 1 && (
            <>
              <h1 className="text-lg font-extrabold text-fg">What&apos;s your business called?</h1>
              <p className="mt-1 text-sm text-fg-muted">You can change this later.</p>
              <div className="mt-5 space-y-4">
                <Field label="Business name">
                  <Input
                    autoFocus
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Rahman Fashion"
                  />
                </Field>
                <Field label="Business type">
                  <Select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
                    {TYPES.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Button
                className="mt-6 w-full"
                disabled={form.name.trim().length < 2}
                onClick={() => setStep(2)}
              >
                Continue <ArrowRight className="h-4 w-4" />
              </Button>
            </>
          )}

          {step === 2 && (
            <>
              <h1 className="text-lg font-extrabold text-fg">Currency & timezone</h1>
              <p className="mt-1 text-sm text-fg-muted">Used for reports and your storefront.</p>
              <div className="mt-5 grid grid-cols-2 gap-4">
                <Field label="Currency">
                  <Select value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}>
                    {CURRENCIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Timezone">
                  <Select value={form.timezone} onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}>
                    {TIMEZONES.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="mt-6 flex gap-2">
                <Button variant="outline" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button className="flex-1" onClick={() => setStep(3)}>
                  Continue <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h1 className="text-lg font-extrabold text-fg">Add your first data</h1>
              <p className="mt-1 text-sm text-fg-muted">
                Optional — you can do this any time. We&apos;ll show a sample report until real data
                arrives.
              </p>
              {error && (
                <p className="mt-3 rounded-sm border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
                  {error}
                </p>
              )}
              <div className="mt-5 space-y-2">
                {[
                  { key: "facebook" as const, icon: Share2, label: "Connect Facebook Page", desc: "Pull orders and messages" },
                  { key: "csv" as const, icon: Upload, label: "Upload a CSV", desc: "Import existing orders & products" },
                  { key: "manual" as const, icon: PencilLine, label: "Add products & orders manually", desc: "Start from scratch" },
                ].map((opt) => (
                  <button
                    key={opt.key}
                    disabled={busy}
                    onClick={() => finish(opt.key)}
                    className="flex w-full items-center gap-3 rounded-sm border border-border p-3 text-left hover:border-primary hover:bg-primary-soft disabled:opacity-50"
                  >
                    <opt.icon className="h-5 w-5 text-primary" />
                    <span className="flex-1">
                      <span className="block text-sm font-semibold text-fg">{opt.label}</span>
                      <span className="block text-xs text-fg-muted">{opt.desc}</span>
                    </span>
                    <ArrowRight className="h-4 w-4 text-fg-subtle" />
                  </button>
                ))}
              </div>
              <div className="mt-6 flex gap-2">
                <Button variant="outline" onClick={() => setStep(2)} disabled={busy}>
                  Back
                </Button>
                <Button variant="ghost" className="flex-1" onClick={() => finish("skip")} disabled={busy}>
                  {busy ? "Setting up…" : "Skip for now"}
                  {!busy && <Check className="h-4 w-4" />}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
