import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/types/jwt-payload';
import { scoreContentTask, toContentQuestion } from './task-check';
import { applyReview, isDue, nextReviewAt } from './spaced-repetition';
import {
  computeCourseCompletion,
  computeGoalForecast,
  computeGoalProgress,
  LessonProgressInput,
} from './scoring';
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
  UpdatePageMediaDto,
  UpdateTaskDto,
} from './dto/content.dto';

@Injectable()
export class ContentService {
  constructor(private readonly prisma: PrismaService) {}

  /** Course owner or admin may edit; other tutors read-only. */
  private async assertCourseEditable(user: AuthenticatedUser, courseId: string) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Course not found');
    if (user.role !== 'admin' && course.ownerUserId !== user.id) {
      throw new ForbiddenException('Not your course');
    }
    return course;
  }

  // --- catalog reads --------------------------------------------------------

  /** Catalog: students see published courses; tutors/admins see everything. */
  listCatalog(user: AuthenticatedUser) {
    const where = user.role === 'student' ? { courses: { some: { status: 'published' } } } : {};
    return this.prisma.category.findMany({
      where,
      orderBy: { order: 'asc' },
      include: {
        courses: {
          ...(user.role === 'student' ? { where: { status: 'published' } } : {}),
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
    if (user.role === 'student' && course.status !== 'published') {
      throw new ForbiddenException('Course is not published');
    }
    const sections = await this.prisma.section.findMany({
      where: { courseId, level },
      orderBy: { order: 'asc' },
      include: {
        units: {
          orderBy: { order: 'asc' },
          include: {
            lessons: { orderBy: { order: 'asc' }, select: { id: true, title: true, optional: true, order: true } },
          },
        },
      },
    });
    return { course, level, sections };
  }

  /** One lesson with pages, tasks (sans answer keys for students), prep data. */
  async lessonDetail(user: AuthenticatedUser, lessonId: string) {
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
    if (user.role === 'student' && lesson.course.status !== 'published') {
      throw new ForbiddenException('Course is not published');
    }
    const hideKeys = user.role === 'student';
    return {
      ...lesson,
      objectives: lesson.objectives ? JSON.parse(lesson.objectives) : [],
      pages: lesson.pages.map((p) => ({
        ...p,
        tasks: p.tasks.map((t) => {
          const payload = JSON.parse(t.payload);
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
            answerKey: t.answerKey ? JSON.parse(t.answerKey) : null,
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
      include: { page: { include: { courseLesson: { include: { course: true } } } } },
    });
    if (!task) throw new NotFoundException('Task not found');
    if (user.role === 'student' && task.page.courseLesson.course.status !== 'published') {
      throw new ForbiddenException('Course is not published');
    }

    if (task.gradingMode !== 'AUTO') {
      // INV-5: MANUAL/COMPLETION never produce a number, only completion.
      return { completed: true, gradingMode: task.gradingMode };
    }
    const answerKey = task.answerKey ? JSON.parse(task.answerKey) : {};
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
        ownerUserId: user.id,
      },
    });
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

  async updateCourse(user: AuthenticatedUser, id: string, dto: UpdateCourseDto) {
    await this.assertCourseEditable(user, id);
    return this.prisma.course.update({ where: { id }, data: { ...dto } });
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
    await this.prisma.wordlistEntry.deleteMany({ where: { wordlistId: wl.id } });
    if (entries.length) {
      await this.prisma.wordlistEntry.createMany({
        data: entries.map((e, i) => ({
          wordlistId: wl.id,
          word: e.word,
          translation: e.translation,
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
        order: dto.order ?? 0,
        includedInHomework: dto.includedInHomework ?? false,
        mediaUrl: dto.mediaUrl,
        text: dto.text,
      },
    });
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
    const fail = (m: string) => {
      throw new BadRequestException(`Invalid task: ${m}`);
    };
    if (type === 'sentence_ordering' && !Array.isArray(payload.words)) fail('words[] required');
    if (type === 'word_matching' && !Array.isArray(payload.pairs)) fail('pairs[] required');
    if (type === 'gap_fill' && typeof payload.text !== 'string') fail('text required');
    if (type === 'categorization' && (!Array.isArray(payload.categories) || !Array.isArray(payload.items)))
      fail('categories[] and items[] required');
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
