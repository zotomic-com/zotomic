import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";

export function PageHero({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 text-center sm:px-6 sm:py-16">
      {eyebrow && (
        <p className="text-xs font-bold uppercase tracking-widest text-primary">{eyebrow}</p>
      )}
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-navy sm:text-5xl">{title}</h1>
      {subtitle && (
        <p className="mx-auto mt-4 max-w-xl text-pretty text-base text-fg-muted sm:text-lg">
          {subtitle}
        </p>
      )}
      {children && <div className="mt-8">{children}</div>}
    </div>
  );
}

export function Section({
  title,
  description,
  className,
  children,
}: {
  title?: string;
  description?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("mx-auto max-w-5xl px-4 py-10 sm:px-6", className)}>
      {title && <h2 className="text-2xl font-extrabold tracking-tight text-navy">{title}</h2>}
      {description && <p className="mt-2 max-w-2xl text-sm text-fg-muted">{description}</p>}
      <div className={cn(title && "mt-6")}>{children}</div>
    </section>
  );
}

export function FeatureGrid({
  items,
}: {
  items: { icon: LucideIcon; title: string; text: string }[];
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((f) => (
        <div key={f.title} className="rounded-lg border border-border bg-surface p-5 shadow-sm">
          <f.icon className="h-5 w-5 text-primary" />
          <p className="mt-3 text-sm font-bold text-fg">{f.title}</p>
          <p className="mt-1 text-sm text-fg-muted">{f.text}</p>
        </div>
      ))}
    </div>
  );
}

export function Steps({
  items,
}: {
  items: { title: string; text: string }[];
}) {
  return (
    <ol className="grid gap-4 sm:grid-cols-3">
      {items.map((s, i) => (
        <li key={s.title} className="rounded-lg border border-border bg-surface p-5 shadow-sm">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary-soft text-sm font-bold text-primary">
            {i + 1}
          </span>
          <p className="mt-3 text-sm font-bold text-fg">{s.title}</p>
          <p className="mt-1 text-sm text-fg-muted">{s.text}</p>
        </li>
      ))}
    </ol>
  );
}

export function CtaBand({
  title = "Ready to see your business clearly?",
  subtitle = "Start free — no credit card required.",
}: {
  title?: string;
  subtitle?: string;
}) {
  return (
    <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <div className="rounded-lg border border-border bg-primary-soft px-6 py-10 text-center">
        <h2 className="text-xl font-extrabold text-navy sm:text-2xl">{title}</h2>
        <p className="mt-2 text-sm text-fg-muted">{subtitle}</p>
        <Button href="/signup" size="lg" className="mt-5">
          Start free <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </section>
  );
}
