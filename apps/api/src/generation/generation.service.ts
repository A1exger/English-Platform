import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ContentService } from '../content/content.service';
import { AuthenticatedUser } from '../auth/types/jwt-payload';
import {
  Aspect,
  ContentLevel,
  GradingMode,
  PageType,
  TaskType,
} from '../common/constants/enums';
import { AiClient } from './ai-client';
import { GenerateDto } from './dto/generate.dto';
import {
  Brief,
  LessonPlan,
  lessonPrompt,
  normalizeLessonPlan,
  normalizeSkeleton,
  parseBrief,
  skeletonPrompt,
} from './pipeline';

type JobRow = {
  id: string;
  targetType: string;
  status: string;
  error: string | null;
  courseId: string | null;
  courseLessonId: string | null;
  level: string | null;
  requestedByUserId: string;
  brief: string;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class GenerationService {
  private readonly logger = new Logger(GenerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly content: ContentService,
    private readonly ai: AiClient,
  ) {}

  private view(job: JobRow) {
    return {
      id: job.id,
      targetType: job.targetType,
      status: job.status,
      error: job.error,
      courseId: job.courseId,
      courseLessonId: job.courseLessonId,
      level: job.level,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }

  /** Create a job (generating) and kick off generation in the background. */
  async create(user: AuthenticatedUser, dto: GenerateDto) {
    const brief = parseBrief({ ...dto });
    const job = await this.prisma.generationJob.create({
      data: {
        targetType: brief.targetType,
        requestedByUserId: user.id,
        brief: JSON.stringify(brief),
        level: brief.level,
        courseId: brief.targetType === 'LESSON' ? brief.courseId ?? null : null,
        status: 'generating',
      },
    });
    // Fire-and-forget; runGeneration never throws (it records failure on the job).
    void this.runGeneration(job.id, user);
    return this.view(job);
  }

  private async runGeneration(jobId: string, user: AuthenticatedUser): Promise<void> {
    let courseId: string | null = null;
    try {
      const job = await this.prisma.generationJob.findUnique({ where: { id: jobId } });
      if (!job) return;
      const brief = JSON.parse(job.brief) as Brief;
      if (brief.targetType === 'LESSON') {
        // Single-lesson generation into an existing course lands with the AI
        // iteration stage; refuse cleanly for now so no partial draft leaks.
        throw new Error('Single-lesson generation is not available yet');
      }

      // Stage 1 — brief → skeleton.
      const skeleton = normalizeSkeleton(await this.ai.json(...promptArgs(skeletonPrompt(brief))), brief);

      // Materialise the skeleton as a DRAFT course (ФТ-К402).
      const categoryId = await this.defaultCategoryId();
      const course = await this.content.createCourse(user, {
        categoryId,
        title: brief.topic,
        description: `AI-generated · ${brief.aspects.join(', ')}`,
      });
      courseId = course.id;
      await this.prisma.generationJob.update({ where: { id: jobId }, data: { courseId } });

      const section = await this.content.createSection(user, {
        courseId: course.id,
        level: brief.level as ContentLevel,
        title: brief.topic,
      });
      const lessons: { lessonId: string; unitTitle: string; lessonTitle: string; objectives: string[] }[] = [];
      let unitOrder = 0;
      for (const u of skeleton.units) {
        const unit = await this.content.createUnit(user, { sectionId: section.id, title: u.title, order: unitOrder++ });
        for (const l of u.lessons) {
          const lesson = await this.content.createLesson(user, { unitId: unit.id, title: l.title, objectives: l.objectives });
          lessons.push({ lessonId: lesson.id, unitTitle: u.title, lessonTitle: l.title, objectives: l.objectives });
        }
      }

      // Stage 2 + 3 — detail each lesson (parallel, limited); validation/repair
      // happens in normalizeLessonPlan + the createTask safety net.
      await this.mapLimit(lessons, concurrency(), async (l) => {
        const plan = normalizeLessonPlan(
          await this.ai.json(...promptArgs(lessonPrompt(brief, { unitTitle: l.unitTitle, lessonTitle: l.lessonTitle, objectives: l.objectives }))),
        );
        await this.materializeLesson(user, l.lessonId, plan);
      });

      // Stage 5 — the course is already draft; mark the job ready for review.
      await this.prisma.generationJob.update({
        where: { id: jobId },
        data: { status: 'ready_for_review', error: null },
      });
    } catch (e) {
      this.logger.warn(`Generation job ${jobId} failed: ${(e as Error)?.message ?? e}`);
      await this.prisma.generationJob.update({
        where: { id: jobId },
        data: { status: 'failed', error: String((e as Error)?.message ?? e).slice(0, 500), courseId },
      });
    }
  }

  private async materializeLesson(user: AuthenticatedUser, lessonId: string, plan: LessonPlan) {
    let pageOrder = 0;
    for (const p of plan.pages) {
      const page = await this.content.createPage(user, {
        courseLessonId: lessonId,
        type: p.type as PageType,
        text: p.text,
        order: pageOrder++,
      });
      let taskOrder = 0;
      for (const t of p.tasks) {
        try {
          await this.content.createTask(user, {
            pageId: page.id,
            type: t.type as TaskType,
            gradingMode: t.gradingMode as GradingMode,
            aspect: t.aspect as Aspect,
            estimatedMinutes: t.estimatedMinutes,
            order: taskOrder++,
            payload: t.payload,
            answerKey: t.answerKey,
          });
        } catch {
          // A task the content service still rejects is dropped, not fatal (ФТ-К403).
        }
      }
    }
    if (plan.wordlist.length) await this.content.setWordlist(user, lessonId, plan.wordlist);
    if (plan.grammar) await this.content.setGrammarReference(user, lessonId, plan.grammar);
  }

  async status(user: AuthenticatedUser, jobId: string) {
    return this.view(await this.owned(user, jobId));
  }

  /** Approve a reviewed draft → publish the course (ФТ-К404). */
  async approve(user: AuthenticatedUser, jobId: string) {
    const job = await this.owned(user, jobId);
    if (job.status !== 'ready_for_review' || !job.courseId) {
      throw new BadRequestException('Job is not ready for review');
    }
    await this.content.updateCourse(user, job.courseId, { status: 'published' });
    return this.view(
      await this.prisma.generationJob.update({ where: { id: jobId }, data: { status: 'approved' } }),
    );
  }

  /** Delete the job and, if still a draft, its partial course (ФТ-К409). */
  async remove(user: AuthenticatedUser, jobId: string) {
    const job = await this.owned(user, jobId);
    if (job.targetType === 'COURSE' && job.courseId) {
      const course = await this.prisma.course.findUnique({ where: { id: job.courseId } });
      if (course && course.status === 'draft') {
        await this.prisma.course.delete({ where: { id: course.id } });
      }
    }
    await this.prisma.generationJob.delete({ where: { id: jobId } });
    return { deleted: true };
  }

  private async owned(user: AuthenticatedUser, id: string): Promise<JobRow> {
    const job = await this.prisma.generationJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('Generation job not found');
    if (job.requestedByUserId !== user.id && user.role !== 'admin') {
      throw new ForbiddenException('Not your generation job');
    }
    return job;
  }

  private async defaultCategoryId(): Promise<string> {
    const existing = await this.prisma.category.findFirst({ where: { title: 'AI Generated' } });
    if (existing) return existing.id;
    return (await this.prisma.category.create({ data: { title: 'AI Generated' } })).id;
  }

  private async mapLimit<T>(items: T[], limit: number, fn: (t: T) => Promise<void>): Promise<void> {
    const queue = [...items];
    const workers = Array.from({ length: Math.max(1, Math.min(limit, queue.length)) }, async () => {
      for (let it = queue.shift(); it !== undefined; it = queue.shift()) await fn(it);
    });
    await Promise.all(workers);
  }
}

// Spread a {system,user} prompt into ai.json(system, user).
function promptArgs(p: { system: string; user: string }): [string, string] {
  return [p.system, p.user];
}

function concurrency(): number {
  const n = Number(process.env.AI_MAX_CONCURRENCY);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 8) : 3;
}
