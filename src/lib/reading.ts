export interface Paragraph {
  index: number;
  text: string;
}

// Splits chapter text into paragraphs with a stable index, based on the
// paragraph's position in the chapter. Paragraph reactions (planned) will
// key off this index, so don't change how paragraphs are numbered without
// also migrating any stored reactions.
export function splitParagraphs(body: string): Paragraph[] {
  return body
    .split(/\n\s*\n/)
    .map((text) => text.trim())
    .filter((text) => text.length > 0)
    .map((text, index) => ({ index, text }));
}
