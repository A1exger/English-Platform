import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/types/jwt-payload';
import {
  CreateCategoryDto,
  CreateCourseDto,
  CreateCourseLessonDto,
  CreatePageDto,
  CreateSectionDto,
  CreateTaskDto,
  CreateUnitDto,
  ReorderLessonDto,
  UpdateCourseDto,
  UpdateCourseLessonDto,
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
          orderBy: { createdAt: 'asc' },
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
          include: { tasks: { orderBy: { order: 'asc' } } },
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
        tasks: p.tasks.map((t) => ({
          ...t,
          payload: JSON.parse(t.payload),
          // The answer key never leaves the server for students.
          answerKey: hideKeys ? undefined : t.answerKey ? JSON.parse(t.answerKey) : null,
        })),
      })),
    };
  }

  // --- authoring (tutor/admin) ----------------------------------------------

  createCategory(dto: CreateCategoryDto) {
    return this.prisma.category.create({ data: { title: dto.title, order: dto.order ?? 0 } });
  }

  createCourse(user: AuthenticatedUser, dto: CreateCourseDto) {
    return this.prisma.course.create({
      data: {
        categoryId: dto.categoryId,
        title: dto.title,
        selfStudy: dto.selfStudy ?? false,
        isNew: dto.isNew ?? false,
        ownerUserId: user.id,
      },
    });
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
