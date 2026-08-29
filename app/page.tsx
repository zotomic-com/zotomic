import Link from "next/link";
import { ShieldCheck, Eye, Lightbulb, Target } from "lucide-react";
import { Button } from "@/components/ui/button";

const STEPS = [
  { icon: Eye, title: "SEE", text: "what's happening across your business." },
  { icon: Lightbulb, title: "UNDERSTAND", text: "why it matters, with clear insights and context." },
  { icon: Target, title: "ACT", text: "on what matters and grow with confidence." },
];

export default function HomePage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:py-24">
      <p className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-fg-muted">
        <ShieldCheck className="h-3.5 w-3.5 text-primary" />
        Business intelligence, without the complexity.
      </p>

      <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-navy sm:text-6xl">
        See. <span className="text-primary">Understand.</span> Act.
      </h1>
      <p className="mx-auto mt-4 max-w-md text-base text-fg-muted sm:text-lg">
        Turn your business data into clarity — and clarity into action.
      </p>

      <div className="mt-8 flex flex-col items-center gap-3">
        <Button href="/signup" size="lg">
          Start free
        </Button>
        <p className="text-xs text-fg-subtle">No credit card required · Start in minutes</p>
      </div>

      <div className="mt-16 grid gap-8 border-t border-border pt-12 sm:grid-cols-3">
        {STEPS.map((s) => (
          <div key={s.title} className="flex flex-col items-center">
            <s.icon className="h-6 w-6 text-primary" />
            <p className="mt-3 text-sm font-bold tracking-wide text-navy">{s.title}</p>
            <p className="mt-1 max-w-[16rem] text-sm text-fg-muted">{s.text}</p>
          </div>
        ))}
      </div>

      <p className="mt-16 text-xs text-fg-subtle">
        Homepage scaffold — the full mockup build lands in Phase 1.{" "}
        <Link href="/how-it-works" className="underline">
          How it works
        </Link>
      </p>
    </div>
  );
}
