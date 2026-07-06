// Pure scoring of a content LessonTask against its stored answerKey.
// Scores are on the 0–10 scale (1 decimal), matching lesson aggregates (INV-4).

import { toQuestion } from '../exercises/exercise.logic';

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase();
const round1 = (x: number) => Math.round(x * 10) / 10;

export interface TaskCheckResult {
  score: number; // 0..10
  correct: boolean;
  total: number;
  right: number;
}

/** Compare a student's state with the answer key for an AUTO task. */
export function scoreContentTask(
  type: string,
  answerKey: Record<string, unknown>,
  state: Record<string, unknown>,
): TaskCheckResult {
  let total = 0;
  let right = 0;

  if (type === 'sentence_ordering') {
    const key = (answerKey.order as string[]) ?? [];
    const given = (state.order as string[]) ?? [];
    total = key.length;
    for (let i = 0; i < key.length; i++) if (norm(given[i]) === norm(key[i])) right++;
  } else if (type === 'word_matching') {
    const key = (answerKey.map as Record<string, string>) ?? {};
    const given = (state.map as Record<string, string>) ?? {};
    const lefts = Object.keys(key);
    total = lefts.length;
    for (const l of lefts) if (norm(given[l]) === norm(key[l])) right++;
  } else if (type === 'gap_fill') {
    const key = (answerKey.answers as string[]) ?? [];
    const given = (state.answers as string[]) ?? [];
    total = key.length;
    for (let i = 0; i < key.length; i++) if (norm(given[i]) === norm(key[i])) right++;
  } else if (type === 'categorization') {
    const key = (answerKey.placement as Record<string, string>) ?? {};
    const given = (state.placement as Record<string, string>) ?? {};
    const items = Object.keys(key);
    total = items.length;
    for (const it of items) if (norm(given[it]) === norm(key[it])) right++;
  } else if (type === 'multiple_choice') {
    total = 1;
    if (norm(state.answer) === norm(answerKey.correct)) right = 1;
  }

  const score = total ? round1((right / total) * 10) : 0;
  return { score, correct: total > 0 && right === total, total, right };
}

/**
 * Student-facing question for a content task: never contains the solution.
 * The 4 drag-drop types reuse the exercise sanitizer (shuffled banks); the
 * rest pass through their prompt-like payloads (answers live in answerKey).
 */
export function toContentQuestion(
  type: string,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  if (type === 'sentence_ordering') return toQuestion('order', '', payload);
  if (type === 'word_matching') return toQuestion('match', '', payload);
  if (type === 'gap_fill') return toQuestion('fill', '', payload);
  if (type === 'categorization') return toQuestion('categorize', '', payload);
  // multiple_choice / audio / essay / discussion
  return { type, ...payload };
}
