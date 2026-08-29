export function LegalPage({
  title,
  updated,
  sections,
}: {
  title: string;
  updated: string;
  sections: { h: string; p: string[] }[];
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <p className="text-xs font-bold uppercase tracking-widest text-primary">Legal</p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-navy">{title}</h1>
      <p className="mt-2 text-sm text-fg-subtle">Last updated: {updated}</p>

      <div className="mt-8 space-y-6">
        {sections.map((s, i) => (
          <section key={i}>
            <h2 className="text-lg font-bold text-fg">{s.h}</h2>
            {s.p.map((para, j) => (
              <p key={j} className="mt-2 text-sm leading-relaxed text-fg-muted">
                {para}
              </p>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
