// Pure spaced-repetition schedule for the personal dictionary trainer (Phase 6).
// A Leitner-style ladder: each successful review promotes the word to a longer
// interval; a miss sends it back to the start. Kept I/O-free for unit testing.

/** Days until the next review, indexed by repetition streak. */
export const SR_INTERVALS_DAYS = [0, 1, 3, 7, 16, 35, 90];

export function intervalDaysFor(reps: number): number {
  const i = Math.min(Math.max(reps, 0), SR_INTERVALS_DAYS.length - 1);
  return SR_INTERVALS_DAYS[i];
}

/** When the word is next due; null (never reviewed) means "due now". */
export function nextReviewAt(reps: number, lastReviewedAt: Date | null): Date | null {
  if (!lastReviewedAt) return null;
  const d = new Date(lastReviewedAt);
  d.setUTCDate(d.getUTCDate() + intervalDaysFor(reps));
  return d;
}

export function isDue(
  reps: number,
  lastReviewedAt: Date | null,
  now: Date = new Date(),
): boolean {
  const next = nextReviewAt(reps, lastReviewedAt);
  return next === null || next.getTime() <= now.getTime();
}

/** New streak after a review: promote on remember, reset on miss. */
export function applyReview(reps: number, remembered: boolean): number {
  return remembered ? reps + 1 : 0;
}
