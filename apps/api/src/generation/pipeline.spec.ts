import { extractJson } from './ai-client';
import { normalizeLessonPlan, normalizeSkeleton, normalizeTask, parseBrief } from './pipeline';

describe('generation pipeline (pure)', () => {
  it('parseBrief validates topic/level and clamps counts', () => {
    const b = parseBrief({ topic: 'Present Perfect', level: 'Intermediate', units: 99, lessonsPerUnit: 50, aspects: ['Grammar', 'Bogus'] });
    expect(b.units).toBe(12); // clamped to max
    expect(b.lessonsPerUnit).toBe(10); // clamped to max
    expect(b.aspects).toEqual(['Grammar']); // invalid aspect dropped
    expect(() => parseBrief({ topic: '', level: 'Intermediate' })).toThrow();
    expect(() => parseBrief({ topic: 'x', level: 'B1' })).toThrow(); // not a CONTENT_LEVEL
  });

  it('normalizeTask keeps valid tasks and drops/repairs bad ones (К403)', () => {
    expect(normalizeTask({ type: 'sentence_ordering', payload: { words: ['I', 'go'] } })?.gradingMode).toBe('AUTO');
    expect(normalizeTask({ type: 'sentence_ordering', payload: { words: ['only'] } })).toBeNull();
    // gap_fill needs a bracketed answer
    expect(normalizeTask({ type: 'gap_fill', payload: { text: 'no gaps here' } })).toBeNull();
    expect(normalizeTask({ type: 'gap_fill', payload: { text: 'I [go].' } })).not.toBeNull();
    // MCQ correct must be one of the options
    expect(normalizeTask({ type: 'multiple_choice', payload: { question: 'Q', options: ['a', 'b'] }, answerKey: { correct: 'z' } })).toBeNull();
    expect(normalizeTask({ type: 'multiple_choice', payload: { question: 'Q', options: ['a', 'b'] }, answerKey: { correct: 'a' } })).not.toBeNull();
    // unknown type dropped; unknown aspect repaired to Grammar
    expect(normalizeTask({ type: 'bogus', payload: {} })).toBeNull();
    expect(
      normalizeTask({ type: 'word_matching', aspect: 'Nonsense', payload: { pairs: [{ left: 'a', right: 'b' }, { left: 'c', right: 'd' }] } })?.aspect,
    ).toBe('Grammar');
  });

  it('normalizeSkeleton clamps to the brief and rejects an empty skeleton', () => {
    const brief = parseBrief({ topic: 't', level: 'Intermediate', units: 2, lessonsPerUnit: 1 });
    const sk = normalizeSkeleton(
      {
        units: [
          { title: 'U1', lessons: [{ title: 'L1', objectives: ['o'] }, { title: 'L2', objectives: [] }] },
          { title: 'U2', lessons: [{ title: 'L3', objectives: [] }] },
          { title: 'U3', lessons: [{ title: 'L4', objectives: [] }] }
        ]
      },
      brief,
    );
    expect(sk.units).toHaveLength(2); // clamped to brief.units
    expect(sk.units[0].lessons).toHaveLength(1); // clamped to lessonsPerUnit
    expect(() => normalizeSkeleton({ units: [] }, brief)).toThrow();
  });

  it('normalizeLessonPlan drops malformed tasks + empty wordlist entries', () => {
    const plan = normalizeLessonPlan({
      pages: [
        {
          type: 'practice',
          text: 'x',
          tasks: [
            { type: 'sentence_ordering', payload: { words: ['a', 'b'] } },
            { type: 'multiple_choice', payload: { question: 'Q', options: ['a'] } } // < 2 options -> dropped
          ]
        }
      ],
      wordlist: [{ word: 'run', translation: 'бежать' }, { word: '' }],
      grammar: { title: 'T', meaning: 'M', form: 'F' }
    });
    expect(plan.pages[0].tasks).toHaveLength(1);
    expect(plan.wordlist).toHaveLength(1);
    expect(plan.grammar?.title).toBe('T');
  });

  it('extractJson handles fenced, prose-wrapped, and string-brace JSON', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Here you go: {"b":2} enjoy')).toEqual({ b: 2 });
    expect(extractJson('{"s":"a}b"}')).toEqual({ s: 'a}b' });
  });
});
