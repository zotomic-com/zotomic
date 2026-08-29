import type { Metadata } from "next";
import { CheckCircle2, MessageSquareText, ShieldCheck } from "lucide-react";
import { CtaBand, PageHero, Section } from "@/components/site/marketing";

export const metadata: Metadata = {
  title: "Zotomic Assistant",
  description:
    "An AI assistant that reads your business context, explains your metrics and reports, and performs a small set of low-risk actions with your confirmation.",
};

const CAN = [
  "Explain any metric or insight in this week's report",
  "Pull product, order and customer summaries on request",
  "Compare periods and surface what changed",
  "Draft a task list from the recommendations",
  "Update a product field or a setting — with your confirmation",
];

export default function AssistantPage() {
  return (
    <>
      <PageHero
        eyebrow="Zotomic Assistant"
        title="Ask your business a question"
        subtitle="The assistant works from your real, calculated numbers — it interprets them, it doesn't invent them."
      />
      <Section title="What it can do">
        <ul className="space-y-2">
          {CAN.map((c) => (
            <li key={c} className="flex items-start gap-2.5 text-sm text-fg-muted">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              {c}
            </li>
          ))}
        </ul>
      </Section>
      <Section>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <p className="mt-3 text-sm font-bold text-fg">Safe by design</p>
            <p className="mt-1 text-sm text-fg-muted">
              It can only read your own business&apos;s data, has no database access, and every
              consequential change needs your explicit approval.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
            <MessageSquareText className="h-5 w-5 text-primary" />
            <p className="mt-3 text-sm font-bold text-fg">Always optional</p>
            <p className="mt-1 text-sm text-fg-muted">
              The dashboard and reports work fully without it. The assistant adds investigation and
              controlled actions on top.
            </p>
          </div>
        </div>
      </Section>
      <CtaBand />
    </>
  );
}
