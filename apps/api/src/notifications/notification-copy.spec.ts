import { readFileSync } from 'fs';
import { join } from 'path';

// The same event is written twice: the API renders it for Telegram and email,
// the web app renders it for the bell, each from its own catalogue. That is how
// the two drifted apart — Telegram said "It is waiting for you in the Homework
// section" while the bell said "— it is waiting for review". Nothing can force
// the two wordings to stay identical (a bell item is not a message), but these
// hold the parts that must not diverge: the set of events, the languages they
// exist in, and the placeholders each one uses.
describe('notification copy', () => {
  const LOCALES = ['en', 'ru', 'de', 'fr', 'nl', 'ar'];
  const api = (loc: string) =>
    JSON.parse(
      readFileSync(join(__dirname, '..', 'i18n', loc, 'messages.json'), 'utf8'),
    ).notification as Record<string, string>;
  const web = (loc: string) =>
    JSON.parse(
      readFileSync(join(__dirname, '..', '..', '..', 'web', 'messages', `${loc}.json`), 'utf8'),
    ).notifications as Record<string, string>;

  /** Event keys, i.e. everything that is not a subject line or UI chrome. */
  const events = (catalogue: Record<string, string>, extra: string[] = []) =>
    Object.keys(catalogue)
      .filter((k) => !k.startsWith('subject') && !extra.includes(k))
      .sort();

  const CHROME = ['title', 'empty', 'markAll', 'generic'];

  it('covers the same events on both channels, in every language', () => {
    const expected = events(api('en'));
    for (const loc of LOCALES) {
      expect({ loc, keys: events(api(loc)) }).toEqual({ loc, keys: expected });
      expect({ loc, keys: events(web(loc), CHROME) }).toEqual({ loc, keys: expected });
    }
  });

  it('uses the placeholders the sender actually provides', () => {
    // The bell builds its text from the notification payload, which carries a
    // title and a student — no {time}. A message asking for one would render the
    // literal "{time}" to the reader.
    for (const loc of LOCALES) {
      for (const [key, text] of Object.entries(web(loc))) {
        if (CHROME.includes(key)) continue;
        const used = [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
        expect({ loc, key, used: used.filter((u) => !['title', 'student'].includes(u)) })
          .toEqual({ loc, key, used: [] });
      }
    }
  });

  it('says where to act, rather than only what happened', () => {
    // What made the old bell copy worse than the Telegram copy: it announced the
    // event and stopped. Every message should end up somewhere the reader can go.
    for (const loc of LOCALES) {
      for (const [key, text] of Object.entries(web(loc))) {
        if (CHROME.includes(key)) continue;
        // Two sentences at minimum: what happened, and where it is waiting.
        const sentences = text.split(/[.!?؟]+\s+/).filter(Boolean).length;
        expect({ loc, key, sentences }).toEqual({ loc, key, sentences: expect.any(Number) });
        if (sentences < 2) {
          throw new Error(`${loc}/${key} is a single sentence: "${text}"`);
        }
      }
    }
  });
});
