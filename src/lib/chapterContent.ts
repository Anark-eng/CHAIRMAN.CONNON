// Canonical shape of a chapter's paragraphs, mirroring the JSONB
// stored on chapters.paragraphs (see supabase/migrations/0008_editor.sql).
//
// The reader never runs dangerouslySetInnerHTML over any of this: the
// paragraph renderer only emits <p>, <h3>, <blockquote>, <hr>,
// <strong>, <em>, and it walks this typed structure directly.

export type ParagraphKind = "p" | "h" | "quote" | "break";

export interface TextRun {
  t: string;
  b?: true;
  i?: true;
}

export interface Paragraph {
  pid: string;
  kind: ParagraphKind;
  runs: TextRun[];
}

// The empty paragraphs value — jsonb "[]".
export const EMPTY_PARAGRAPHS: Paragraph[] = [];

// A crypto-strong uuid the browser can produce during autosave, so the
// pid we hand back to the server matches what the DB will accept as a
// uuid. Falls back to Math.random on ancient runtimes.
export function randomPid(): string {
  const g = globalThis as { crypto?: Crypto };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ---------------------------------------------------------------------------
// Runs <-> plain text
// ---------------------------------------------------------------------------
export function runsToText(runs: TextRun[]): string {
  return runs.map((r) => r.t).join("");
}

export function paragraphToPlainText(p: Paragraph): string {
  if (p.kind === "break") return "* * *";
  if (p.kind === "quote") return `> ${runsToText(p.runs)}`;
  if (p.kind === "h") return `# ${runsToText(p.runs)}`;
  return runsToText(p.runs);
}

// Reader-facing joined-plain-text fallback (kept in the chapters.body
// column too so search / old code paths keep working).
export function paragraphsToBody(paragraphs: Paragraph[]): string {
  return paragraphs.map(paragraphToPlainText).join("\n\n");
}

// ---------------------------------------------------------------------------
// Markdown-lite: the small syntax the editor's textarea speaks. Keeps
// the editor phone-friendly (a plain textarea works everywhere) and
// makes injection impossible (we never store HTML).
//
// Recognised tokens per paragraph:
//   #  ... — heading (kind: h)
//   >  ... — block quote (kind: quote)
//   ---    — scene break (kind: break; text ignored)
//   ***    — scene break too, same thing
//   otherwise — regular paragraph (kind: p)
//
// Inline within a paragraph:
//   **bold**   — bold run
//   *italic*   — italic run
//
// Nothing else is recognised. Anything that looks like HTML is treated
// as literal text (the sanitiser strips real HTML on the way in from a
// paste event; markdown-lite never survives to HTML at all).
// ---------------------------------------------------------------------------

const INLINE_RE = /(\*\*[^*]+?\*\*|\*[^*]+?\*)/g;

function parseInline(text: string): TextRun[] {
  if (!text) return [{ t: "" }];
  const runs: TextRun[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE_RE)) {
    const start = match.index ?? 0;
    if (start > last) runs.push({ t: text.slice(last, start) });
    const token = match[0];
    if (token.startsWith("**")) {
      runs.push({ t: token.slice(2, -2), b: true });
    } else {
      runs.push({ t: token.slice(1, -1), i: true });
    }
    last = start + token.length;
  }
  if (last < text.length) runs.push({ t: text.slice(last) });
  return runs.filter((r) => r.t.length > 0);
}

function runsToMarkdown(runs: TextRun[]): string {
  return runs
    .map((r) => {
      if (r.b) return `**${r.t}**`;
      if (r.i) return `*${r.t}*`;
      return r.t;
    })
    .join("");
}

export function paragraphsToMarkdown(paragraphs: Paragraph[]): string {
  return paragraphs
    .map((p) => {
      if (p.kind === "break") return "---";
      const body = runsToMarkdown(p.runs);
      if (p.kind === "h") return `# ${body}`;
      if (p.kind === "quote") return `> ${body}`;
      return body;
    })
    .join("\n\n");
}

// Parse a markdown-lite blob into a paragraph list WITHOUT pids. The
// caller (usually assignPids) will attach them by diff against the
// existing paragraph list so unchanged paragraphs keep their identity.
export interface ParsedParagraph {
  kind: ParagraphKind;
  runs: TextRun[];
  plain: string; // normalised plain text, used for diff matching
}

export function parseMarkdownParagraphs(input: string): ParsedParagraph[] {
  // Collapse runs of blank lines, trim trailing spaces per line.
  const cleaned = input
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");

  const blocks = cleaned.split(/\n\s*\n/);
  const out: ParsedParagraph[] = [];
  for (const raw of blocks) {
    const block = raw.trim();
    if (!block) continue;
    if (/^(-{3,}|\*{3,})$/.test(block)) {
      out.push({ kind: "break", runs: [], plain: "---" });
      continue;
    }
    if (block.startsWith("# ")) {
      const text = block.slice(2).trim();
      out.push({ kind: "h", runs: parseInline(text), plain: `h:${text}` });
      continue;
    }
    if (block.startsWith("> ")) {
      const text = block
        .split("\n")
        .map((l) => l.replace(/^>\s?/, ""))
        .join(" ")
        .trim();
      out.push({ kind: "quote", runs: parseInline(text), plain: `q:${text}` });
      continue;
    }
    // A regular paragraph — a newline inside a paragraph block is
    // treated as a soft join.
    const joined = block.split("\n").map((l) => l.trim()).filter(Boolean).join(" ");
    out.push({ kind: "p", runs: parseInline(joined), plain: `p:${joined}` });
  }
  return out;
}

