// The single, canonical interactive-task contract (SPEC §4 / App. A/В/Д).
//
// One payload/answerKey/state format and one grade/sanitize pair, shared by the
// course player, the live board and homework (SPEC §4 directives 1–3). The
// answerKey NEVER leaves the server (ДИ-3): `sanitize` produces the student
// payload; `grade` runs server-side only.
//
// This is intentionally a set of PURE functions (no I/O, no Nest deps) so it is
// trivially unit-tested and importable from any module. Shuffling of banks
// happens once, at instance/card creation, so both sides see the same layout.

export const TASK_TYPES = [
  'sentence_ordering',
  'word_matching',
  'gap_fill',
  'categorization',
  'multiple_choice',
] as const;
export type TaskType = (typeof TASK_TYPES)[number];

// ——— App. A shapes (loose Records at the boundary; branches cast) ———
export interface MatchPair {
  id: string;
  left: string;
  right: string;
}
export type GapSegment = string | { gap: string };
export interface Category {
  id: string;
  label: string;
}
export interface TaskItem {
  id: string;
  text: string;
}

export interface ExerciseResult {
  correct: boolean;
  score: number; // 0..100
  perToken?: Record<string, boolean>;
}

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase();

/** Percentage of per-token flags that are true (0 when there are none). */
const pct = (per: Record<string, boolean>): number => {
  const vals = Object.values(per);
  return vals.length ? Math.round((100 * vals.filter(Boolean).length) / vals.length) : 0;
};

/** Fisher–Yates; used to lay out banks so an ordering never leaks the answer. */
export function shuffle<T>(arr: T[]): T[] {
  const r = [...arr];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

/**
 * App. Д — parse constructor markup `"I [go] every [day]."` into a gap_fill
 * payload: ordered segments with `{gap:"g1"}` placeholders, the answer map
 * (server-only), and a bank seeded from the answers (distractors added later).
 */
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

/**
 * App. В — server-side grading. `sentence_ordering`/`multiple_choice` are
 * all-or-nothing; the drag types give partial credit with a per-token map so
 * the UI can mark each element. Comparison is case/space-insensitive for ids?
 * No — ids/indices are compared exactly; only free text would be normalised,
 * and none is compared here (answers are matched by id).
 */
export function grade(
  type: TaskType,
  payload: Record<string, unknown>,
  answerKey: Record<string, unknown>,
  state: Record<string, unknown>,
): ExerciseResult {
  switch (type) {
    case 'sentence_ordering': {
      const tokens = (payload.tokens as string[]) ?? [];
      const order = (state.order as number[]) ?? [];
      const produced = order.map((i) => tokens[i]);
      const correct =
        produced.length === tokens.length && produced.join('') === tokens.join('');
      return { correct, score: correct ? 100 : 0 };
    }
    case 'gap_fill': {
      const key = (answerKey as Record<string, string>) ?? {};
      const filled = (state.filled as Record<string, string | null>) ?? {};
      const per = Object.fromEntries(
        Object.entries(key).map(([g, a]) => [g, norm(filled[g]) === norm(a)]),
      );
      return { correct: Object.values(per).every(Boolean), score: pct(per), perToken: per };
    }
    case 'categorization': {
      const key = (answerKey as Record<string, string>) ?? {};
      const placement = (state.placement as Record<string, string | null>) ?? {};
      const per = Object.fromEntries(
        Object.entries(key).map(([i, c]) => [i, placement[i] === c]),
      );
      return { correct: Object.values(per).every(Boolean), score: pct(per), perToken: per };
    }
    case 'word_matching': {
      const pairs = (payload.pairs as MatchPair[]) ?? [];
      const links = (state.links as Record<string, string>) ?? {};
      const per = Object.fromEntries(pairs.map((p) => [p.id, links[p.id] === p.id]));
      return { correct: Object.values(per).every(Boolean), score: pct(per), perToken: per };
    }
    case 'multiple_choice': {
      const ok = state.choice === (answerKey as { correct: number }).correct;
      return { correct: ok, score: ok ? 100 : 0 };
    }
    default:
      return { correct: false, score: 0 };
  }
}

/**
 * App. В — the payload handed to a STUDENT. The answerKey is stored separately
 * and never included. word_matching is re-shaped into two shuffled columns;
 * the others pass through (their answers live in the answerKey, and the
 * sentence order / gap layout is driven by shuffled state seeded server-side).
 */
export function sanitize(
  type: TaskType,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  if (type === 'word_matching') {
    const pairs = (payload.pairs as MatchPair[]) ?? [];
    return {
      rightType: payload.rightType ?? 'text',
      left: shuffle(pairs.map((p) => ({ id: p.id, text: p.left }))),
      right: shuffle(pairs.map((p) => ({ id: p.id, text: p.right }))),
    };
  }
  // gap_fill / categorization / sentence_ordering / multiple_choice
  return payload;
}
