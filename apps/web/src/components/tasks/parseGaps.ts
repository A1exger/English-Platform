import type { GapSegment } from './types';

// App. Д — parse "I [go] every [day]." into a gap_fill draft. Mirrors the
// server parser so the constructor preview matches how it will be stored.
// (answer + full bank are for the author's preview; the real answerKey is
// derived and kept server-side.)
export function parseGaps(src: string): {
  segments: GapSegment[];
  answer: Record<string, string>;
  bank: string[];
} {
  const segments: GapSegment[] = [];
  const answer: Record<string, string> = {};
  const bank: string[] = [];
  let last = 0;
  let n = 0;
  const re = /\[([^\]]+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    if (m.index > last) segments.push(src.slice(last, m.index));
    const id = `g${++n}`;
    segments.push({ gap: id });
    answer[id] = m[1].trim();
    bank.push(m[1].trim());
    last = re.lastIndex;
  }
  if (last < src.length) segments.push(src.slice(last));
  return { segments, answer, bank };
}
