import {
  CardSnapshot,
  cardQuestion,
  resultFromCards,
  scoreCard,
  snapshotTask,
  TaskLike,
} from './assignment-scoring';
import { GradedTask } from '../content/scoring';

const mc = (correct: string): TaskLike => ({
  id: 't1',
  type: 'multiple_choice',
  gradingMode: 'AUTO',
  aspect: 'Grammar',
  estimatedMinutes: 5,
  payload: JSON.stringify({ question: 'Pick a', options: ['a', 'b', 'c'] }),
  answerKey: JSON.stringify({ correct }),
});

describe('snapshotTask (INV-7)', () => {
  it('freezes the task: later edits to the master never change the snapshot', () => {
    const master = mc('a');
    const snap = snapshotTask(master);

    // The tutor edits the master task AFTER assigning.
    master.answerKey = JSON.stringify({ correct: 'b' });
    master.payload = JSON.stringify({ question: 'CHANGED', options: ['x'] });

    // The snapshot is an independent copy, unaffected by the edit.
    expect(snap.answerKey).toEqual({ correct: 'a' });
    expect(snap.payload).toEqual({ question: 'Pick a', options: ['a', 'b', 'c'] });
  });

  it('grades a card against its own snapshot, not the live master', () => {
    const master = mc('a');
    const snap = snapshotTask(master);
    master.answerKey = JSON.stringify({ correct: 'b' }); // master changed to 'b'

    // Student answered 'a' — still correct against the frozen snapshot.
    expect(scoreCard(snap, { answer: 'a' }).score).toBe(10);
    expect(scoreCard(snap, { answer: 'b' }).score).toBe(0);
  });

  it('sanitized card question never leaks the answer key', () => {
    const snap = snapshotTask(mc('a'));
    const q = cardQuestion('card1', snap);
    expect(JSON.stringify(q)).not.toContain('answerKey');
    expect(q.id).toBe('card1');
    expect(q.aspect).toBe('Grammar');
  });
});

describe('scoreCard (INV-5)', () => {
  it('MANUAL/COMPLETION complete without a number; unanswered AUTO is incomplete', () => {
    const manual: CardSnapshot = {
      taskId: 'e',
      type: 'essay',
      gradingMode: 'MANUAL',
      aspect: 'Writing',
      estimatedMinutes: 10,
      payload: {},
      answerKey: null,
    };
    expect(scoreCard(manual, { text: 'hi' })).toEqual({
      score: null,
      completed: true,
      solution: null,
    });
    const auto = snapshotTask(mc('a'));
    expect(scoreCard(auto, null).completed).toBe(false);
  });
});

describe('resultFromCards (INV-4)', () => {
  it('aggregates snapshotted card grades exactly like a lesson result', () => {
    const cards: GradedTask[] = [
      { gradingMode: 'AUTO', aspect: 'Reading', score: 8.7, completed: true },
      { gradingMode: 'AUTO', aspect: 'Grammar', score: 9.6, completed: true },
      { gradingMode: 'AUTO', aspect: 'Grammar', score: 10, completed: true },
      { gradingMode: 'AUTO', aspect: 'Reading', score: 8.9, completed: true },
      { gradingMode: 'AUTO', aspect: 'Grammar', score: 10, completed: true },
      { gradingMode: 'AUTO', aspect: 'Grammar', score: 9.3, completed: true },
    ];
    const r = resultFromCards(cards);
    expect(r.overall).toBe(9.4);
    expect(r.perAspect.Reading).toBe(8.8);
    expect(r.perAspect.Grammar).toBe(9.7);
    expect(r.motivationTier).toBe('excellent');
  });
});
