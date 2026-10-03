import {
  applyReview,
  intervalDaysFor,
  isDue,
  nextReviewAt,
} from './spaced-repetition';

describe('spaced repetition', () => {
  it('promotes the interval up the ladder and clamps at the top', () => {
    expect(intervalDaysFor(0)).toBe(0);
    expect(intervalDaysFor(1)).toBe(1);
    expect(intervalDaysFor(3)).toBe(7);
    expect(intervalDaysFor(999)).toBe(90);
  });

  it('a never-reviewed word is due now', () => {
    expect(isDue(0, null)).toBe(true);
    expect(nextReviewAt(2, null)).toBeNull();
  });

  it('schedules the next review reps-days out and gates due-ness', () => {
    const base = new Date('2026-01-01T00:00:00Z');
    // reps=1 -> +1 day
    const soon = new Date('2026-01-01T12:00:00Z');
    const later = new Date('2026-01-03T00:00:00Z');
    expect(isDue(1, base, soon)).toBe(false);
    expect(isDue(1, base, later)).toBe(true);
  });

  it('remember promotes, miss resets to zero', () => {
    expect(applyReview(2, true)).toBe(3);
    expect(applyReview(4, false)).toBe(0);
  });
});