// Attach a pid to each parsed paragraph. If a paragraph's plain form
// matches an existing paragraph exactly, reuse that pid so reactions
// and comments follow the paragraph across an edit. A brand-new
// paragraph gets a fresh pid — the caller (server action) decides
// whether the ones that DROPPED had reactions/comments and warns the
// author accordingly.
export function assignPids(parsed: ParsedParagraph[], existing: Paragraph[]): Paragraph[] {
  const availableByPlain = new Map<string, string[]>();
  for (const p of existing) {
    const key = plainKeyForParagraph(p);
    const arr = availableByPlain.get(key) ?? [];
    arr.push(p.pid);
    availableByPlain.set(key, arr);
  }
  return parsed.map((p) => {
    const arr = availableByPlain.get(p.plain);
    let pid: string;
    if (arr && arr.length > 0) {
      pid = arr.shift()!;
    } else {
      pid = randomPid();
    }
    return { pid, kind: p.kind, runs: p.runs };
  });
}

function plainKeyForParagraph(p: Paragraph): string {
  if (p.kind === "break") return "---";
  const text = runsToText(p.runs);
  if (p.kind === "h") return `h:${text}`;
  if (p.kind === "quote") return `q:${text}`;
  return `p:${text}`;
}

// Compute which pids from `before` are no longer in `after`. Used by
// the save action to warn the author about paragraphs with reactions
// or comments about to disappear.
export function droppedPids(before: Paragraph[], after: Paragraph[]): string[] {
  const kept = new Set(after.map((p) => p.pid));
  return before.map((p) => p.pid).filter((pid) => !kept.has(pid));
}

// ---------------------------------------------------------------------------
// Word count / character count / reading time
// ---------------------------------------------------------------------------
export interface ChapterStats {
  words: number;
  characters: number;
  readingMinutes: number;
}

const WORDS_PER_MINUTE = 250;

export function paragraphsStats(paragraphs: Paragraph[]): ChapterStats {
  let characters = 0;
  let words = 0;
  for (const p of paragraphs) {
    if (p.kind === "break") continue;
    const text = runsToText(p.runs).trim();
    if (!text) continue;
    characters += text.length;
    words += text.split(/\s+/).filter(Boolean).length;
  }
  return {
    words,
    characters,
    readingMinutes: Math.max(1, Math.round(words / WORDS_PER_MINUTE)),
  };
}

export function markdownStats(md: string): ChapterStats {
  return paragraphsStats(assignPids(parseMarkdownParagraphs(md), []));
}

// ---------------------------------------------------------------------------
// Paste sanitisation.
// Turns pasted HTML from Word / Google Docs / a browser into the same
// markdown-lite the editor already speaks. Keeps paragraph breaks,
// bold, italics. Drops fonts, sizes, colours, background shading, and
// every other attribute. Never returns HTML.
// ---------------------------------------------------------------------------
export function pasteHtmlToMarkdown(html: string): string {
  // Strip Microsoft Word conditional comments and style/script blocks
  // outright. These carry no text a reader wants to see.
  const cleaned = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");

  if (typeof DOMParser === "undefined") {
    // Server-side fallback: strip HTML tags entirely and treat as plain
    // text. The client normally handles paste, so this branch is only
    // used by tests.
    return htmlEntitiesToText(cleaned.replace(/<[^>]+>/g, ""));
  }

  const doc = new DOMParser().parseFromString(cleaned, "text/html");
  const parts: string[] = [];
  walk(doc.body, parts);
  const joined = parts.join("\n\n");
  return joined
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function walk(node: Node, out: string[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    // Text nodes at the top level become their own paragraphs only when
    // they're surrounded by other block elements; here we just collect
    // them and let the enclosing block emit them.
    const text = (node.nodeValue ?? "").replace(/[\u00a0\u2028\u2029]/g, " ");
    if (text.trim()) out.push(text);
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as Element;
  const tag = el.tagName.toLowerCase();

  if (tag === "br") {
    out.push("\n");
    return;
  }
  if (tag === "hr") {
    out.push("---");
    return;
  }
  if (tag === "h1" || tag === "h2" || tag === "h3" || tag === "h4") {
    const inline = collectInline(el);
    if (inline.trim()) out.push(`# ${inline.trim()}`);
    return;
  }
  if (tag === "blockquote") {
    const inline = collectInline(el).trim();
    if (inline) out.push(`> ${inline}`);
    return;
  }
  if (tag === "p" || tag === "div" || tag === "li") {
    const inline = collectInline(el).trim();
    if (inline) out.push(inline);
    return;
  }
  // Anything else: descend and let child block elements emit their own
  // paragraphs; inline elements get folded into the parent via
  // collectInline when it's called from a block ancestor.
  for (const child of Array.from(el.childNodes)) walk(child, out);
}

function collectInline(el: Element): string {
  let out = "";
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      out += (child.nodeValue ?? "").replace(/[\u00a0\u2028\u2029]/g, " ");
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const c = child as Element;
      const tag = c.tagName.toLowerCase();
      if (tag === "br") {
        out += " ";
      } else if (tag === "strong" || tag === "b") {
        const inner = collectInline(c).trim();
        if (inner) out += `**${inner}**`;
      } else if (tag === "em" || tag === "i") {
        const inner = collectInline(c).trim();
        if (inner) out += `*${inner}*`;
      } else {
        out += collectInline(c);
      }
    }
  }
  return out.replace(/\s+/g, " ");
}

function htmlEntitiesToText(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&(?:apos|#x27);/g, "'");
}
