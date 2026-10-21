import { remarkText, textShape } from './remark-text';

// What the backfill must and must not do to a tutor's own writing. The "must
// not" half matters more: this runs over content that already exists.
describe('remarkText', () => {
  describe('textShape', () => {
    it('tells the three cases apart', () => {
      expect(textShape('A.\n\nB.')).toBe('paragraphs');
      expect(textShape('A.\nB.')).toBe('line-breaks');
      expect(textShape('A single run of prose.')).toBe('one-run');
      expect(textShape('   ')).toBe('empty');
      expect(textShape(null)).toBe('empty');
    });
  });

  it('leaves an unbroken run completely alone', () => {
    // The case where any change would be a guess about where a thought ends.
    const src =
      'Everyone is aware of how English is evolving. Many new terms are added ' +
      'to the dictionary each month. But from where do they all originate?';
    const r = remarkText(src, ['English']);
    expect(r).toEqual({
      text: src,
      paragraphs: 0,
      headings: 0,
      bolded: [],
      shape: 'one-run',
    });
  });

  it('promotes newlines the author typed into paragraphs', () => {
    const r = remarkText('First thought.\nSecond thought.\nThird thought.');
    expect(r.text).toBe('First thought.\n\nSecond thought.\n\nThird thought.');
    expect(r.paragraphs).toBe(2);
  });

  it('joins a line broken mid-sentence rather than splitting it', () => {
    // Hard-wrapped prose: the newline is not a break the author meant.
    const r = remarkText('Everyone is aware of how English\nis evolving today.');
    expect(r.text).toBe('Everyone is aware of how English is evolving today.');
    expect(r.paragraphs).toBe(0);
  });

  it('marks a short unpunctuated line above a paragraph as a heading', () => {
    const body =
      'By joining two words that already exist in the language, we can create new words. ' +
      'Everybody knows such words as brunch, which first appeared over a hundred years ago.';
    const r = remarkText(`A new word out of old ones\n${body}`);
    expect(r.text).toBe(`## A new word out of old ones\n\n${body}`);
    expect(r.headings).toBe(1);
  });

  it('marks a heading across a blank line too', () => {
    // The dominant real case: the model already put a blank line in, so the
    // heading and its body are separate blocks before we touch anything.
    const body =
      'Another well-known characteristic of English is its propensity for adopting ' +
      'vocabulary from other languages, and coffee is the obvious example.';
    const r = remarkText(`Adopting words from another language\n\n${body}`);
    expect(r.headings).toBe(1);
    expect(r.text).toBe(`## Adopting words from another language\n\n${body}`);
  });

  it('marks a question used as an article title', () => {
    // The heading of the page this was written for is a question, so a question
    // mark cannot disqualify one.
    const body =
      'Everyone is aware of how English is evolving. Many new terms are added to the ' +
      'dictionary each month, and most come from a handful of familiar processes.';
    const r = remarkText(`How do new words appear?\n${body}`);
    expect(r.headings).toBe(1);
    expect(r.text).toBe(`## How do new words appear?\n\n${body}`);
  });

  it('leaves a short instruction line as a paragraph', () => {
    // Structurally identical to a heading — short line, longer line under it —
    // so the guard is the size of the body: an instruction has no body.
    const src = 'Read the text\n\nNow answer the questions below carefully.';
    const r = remarkText(src);
    expect(r.headings).toBe(0);
    expect(r.text).toBe(src);
  });

  it('bolds the first occurrence of each wordlist term, once', () => {
    const r = remarkText(
      'People often say brunch these days.\nA barista makes coffee, and a barista knows brunch too.',
      ['brunch', 'barista'],
    );
    expect(r.bolded.sort()).toEqual(['barista', 'brunch']);
    // First occurrence only — the repeats stay plain.
    expect(r.text).toBe(
      'People often say **brunch** these days.\n\nA **barista** makes coffee, and a barista knows brunch too.',
    );
  });

  it('prefers the longer term when two overlap', () => {
    const r = remarkText('I wake up at seven.\nThen I have breakfast.', ['wake', 'wake up']);
    expect(r.text).toContain('**wake up**');
    expect(r.text).not.toContain('**wake** up');
  });

  it('never bolds inside a word', () => {
    const r = remarkText('The barista and the baristas are here.\nShe arrives early.', ['barista']);
    expect(r.text).toContain('**barista** and');
    expect(r.text).not.toContain('**barista**s');
  });

  it('leaves a term the tutor already bolded alone', () => {
    const r = remarkText('We drink a **latte** here.\nWe also drink latte there.', ['latte']);
    expect(r.bolded).toEqual([]);
    expect(r.text).toBe('We drink a **latte** here.\n\nWe also drink latte there.');
  });

  it('keeps a heading the tutor wrote as they wrote it', () => {
    const r = remarkText('### My own heading\nSome body text follows it here.');
    expect(r.text).toBe('### My own heading\n\nSome body text follows it here.');
    expect(r.headings).toBe(0);
  });

  it('is idempotent — a second pass changes nothing', () => {
    const src =
      'How do new words appear?\nEveryone is aware of how English is evolving.\n' +
      'A new word out of old ones\nEverybody knows such words as brunch by now.';
    const once = remarkText(src, ['brunch', 'English']);
    const twice = remarkText(once.text, ['brunch', 'English']);
    expect(twice.text).toBe(once.text);
    expect(twice.headings).toBe(0);
    expect(twice.bolded).toEqual([]);
  });

  it('survives a term with regex punctuation in it', () => {
    const r = remarkText('Use the (very) odd term here.\nThen carry on.', ['(very)']);
    expect(r.text).toContain('**(very)**');
  });
});
