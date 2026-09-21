'use client';

import { ReactNode } from 'react';

// A deliberately small slice of Markdown for lesson text: a heading, real
// paragraphs, a bold term, an italic gloss. That is what the generator already
// writes into a reading page (pipeline.ts asks it for a 150-300 word article),
// and until now all of it arrived as one run-on paragraph.
//
// Two properties matter more than features here:
//
//  * Nothing authored before this renders differently. Text with no blank line
//    and no `*` is still exactly one <p> with the same string.
//  * It builds React nodes, never HTML. Lesson text can come from an AI, so
//    there is no route from a generated article to injected markup.
//
// Underscores are deliberately NOT emphasis. `word_matching` and `snake_case`
// appear in this material, and CommonMark's intraword rules are a lot of
// machinery to buy something nobody writing a lesson will miss.

/** Index of the closing `mark`, or -1 when this opener has no valid partner. */
function findClose(src: string, from: number, mark: string): number {
  let i = from;
  while (i < src.length) {
    const at = src.indexOf(mark, i);
    if (at < 0) return -1;
    const inner = src.slice(from, at);
    // An empty span, or one padded with spaces, is punctuation rather than
    // emphasis: "2 * 3 * 4" and "a ** b" must survive as themselves.
    if (inner.length > 0 && !/^\s/.test(inner) && !/\s$/.test(inner)) return at;
    i = at + mark.length;
  }
  return -1;
}

/** `**bold**` and `*italic*`, nestable; anything unpaired stays literal. */
export function inlineNodes(src: string, keyBase = 'i'): ReactNode[] {
  const out: ReactNode[] = [];
  let plain = '';
  let i = 0;
  let k = 0;
  const flush = () => {
    if (plain) {
      out.push(plain);
      plain = '';
    }
  };
  while (i < src.length) {
    if (src[i] === '*') {
      const mark = src.startsWith('**', i) ? '**' : '*';
      const close = findClose(src, i + mark.length, mark);
      if (close >= 0) {
        flush();
        const inner = src.slice(i + mark.length, close);
        const key = `${keyBase}-${k++}`;
        out.push(
          mark === '**' ? (
            <strong key={key}>{inlineNodes(inner, key)}</strong>
          ) : (
            <em key={key}>{inlineNodes(inner, key)}</em>
          ),
        );
        i = close + mark.length;
        continue;
      }
    }
    plain += src[i];
    i++;
  }
  flush();
  return out;
}

/** Single newlines become line breaks; a blank line starts a new block. */
function withBreaks(src: string, keyBase: string): ReactNode[] {
  const lines = src.split('\n');
  return lines.flatMap((line, i) =>
    i === 0
      ? inlineNodes(line, `${keyBase}-0`)
      : [<br key={`${keyBase}-br${i}`} />, ...inlineNodes(line, `${keyBase}-${i}`)],
  );
}

/**
 * Lesson text as blocks. Blank lines separate paragraphs; a leading `#` makes a
 * heading. A single newline is a line break rather than a space, because pages
 * written before blank lines meant anything use one newline per paragraph —
 * collapsing those would keep the wall of text this exists to end.
 *
 * The lesson title owns <h2>, so a heading inside the text starts at <h3>.
 */
export function RichText({ text }: { text?: string | null }) {
  if (!text) return null;
  const blocks = text.split(/\n[ \t]*\n+/);
  return (
    <>
      {blocks.map((raw, b) => {
        const block = raw.trim();
        if (!block) return null;
        const heading = /^(#{1,3})\s+(.*)$/s.exec(block);
        if (heading) {
          const body = inlineNodes(heading[2].trim(), `h${b}`);
          return heading[1].length >= 3 ? (
            <h4 key={b} className="rich-h4">{body}</h4>
          ) : (
            <h3 key={b} className="rich-h3">{body}</h3>
          );
        }
        return (
          <p key={b} className="rich-p">
            {withBreaks(block, `p${b}`)}
          </p>
        );
      })}
    </>
  );
}

/** The same text with its marks removed — for one-line previews and teasers. */
export function plainText(src?: string | null): string {
  if (!src) return '';
  return src
    .replace(/^#{1,3}\s+/gm, '')
    .replace(/\*\*(\S(?:.*?\S)?)\*\*/gs, '$1')
    .replace(/\*(\S(?:.*?\S)?)\*/gs, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}
