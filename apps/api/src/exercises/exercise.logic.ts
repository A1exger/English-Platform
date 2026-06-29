import { BadRequestException } from '@nestjs/common';

export const EXERCISE_TYPES = ['order', 'match', 'fill', 'categorize'] as const;
export type ExerciseType = (typeof EXERCISE_TYPES)[number];

export interface CheckResult {
  score: number; // 0..100
  correct: boolean;
  total: number;
  right: number;
}

function shuffle<T>(arr: T[]): T[] {
  const r = [...arr];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase();

/** Parse fill-in text like "I [go] to [school]." into segments + answers. */
export function parseFill(text: string): {
  segments: ({ text: string } | { blank: number })[];
  answers: string[];
} {
  const segments: ({ text: string } | { blank: number })[] = [];
  const answers: string[] = [];
  const re = /\[([^\]]+)\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) segments.push({ text: text.slice(last, m.index) });
    segments.push({ blank: answers.length });
    answers.push(m[1].trim());
    last = re.lastIndex;
  }
  if (last < text.length) segments.push({ text: text.slice(last) });
  return { segments, answers };
}

/** Validate a template payload for the given type (throws on bad input). */
export function validatePayload(type: ExerciseType, payload: unknown): void {
  const p = (payload ?? {}) as Record<string, unknown>;
  const fail = (msg: string) => {
    throw new BadRequestException(`Invalid exercise: ${msg}`);
  };
  if (type === 'order') {
    const words = p.words as unknown[];
    if (!Array.isArray(words) || words.length < 2 || words.some((w) => !norm(w)))
      fail('need at least 2 words');
  } else if (type === 'match') {
    const pairs = p.pairs as { left: unknown; right: unknown }[];
    if (!Array.isArray(pairs) || pairs.length < 2) fail('need at least 2 pairs');
    if (pairs.some((x) => !norm(x?.left) || !norm(x?.right))) fail('empty pair');
  } else if (type === 'fill') {
    const text = String(p.text ?? '');
    if (parseFill(text).answers.length < 1) fail('need at least one [blank]');
  } else if (type === 'categorize') {
    const categories = p.categories as unknown[];
    const items = p.items as { text: unknown; category: unknown }[];
    if (!Array.isArray(categories) || categories.length < 2)
      fail('need at least 2 categories');
    if (!Array.isArray(items) || items.length < 2) fail('need at least 2 items');
    const set = new Set(categories.map((c) => String(c)));
    if (items.some((it) => !norm(it?.text) || !set.has(String(it?.category))))
      fail('item with empty text or unknown category');
  } else {
    fail('unknown type');
  }
}

/**
 * Build the student-facing question WITHOUT the solution. `seed`-free random
 * shuffle is fine since the answer key never leaves the server.
 */
export function toQuestion(
  type: ExerciseType,
  title: string,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  if (type === 'order') {
    return {
      type,
      title,
      prompt: payload.prompt ?? null,
      tokens: shuffle(payload.words as string[]),
    };
  }
  if (type === 'match') {
    const pairs = payload.pairs as { left: string; right: string }[];
    return {
      type,
      title,
      lefts: pairs.map((p) => p.left),
      rights: shuffle(pairs.map((p) => p.right)),
    };
  }
  if (type === 'fill') {
    const { segments, answers } = parseFill(String(payload.text));
    const distractors = (payload.distractors as string[]) ?? [];
    return {
      type,
      title,
      segments,
      blanks: answers.length,
      bank: shuffle([...answers, ...distractors]),
    };
  }
  // categorize
  const items = payload.items as { text: string; category: string }[];
  return {
    type,
    title,
    categories: payload.categories,
    items: shuffle(items.map((i) => i.text)),
  };
}

/** Score a student's state against the stored solution. */
export function checkAnswer(
  type: ExerciseType,
  payload: Record<string, unknown>,
  state: Record<string, unknown>,
): CheckResult {
  let total = 0;
  let right = 0;

  if (type === 'order') {
    const words = payload.words as string[];
    const order = (state.order as string[]) ?? [];
    total = words.length;
    for (let i = 0; i < words.length; i++) if (norm(order[i]) === norm(words[i])) right++;
  } else if (type === 'match') {
    const pairs = payload.pairs as { left: string; right: string }[];
    const map = (state.map as Record<string, string>) ?? {};
    total = pairs.length;
    for (const p of pairs) if (norm(map[p.left]) === norm(p.right)) right++;
  } else if (type === 'fill') {
    const { answers } = parseFill(String(payload.text));
    const given = (state.answers as string[]) ?? [];
    total = answers.length;
    for (let i = 0; i < answers.length; i++) if (norm(given[i]) === norm(answers[i])) right++;
  } else if (type === 'categorize') {
    const items = payload.items as { text: string; category: string }[];
    const placement = (state.placement as Record<string, string>) ?? {};
    total = items.length;
    for (const it of items) if (norm(placement[it.text]) === norm(it.category)) right++;
  }

  const score = total ? Math.round((right / total) * 100) : 0;
  return { score, correct: total > 0 && right === total, total, right };
}
