import type { Paragraph, TextRun } from "@/lib/chapterContent";

// Safe render of one paragraph's rich runs. Emits only <strong> and
// <em> around plain text — no dangerouslySetInnerHTML anywhere.
export function ParagraphRuns({ runs }: { runs: TextRun[] }) {
  return (
    <>
      {runs.map((r, i) => renderRun(r, i))}
    </>
  );
}

function renderRun(run: TextRun, i: number) {
  if (run.b) return <strong key={i}>{run.t}</strong>;
  if (run.i) return <em key={i}>{run.t}</em>;
  return <span key={i}>{run.t}</span>;
}

export function AuthorNote({
  position,
  text,
}: {
  position: "top" | "bottom";
  text: string | null | undefined;
}) {
  if (!text || !text.trim()) return null;
  const label = position === "top" ? "Author's note (before)" : "Author's note (after)";
  return (
    <aside
      className={
        "my-6 rounded-lg border border-dashed border-current/30 bg-current/[0.04] px-4 py-3 text-sm " +
        (position === "top" ? "" : "italic")
      }
    >
      <p className="mb-1 text-xs uppercase tracking-wide opacity-70">{label}</p>
      <p className="whitespace-pre-line">{text}</p>
    </aside>
  );
}

// A helper for rendering the whole paragraph list in reader-only
// contexts (e.g. the paragraph discussion page's quote block) where
// we don't need reactions attached.
export function PlainParagraphList({ paragraphs }: { paragraphs: Paragraph[] }) {
  return (
    <div className="space-y-4">
      {paragraphs.map((p) => (
        <ParagraphBlock key={p.pid} paragraph={p} />
      ))}
    </div>
  );
}

function ParagraphBlock({ paragraph }: { paragraph: Paragraph }) {
  if (paragraph.kind === "break") {
    return (
      <div className="my-4 text-center text-xl opacity-50" aria-hidden>
        &sect; &sect; &sect;
      </div>
    );
  }
  if (paragraph.kind === "h") {
    return (
      <h3 className="text-lg font-semibold">
        <ParagraphRuns runs={paragraph.runs} />
      </h3>
    );
  }
  if (paragraph.kind === "quote") {
    return (
      <blockquote className="border-l-2 border-current/40 pl-4 italic">
        <ParagraphRuns runs={paragraph.runs} />
      </blockquote>
    );
  }
  return (
    <p>
      <ParagraphRuns runs={paragraph.runs} />
    </p>
  );
}
