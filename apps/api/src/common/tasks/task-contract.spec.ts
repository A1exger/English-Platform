import { grade, sanitize, parseGaps } from './task-contract';

describe('task-contract grade()', () => {
  it('sentence_ordering: all-or-nothing', () => {
    const payload = { tokens: ['I', 'have', 'never', 'been', 'to', 'London'] };
    expect(grade('sentence_ordering', payload, {}, { order: [0, 1, 2, 3, 4, 5] })).toEqual({
      correct: true,
      score: 100,
    });
    // one swap -> wrong -> 0 (no partial credit for ordering)
    expect(grade('sentence_ordering', payload, {}, { order: [1, 0, 2, 3, 4, 5] })).toEqual({
      correct: false,
      score: 0,
    });
  });

  it('gap_fill: partial credit + per-token map', () => {
    const answerKey = { g1: 'go', g2: 'day' };
    const all = grade('gap_fill', {}, answerKey, { filled: { g1: 'go', g2: 'day' } });
    expect(all).toEqual({ correct: true, score: 100, perToken: { g1: true, g2: true } });

    const half = grade('gap_fill', {}, answerKey, { filled: { g1: 'go', g2: null } });
    expect(half.correct).toBe(false);
    expect(half.score).toBe(50);
    expect(half.perToken).toEqual({ g1: true, g2: false });

    const none = grade('gap_fill', {}, answerKey, { filled: { g1: 'week', g2: 'going' } });
    expect(none.score).toBe(0);
  });

  it('categorization: partial credit by item id', () => {
    const answerKey = { i1: 'verbs', i2: 'nouns' };
    expect(grade('categorization', {}, answerKey, { placement: { i1: 'verbs', i2: 'nouns' } }).score).toBe(100);
    const partial = grade('categorization', {}, answerKey, { placement: { i1: 'verbs', i2: 'verbs' } });
    expect(partial.score).toBe(50);
    expect(partial.perToken).toEqual({ i1: true, i2: false });
  });

  it('word_matching: correct link is same pair id', () => {
    const payload = {
      pairs: [
        { id: 'p1', left: 'cat', right: 'кошка' },
        { id: 'p2', left: 'dog', right: 'собака' },
      ],
    };
    expect(grade('word_matching', payload, {}, { links: { p1: 'p1', p2: 'p2' } }).score).toBe(100);
    const swapped = grade('word_matching', payload, {}, { links: { p1: 'p2', p2: 'p1' } });
    expect(swapped.score).toBe(0);
    expect(swapped.perToken).toEqual({ p1: false, p2: false });
  });

  it('multiple_choice: exact index match', () => {
    expect(grade('multiple_choice', {}, { correct: 1 }, { choice: 1 })).toEqual({ correct: true, score: 100 });
    expect(grade('multiple_choice', {}, { correct: 1 }, { choice: 0 })).toEqual({ correct: false, score: 0 });
  });
});

describe('task-contract sanitize()', () => {
  it('word_matching: two shuffled columns, no answer leaked', () => {
    const payload = {
      rightType: 'text',
      pairs: [
        { id: 'p1', left: 'cat', right: 'кошка' },
        { id: 'p2', left: 'dog', right: 'собака' },
      ],
    };
    const out = sanitize('word_matching', payload) as {
      left: { id: string; text: string }[];
      right: { id: string; text: string }[];
    };
    // no `pairs` (which would reveal left↔right); only detached columns
    expect((out as Record<string, unknown>).pairs).toBeUndefined();
    expect(out.left.map((x) => x.text).sort()).toEqual(['cat', 'dog']);
    expect(out.right.map((x) => x.text).sort()).toEqual(['кошка', 'собака']);
  });

  it('gap_fill/categorization payloads never carry the answerKey', () => {
    const gap = sanitize('gap_fill', { segments: ['I ', { gap: 'g1' }, '.'], bank: ['go', 'day'] });
    expect(JSON.stringify(gap)).not.toContain('answerKey');
    const cat = sanitize('categorization', {
      categories: [{ id: 'verbs', label: 'Verbs' }],
      items: [{ id: 'i1', text: 'run' }],
    }) as { items: { text: string; category?: string }[] };
    // items carry no category
    expect(cat.items[0].category).toBeUndefined();
  });
});

describe('task-contract parseGaps()', () => {
  it('extracts ordered segments, answers and a bank from [markup]', () => {
    const { segments, answer, bank } = parseGaps('I [go] to school every [day].');
    expect(answer).toEqual({ g1: 'go', g2: 'day' });
    expect(bank).toEqual(['go', 'day']);
    // segments interleave text and gap placeholders in order
    expect(segments[0]).toBe('I ');
    expect(segments[1]).toEqual({ gap: 'g1' });
    expect(segments).toContainEqual({ gap: 'g2' });
  });
});
