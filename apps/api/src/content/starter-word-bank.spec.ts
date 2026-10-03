import { STARTER_WORD_BANK } from './starter-word-bank';
import { STARTER_WORD_SENSES } from './starter-word-senses';

// The bank is data, and data rots quietly: a word added with five of the six
// locales looks fine in Russian and shows Russian to a German reader. These
// check the pack the way a reader meets it — every word, every language.
describe('starter word bank', () => {
  const LOCALES = ['en', 'ru', 'de', 'fr', 'nl', 'ar'];
  const words = STARTER_WORD_BANK.flatMap((g) => g.words);

  it('glosses every word in every locale', () => {
    const gaps = words
      .map((w) => ({ word: w.word, missing: LOCALES.filter((l) => !w.translations[l]?.trim()) }))
      .filter((r) => r.missing.length > 0);
    expect(gaps).toEqual([]);
  });

  it('has no duplicate words — `word` is unique, so a duplicate silently drops one', () => {
    const seen = new Map<string, number>();
    for (const w of words) seen.set(w.word, (seen.get(w.word) ?? 0) + 1);
    expect([...seen].filter(([, n]) => n > 1)).toEqual([]);
  });

  it('glosses every sense in every locale except English, which the definition is', () => {
    const gaps: { word: string; missing: string[] }[] = [];
    for (const [word, senses] of Object.entries(STARTER_WORD_SENSES)) {
      for (const s of senses) {
        const missing = LOCALES.filter((l) => l !== 'en' && !s.translations[l]?.trim());
        if (missing.length || !s.definition.trim()) gaps.push({ word, missing });
      }
    }
    expect(gaps).toEqual([]);
  });

  it('only carries senses for words that are in the bank', () => {
    const known = new Set(words.map((w) => w.word.toLowerCase()));
    expect(Object.keys(STARTER_WORD_SENSES).filter((w) => !known.has(w))).toEqual([]);
  });

  it('gives every sense more than one meaning to choose between', () => {
    // A single-sense entry is the default case and needs no sense rows; if one
    // appears here it is half-finished data, not polysemy.
    expect(Object.entries(STARTER_WORD_SENSES).filter(([, s]) => s.length < 2).map(([w]) => w)).toEqual([]);
  });
});
