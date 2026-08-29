/** Renders the `## Heading` + blank-line-paragraph format used by platform pages. */

interface Block {
  heading: string | null;
  paras: string[];
}

export function parseDoc(body: string): Block[] {
  const blocks: Block[] = [];
  let current: Block = { heading: null, paras: [] };
  for (const raw of body.split("\n")) {
    const line = raw.trimEnd();
    if (line.startsWith("## ")) {
      if (current.heading || current.paras.length) blocks.push(current);
      current = { heading: line.slice(3).trim(), paras: [] };
    } else if (line.trim() === "") {
      current.paras.push("");
    } else {
      const last = current.paras[current.paras.length - 1];
      if (last === "" || last === undefined) current.paras.push(line);
      else current.paras[current.paras.length - 1] = `${last} ${line}`;
    }
  }
  if (current.heading || current.paras.length) blocks.push(current);
  return blocks.map((b) => ({ ...b, paras: b.paras.filter(Boolean) }));
}

export function RichLegal({ title, body, updated }: { title: string; body: string; updated?: string | null }) {
  const blocks = parseDoc(body);
  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <p className="text-xs font-bold uppercase tracking-widest text-primary">Legal</p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-navy">{title}</h1>
      {updated && (
        <p className="mt-2 text-sm text-fg-subtle">
          Last updated: {new Date(updated).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
        </p>
      )}
      <div className="mt-8 space-y-6">
        {blocks.map((b, i) => (
          <section key={i}>
            {b.heading && <h2 className="text-lg font-bold text-fg">{b.heading}</h2>}
            {b.paras.map((p, j) => (
              <p key={j} className="mt-2 text-sm leading-relaxed text-fg-muted">
                {p}
              </p>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

export function RichFaq({ title, body, updated }: { title: string; body: string; updated?: string | null }) {
  const blocks = parseDoc(body).filter((b) => b.heading);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: blocks.map((b) => ({
      "@type": "Question",
      name: b.heading,
      acceptedAnswer: { "@type": "Answer", text: b.paras.join(" ") },
    })),
  };
  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      {blocks.length > 0 && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      )}
      <p className="text-xs font-bold uppercase tracking-widest text-primary">Help</p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-navy">{title}</h1>
      {updated && (
        <p className="mt-2 text-sm text-fg-subtle">
          Updated {new Date(updated).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
        </p>
      )}
      <dl className="mt-8 divide-y divide-border">
        {blocks.map((b, i) => (
          <div key={i} className="py-5">
            <dt className="text-base font-bold text-fg">{b.heading}</dt>
            {b.paras.map((p, j) => (
              <dd key={j} className="mt-2 text-sm leading-relaxed text-fg-muted">
                {p}
              </dd>
            ))}
          </div>
        ))}
      </dl>
    </div>
  );
}
