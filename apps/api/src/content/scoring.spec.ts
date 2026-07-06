import {
  computeCourseCompletion,
  computeGoalForecast,
  computeGoalProgress,
  computeLessonResult,
  GradedTask,
} from './scoring';

const auto = (aspect: string, score: number): GradedTask => ({
  gradingMode: 'AUTO',
  aspect,
  score,
  completed: true,
});

describe('computeLessonResult (INV-4/INV-5)', () => {
  it('matches the reference case: 8.7/9.6/10/8.9/10/9.3 -> overall 9.4, Reading 8.8, Grammar 9.7', () => {
    const tasks: GradedTask[] = [
      auto('Reading', 8.7),
      auto('Grammar', 9.6),
      auto('Grammar', 10),
      auto('Reading', 8.9),
      auto('Grammar', 10),
      auto('Grammar', 9.3),
    ];
    const r = computeLessonResult(tasks);
    expect(r.overall).toBe(9.4);
    expect(r.perAspect.Reading).toBe(8.8);
    expect(r.perAspect.Grammar).toBe(9.7);
    expect(r.completion).toBe(100);
    expect(r.motivationTier).toBe('excellent');
  });

  it('MANUAL and COMPLETION tasks never enter the numeric aggregate (INV-5)', () => {
    const tasks: GradedTask[] = [
      auto('Grammar', 8),
      { gradingMode: 'MANUAL', aspect: 'Writing', score: 2, completed: true },
      { gradingMode: 'COMPLETION', aspect: 'Speaking', score: 0, completed: false },
    ];
    const r = computeLessonResult(tasks);
    expect(r.overall).toBe(8);
    expect(r.perAspect.Writing).toBeUndefined();
    expect(r.perAspect.Speaking).toBeUndefined();
    // completion counts every grading mode: 2 of 3 done
    expect(r.completion).toBe(67);
  });

  it('aspect comes from the explicit tag, never the title (INV-6)', () => {
    // "Grammar context: reading" tagged as Reading must land in Reading.
    const r = computeLessonResult([auto('Reading', 7.0), auto('Grammar', 9.0)]);
    expect(r.perAspect.Reading).toBe(7.0);
    expect(r.perAspect.Grammar).toBe(9.0);
  });

  it('no AUTO tasks -> overall null, tier keepGoing', () => {
    const r = computeLessonResult([
      { gradingMode: 'COMPLETION', aspect: 'Speaking', score: null, completed: true },
    ]);
    expect(r.overall).toBeNull();
    expect(r.completion).toBe(100);
    expect(r.motivationTier).toBe('keepGoing');
  });
});

describe('progress counters (INV-3)', () => {
  const lessons = [
    { optional: false, completed: true, overall: 9.4 },
    { optional: false, completed: true, overall: 7.0 },
    { optional: false, completed: false, overall: null },
    { optional: false, completed: false, overall: null },
    { optional: true, completed: true, overall: 8.0 },
    { optional: true, completed: false, overall: null },
  ];

  it('courseCompletion counts only required lessons in the denominator', () => {
    // 2 of 4 required done; optional excluded entirely.
    expect(computeCourseCompletion(lessons)).toBe(50);
  });

  it('goalProgress averages ALL completed lessons including optional', () => {
    // (9.4 + 7.0 + 8.0) / 3 = 8.133 -> 8.1
    expect(computeGoalProgress(lessons)).toBe(8.1);
  });

  it('empty inputs are safe', () => {
    expect(computeCourseCompletion([])).toBe(0);
    expect(computeGoalProgress([])).toBeNull();
  });

  it('goal forecast projects the current average and counts required remaining', () => {
    const f = computeGoalForecast(lessons);
    // projected = goalProgress (8.1); required not done = 2 (optional excluded)
    expect(f.projected).toBe(8.1);
    expect(f.remaining).toBe(2);
  });
});
