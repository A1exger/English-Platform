/**
 * The picture a lesson opens on when the tutor has not uploaded one.
 *
 * Half-illustrated courses look worse than plain ones: the eye reads the empty
 * lessons as unfinished. So every lesson gets a picture — the tutor's own if
 * there is one, otherwise a scene from this set, chosen by what the lesson is
 * about and, failing that, by its id so the same lesson always opens on the
 * same scene rather than shuffling on every visit.
 *
 * The scenes carry no words on purpose. The platform speaks six languages and
 * two of them are read right to left; a drawing with a caption in it would be
 * wrong in five of those and would have to be redrawn for each.
 */
const SCENES = [
  'home',
  'school',
  'food',
  'travel',
  'family',
  'work',
  'nature',
  'free_time',
] as const;

type Scene = (typeof SCENES)[number];

/**
 * Words that put a lesson on a scene. Lesson titles are written in the language
 * the tutor thinks in, so the common ones are listed in English and Russian;
 * anything unmatched falls through to the id-based pick, which is never wrong,
 * only arbitrary.
 */
const KEYWORDS: Record<Scene, string[]> = {
  home: ['home', 'house', 'routine', 'daily', 'my day', 'morning', 'evening', 'room', 'flat', 'дом', 'распорядок', 'мой день', 'утро', 'вечер', 'комнат', 'квартир'],
  school: ['school', 'lesson', 'class', 'study', 'grammar', 'exam', 'homework', 'tense', 'present', 'past', 'future', 'verb', 'vocabul', 'школ', 'урок', 'класс', 'учеб', 'граммат', 'экзамен', 'глагол', 'лексик'],
  food: ['food', 'eat', 'drink', 'meal', 'cook', 'restaurant', 'breakfast', 'lunch', 'dinner', 'еда', 'ед', 'пищ', 'ресторан', 'завтрак', 'обед', 'ужин', 'готов'],
  travel: ['travel', 'trip', 'holiday', 'airport', 'hotel', 'journey', 'transport', 'city', 'путеш', 'поезд', 'отпуск', 'аэропорт', 'отел', 'транспорт', 'город'],
  family: ['family', 'friend', 'people', 'relative', 'parent', 'child', 'семь', 'друз', 'люд', 'родител', 'ребён', 'дет'],
  work: ['work', 'job', 'office', 'business', 'career', 'money', 'shop', 'работ', 'профес', 'офис', 'бизнес', 'карьер', 'деньг', 'покуп'],
  nature: ['nature', 'weather', 'animal', 'season', 'environment', 'climate', 'природ', 'погод', 'животн', 'сезон', 'климат', 'эколог'],
  free_time: ['free time', 'hobby', 'sport', 'music', 'game', 'film', 'book', 'отдых', 'хобби', 'спорт', 'музык', 'игр', 'фильм', 'книг'],
};

/**
 * Order the keywords are tried in — most specific first. "Extra practice: food
 * vocabulary" is a lesson about food, not a lesson about lessons, but the
 * school bucket holds the words every title contains ("lesson", "grammar",
 * "vocabulary"), so it has to come last or it swallows everything.
 */
const MATCH_ORDER: Scene[] = ['food', 'travel', 'family', 'work', 'nature', 'free_time', 'home', 'school'];

/** Stable small hash — the same lesson gets the same scene on every device. */
function hash(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Path of the scene for a lesson, under /illustrations. */
export function illustrationFor(text: string, seed: string): string {
  const hay = text.toLowerCase();
  for (const scene of MATCH_ORDER) {
    if (KEYWORDS[scene].some((w) => hay.includes(w))) return `/illustrations/${scene}.svg`;
  }
  return `/illustrations/${SCENES[hash(seed) % SCENES.length]}.svg`;
}

/** The uploaded picture if there is one, otherwise the lesson's own scene. */
export function lessonCover(
  lesson: { id: string; title?: string | null; coverUrl?: string | null },
  fileUrl: (u: string) => string,
): string {
  return lesson.coverUrl
    ? fileUrl(lesson.coverUrl)
    : illustrationFor(lesson.title ?? '', lesson.id);
}
