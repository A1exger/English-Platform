// Pure aggregate functions for lesson results and progress counters.
// INV-3, INV-4, INV-5: kept free of I/O so they are trivially unit-testable.

import { Aspect, GradingMode } from '../common/constants/enums';

export interface GradedTask {
  gradingMode: GradingMode;
  aspect: Aspect | string;
  /** 0–10 score; only meaningful for AUTO tasks. */
  score: number | null;
  /** Whether the student finished the task (any grading mode). */
  completed: boolean;
}

export interface LessonResultAggregate {
  /** Rounded to 1 decimal; null when the lesson has no scored AUTO tasks. */
  overall: number | null;
  /** aspect -> rounded mean of AUTO scores for that aspect (INV-4/INV-6). */
  perAspect: Record<string, number>;
  /** 0–100, share of completed tasks of any grading mode. */
  completion: number;
  motivationTier: MotivationTier;
}

export type MotivationTier = 'excellent' | 'good' | 'keepGoing';

const round1 = (x: number): number => Math.round(x * 10) / 10;
const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;

/** Motivation tier thresholds (documented product choice). */
export function motivationTierFor(overall: number | null): MotivationTier {
  if (overall === null) return 'keepGoing';
  if (overall >= 9) return 'excellent';
  if (overall >= 7) return 'good';
  return 'keepGoing';
}

/**
 * INV-4 + INV-5: the numeric aggregate uses ONLY AUTO tasks with a score.
 * `overall` = mean of all AUTO scores; `perAspect` = mean of AUTO scores per
 * explicit aspect tag. Both rounded to 1 decimal. MANUAL/COMPLETION tasks
 * contribute to `completion` only.
 */
export function computeLessonResult(tasks: GradedTask[]): LessonResultAggregate {
  const auto = tasks.filter(
    (t) => t.gradingMode === 'AUTO' && t.score !== null && !Number.isNaN(t.score),
  );

  const overall = auto.length ? round1(mean(auto.map((t) => t.score as number))) : null;

  const perAspect: Record<string, number> = {};
  const byAspect = new Map<string, number[]>();
  for (const t of auto) {
    const arr = byAspect.get(t.aspect) ?? [];
    arr.push(t.score as number);
    byAspect.set(t.aspect, arr);
  }
  for (const [aspect, scores] of byAspect) {
    perAspect[aspect] = round1(mean(scores));
  }

  const completion = tasks.length
    ? Math.round((tasks.filter((t) => t.completed).length / tasks.length) * 100)
    : 0;

  return { overall, perAspect, completion, motivationTier: motivationTierFor(overall) };
}

export interface LessonProgressInput {
  optional: boolean;
  completed: boolean;
  /** overall score of the finished lesson (null if not finished / no AUTO). */
  overall: number | null;
}

/**
 * INV-3a: structural course completion. The denominator counts ONLY required
 * (optional=false) lessons; optional lessons never appear in it (nor in the
 * numerator). Returns 0–100.
 */
export function computeCourseCompletion(lessons: LessonProgressInput[]): number {
  const required = lessons.filter((l) => !l.optional);
  if (required.length === 0) return 0;
  const done = required.filter((l) => l.completed).length;
  return Math.round((done / required.length) * 100);
}

/**
 * INV-3b: goal progress. Mean of overall scores across ALL completed lessons,
 * INCLUDING optional ones. Rounded to 1 decimal; null when nothing scored yet.
 */
export function computeGoalProgress(lessons: LessonProgressInput[]): number | null {
  const scored = lessons.filter((l) => l.completed && l.overall !== null);
  if (scored.length === 0) return null;
  return round1(mean(scored.map((l) => l.overall as number)));
}
