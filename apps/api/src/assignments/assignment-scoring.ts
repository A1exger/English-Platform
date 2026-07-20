// Pure helpers for content assignments (homework/lesson): task snapshotting
// (INV-7) and result aggregation (INV-3/INV-4/INV-5). Kept free of I/O so the
// invariants are trivially unit-testable, mirroring content/scoring.ts.

import { GradingMode } from '../common/constants/enums';
import {
  computeLessonResult,
  GradedTask,
  LessonResultAggregate,
} from '../content/scoring';
import { scoreContentTask, toContentQuestion } from '../content/task-check';

/** Shape of a stored LessonTask (payload/answerKey are JSON strings). */
export interface TaskLike {
  id: string;
  type: string;
  gradingMode: string;
  aspect: string;
  estimatedMinutes: number;
  payload: string;
  answerKey: string | null;
}

/** A fully-materialized snapshot of a task, stored on a HomeworkCard (INV-7). */
export interface CardSnapshot {
  taskId: string;
  type: string;
  gradingMode: GradingMode;
  aspect: string;
  estimatedMinutes: number;
  /** Full payload (may reveal the solution): SERVER-ONLY, never sent as-is. */
  payload: Record<string, unknown>;
  answerKey: Record<string, unknown> | null;
}

/**
 * INV-7: copy every task field into an independent snapshot. Once taken, later
 * edits to the master task can never change this object (it holds parsed copies,
 * not references), so already-assigned homework is frozen.
 */
export function snapshotTask(task: TaskLike): CardSnapshot {
  return {
    taskId: task.id,
    type: task.type,
    gradingMode: task.gradingMode as GradingMode,
    aspect: task.aspect,
    estimatedMinutes: task.estimatedMinutes,
    payload: JSON.parse(task.payload) as Record<string, unknown>,
    answerKey: task.answerKey
      ? (JSON.parse(task.answerKey) as Record<string, unknown>)
      : null,
  };
}

/** Student-facing card: sanitized question only, never the solution. */
export function cardQuestion(cardId: string, snapshot: CardSnapshot) {
  return {
    id: cardId,
    taskId: snapshot.taskId,
    type: snapshot.type,
    gradingMode: snapshot.gradingMode,
    aspect: snapshot.aspect,
    estimatedMinutes: snapshot.estimatedMinutes,
    question: toContentQuestion(snapshot.type, snapshot.payload),
  };
}

export interface CardGrade {
  /** AUTO score 0–10; null for MANUAL/COMPLETION or an unanswered card. */
  score: number | null;
  completed: boolean;
  /** Revealed after an AUTO submission so the student can review. */
  solution: Record<string, unknown> | null;
}

/**
 * Grade one card against its OWN snapshot (INV-5): AUTO -> 0–10 score;
 * MANUAL/COMPLETION -> completed only, no number. A card with no answer yet
 * (state === null) counts as not completed.
 */
export function scoreCard(
  snapshot: CardSnapshot,
  state: Record<string, unknown> | null,
): CardGrade {
  if (snapshot.gradingMode !== 'AUTO') {
    return { score: null, completed: true, solution: null };
  }
  if (!state) return { score: null, completed: false, solution: null };
  const r = scoreContentTask(snapshot.type, snapshot.answerKey ?? {}, state);
  return { score: r.score, completed: true, solution: snapshot.answerKey };
}

/**
 * Aggregate a set of already-graded cards into a LessonResult (INV-3/4/5).
 * A GradedTask is exactly the per-card grade the aggregate needs.
 */
export function resultFromCards(cards: GradedTask[]): LessonResultAggregate {
  return computeLessonResult(cards);
}
