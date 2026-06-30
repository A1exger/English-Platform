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
    validatePayload(dto.type, dto.payload);
    return this.prisma.exercise.create({
      data: {
        ownerUserId: user.id,
        type: dto.type,
        title: dto.title,
        payload: JSON.stringify(dto.payload),
      },
    });
  }

  async list(user: AuthenticatedUser) {
    if (user.role === 'admin') {
      return this.prisma.exercise.findMany({ orderBy: { createdAt: 'desc' } });
    }
    const adminIds = await this.adminUserIds();
    return this.prisma.exercise.findMany({
      where: { ownerUserId: { in: [...new Set([user.id, ...adminIds])] } },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async ownedExercise(user: AuthenticatedUser, id: string) {
    const ex = await this.prisma.exercise.findUnique({ where: { id } });
    if (!ex) throw new NotFoundException('Exercise not found');
    if (ex.ownerUserId !== user.id && user.role !== 'admin') {
      throw new ForbiddenException('Not your exercise');
    }
    return ex;
  }

  /** Full template (with solution) — owner/admin only, for editing/preview. */
  async getOne(user: AuthenticatedUser, id: string) {
    const ex = await this.ownedExercise(user, id);
    return { ...ex, payload: JSON.parse(ex.payload) };
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateExerciseDto) {
    const ex = await this.ownedExercise(user, id);
    if (dto.payload) {
      validatePayload(ex.type as ExerciseType, dto.payload);
    }
    return this.prisma.exercise.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.payload !== undefined ? { payload: JSON.stringify(dto.payload) } : {}),
      },
    });
  }

  async remove(user: AuthenticatedUser, id: string) {
    await this.ownedExercise(user, id);
    await this.prisma.exercise.delete({ where: { id } });
    return { deleted: true };
  }

  async duplicate(user: AuthenticatedUser, id: string) {
    const ex = await this.ownedExercise(user, id);
    return this.prisma.exercise.create({
      data: {
        ownerUserId: user.id,
        type: ex.type,
        title: `${ex.title} (copy)`,
        payload: ex.payload,
      },
    });
  }

  // --- live lesson instances ------------------------------------------------

  /** Sanitized question (no solution) + current state/status for an instance. */
  private instanceView(
    instance: { id: string; status: string; score: number | null; state: string | null },
    exercise: { type: string; title: string; payload: string },
  ) {
    return {
      id: instance.id,
      status: instance.status,
      score: instance.score,
      state: instance.state ? JSON.parse(instance.state) : null,
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
    const instance = await this.prisma.exerciseInstance.create({
      data: { exerciseId, context: 'lesson', lessonId },
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

  /** Server-side check. Idempotent for homework: returns the stored score. */
  async check(user: AuthenticatedUser, id: string) {
    const instance = await this.accessibleInstance(user, id);
    const payload = JSON.parse(instance.exercise.payload);
    const solution = solutionFor(instance.exercise.type as ExerciseType, payload);
    if (instance.status === 'submitted' && instance.score !== null) {
      return {
        score: instance.score,
        correct: instance.score === 100,
        submitted: true,
        solution,
      };
    }
    const state = instance.state ? JSON.parse(instance.state) : {};
    const result = checkAnswer(
      instance.exercise.type as ExerciseType,
      payload,
      state,
    );

    if (instance.context === 'homework') {
      await this.prisma.exerciseInstance.update({
        where: { id },
        data: { status: 'submitted', score: result.score },
      });
      // When every exercise in the homework is submitted, mark it graded.
      if (instance.homeworkId) {
        const remaining = await this.prisma.exerciseInstance.count({
          where: { homeworkId: instance.homeworkId, status: { not: 'submitted' } },
        });
        if (remaining === 0) {
          await this.prisma.homework.update({
            where: { id: instance.homeworkId },
            data: { status: 'graded' },
          });
        }
      }
    }
    return { score: result.score, correct: result.correct, submitted: true, solution };
  }
}
