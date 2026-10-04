import { readFileSync } from 'fs';
import { join } from 'path';
import { TASK_TYPES } from './task-contract';

// The authoring UI names a task type by looking the type itself up as a message
// key — `t(type)`. A key that is simply absent does not fail a build or a
// render: next-intl prints the key path, so the tab reads "exercises.true_false"
// and, worse, an exercise saved without a title is stored AS that string
// (ExercisesView: `title: title || t(type)`), which the student then sees.
//
// The locale files are checked against each other elsewhere, and that check
// passes happily when a key is missing from all six at once — which is how
// true_false shipped unnamed. This is the check that catches it: the API owns
// the list of task types, so every type it accepts must have a label.
describe('task type labels', () => {
  const LOCALES = ['en', 'ru', 'de', 'fr', 'nl', 'ar'];
  const labels = (loc: string) =>
    JSON.parse(
      readFileSync(join(__dirname, '..', '..', '..', '..', 'web', 'messages', `${loc}.json`), 'utf8'),
    ).exercises as Record<string, string>;

  // The four pre-SPEC authoring types, graded by exercise.logic rather than by
  // the task contract. They are listed in ExercisesView as TYPES and go through
  // the same t(type) lookup, so they need labels for the same reason.
  const LEGACY = ['order', 'match', 'fill', 'categorize'];

  it.each(LOCALES)('names every task type in %s', (loc) => {
    const catalogue = labels(loc);
    const unnamed = [...TASK_TYPES, ...LEGACY].filter(
      (type) => typeof catalogue[type] !== 'string' || catalogue[type].trim() === '',
    );
    if (unnamed.length) {
      throw new Error(
        `${loc}: no label for ${unnamed.join(', ')} — the UI would show the raw key, ` +
          `and an untitled exercise would be saved under it`,
      );
    }
  });
});
