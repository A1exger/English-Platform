import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/types/jwt-payload';
import { NotificationsService } from '../notifications/notifications.service';
import { GradedTask } from '../content/scoring';
import {
  CardSnapshot,
  cardQuestion,
  resultFromCards,
  scoreCard,
  snapshotTask,
} from './assignment-scoring';
import {
  CreateAssignmentDto,
  GradeCardDto,
  SubmitCardDto,
} from './dto/assignment.dto';

@Injectable()
export class AssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // --- helpers --------------------------------------------------------------

  private async studentProfileForUser(userId: string) {
    const profile = await this.prisma.studentProfile.findUnique({
      where: { userId },
    });
    if (!profile) throw new ForbiddenException('No student profile');
    return profile;
  }

  /** Map studentProfileIds -> a display name, for tutor/admin views. */
  private async studentNames(ids: string[]): Promise<Record<string, string>> {
    if (ids.length === 0) return {};
    const rows = await this.prisma.studentProfile.findMany({
      where: { id: { in: Array.from(new Set(ids)) } },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
    const out: Record<string, string> = {};
    for (const r of rows) out[r.id] = `${r.user.firstName} ${r.user.lastName}`.trim();
    return out;
  }

  private parseSnapshot(card: { taskSnapshot: string }): CardSnapshot {
    return JSON.parse(card.taskSnapshot) as CardSnapshot;
  }

  // --- authoring (tutor/admin): create an assignment with a snapshot --------

  /**
   * INV-7: snapshot the selected tasks into HomeworkCards at assignment time.
   * Tasks come either from an explicit `taskIds` pool or from a whole lesson
   * (kind=homework prefers pages flagged includedInHomework).
   */
  async createAssignment(user: AuthenticatedUser, dto: CreateAssignmentDto) {
    const student = await this.prisma.studentProfile.findUnique({
      where: { id: dto.studentProfileId },
    });
    if (!student) throw new NotFoundException('Student not found');

    const tasks = await this.collectTasks(dto);
    if (tasks.length === 0) {
      throw new BadRequestException('No tasks to assign');
    }

    const assignment = await this.prisma.$transaction(async (db) => {
      const created = await db.contentAssignment.create({
        data: {
          courseLessonId: dto.courseLessonId ?? null,
          studentProfileId: dto.studentProfileId,
          assignedByUserId: user.id,
          kind: dto.kind,
          topicTag: dto.topicTag ?? null,
          dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
          status: 'assigned',
        },
      });
      for (let i = 0; i < tasks.length; i++) {
        await db.homeworkCard.create({
          data: {
            assignmentId: created.id,
            taskSnapshot: JSON.stringify(snapshotTask(tasks[i])),
            order: i,
          },
        });
      }
      return created;
    });

    await this.notifications.enqueue({
      userId: student.userId,
      templateKey: 'homework_assigned',
      payload: { title: dto.topicTag ?? 'Homework' },
    });

    return this.getOne(user, assignment.id);
  }

  /** Resolve the ordered list of source tasks to snapshot for an assignment. */
  private async collectTasks(dto: CreateAssignmentDto) {
    if (dto.taskIds && dto.taskIds.length > 0) {
      const found = await this.prisma.lessonTask.findMany({
        where: { id: { in: dto.taskIds } },
      });
      // Preserve the caller's order (pool selection).
      const byId = new Map(found.map((t) => [t.id, t]));
      return dto.taskIds.map((id) => byId.get(id)).filter((t): t is NonNullable<typeof t> => !!t);
    }
    if (dto.courseLessonId) {
      const pages = await this.prisma.lessonPage.findMany({
        where: { courseLessonId: dto.courseLessonId },
        orderBy: { order: 'asc' },
        include: { tasks: { orderBy: { order: 'asc' } } },
      });
      const homeworkPages = pages.filter((p) => p.includedInHomework);
      const source = dto.kind === 'homework' && homeworkPages.length > 0 ? homeworkPages : pages;
      return source.flatMap((p) => p.tasks);
    }
    throw new BadRequestException('Provide courseLessonId or taskIds');
  }

  // --- reads ----------------------------------------------------------------

  async listForUser(user: AuthenticatedUser) {
    let where: Record<string, unknown>;
    if (user.role === 'student') {
      const student = await this.studentProfileForUser(user.id);
      where = { studentProfileId: student.id };
    } else if (user.role === 'admin') {
      where = {};
    } else {
      where = { assignedByUserId: user.id };
    }

    const rows = await this.prisma.contentAssignment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        cards: { select: { status: true } },
        result: true,
      },
    });

    const names =
      user.role === 'student'
        ? {}
        : await this.studentNames(rows.map((r) => r.studentProfileId));

    return rows.map((a) => ({
      id: a.id,
      kind: a.kind,
      topicTag: a.topicTag,
      dueAt: a.dueAt,
      status: a.status,
      createdAt: a.createdAt,
      cardCount: a.cards.length,
      submittedCount: a.cards.filter((c) => c.status === 'submitted').length,
      studentName: names[a.studentProfileId],
      result: a.result
        ? {
            overall: a.result.overall,
            completion: a.result.completion,
            motivationTier: a.result.motivationTier,
          }
        : null,
    }));
  }

  async getOne(user: AuthenticatedUser, id: string) {
    const a = await this.prisma.contentAssignment.findUnique({
      where: { id },
      include: {
        cards: { orderBy: { order: 'asc' } },
        result: true,
      },
    });
    if (!a) throw new NotFoundException('Assignment not found');

    const isStudent = user.role === 'student';
    if (isStudent) {
      const student = await this.studentProfileForUser(user.id);
      if (a.studentProfileId !== student.id) {
        throw new ForbiddenException('Not your assignment');
      }
    } else if (user.role !== 'admin' && a.assignedByUserId !== user.id) {
      throw new ForbiddenException('Not your assignment');
    }

    const names = isStudent ? {} : await this.studentNames([a.studentProfileId]);

    const cards = a.cards.map((c) => {
      const snap = this.parseSnapshot(c);
      const submitted = c.status === 'submitted';
      const q = cardQuestion(c.id, snap);
      // Students only see the answer key after they submit an AUTO card.
      const revealSolution = submitted && snap.gradingMode === 'AUTO';
      return {
        ...q,
        order: c.order,
        status: c.status,
        score: c.score,
        feedback: c.feedback,
        state: c.state ? JSON.parse(c.state) : null,
        // Tutors always see the key; students only post-submit.
        solution: !isStudent || revealSolution ? snap.answerKey : null,
      };
    });

    return {
      id: a.id,
      kind: a.kind,
      topicTag: a.topicTag,
      dueAt: a.dueAt,
      status: a.status,
      createdAt: a.createdAt,
      courseLessonId: a.courseLessonId,
      studentName: names[a.studentProfileId],
      cards,
      result: a.result
        ? {
            overall: a.result.overall,
            perAspect: JSON.parse(a.result.perAspect) as Record<string, number>,
            completion: a.result.completion,
            motivationTier: a.result.motivationTier,
          }
        : null,
    };
  }

  // --- student: submit one card --------------------------------------------

  async submitCard(user: AuthenticatedUser, cardId: string, dto: SubmitCardDto) {
    const card = await this.prisma.homeworkCard.findUnique({
      where: { id: cardId },
      include: { assignment: true },
    });
    if (!card) throw new NotFoundException('Card not found');
    const student = await this.studentProfileForUser(user.id);
    if (card.assignment.studentProfileId !== student.id) {
      throw new ForbiddenException('Not your homework');
    }

    const snap = this.parseSnapshot(card);
    const grade = scoreCard(snap, dto.state);
    await this.prisma.homeworkCard.update({
      where: { id: cardId },
      data: {
        state: JSON.stringify(dto.state),
        score: grade.score,
        status: 'submitted',
        submittedAt: new Date(),
      },
    });
    await this.recomputeResult(card.assignmentId);

    return {
      completed: grade.completed,
      gradingMode: snap.gradingMode,
      score: grade.score ?? undefined,
      solution: grade.solution ?? undefined,
    };
  }

  // --- tutor: manual grade/feedback for MANUAL (essay) cards ----------------

  async gradeCard(user: AuthenticatedUser, cardId: string, dto: GradeCardDto) {
    const card = await this.prisma.homeworkCard.findUnique({
      where: { id: cardId },
      include: { assignment: true },
    });
    if (!card) throw new NotFoundException('Card not found');
    if (user.role !== 'admin' && card.assignment.assignedByUserId !== user.id) {
      throw new ForbiddenException('Not your assignment');
    }
    await this.prisma.homeworkCard.update({
      where: { id: cardId },
      data: {
        ...(dto.score !== undefined ? { score: dto.score } : {}),
        ...(dto.feedback !== undefined ? { feedback: dto.feedback } : {}),
      },
    });
    await this.recomputeResult(card.assignmentId);
    return this.getOne(user, card.assignmentId);
  }

  /**
   * Recompute and persist the LessonResult (INV-3/4/5) from the current cards,
   * and advance the assignment status (assigned -> in_progress -> done).
   */
  private async recomputeResult(assignmentId: string) {
    const cards = await this.prisma.homeworkCard.findMany({
      where: { assignmentId },
    });
    const graded: GradedTask[] = cards.map((c) => {
      const snap = this.parseSnapshot(c);
      return {
        gradingMode: snap.gradingMode,
        aspect: snap.aspect,
        score: c.score ?? null,
        completed: c.status === 'submitted',
      };
    });
    const agg = resultFromCards(graded);

    await this.prisma.lessonResult.upsert({
      where: { assignmentId },
      update: {
        overall: agg.overall,
        perAspect: JSON.stringify(agg.perAspect),
        completion: agg.completion,
        motivationTier: agg.motivationTier,
      },
      create: {
        assignmentId,
        overall: agg.overall,
        perAspect: JSON.stringify(agg.perAspect),
        completion: agg.completion,
        motivationTier: agg.motivationTier,
      },
    });

    const submitted = cards.filter((c) => c.status === 'submitted').length;
    const status = submitted === 0 ? 'assigned' : submitted === cards.length ? 'done' : 'in_progress';
    await this.prisma.contentAssignment.update({
      where: { id: assignmentId },
      data: { status },
    });
  }
}
