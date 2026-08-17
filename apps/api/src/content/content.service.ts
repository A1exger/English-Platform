import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { I18nContext } from 'nestjs-i18n';
import { PrismaService } from '../prisma/prisma.service';
import { AiClient } from '../generation/ai-client';
import { AuthenticatedUser } from '../auth/types/jwt-payload';
import { scoreContentTask, toContentQuestion } from './task-check';
import { applyReview, isDue, nextReviewAt } from './spaced-repetition';
import {
  computeCourseCompletion,
  computeGoalForecast,
  computeGoalProgress,
  LessonProgressInput,
} from './scoring';
import { CONTENT_LEVELS } from '../common/constants/enums';
import { STARTER_WORD_BANK } from './starter-word-bank';
import {
  CreateCategoryDto,
  CreateCourseDto,
  CreateCourseLessonDto,
  CreatePageDto,
  CreatePageMediaDto,
  CreateSectionDto,
  CreateTaskDto,
  CreateUnitDto,
  ReorderLessonDto,
  UpdateCourseDto,
  UpdateCourseLessonDto,
  UpdatePageDto,
  UpdatePageMediaDto,
  UpdateTaskDto,
} from './dto/content.dto';

// Pick a wordlist entry's translation for the request locale, falling back to
// the authored default. `translations` is a JSON map { locale: text } (V1).
function parseTranslations(raw: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    const map = JSON.parse(raw) as Record<string, string>;
    return map && typeof map === 'object' ? map : {};
  } catch {
    return {};
  }
}

function resolveWordTranslation(
  entry: { translation: string | null; translations: string | null },
  lang: string,
): string | null {
  const map = parseTranslations(entry.translations);
  return map[lang] || entry.translation;
}

/**
 * word -> gloss in the request locale, built from the lesson's wordlist. Used to
 * re-language vocabulary exercises whose glosses were baked in at authoring time
 * (an AI-written lesson can carry e.g. Spanish rights regardless of the reader's
 * language). Keys are lowercased for a forgiving match.
 */
function glossaryFor(
  wordlist: { entries: { word: string; translation: string | null; translations: string | null }[] } | null,
  lang: string,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const e of wordlist?.entries ?? []) {
    const t = resolveWordTranslation(e, lang);
    if (t) out.set(e.word.trim().toLowerCase(), t);
  }
  return out;
}

/**
 * Swap a word_matching task's right-hand column to the reader's language when
 * the left-hand word is in the lesson wordlist. Any word missing a translation
 * keeps its authored gloss, so a partially translated list still works. Other
 * task types pass through untouched.
 */
function localizeTaskPayload(
  type: string,
  payload: Record<string, unknown>,
  glossary: Map<string, string>,
): Record<string, unknown> {
  if (type !== 'word_matching' || glossary.size === 0) return payload;
  const pairs = payload.pairs;
  if (!Array.isArray(pairs)) return payload;
  return {
    ...payload,
    pairs: pairs.map((p) => {
      const pair = p as { left?: unknown; right?: unknown };
      const left = String(pair.left ?? '').trim().toLowerCase();
      const gloss = glossary.get(left);
      return gloss ? { ...pair, right: gloss } : pair;
    }),
  };
}

/** The same swap for a word_matching answer key ({ map: { left: right } }). */
function localizeAnswerKey(
  type: string,
  answerKey: Record<string, unknown>,
  glossary: Map<string, string>,
): Record<string, unknown> {
  if (type !== 'word_matching' || glossary.size === 0) return answerKey;
  const map = answerKey.map;
  if (!map || typeof map !== 'object') return answerKey;
  const next: Record<string, string> = {};
  for (const [left, right] of Object.entries(map as Record<string, string>)) {
    next[left] = glossary.get(left.trim().toLowerCase()) ?? right;
  }
  return { ...answerKey, map: next };
}

/**
 * Derive an AUTO task's answer key from its own payload. Mirrors what both the
 * manual builder and the generator produce; returns null when the payload does
 * not carry enough to reconstruct one.
 */
function rebuildAnswerKey(
  type: string,
  payload: Record<string, unknown>,
): Record<string, unknown> | null {
  if (type === 'sentence_ordering') {
    const words = Array.isArray(payload.words) ? (payload.words as string[]) : [];
    return words.length >= 2 ? { order: words } : null;
  }
  if (type === 'word_matching') {
    const pairs = Array.isArray(payload.pairs)
      ? (payload.pairs as { left?: string; right?: string }[])
      : [];
    const map: Record<string, string> = {};
    for (const p of pairs) if (p?.left && p?.right) map[p.left] = p.right;
    return Object.keys(map).length ? { map } : null;
  }
  if (type === 'gap_fill') {
    const text = typeof payload.text === 'string' ? payload.text : '';
    const answers = [...text.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1].trim());
    return answers.length ? { answers } : null;
  }
  if (type === 'categorization') {
    const items = Array.isArray(payload.items)
      ? (payload.items as { text?: string; category?: string }[])
      : [];
    const placement: Record<string, string> = {};
    for (const it of items) if (it?.text && it?.category) placement[it.text] = it.category;
    return Object.keys(placement).length ? { placement } : null;
  }
  return null;
}

