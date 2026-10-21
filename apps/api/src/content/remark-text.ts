// Backfill markup into lesson text written before RichText existed.
//
// Pages are not rewritten on deploy — this is a pure module driven by an
// explicit script (see DEPLOY.md §8.4), dry-run by default. Rewriting a
// tutor's own writing is not something a migration should do quietly.
//
// The rules are ordered by how much they GUESS. Two are faithful readings of
// what is already in the data:
//
//   * a single newline the author typed is a break they meant, so it becomes a
//     paragraph break rather than the line break RichText renders today;
//   * the lesson's own wordlist is the list of terms it teaches, so marking the
//     first occurrence of each is reading the data, not inventing emphasis.
//
// One is a heuristic, kept narrow: a short line with no closing punctuation,
// followed by something longer, is a section heading. That is the shape of
// "A new word out of old ones" above its paragraph.
//
// And one thing is deliberately NOT done: a text that arrives as a single
// unbroken run is left alone. Splitting prose at sentence boundaries guesses
// where a thought ends, and guessing wrong is worse than the wall of text.
// Those pages are reported instead, for a human to break up.

export type TextShape =
  /** Already has blank lines — RichText renders paragraphs from it today. */
  | 'paragraphs'
  /** Single newlines only: breaks the author typed, promotable. */
  | 'line-breaks'
  /** One unbroken run. Nothing faithful to do; needs a human. */
  | 'one-run'
  | 'empty';

export function textShape(text?: string | null): TextShape {
  const t = (text ?? '').replace(/\r\n/g, '\n').trim();
  if (!t) return 'empty';
  if (/\n[ \t]*\n/.test(t)) return 'paragraphs';
  if (t.includes('\n')) return 'line-breaks';
  return 'one-run';
}

/** A line that closes a sentence, allowing a trailing quote or bracket. */
const endsSentence = (line: string) => /[.!?…][")'»\]]?$/.test(line.trim());

/**
 * A section heading: short, at least two words, no closing punctuation beyond a
 * question mark, and followed by a real paragraph.
 *
 * "Followed by a real paragraph" is doing the work. In text that already has
 * blank lines a heading and a short instruction line look identical — both are
 * a short line above a longer one — so the guard is the size of what follows:
 * a heading introduces a body, while "Read the text" sits above another short
 * line. Eighty characters is about a sentence and a half.
 *
 * A question mark is allowed because an article's title is so often a question
 * — "How do new words appear?" is the heading of the page this was written for.
 * The cost is that a standalone question closing a paragraph can be misread as
 * a heading, which is why the script proposes changes before writing them.
 */
const MIN_BODY = 80;

function looksLikeHeading(line: string, next: string | undefined): boolean {
  const l = line.trim();
  if (!l || l.length > 60) return false;
  if (/[.!,:;…]$/.test(l)) return false;
  if (l.split(/\s+/).length < 2) return false;
  const body = next?.trim() ?? '';
  return body.length >= MIN_BODY && body.length > l.length;
}

/** Escape a wordlist term for use inside a RegExp. */
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface RemarkResult {
  text: string;
  /** Newlines promoted to paragraph breaks. */
  paragraphs: number;
  /** Lines turned into `## …`. */
  headings: number;
  /** Wordlist terms that got their first occurrence marked. */
  bolded: string[];
  shape: TextShape;
}

/**
 * Add markup to one page's text. Idempotent: a heading already written as `#`
 * is left as it is, and a term already inside `**` is not marked again, so
 * running this twice changes nothing the second time.
 *
 * @param words the lesson's wordlist entries, longest first is not required —
 *              they are sorted here so "wake up" wins over "wake".
 */
export function remarkText(text: string | null | undefined, words: string[] = []): RemarkResult {
  const shape = textShape(text);
  const src = (text ?? '').replace(/\r\n/g, '\n').trim();
  if (shape === 'empty' || shape === 'one-run') {
    return { text: src, paragraphs: 0, headings: 0, bolded: [], shape };
  }

  // ——— blocks: promote typed newlines, join lines wrapped mid-sentence ———
  const lines = src.split('\n');
  const blocks: { kind: 'heading' | 'text'; text: string }[] = [];
  let buffer: string[] = [];
  let paragraphs = 0;
  let headings = 0;
  const flush = () => {
    if (buffer.length) {
      blocks.push({ kind: 'text', text: buffer.join(' ') });
      buffer = [];
    }
  };
  const nextNonEmpty = (from: number) => lines.slice(from).map((l) => l.trim()).find(Boolean);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      // A blank line the author already put in: that is a block boundary.
      flush();
      continue;
    }
    if (/^#{1,3}\s/.test(line)) {
      flush();
      blocks.push({ kind: 'heading', text: line });
      continue;
    }
    if (looksLikeHeading(line, nextNonEmpty(i + 1))) {
      flush();
      blocks.push({ kind: 'heading', text: `## ${line}` });
      headings++;
      continue;
    }
    buffer.push(line);
    // Only a line that closes a sentence ends a paragraph. A line broken
    // mid-sentence is a hard wrap and is joined back up instead.
    if (endsSentence(line)) {
      const wasSingleNewline = i + 1 < lines.length && lines[i + 1].trim() !== '';
      flush();
      if (wasSingleNewline) paragraphs++;
    }
  }
  flush();

  // ——— bold: the lesson's own vocabulary, first occurrence, once each ———
  const bolded: string[] = [];
  const terms = [...new Set(words.map((w) => w.trim()).filter(Boolean))].sort(
    (a, b) => b.length - a.length,
  );
  for (const block of blocks) {
    if (block.kind === 'heading') continue; // a heading is already emphasis
    for (const term of terms) {
      if (bolded.includes(term)) continue;
      const re = new RegExp(`(?<![\\w*])(${escapeRe(term)})(?![\\w*])`, 'i');
      if (!re.test(block.text)) continue;
      // Already marked by hand somewhere in this text? Leave it alone.
      if (new RegExp(`\\*\\*[^*]*${escapeRe(term)}[^*]*\\*\\*`, 'i').test(src)) continue;
      block.text = block.text.replace(re, '**$1**');
      bolded.push(term);
    }
  }

  return {
    text: blocks.map((b) => b.text).join('\n\n'),
    paragraphs,
    headings,
    bolded,
    shape,
  };
}
