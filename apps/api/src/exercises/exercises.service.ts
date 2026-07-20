import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LessonsService } from '../lessons/lessons.service';
import { AuthenticatedUser } from '../auth/types/jwt-payload';
import {
  CreateExerciseDto,
  UpdateExerciseDto,
} from './dto/exercise.dto';
import {
  checkAnswer,
  ExerciseType,
  solutionFor,
  toQuestion,
  validatePayload,
} from './exercise.logic';
import { grade, sanitize, TaskType } from '../common/tasks/task-contract';
import { isCanonicalType, normalizeCanonical, seedInstanceState } from './canonical';

// Columns returned by the library listing: never ship `payload`/`answerKey`
// (they may encode the solution) — only what the UI needs to render a card.
const EXERCISE_CARD_SELECT = {
  id: true,
  type: true,
  title: true,
  prompt: true,
  aspect: true,
  gradingMode: true,
  isPublic: true,
  ownerUserId: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class ExercisesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lessons: LessonsService,
  ) {}

  private async adminUserIds(): Promise<string[]> {
    const admins = await this.prisma.user.findMany({
      where: { role: 'admin' },
      select: { id: true },
    });
    return admins.map((a) => a.id);
  }

  // --- templates (CRUD) -----------------------------------------------------

  async create(user: AuthenticatedUser, dto: CreateExerciseDto) {
    // Common authoring fields (canonical types use them; legacy ignores prompt/
    // aspect but they are harmless additive columns with sane defaults).
    const base = {
      ownerUserId: user.id,
      type: dto.type,
      title: dto.title,
      prompt: dto.prompt ?? null,
      gradingMode: dto.gradingMode ?? 'AUTO',
      aspect: dto.aspect ?? 'Grammar',
      isPublic: dto.isPublic ?? false,
    };
    if (isCanonicalType(dto.type)) {
      const norm = normalizeCanonical(dto.type, dto.payload, dto.answerKey ?? null);
      return this.prisma.exercise.create({
        data: {
          ...base,
          payload: JSON.stringify(norm.payload),
          answerKey: norm.answerKey ? JSON.stringify(norm.answerKey) : null,
        },
      });
    }
    // Legacy order/match/fill/categorize (unchanged behaviour).
    validatePayload(dto.type as ExerciseType, dto.payload);
    return this.prisma.exercise.create({
      data: { ...base, payload: JSON.stringify(dto.payload) },
    });
  }

  /** Library listing (ФТ-У101): own + admin-shared + public, without solutions. */
  async list(user: AuthenticatedUser) {
    if (user.role === 'admin') {
      return this.prisma.exercise.findMany({
        orderBy: { createdAt: 'desc' },
        select: EXERCISE_CARD_SELECT,
      });
    }
    const adminIds = await this.adminUserIds();
    return this.prisma.exercise.findMany({
      where: {
        OR: [
          { ownerUserId: { in: [...new Set([user.id, ...adminIds])] } },
          { isPublic: true },
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: EXERCISE_CARD_SELECT,
    });
  }

  /** Owner/admin only — required to edit, delete or assign. */
  private async ownedExercise(user: AuthenticatedUser, id: string) {
    const ex = await this.prisma.exercise.findUnique({ where: { id } });
    if (!ex) throw new NotFoundException('Exercise not found');
    if (ex.ownerUserId !== user.id && user.role !== 'admin') {
      throw new ForbiddenException('Not your exercise');
    }
    return ex;
  }

  /** Readable by any tutor/admin who owns it, is admin, or it is public. */
  private async readableExercise(user: AuthenticatedUser, id: string) {
    const ex = await this.prisma.exercise.findUnique({ where: { id } });
    if (!ex) throw new NotFoundException('Exercise not found');
    if (ex.ownerUserId === user.id || user.role === 'admin' || ex.isPublic) {
      return ex;
    }
    throw new ForbiddenException('Not your exercise');
  }

  /**
   * Full template (with solution) for editing/preview. The endpoint is
   * tutor/admin-only, so returning the answerKey here does not leak it to
   * students (that concern is handled by the student-facing instance view).
   */
  async getOne(user: AuthenticatedUser, id: string) {
    const ex = await this.readableExercise(user, id);
    return {
      ...ex,
      payload: JSON.parse(ex.payload),
      answerKey: ex.answerKey ? JSON.parse(ex.answerKey) : null,
    };
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateExerciseDto) {
    const ex = await this.ownedExercise(user, id);
    const data: Record<string, unknown> = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.prompt !== undefined) data.prompt = dto.prompt || null;
    if (dto.gradingMode !== undefined) data.gradingMode = dto.gradingMode;
    if (dto.aspect !== undefined) data.aspect = dto.aspect;
    if (dto.isPublic !== undefined) data.isPublic = dto.isPublic;

    if (isCanonicalType(ex.type)) {
      // Re-validate whenever the payload or answerKey changes.
      if (dto.payload !== undefined || dto.answerKey !== undefined) {
        const nextPayload = dto.payload ?? JSON.parse(ex.payload);
        const nextKey =
          dto.answerKey ?? (ex.answerKey ? JSON.parse(ex.answerKey) : null);
        const norm = normalizeCanonical(ex.type as TaskType, nextPayload, nextKey);
        data.payload = JSON.stringify(norm.payload);
        data.answerKey = norm.answerKey ? JSON.stringify(norm.answerKey) : null;
      }
    } else if (dto.payload !== undefined) {
      validatePayload(ex.type as ExerciseType, dto.payload);
      data.payload = JSON.stringify(dto.payload);
    }
    return this.prisma.exercise.update({ where: { id }, data });
  }

  async remove(user: AuthenticatedUser, id: string) {
    await this.ownedExercise(user, id);
    await this.prisma.exercise.delete({ where: { id } });
    return { deleted: true };
  }

  async duplicate(user: AuthenticatedUser, id: string) {
    const ex = await this.readableExercise(user, id);
    return this.prisma.exercise.create({
      data: {
        ownerUserId: user.id,
        type: ex.type,
        title: `${ex.title} (copy)`,
        prompt: ex.prompt,
        payload: ex.payload,
        answerKey: ex.answerKey,
        gradingMode: ex.gradingMode,
        aspect: ex.aspect,
        isPublic: false, // a copy starts private
      },
    });
  }

  // --- live lesson instances ------------------------------------------------

  /**
   * The student-facing view of an instance: no solution ever. Canonical tasks
   * return a `sanitize`d def (App. В) + any stored result; legacy tasks return
   * the shuffled `question` as before. `kind` lets the player pick a renderer.
   */
  private instanceView(
    instance: {
      id: string;
      status: string;
      score: number | null;
      state: string | null;
      result?: string | null;
    },
    exercise: { type: string; title: string; prompt?: string | null; payload: string },
  ) {
    const base = {
      id: instance.id,
      status: instance.status,
      score: instance.score,
      state: instance.state ? JSON.parse(instance.state) : null,
    };
    if (isCanonicalType(exercise.type)) {
      return {
        ...base,
        kind: 'canonical' as const,
        taskType: exercise.type,
        title: exercise.title,
        prompt: exercise.prompt ?? null,
        def: sanitize(exercise.type as TaskType, JSON.parse(exercise.payload)),
        result: instance.result ? JSON.parse(instance.result) : null,
      };
    }
    return {
      ...base,
      kind: 'legacy' as const,
      question: toQuestion(
        exercise.type as ExerciseType,
        exercise.title,
        JSON.parse(exercise.payload),
      ),
    };
  }

  async createLessonInstance(
    user: AuthenticatedUser,
    lessonId: string,
    exerciseId: string,
  ) {
    await this.lessons.getOne(user, lessonId); // access + existence
    const exercise = await this.prisma.exercise.findUnique({
      where: { id: exerciseId },
    });
    if (!exercise) throw new NotFoundException('Exercise not found');
    // Seed the initial layout on the SERVER (§Прил. В / ФТ-У302).
    const seededState = seedInstanceState(exercise.type, exercise.payload);
    const instance = await this.prisma.exerciseInstance.create({
      data: {
        exerciseId,
        context: 'lesson',
        lessonId,
        ...(seededState ? { state: seededState } : {}),
      },
    });
    return this.instanceView(instance, exercise);
  }

  async listLessonInstances(user: AuthenticatedUser, lessonId: string) {
    await this.lessons.getOne(user, lessonId);
    const instances = await this.prisma.exerciseInstance.findMany({
      where: { lessonId, context: 'lesson' },
      orderBy: { createdAt: 'asc' },
      include: { exercise: true },
    });
    return instances.map((i) => this.instanceView(i, i.exercise));
  }

  /** Remove a live exercise from a lesson board (tutor/admin). */
  async removeLessonInstance(
    user: AuthenticatedUser,
    lessonId: string,
    instanceId: string,
  ) {
    await this.lessons.getOne(user, lessonId);
    await this.prisma.exerciseInstance.deleteMany({
      where: { id: instanceId, lessonId },
    });
    return { deleted: true };
  }

  // --- instance state + checking (lesson or homework) -----------------------

  private async accessibleInstance(user: AuthenticatedUser, id: string) {
    const instance = await this.prisma.exerciseInstance.findUnique({
      where: { id },
      include: { exercise: true },
    });
    if (!instance) throw new NotFoundException('Exercise instance not found');

    if (user.role === 'admin' || instance.exercise.ownerUserId === user.id) {
      return instance;
    }
    if (instance.context === 'homework') {
      const student = await this.prisma.studentProfile.findUnique({
        where: { userId: user.id },
      });
      if (student && student.id === instance.studentProfileId) return instance;
    }
    if (instance.context === 'lesson' && instance.lessonId) {
      // Anyone allowed into the lesson may solve a live exercise.
      await this.lessons.getOne(user, instance.lessonId);
      return instance;
    }
    throw new ForbiddenException('Not allowed');
  }

  async getInstance(user: AuthenticatedUser, id: string) {
    const instance = await this.accessibleInstance(user, id);
    return this.instanceView(instance, instance.exercise);
  }

  async saveState(
    user: AuthenticatedUser,
    id: string,
    state: Record<string, unknown>,
  ) {
    const instance = await this.accessibleInstance(user, id);
    if (instance.status === 'submitted') {
      return this.instanceView(instance, instance.exercise);
    }
    const updated = await this.prisma.exerciseInstance.update({
      where: { id },
      data: { state: JSON.stringify(state) },
      include: { exercise: true },
    });
    return this.instanceView(updated, updated.exercise);
  }

  /** Mark a homework graded once all of its instances are submitted. */
  private async markHomeworkGradedIfDone(homeworkId: string | null) {
    if (!homeworkId) return;
    const remaining = await this.prisma.exerciseInstance.count({
      where: { homeworkId, status: { not: 'submitted' } },
    });
    if (remaining === 0) {
      await this.prisma.homework.update({
        where: { id: homeworkId },
        data: { status: 'graded' },
      });
    }
  }

  /** Server-side check. Idempotent for homework: returns the stored score. */
  async check(user: AuthenticatedUser, id: string) {
    const instance = await this.accessibleInstance(user, id);
    const payload = JSON.parse(instance.exercise.payload);
    const type = instance.exercise.type;
    const state = instance.state ? JSON.parse(instance.state) : {};

    // --- canonical (App. В): per-element grading; the эталон never leaves ---
    if (isCanonicalType(type)) {
      // Homework is terminal: a re-check returns the stored result unchanged, so
      // a resubmission never re-grades or double-counts (ФТ-У403).
      if (
        instance.context === 'homework' &&
        instance.status === 'submitted' &&
        instance.result
      ) {
        const stored = JSON.parse(instance.result);
        return {
          correct: stored.correct,
          score: stored.score,
          perToken: stored.perToken ?? null,
          submitted: true,
        };
      }
      const answerKey = instance.exercise.answerKey
        ? JSON.parse(instance.exercise.answerKey)
        : {};
      const result = grade(type as TaskType, payload, answerKey, state);
      await this.prisma.exerciseInstance.update({
        where: { id },
        data: {
          result: JSON.stringify(result),
          // Homework submission is terminal + scored; a live lesson check is a
          // re-checkable reveal, so it only stores the result.
          ...(instance.context === 'homework'
            ? { status: 'submitted', score: result.score }
            : {}),
        },
      });
      if (instance.context === 'homework') {
        await this.markHomeworkGradedIfDone(instance.homeworkId);
      }
      return {
        correct: result.correct,
        score: result.score,
        perToken: result.perToken ?? null,
        submitted: true,
      };
    }

    // --- legacy (unchanged) ---
    const solution = solutionFor(type as ExerciseType, payload);
    if (instance.status === 'submitted' && instance.score !== null) {
      return {
        score: instance.score,
        correct: instance.score === 100,
        submitted: true,
        solution,
      };
    }
    const result = checkAnswer(type as ExerciseType, payload, state);
    if (instance.context === 'homework') {
      await this.prisma.exerciseInstance.update({
        where: { id },
        data: { status: 'submitted', score: result.score },
      });
      await this.markHomeworkGradedIfDone(instance.homeworkId);
    }
    return { score: result.score, correct: result.correct, submitted: true, solution };
  }
}