@Injectable()
export class ContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiClient,
  ) {}

  // Locales the AI translate step fills for the wordlist (matches the web i18n).
  private static readonly TRANSLATE_LOCALES = ['en', 'ru', 'de', 'fr', 'nl', 'ar'];

  /** Course owner or admin may edit; other tutors read-only. */
  private async assertCourseEditable(user: AuthenticatedUser, courseId: string) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Course not found');
    if (user.role !== 'admin' && course.ownerUserId !== user.id) {
      throw new ForbiddenException('Not your course');
    }
    return course;
  }

  // --- course audience ------------------------------------------------------

  /**
   * What a student is allowed to open: any published course that is either
   * shared with everyone (visibility "public") or individually granted to them
   * (visibility "private" + a CourseAccess row). Used as the Prisma filter for
   * list reads and mirrored by assertCourseVisible for single-course reads.
   */
  private async studentCourseFilter(userId: string) {
    const student = await this.prisma.studentProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    return {
      status: 'published',
      OR: [
        { visibility: 'public' },
        ...(student
          ? [{ access: { some: { studentProfileId: student.id } } }]
          : []),
      ],
    };
  }

  /** Single-course gate for students; tutors/admins always pass. */
  private async assertCourseVisible(
    user: AuthenticatedUser,
    course: { id: string; status: string; visibility: string },
  ) {
    if (user.role !== 'student') return;
    if (course.status !== 'published') {
      throw new ForbiddenException('Course is not published');
    }
    if (course.visibility === 'public') return;
    const student = await this.prisma.studentProfile.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    const granted = student
      ? await this.prisma.courseAccess.findUnique({
          where: {
            courseId_studentProfileId: {
              courseId: course.id,
              studentProfileId: student.id,
            },
          },
        })
      : null;
    if (!granted) throw new ForbiddenException('Course is not shared with you');
  }

  // --- catalog reads --------------------------------------------------------

  /** Catalog: students see the courses shared with them; staff see everything. */
  async listCatalog(user: AuthenticatedUser) {
    const courseWhere =
      user.role === 'student' ? await this.studentCourseFilter(user.id) : null;
    return this.prisma.category.findMany({
      where: courseWhere ? { courses: { some: courseWhere } } : {},
      orderBy: { order: 'asc' },
      include: {
        courses: {
          ...(courseWhere ? { where: courseWhere } : {}),
          orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
          // Section levels drive the level chips/filter on the catalog cards.
          include: { sections: { select: { level: true }, orderBy: { order: 'asc' } } },
        },
      },
    });
  }

  /** Full tree of one course level: sections -> units -> lessons (ordered). */
  async courseTree(user: AuthenticatedUser, courseId: string, level: string) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Course not found');
    await this.assertCourseVisible(user, course);
    const sections = await this.prisma.section.findMany({
      where: { courseId, level },
      orderBy: { order: 'asc' },
      include: {
        units: {
          orderBy: { order: 'asc' },
          include: {
            lessons: {
              orderBy: { order: 'asc' },
              select: {
                id: true,
                title: true,
                optional: true,
                order: true,
                // Task count per lesson: a lesson with none cannot be handed out
                // as homework (createAssignment rejects an empty set), so the UI
                // needs to know before offering the button.
                pages: { select: { _count: { select: { tasks: true } } } },
              },
            },
          },
        },
      },
    });

    // Collapse the per-page counts into one number per lesson, so the shape the
    // client sees stays flat.
    // Which levels this course actually has content in. Both the builder and the
    // library open on one of these instead of a hard-coded default, which is how
    // a course whose only section is, say, Advanced used to look empty.
    const present = await this.prisma.section.findMany({
      where: { courseId },
      select: { level: true },
      distinct: ['level'],
    });
    const levels = (CONTENT_LEVELS as readonly string[]).filter((l) =>
      present.some((p) => p.level === l),
    );

    const withCounts = sections.map((sec) => ({
      ...sec,
      units: sec.units.map((u) => ({
        ...u,
        lessons: u.lessons.map(({ pages, ...l }) => ({
          ...l,
          taskCount: pages.reduce((n, pg) => n + pg._count.tasks, 0),
        })),
      })),
    }));

    // Students get their per-lesson progress on the roadmap: a lesson is "done"
    // when they have a finished (status=done) assignment for it, and its score
    // is that assignment's overall — the same rule as the progress cabinet
    // (INV-3). Additive: the author path keeps the plain shape.
    const student =
      user.role === 'student'
        ? await this.prisma.studentProfile.findUnique({ where: { userId: user.id } })
        : null;
    if (student) {
      const finished = await this.prisma.contentAssignment.findMany({
        where: { studentProfileId: student.id, status: 'done', courseLessonId: { not: null } },
        include: { result: { select: { overall: true } } },
      });
      const byLesson = new Map<string, number | null>();
      for (const a of finished) {
        if (!a.courseLessonId) continue;
        const overall = a.result?.overall ?? null;
        const prev = byLesson.get(a.courseLessonId);
        if (prev === undefined || (overall ?? -1) > (prev ?? -1)) {
          byLesson.set(a.courseLessonId, overall);
        }
      }
      const withProgress = withCounts.map((s) => ({
        ...s,
        units: s.units.map((u) => ({
          ...u,
          lessons: u.lessons.map((l) => ({
            ...l,
            done: byLesson.has(l.id),
            score: byLesson.get(l.id) ?? null,
          })),
        })),
      }));
      return { course, level, levels, sections: withProgress };
    }

    return { course, level, levels, sections: withCounts };
  }

  /** One lesson with pages, tasks (sans answer keys for students), prep data.
   *  `edit=true` (authors only) returns the raw wordlist + per-locale map for the
   *  builder; otherwise the wordlist is resolved to the request locale. */
  async lessonDetail(user: AuthenticatedUser, lessonId: string, edit = false) {
    const lesson = await this.prisma.courseLesson.findUnique({
      where: { id: lessonId },
      include: {
        pages: {
          orderBy: { order: 'asc' },
          include: {
            tasks: { orderBy: { order: 'asc' } },
            media: { orderBy: { order: 'asc' } },
          },
        },
        wordlist: { include: { entries: { orderBy: { order: 'asc' } } } },
        grammarReference: true,
        course: true,
      },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');
    await this.assertCourseVisible(user, lesson.course);
    const hideKeys = user.role === 'student';
    // Serve each wordlist entry's translation in the request locale, falling
    // back to the authored default (V1: per-locale wordlist translations).
    const lang = I18nContext.current()?.lang ?? 'en';
    // The builder (edit=true, authors only) needs the raw base + full per-locale
    // map. Every *playing* view — student, or teacher in the live room — gets the
    // one translation resolved to the request locale, so switching the interface
    // language actually changes the glosses.
    const forEditor = user.role !== 'student' && edit;
    const wordlist = lesson.wordlist
      ? {
          ...lesson.wordlist,
          entries: lesson.wordlist.entries.map(({ translations, ...e }) =>
            forEditor
              ? { ...e, translations: parseTranslations(translations) }
              : {
                  ...e,
                  translation: resolveWordTranslation({ translation: e.translation, translations }, lang),
                },
          ),
        }
      : lesson.wordlist;
    // Vocabulary exercises carry their glosses inside the task payload, so they
    // need the same per-locale treatment as the wordlist — otherwise a lesson
    // authored with e.g. Spanish rights shows Spanish to every reader. The
    // editor keeps the authored payload untouched.
    const glossary = forEditor ? new Map<string, string>() : glossaryFor(lesson.wordlist, lang);
    return {
      ...lesson,
      wordlist,
      objectives: lesson.objectives ? JSON.parse(lesson.objectives) : [],
      pages: lesson.pages.map((p) => ({
        ...p,
        tasks: p.tasks.map((t) => {
          const payload = localizeTaskPayload(t.type, JSON.parse(t.payload), glossary);
          if (hideKeys) {
            // Students get a sanitized question only: no payload (which can
            // reveal the solution, e.g. word order) and no answer key.
            return {
              id: t.id,
              type: t.type,
              gradingMode: t.gradingMode,
              aspect: t.aspect,
              estimatedMinutes: t.estimatedMinutes,
              order: t.order,
              question: toContentQuestion(t.type, payload),
            };
          }
          return {
            ...t,
            payload,
            answerKey: t.answerKey
              ? localizeAnswerKey(t.type, JSON.parse(t.answerKey), glossary)
              : null,
            question: toContentQuestion(t.type, payload),
          };
        }),
      })),
    };
  }

  /** Server-side check of one task (AUTO scores; MANUAL/COMPLETION complete). */
  async checkTask(
    user: AuthenticatedUser,
    taskId: string,
    state: Record<string, unknown>,
  ) {
    const task = await this.prisma.lessonTask.findUnique({
      where: { id: taskId },
      include: {
        page: {
          include: {
            courseLesson: {
              include: {
                course: true,
                wordlist: { include: { entries: true } },
              },
            },
          },
        },
      },
    });
    if (!task) throw new NotFoundException('Task not found');
    await this.assertCourseVisible(user, task.page.courseLesson.course);

    if (task.gradingMode !== 'AUTO') {
      // INV-5: MANUAL/COMPLETION never produce a number, only completion.
      return { completed: true, gradingMode: task.gradingMode };
    }
    // Score against the key in the SAME language the student was shown, or every
    // vocabulary answer would read as wrong once the glosses are localized.
    const lang = I18nContext.current()?.lang ?? 'en';
    const answerKey = localizeAnswerKey(
      task.type,
      task.answerKey ? JSON.parse(task.answerKey) : {},
      glossaryFor(task.page.courseLesson.wordlist, lang),
    );
    const result = scoreContentTask(task.type, answerKey, state);
    return {
      completed: true,
      gradingMode: task.gradingMode,
      score: result.score,
      correct: result.correct,
      // After checking, the solution may be revealed for review.
      solution: answerKey,
    };
  }

  // --- personal dictionary (Preparation -> "add to dictionary") -------------

  private async studentProfileForUser(userId: string) {
    const profile = await this.prisma.studentProfile.findUnique({
      where: { userId },
    });
    if (!profile) throw new ForbiddenException('No student profile');
    return profile;
  }

  // --- shared word bank -----------------------------------------------------

  /**
   * Browse the shared bank. Open to every signed-in role: tutors curate it,
   * students read it to fill their own dictionary from it.
   */
  async listWordBank(query?: string, topic?: string) {
    const q = query?.trim();
    const rows = await this.prisma.wordBankEntry.findMany({
      where: {
        ...(topic ? { topic } : {}),
        ...(q ? { OR: [{ word: { contains: q } }, { translation: { contains: q } }] } : {}),
      },
      orderBy: [{ topic: 'asc' }, { word: 'asc' }],
      take: 1000,
    });
    // Serve the reader's own language, falling back to the stored default — the
    // same rule the lesson wordlist uses, so a partly translated row still works.
    const lang = I18nContext.current()?.lang ?? 'en';
    return rows.map((r) => ({
      ...r,
      translation: resolveWordTranslation(r, lang),
    }));
  }

  /** The distinct topics in the bank, for the filter. */
  async wordBankTopics(): Promise<string[]> {
    const rows = await this.prisma.wordBankEntry.findMany({
      where: { topic: { not: null } },
      select: { topic: true },
      distinct: ['topic'],
      orderBy: { topic: 'asc' },
    });
    return rows.map((r) => r.topic!).filter(Boolean);
  }

  /**
   * Bulk import, one entry per line: "word = translation" (the translation is
   * optional, so a bare list of words works too). Upserts on the word, which
   * makes re-importing a corrected list update it instead of duplicating.
   */
  async importWordBank(text: string, topic?: string) {
    // De-duplicate within the paste itself: upserting the same word twice in one
    // batch would otherwise have the second silently overwrite the first.
    const byWord = new Map<string, { word: string; translation?: string }>();
    for (const line of text.split('\n')) {
      const at = line.indexOf('=');
      const word = (at < 0 ? line : line.slice(0, at)).trim();
      if (!word) continue;
      const translation = at < 0 ? '' : line.slice(at + 1).trim();
      byWord.set(word.toLowerCase(), { word, translation: translation || undefined });
    }

    for (const r of byWord.values()) {
      await this.prisma.wordBankEntry.upsert({
        where: { word: r.word },
        update: { translation: r.translation, ...(topic ? { topic } : {}) },
        create: { word: r.word, translation: r.translation, topic: topic || null },
      });
    }
    return { imported: byWord.size };
  }

  /**
   * Load the bundled starter pack so the bank is useful before anyone types a
   * word. Upserts like any import, so running it twice changes nothing and a
   * translation a tutor corrected by hand survives — the topic is only set on
   * rows this pack creates.
   */
  async seedWordBank() {
    let added = 0;
    for (const group of STARTER_WORD_BANK) {
      for (const w of group.words) {
        const existing = await this.prisma.wordBankEntry.findUnique({ where: { word: w.word } });
        if (existing) continue;
        await this.prisma.wordBankEntry.create({
          data: {
            word: w.word,
            // Russian is the stored default so an older client that reads only
            // `translation` still shows something sensible.
            translation: w.translations.ru,
            translations: JSON.stringify(w.translations),
            topic: group.topic,
          },
        });
        added++;
      }
    }
    return { added, total: await this.prisma.wordBankEntry.count() };
  }

  async deleteWordBankEntry(id: string) {
    await this.prisma.wordBankEntry.delete({ where: { id } }).catch(() => undefined);
    return { deleted: true };
  }

  /**
   * Look a word up in the free Dictionary API (dictionaryapi.dev): no key, no
   * quota, no cost. It is English-only — definitions, an example and the
   * phonetic spelling — so it enriches an entry rather than translating it.
   * Never throws: a lookup failure returns empty and the tutor types their own.
   */
  async lookupWord(word: string) {
    const term = word.trim();
    if (!term) return { word: term, definition: null, example: null, phonetic: null };
    try {
      const res = await fetch(
        `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(term)}`,
      );
      if (!res.ok) return { word: term, definition: null, example: null, phonetic: null };
      const body = (await res.json()) as {
        phonetic?: string;
        meanings?: { definitions?: { definition?: string; example?: string }[] }[];
      }[];
      const first = body?.[0];
      const def = first?.meanings?.[0]?.definitions?.[0];
      return {
        word: term,
        definition: def?.definition ?? null,
        example: def?.example ?? null,
        phonetic: first?.phonetic ?? null,
      };
    } catch {
      return { word: term, definition: null, example: null, phonetic: null };
    }
  }

  /** Student: copy a bank entry into their own dictionary. */
  async addFromWordBank(user: AuthenticatedUser, entryId: string) {
    const entry = await this.prisma.wordBankEntry.findUnique({ where: { id: entryId } });
    if (!entry) throw new NotFoundException('Word not found');
    const lang = I18nContext.current()?.lang ?? 'en';
    return this.addDictionaryEntry(user, {
      word: entry.word,
      translation: resolveWordTranslation(entry, lang) ?? undefined,
    });
  }

  async addDictionaryEntry(
    user: AuthenticatedUser,
    dto: { word: string; translation?: string; sourceLessonId?: string },
  ) {
    const student = await this.studentProfileForUser(user.id);
    return this.prisma.dictionaryEntry.upsert({
      where: {
        studentProfileId_word: { studentProfileId: student.id, word: dto.word },
      },
      update: { translation: dto.translation },
      create: {
        studentProfileId: student.id,
        word: dto.word,
        translation: dto.translation,
        sourceLessonId: dto.sourceLessonId,
      },
    });
  }

  async listDictionary(user: AuthenticatedUser) {
    const student = await this.studentProfileForUser(user.id);
    const entries = await this.prisma.dictionaryEntry.findMany({
      where: { studentProfileId: student.id },
      orderBy: { createdAt: 'desc' },
    });
    const now = new Date();
    // Enrich with spaced-repetition scheduling for the trainer (Phase 6).
    return entries.map((e) => ({
      ...e,
      due: isDue(e.repetitions, e.lastReviewedAt, now),
      nextReviewAt: nextReviewAt(e.repetitions, e.lastReviewedAt),
    }));
  }

  /** Trainer review: promote on remember, reset the streak on a miss. */
  async reviewDictionaryEntry(
    user: AuthenticatedUser,
    entryId: string,
    remembered: boolean,
  ) {
    const student = await this.studentProfileForUser(user.id);
    const entry = await this.prisma.dictionaryEntry.findUnique({ where: { id: entryId } });
    if (!entry || entry.studentProfileId !== student.id) {
      throw new NotFoundException('Dictionary entry not found');
    }
    const updated = await this.prisma.dictionaryEntry.update({
      where: { id: entryId },
      data: {
        repetitions: applyReview(entry.repetitions, remembered),
        lastReviewedAt: new Date(),
      },
    });
    return {
      ...updated,
      due: isDue(updated.repetitions, updated.lastReviewedAt),
      nextReviewAt: nextReviewAt(updated.repetitions, updated.lastReviewedAt),
    };
  }

  /**
   * Both progress counters + goal forecast for the cabinet (INV-3), grouped by
   * the courses the student has been assigned lessons in. A lesson counts as
   * completed when the student has a finished (status=done) assignment for it;
   * its grade comes from that assignment's LessonResult.
   */
  async studentProgress(user: AuthenticatedUser) {
    const student = await this.studentProfileForUser(user.id);
    const assignments = await this.prisma.contentAssignment.findMany({
      where: { studentProfileId: student.id, courseLessonId: { not: null } },
      include: { result: true },
    });

    // Best (highest overall) finished assignment per course lesson.
    const doneByLesson = new Map<string, number | null>();
    for (const a of assignments) {
      if (a.status !== 'done' || !a.courseLessonId) continue;
      const overall = a.result?.overall ?? null;
      const prev = doneByLesson.get(a.courseLessonId);
      if (prev === undefined || (overall ?? -1) > (prev ?? -1)) {
        doneByLesson.set(a.courseLessonId, overall);
      }
    }

    // Which (course, level) pairs the student is working in.
    const lessonIds = Array.from(
      new Set(assignments.map((a) => a.courseLessonId).filter((x): x is string => !!x)),
    );
    const assignedLessons = await this.prisma.courseLesson.findMany({
      where: { id: { in: lessonIds } },
      include: { course: { select: { id: true, title: true } } },
    });
    const pairs = new Map<string, { courseId: string; title: string; level: string }>();
    for (const l of assignedLessons) {
      pairs.set(`${l.courseId}:${l.level}`, {
        courseId: l.courseId,
        title: l.course.title,
        level: l.level,
      });
    }

    const courses: {
      courseId: string;
      title: string;
      level: string;
      courseCompletion: number;
      goalProgress: number | null;
      forecast: ReturnType<typeof computeGoalForecast>;
      lessonsRequired: number;
      lessonsDone: number;
    }[] = [];
    const allScored: LessonProgressInput[] = [];
    for (const { courseId, title, level } of pairs.values()) {
      const lessons = await this.prisma.courseLesson.findMany({
        where: { courseId, level },
        select: { id: true, optional: true },
      });
      const inputs: LessonProgressInput[] = lessons.map((l) => ({
        optional: l.optional,
        completed: doneByLesson.has(l.id),
        overall: doneByLesson.get(l.id) ?? null,
      }));
      allScored.push(...inputs);
      courses.push({
        courseId,
        title,
        level,
        courseCompletion: computeCourseCompletion(inputs),
        goalProgress: computeGoalProgress(inputs),
        forecast: computeGoalForecast(inputs),
        lessonsRequired: inputs.filter((i) => !i.optional).length,
        lessonsDone: inputs.filter((i) => i.completed).length,
      });
    }

    return {
      courses,
      overall: {
        goalProgress: computeGoalProgress(allScored),
        forecast: computeGoalForecast(allScored),
      },
    };
  }

  // --- authoring (tutor/admin) ----------------------------------------------

  createCategory(dto: CreateCategoryDto) {
    return this.prisma.category.create({ data: { title: dto.title, order: dto.order ?? 0 } });
  }

  async createCourse(user: AuthenticatedUser, dto: CreateCourseDto) {
    // Append to the end of its category's manual order (ФТ-К104).
    const order = await this.prisma.course.count({ where: { categoryId: dto.categoryId } });
    return this.prisma.course.create({
      data: {
        categoryId: dto.categoryId,
        title: dto.title,
        description: dto.description ?? null,
        coverUrl: dto.coverUrl ?? null,
        order,
        selfStudy: dto.selfStudy ?? false,
        isNew: dto.isNew ?? false,
        visibility: dto.visibility ?? 'public',
        ownerUserId: user.id,
      },
    });
  }

  // --- individual-course access (visibility = "private") --------------------

  /** Students a private course is shared with (course owner / admin only). */
  async listCourseAccess(user: AuthenticatedUser, courseId: string) {
    await this.assertCourseEditable(user, courseId);
    const rows = await this.prisma.courseAccess.findMany({
      where: { courseId },
      include: {
        studentProfile: {
          include: { user: { select: { firstName: true, lastName: true, email: true } } },
        },
      },
    });
    return rows.map((r) => ({
      studentProfileId: r.studentProfileId,
      name: `${r.studentProfile.user.firstName} ${r.studentProfile.user.lastName}`.trim(),
      email: r.studentProfile.user.email,
    }));
  }

  /**
   * Replace the whole access list in one call, so the editor can just send the
   * checked students. Unknown ids are ignored rather than failing the batch.
   */
  async setCourseAccess(
    user: AuthenticatedUser,
    courseId: string,
    studentProfileIds: string[],
  ) {
    await this.assertCourseEditable(user, courseId);
    const valid = await this.prisma.studentProfile.findMany({
      where: { id: { in: studentProfileIds } },
      select: { id: true },
    });
    await this.prisma.$transaction([
      this.prisma.courseAccess.deleteMany({ where: { courseId } }),
      ...valid.map((s) =>
        this.prisma.courseAccess.create({
          data: { courseId, studentProfileId: s.id },
        }),
      ),
    ]);
    return { granted: valid.length };
  }

  async reorderCategories(_user: AuthenticatedUser, ids: string[]) {
    await this.prisma.$transaction(
      ids.map((id, i) => this.prisma.category.update({ where: { id }, data: { order: i } })),
    );
    return { reordered: ids.length };
  }

  async reorderCourses(_user: AuthenticatedUser, categoryId: string, ids: string[]) {
    // Only touch courses that really belong to this category.
    const courses = await this.prisma.course.findMany({
      where: { id: { in: ids }, categoryId },
      select: { id: true },
    });
    const valid = new Set(courses.map((c) => c.id));
    const ordered = ids.filter((id) => valid.has(id));
    await this.prisma.$transaction(
      ordered.map((id, i) => this.prisma.course.update({ where: { id }, data: { order: i } })),
    );
    return { reordered: ordered.length };
  }

  // --- editor tree reorder (sections/units/pages/tasks) ---------------------
  // Lessons keep their level-wide endpoint (reorderLesson / INV-1); these order
  // a set of siblings by the position of their id in the submitted list.

  async reorderSections(user: AuthenticatedUser, courseId: string, ids: string[]) {
    await this.assertCourseEditable(user, courseId);
    const rows = await this.prisma.section.findMany({ where: { id: { in: ids }, courseId }, select: { id: true } });
    return this.applyOrder(rows.map((r) => r.id), ids, (id, order) =>
      this.prisma.section.update({ where: { id }, data: { order } }),
    );
  }

  async reorderUnits(user: AuthenticatedUser, sectionId: string, ids: string[]) {
    const section = await this.prisma.section.findUnique({ where: { id: sectionId } });
    if (!section) throw new NotFoundException('Section not found');
    await this.assertCourseEditable(user, section.courseId);
    const rows = await this.prisma.unit.findMany({ where: { id: { in: ids }, sectionId }, select: { id: true } });
    return this.applyOrder(rows.map((r) => r.id), ids, (id, order) =>
      this.prisma.unit.update({ where: { id }, data: { order } }),
    );
  }

  async reorderPages(user: AuthenticatedUser, courseLessonId: string, ids: string[]) {
    const lesson = await this.prisma.courseLesson.findUnique({ where: { id: courseLessonId } });
    if (!lesson) throw new NotFoundException('Lesson not found');
    await this.assertCourseEditable(user, lesson.courseId);
    const rows = await this.prisma.lessonPage.findMany({ where: { id: { in: ids }, courseLessonId }, select: { id: true } });
    return this.applyOrder(rows.map((r) => r.id), ids, (id, order) =>
      this.prisma.lessonPage.update({ where: { id }, data: { order } }),
    );
  }

  async reorderTasks(user: AuthenticatedUser, pageId: string, ids: string[]) {
    await this.assertPageEditable(user, pageId);
    const rows = await this.prisma.lessonTask.findMany({ where: { id: { in: ids }, pageId }, select: { id: true } });
    return this.applyOrder(rows.map((r) => r.id), ids, (id, order) =>
      this.prisma.lessonTask.update({ where: { id }, data: { order } }),
    );
  }

  private async applyOrder(
    valid: string[],
    ids: string[],
    update: (id: string, order: number) => Prisma.PrismaPromise<unknown>,
  ) {
    const allowed = new Set(valid);
    const ordered = ids.filter((id) => allowed.has(id));
    await this.prisma.$transaction(ordered.map((id, i) => update(id, i)));
    return { reordered: ordered.length };
  }

  async updateCourse(user: AuthenticatedUser, id: string, dto: UpdateCourseDto) {
    await this.assertCourseEditable(user, id);
    return this.prisma.course.update({ where: { id }, data: { ...dto } });
  }

  /** Delete a course and its whole tree (sections → units → lessons cascade). */
  async deleteCourse(user: AuthenticatedUser, id: string) {
    await this.assertCourseEditable(user, id);
    await this.prisma.course.delete({ where: { id } });
    return { deleted: true };
  }

  async createSection(user: AuthenticatedUser, dto: CreateSectionDto) {
    await this.assertCourseEditable(user, dto.courseId);
    return this.prisma.section.create({
      data: { courseId: dto.courseId, level: dto.level, title: dto.title, order: dto.order ?? 0 },
    });
  }

  async createUnit(user: AuthenticatedUser, dto: CreateUnitDto) {
    const section = await this.prisma.section.findUnique({ where: { id: dto.sectionId } });
    if (!section) throw new NotFoundException('Section not found');
    await this.assertCourseEditable(user, section.courseId);
    return this.prisma.unit.create({
      data: { sectionId: dto.sectionId, title: dto.title, order: dto.order ?? 0 },
    });
  }

  /**
   * Renumber a level's lessons to a dense 1..n (createLesson starts at 1).
   * Lesson order is level-wide and unique (INV-1, @@unique([courseId, level,
   * order])), so removing a whole unit or section leaves holes that the ±1
   * shifts in createLesson/reorderLesson would then misread. Safe against the
   * unique index: rows are walked in ascending order and only ever move down,
   * so the slot being written to has already been vacated.
   */
  private async repackLessonOrder(
    db: Prisma.TransactionClient,
    courseId: string,
    level: string,
  ) {
    const rows = await db.courseLesson.findMany({
      where: { courseId, level },
      orderBy: { order: 'asc' },
      select: { id: true, order: true },
    });
    for (const [i, row] of rows.entries()) {
      if (row.order !== i + 1) {
        await db.courseLesson.update({ where: { id: row.id }, data: { order: i + 1 } });
      }
    }
  }

  /**
   * Rebuild the answer keys the AI generator used to omit.
   *
   * Generated sentence_ordering / word_matching / gap_fill / categorization
   * tasks were stored with no answerKey, so scoreContentTask had nothing to
   * compare against: every attempt scored 0/10 and no solution could be shown.
   * The generator now emits them, but content made before that is still
   * unanswerable — and the key is fully recoverable from the payload, because
   * that is exactly how the manual builder derives it:
   *   sentence_ordering  words are stored in the correct order
   *   word_matching      each pair carries its own left/right
   *   gap_fill           answers are the [bracketed] spans of the text
   *   categorization     each item carries its category
   *
   * Only tasks with a missing/empty key are touched, so this is safe to re-run
   * and never overwrites a key an author set by hand.
   */
  async backfillAnswerKeys(user: AuthenticatedUser) {
    if (user.role !== 'admin') throw new ForbiddenException('Admins only');
    const types = ['sentence_ordering', 'word_matching', 'gap_fill', 'categorization'];
    const tasks = await this.prisma.lessonTask.findMany({
      where: { type: { in: types }, gradingMode: 'AUTO' },
      select: { id: true, type: true, payload: true, answerKey: true },
    });

    let repaired = 0;
    let unrecoverable = 0;
    for (const t of tasks) {
      const existing = t.answerKey ? (JSON.parse(t.answerKey) as Record<string, unknown>) : null;
      if (existing && Object.keys(existing).length > 0) continue;

      const key = rebuildAnswerKey(t.type, JSON.parse(t.payload) as Record<string, unknown>);
      if (!key) {
        unrecoverable++;
        continue;
      }
      await this.prisma.lessonTask.update({
        where: { id: t.id },
        data: { answerKey: JSON.stringify(key) },
      });
      repaired++;
    }
    return { scanned: tasks.length, repaired, unrecoverable };
  }

  async renameSection(user: AuthenticatedUser, id: string, title: string) {
    const section = await this.prisma.section.findUnique({ where: { id } });
    if (!section) throw new NotFoundException('Section not found');
    await this.assertCourseEditable(user, section.courseId);
    return this.prisma.section.update({ where: { id }, data: { title } });
  }

  async renameUnit(user: AuthenticatedUser, id: string, title: string) {
    const unit = await this.prisma.unit.findUnique({ where: { id }, include: { section: true } });
    if (!unit) throw new NotFoundException('Unit not found');
    await this.assertCourseEditable(user, unit.section.courseId);
    return this.prisma.unit.update({ where: { id }, data: { title } });
  }

  /** Delete a unit with its lessons (DB cascade), then close the order gaps. */
  async deleteUnit(user: AuthenticatedUser, id: string) {
    const unit = await this.prisma.unit.findUnique({
      where: { id },
      include: { section: true },
    });
    if (!unit) throw new NotFoundException('Unit not found');
    await this.assertCourseEditable(user, unit.section.courseId);
    await this.prisma.$transaction(async (db) => {
      await db.unit.delete({ where: { id } });
      await this.repackLessonOrder(db, unit.section.courseId, unit.section.level);
    });
    return { deleted: true };
  }

  /** Delete a section with its units and lessons, then close the order gaps. */
  async deleteSection(user: AuthenticatedUser, id: string) {
    const section = await this.prisma.section.findUnique({ where: { id } });
    if (!section) throw new NotFoundException('Section not found');
    await this.assertCourseEditable(user, section.courseId);
    await this.prisma.$transaction(async (db) => {
      await db.section.delete({ where: { id } });
      await this.repackLessonOrder(db, section.courseId, section.level);
    });
    return { deleted: true };
  }

  /**
   * INV-1: lesson order is level-wide. Appends at the end by default; an
   * explicit position shifts every later lesson (across all units) up by one.
   */
  async createLesson(user: AuthenticatedUser, dto: CreateCourseLessonDto) {
    const unit = await this.prisma.unit.findUnique({
      where: { id: dto.unitId },
      include: { section: true },
    });
    if (!unit) throw new NotFoundException('Unit not found');
    await this.assertCourseEditable(user, unit.section.courseId);
    const courseId = unit.section.courseId;
    const level = unit.section.level;

    const max = await this.prisma.courseLesson.aggregate({
      where: { courseId, level },
      _max: { order: true },
    });
    const last = max._max.order ?? 0;
    const target = dto.order ? Math.min(dto.order, last + 1) : last + 1;

    return this.prisma.$transaction(async (db) => {
      if (target <= last) {
        // Make room: shift orders >= target up by one, level-wide (INV-1).
        // Two-phase update keeps the (courseId, level, order) unique index happy.
        const toShift = await db.courseLesson.findMany({
          where: { courseId, level, order: { gte: target } },
          orderBy: { order: 'desc' },
        });
        for (const l of toShift) {
          await db.courseLesson.update({ where: { id: l.id }, data: { order: l.order + 1 } });
        }
      }
      return db.courseLesson.create({
        data: {
          courseId,
          level,
          unitId: dto.unitId,
          title: dto.title,
          optional: dto.optional ?? false,
          order: target,
          objectives: dto.objectives ? JSON.stringify(dto.objectives) : null,
        },
      });
    });
  }

  async updateLesson(user: AuthenticatedUser, id: string, dto: UpdateCourseLessonDto) {
    const lesson = await this.prisma.courseLesson.findUnique({ where: { id } });
    if (!lesson) throw new NotFoundException('Lesson not found');
    await this.assertCourseEditable(user, lesson.courseId);
    return this.prisma.courseLesson.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.optional !== undefined ? { optional: dto.optional } : {}),
        ...(dto.objectives !== undefined
          ? { objectives: JSON.stringify(dto.objectives) }
          : {}),
      },
    });
  }

  /** INV-1: move a lesson to a new level-wide position, shifting the rest. */
  async reorderLesson(user: AuthenticatedUser, id: string, dto: ReorderLessonDto) {
    const lesson = await this.prisma.courseLesson.findUnique({ where: { id } });
    if (!lesson) throw new NotFoundException('Lesson not found');
    await this.assertCourseEditable(user, lesson.courseId);
    const { courseId, level } = lesson;

    const count = await this.prisma.courseLesson.count({ where: { courseId, level } });
    const target = Math.max(1, Math.min(dto.order, count));
    if (target === lesson.order) return lesson;

    return this.prisma.$transaction(async (db) => {
      // Park the moving lesson outside the range to free its slot.
      await db.courseLesson.update({ where: { id }, data: { order: count + 1000 } });
      if (target < lesson.order) {
        const toShift = await db.courseLesson.findMany({
          where: { courseId, level, order: { gte: target, lt: lesson.order } },
          orderBy: { order: 'desc' },
        });
        for (const l of toShift) {
          await db.courseLesson.update({ where: { id: l.id }, data: { order: l.order + 1 } });
        }
      } else {
        const toShift = await db.courseLesson.findMany({
          where: { courseId, level, order: { gt: lesson.order, lte: target } },
          orderBy: { order: 'asc' },
        });
        for (const l of toShift) {
          await db.courseLesson.update({ where: { id: l.id }, data: { order: l.order - 1 } });
        }
      }
      return db.courseLesson.update({ where: { id }, data: { order: target } });
    });
  }

  async deleteLesson(user: AuthenticatedUser, id: string) {
    const lesson = await this.prisma.courseLesson.findUnique({ where: { id } });
    if (!lesson) throw new NotFoundException('Lesson not found');
    await this.assertCourseEditable(user, lesson.courseId);
    await this.prisma.$transaction(async (db) => {
      await db.courseLesson.delete({ where: { id } });
      // Close the gap level-wide.
      const later = await db.courseLesson.findMany({
        where: { courseId: lesson.courseId, level: lesson.level, order: { gt: lesson.order } },
        orderBy: { order: 'asc' },
      });
      for (const l of later) {
        await db.courseLesson.update({ where: { id: l.id }, data: { order: l.order - 1 } });
      }
    });
    return { deleted: true };
  }

  /** Replace the lesson wordlist with the given entries. */
  async setWordlist(
    user: AuthenticatedUser,
    lessonId: string,
    entries: { word: string; translation?: string; example?: string }[],
  ) {
    const lesson = await this.prisma.courseLesson.findUnique({ where: { id: lessonId } });
    if (!lesson) throw new NotFoundException('Lesson not found');
    await this.assertCourseEditable(user, lesson.courseId);
    const wl = await this.prisma.wordlist.upsert({
      where: { courseLessonId: lessonId },
      update: {},
      create: { courseLessonId: lessonId },
    });
    // Keep any AI-filled per-locale translations for words that stay in the list,
    // so editing one entry doesn't wipe the rest (V2).
    const previous = await this.prisma.wordlistEntry.findMany({
      where: { wordlistId: wl.id },
      select: { word: true, translations: true },
    });
    const keepByWord = new Map(
      previous.filter((p) => p.translations).map((p) => [p.word, p.translations as string]),
    );
    await this.prisma.wordlistEntry.deleteMany({ where: { wordlistId: wl.id } });
    if (entries.length) {
      await this.prisma.wordlistEntry.createMany({
        data: entries.map((e, i) => ({
          wordlistId: wl.id,
          word: e.word,
          translation: e.translation,
          translations: keepByWord.get(e.word) ?? null,
          example: e.example,
          order: i,
        })),
      });
    }
    return this.prisma.wordlist.findUnique({
      where: { id: wl.id },
      include: { entries: { orderBy: { order: 'asc' } } },
    });
  }

  /**
   * AI translate step (V2): fill each wordlist entry's per-locale translations
   * so the lesson can serve the word's meaning in the viewer's language. Throws
   * AiUnavailableError when no API key is configured (handled by the controller).
   */
  async translateWordlist(user: AuthenticatedUser, lessonId: string) {
    const lesson = await this.prisma.courseLesson.findUnique({ where: { id: lessonId } });
    if (!lesson) throw new NotFoundException('Lesson not found');
    await this.assertCourseEditable(user, lesson.courseId);

    const wl = await this.prisma.wordlist.findUnique({
      where: { courseLessonId: lessonId },
      include: { entries: { orderBy: { order: 'asc' } } },
    });
    if (!wl || wl.entries.length === 0) {
      throw new BadRequestException('No wordlist to translate');
    }

    const locales = ContentService.TRANSLATE_LOCALES;
    const system =
      'You translate vocabulary glosses for an English-learning app. For each ' +
      'English word or phrase, give a SHORT translation of its meaning (1–3 words, ' +
      'never a sentence) in every requested language, using the provided meaning/' +
      'example to pick the right sense. Return ONLY minified JSON of the form ' +
      '{"items":[{"t":{"en":"…","ru":"…","de":"…","fr":"…","nl":"…","ar":"…"}}]} ' +
      'with exactly one item per input word, in the same order.';
    const userMsg = JSON.stringify({
      targetLanguages: locales,
      words: wl.entries.map((e) => ({
        word: e.word,
        meaning: e.translation ?? undefined,
        example: e.example ?? undefined,
      })),
    });

    const out = await this.ai.json<{ items?: { t?: Record<string, string> }[] }>(system, userMsg);
    const items = out.items ?? [];

    await this.prisma.$transaction(
      wl.entries.map((e, i) => {
        const raw = items[i]?.t ?? {};
        const clean: Record<string, string> = {};
        for (const loc of locales) {
          const v = raw[loc];
          if (typeof v === 'string' && v.trim()) clean[loc] = v.trim();
        }
        return this.prisma.wordlistEntry.update({
          where: { id: e.id },
          data: { translations: Object.keys(clean).length ? JSON.stringify(clean) : null },
        });
      }),
    );

    return { translated: wl.entries.length, locales };
  }

  /** Manually set per-locale wordlist translations, matched by word (V3). */
  async setWordlistTranslations(
    user: AuthenticatedUser,
    lessonId: string,
    entries: { word: string; translations: Record<string, string> }[],
  ) {
    const lesson = await this.prisma.courseLesson.findUnique({ where: { id: lessonId } });
    if (!lesson) throw new NotFoundException('Lesson not found');
    await this.assertCourseEditable(user, lesson.courseId);
    const wl = await this.prisma.wordlist.findUnique({
      where: { courseLessonId: lessonId },
      include: { entries: true },
    });
    if (!wl) throw new BadRequestException('No wordlist');

    const byWord = new Map(entries.map((e) => [e.word, e.translations]));
    const locales = ContentService.TRANSLATE_LOCALES;
    await this.prisma.$transaction(
      wl.entries
        .filter((e) => byWord.has(e.word))
        .map((e) => {
          const map = byWord.get(e.word) ?? {};
          const clean: Record<string, string> = {};
          for (const loc of locales) {
            const v = map[loc];
            if (typeof v === 'string' && v.trim()) clean[loc] = v.trim();
          }
          return this.prisma.wordlistEntry.update({
            where: { id: e.id },
            data: { translations: Object.keys(clean).length ? JSON.stringify(clean) : null },
          });
        }),
    );
    return { updated: true };
  }

  /** Create or update the lesson grammar reference (Meaning / Form). */
  async setGrammarReference(
    user: AuthenticatedUser,
    lessonId: string,
    dto: { title: string; meaning: string; form: string },
  ) {
    const lesson = await this.prisma.courseLesson.findUnique({ where: { id: lessonId } });
    if (!lesson) throw new NotFoundException('Lesson not found');
    await this.assertCourseEditable(user, lesson.courseId);
    return this.prisma.grammarReference.upsert({
      where: { courseLessonId: lessonId },
      update: dto,
      create: { courseLessonId: lessonId, ...dto },
    });
  }

  async createPage(user: AuthenticatedUser, dto: CreatePageDto) {
    const lesson = await this.prisma.courseLesson.findUnique({
      where: { id: dto.courseLessonId },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');
    await this.assertCourseEditable(user, lesson.courseId);
    return this.prisma.lessonPage.create({
      data: {
        courseLessonId: dto.courseLessonId,
        type: dto.type,
        title: dto.title ?? null,
        order: dto.order ?? 0,
        includedInHomework: dto.includedInHomework ?? false,
        mediaUrl: dto.mediaUrl,
        text: dto.text,
      },
    });
  }

  async updatePage(user: AuthenticatedUser, id: string, dto: UpdatePageDto) {
    await this.assertPageEditable(user, id);
    return this.prisma.lessonPage.update({ where: { id }, data: { ...dto } });
  }

  // --- page media (§7): image/video/audio attachments -----------------------

  private async assertPageEditable(user: AuthenticatedUser, pageId: string) {
    const page = await this.prisma.lessonPage.findUnique({
      where: { id: pageId },
      include: { courseLesson: true },
    });
    if (!page) throw new NotFoundException('Page not found');
    await this.assertCourseEditable(user, page.courseLesson.courseId);
    return page;
  }

  private async assertMediaEditable(user: AuthenticatedUser, mediaId: string) {
    const media = await this.prisma.pageMedia.findUnique({
      where: { id: mediaId },
      include: { page: { include: { courseLesson: true } } },
    });
    if (!media) throw new NotFoundException('Media not found');
    await this.assertCourseEditable(user, media.page.courseLesson.courseId);
    return media;
  }

  async addPageMedia(user: AuthenticatedUser, pageId: string, dto: CreatePageMediaDto) {
    await this.assertPageEditable(user, pageId);
    const order = await this.prisma.pageMedia.count({ where: { pageId } });
    return this.prisma.pageMedia.create({
      data: {
        pageId,
        kind: dto.kind,
        url: dto.url,
        caption: dto.caption ?? null,
        transcript: dto.transcript ?? null,
        order,
      },
    });
  }

  async updatePageMedia(user: AuthenticatedUser, id: string, dto: UpdatePageMediaDto) {
    await this.assertMediaEditable(user, id);
    return this.prisma.pageMedia.update({ where: { id }, data: { ...dto } });
  }

  async deletePageMedia(user: AuthenticatedUser, id: string) {
    await this.assertMediaEditable(user, id);
    await this.prisma.pageMedia.delete({ where: { id } });
    return { deleted: true };
  }

  async reorderPageMedia(user: AuthenticatedUser, pageId: string, ids: string[]) {
    await this.assertPageEditable(user, pageId);
    const media = await this.prisma.pageMedia.findMany({
      where: { id: { in: ids }, pageId },
      select: { id: true },
    });
    const valid = new Set(media.map((m) => m.id));
    const ordered = ids.filter((id) => valid.has(id));
    await this.prisma.$transaction(
      ordered.map((id, i) => this.prisma.pageMedia.update({ where: { id }, data: { order: i } })),
    );
    return { reordered: ordered.length };
  }

  private validateTaskPayload(type: string, payload: Record<string, unknown>, answerKey?: Record<string, unknown>) {
    // Annotated on the variable, not the arrow: that is what makes TypeScript
    // treat a fail() call as terminating, so the true_false branch below can
    // read answerKey again after asserting it is present.
    const fail: (m: string) => never = (m) => {
      throw new BadRequestException(`Invalid task: ${m}`);
    };
    if (type === 'sentence_ordering' && !Array.isArray(payload.words)) fail('words[] required');
    if (type === 'word_matching' && !Array.isArray(payload.pairs)) fail('pairs[] required');
    if (type === 'gap_fill' && typeof payload.text !== 'string') fail('text required');
    if (type === 'categorization' && (!Array.isArray(payload.categories) || !Array.isArray(payload.items)))
      fail('categories[] and items[] required');
    if (type === 'true_false') {
      if (!Array.isArray(payload.statements) || payload.statements.length === 0)
        fail('statements[] required');
      if (!answerKey || !Array.isArray(answerKey.values))
        fail('answerKey.values[] required');
      if ((answerKey.values as unknown[]).length !== (payload.statements as unknown[]).length)
        fail('answerKey.values[] must match statements[]');
    }
    if (type === 'multiple_choice') {
      if (!Array.isArray(payload.options) || typeof payload.question !== 'string') fail('question + options[] required');
      if (!answerKey || typeof answerKey.correct !== 'string') fail('answerKey.correct required');
    }
  }

  async createTask(user: AuthenticatedUser, dto: CreateTaskDto) {
    const page = await this.prisma.lessonPage.findUnique({
      where: { id: dto.pageId },
      include: { courseLesson: true },
    });
    if (!page) throw new NotFoundException('Page not found');
    await this.assertCourseEditable(user, page.courseLesson.courseId);
    this.validateTaskPayload(dto.type, dto.payload, dto.answerKey);
    return this.prisma.lessonTask.create({
      data: {
        pageId: dto.pageId,
        type: dto.type,
        gradingMode: dto.gradingMode,
        aspect: dto.aspect,
        estimatedMinutes: dto.estimatedMinutes ?? 5,
        order: dto.order ?? 0,
        payload: JSON.stringify(dto.payload),
        answerKey: dto.answerKey ? JSON.stringify(dto.answerKey) : null,
      },
    });
  }

  async updateTask(user: AuthenticatedUser, id: string, dto: UpdateTaskDto) {
    const task = await this.prisma.lessonTask.findUnique({
      where: { id },
      include: { page: { include: { courseLesson: true } } },
    });
    if (!task) throw new NotFoundException('Task not found');
    await this.assertCourseEditable(user, task.page.courseLesson.courseId);
    if (dto.payload) this.validateTaskPayload(task.type, dto.payload, dto.answerKey);
    return this.prisma.lessonTask.update({
      where: { id },
      data: {
        ...(dto.gradingMode !== undefined ? { gradingMode: dto.gradingMode } : {}),
        ...(dto.aspect !== undefined ? { aspect: dto.aspect } : {}),
        ...(dto.estimatedMinutes !== undefined ? { estimatedMinutes: dto.estimatedMinutes } : {}),
        ...(dto.payload !== undefined ? { payload: JSON.stringify(dto.payload) } : {}),
        ...(dto.answerKey !== undefined ? { answerKey: JSON.stringify(dto.answerKey) } : {}),
      },
    });
  }

  async deleteTask(user: AuthenticatedUser, id: string) {
    const task = await this.prisma.lessonTask.findUnique({
      where: { id },
      include: { page: { include: { courseLesson: true } } },
    });
    if (!task) throw new NotFoundException('Task not found');
    await this.assertCourseEditable(user, task.page.courseLesson.courseId);
    await this.prisma.lessonTask.delete({ where: { id } });
    return { deleted: true };
  }
}
