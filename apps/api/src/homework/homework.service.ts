import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/types/jwt-payload';
import { CreateHomeworkDto } from './dto/create-homework.dto';
import { SubmitHomeworkDto } from './dto/submit-homework.dto';
import { GradeHomeworkDto } from './dto/grade-homework.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { seedInstanceState } from '../exercises/canonical';

const HOMEWORK_INCLUDE = {
  submissions: { orderBy: { submittedAt: 'desc' } },
} as const;

@Injectable()
export class HomeworkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private async tutorProfileForUser(userId: string) {
    const profile = await this.prisma.tutorProfile.findUnique({
      where: { userId },
    });
    if (!profile) {
      throw new ForbiddenException('No tutor profile for this user');
    }
    return profile;
  }

  private async studentProfileForUser(userId: string) {
    const profile = await this.prisma.studentProfile.findUnique({
      where: { userId },
    });
    if (!profile) {
      throw new ForbiddenException('No student profile for this user');
    }
    return profile;
  }

  /** Tutor profile for the owner, auto-created for an admin. */
  private async tutorProfileForOwner(user: AuthenticatedUser) {
    const existing = await this.prisma.tutorProfile.findUnique({
      where: { userId: user.id },
    });
    if (existing) return existing;
    if (user.role === 'admin') {
      return this.prisma.tutorProfile.create({ data: { userId: user.id } });
    }
    throw new ForbiddenException('No tutor profile for this user');
  }

  /** Attach exercise-instance summaries to homework rows. */
  private async withExercises<T extends { id: string }>(hws: T[]) {
    return Promise.all(
      hws.map(async (hw) => {
        const exercises = await this.prisma.exerciseInstance.findMany({
          where: { homeworkId: hw.id },
          select: { id: true, status: true, score: true, exerciseId: true },
        });
        return { ...hw, exercises };
      }),
    );
  }

  /**
   * Assign one or more exercises to one or more students. Each student gets
   * their own homework + per-exercise instance, and a notification.
   */
  async assignExercises(
    user: AuthenticatedUser,
    dto: {
      studentProfileIds: string[];
      exerciseIds: string[];
      title?: string;
      dueAt?: string;
    },
  ) {
    const tutor = await this.tutorProfileForOwner(user);
    // Fetch the referenced templates so each instance can seed its OWN
    // server-side layout — independent per (student × task), never revealing the
    // answer (ФТ-У302). Canonical + legacy exercises both ride this path.
    const refs = await this.prisma.exercise.findMany({
      where: { id: { in: dto.exerciseIds } },
      select: { id: true, type: true, payload: true },
    });
    const byId = new Map(refs.map((r) => [r.id, r]));
    const created: string[] = [];
    for (const studentProfileId of dto.studentProfileIds) {
      const student = await this.prisma.studentProfile.findUnique({
        where: { id: studentProfileId },
      });
      if (!student) continue;
      const homework = await this.prisma.homework.create({
        data: {
          tutorProfileId: tutor.id,
          studentProfileId,
          title: dto.title || 'Exercises',
          dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
          status: 'assigned',
        },
      });
      for (const exerciseId of dto.exerciseIds) {
        const ex = byId.get(exerciseId);
        const seeded = ex ? seedInstanceState(ex.type, ex.payload) : undefined;
        await this.prisma.exerciseInstance.create({
          data: {
            exerciseId,
            context: 'homework',
            homeworkId: homework.id,
            studentProfileId,
            ...(seeded ? { state: seeded } : {}),
          },
        });
      }
      await this.notifications.enqueue({
        userId: student.userId,
        templateKey: 'homework_assigned',
        payload: { title: homework.title },
      });
      created.push(homework.id);
    }
    return { created: created.length };
  }

  async create(user: AuthenticatedUser, dto: CreateHomeworkDto) {
    const tutor = await this.tutorProfileForUser(user.id);
    const homework = await this.prisma.homework.create({
      data: {
        tutorProfileId: tutor.id,
        studentProfileId: dto.studentProfileId,
        lessonId: dto.lessonId,
        title: dto.title,
        description: dto.description,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        status: 'assigned',
      },
      include: HOMEWORK_INCLUDE,
    });

    // Notify the student (in their own language).
    const student = await this.prisma.studentProfile.findUnique({
      where: { id: dto.studentProfileId },
    });
    if (student) {
      await this.notifications.enqueue({
        userId: student.userId,
        templateKey: 'homework_assigned',
        payload: { title: homework.title },
      });
    }

    return homework;
  }

  async list(user: AuthenticatedUser) {
    if (user.role === 'tutor' || user.role === 'admin') {
      const tutor = await this.prisma.tutorProfile.findUnique({
        where: { userId: user.id },
      });
      const hws =
        user.role === 'admin'
          ? await this.prisma.homework.findMany({
              orderBy: { createdAt: 'desc' },
              include: HOMEWORK_INCLUDE,
            })
          : tutor
            ? await this.prisma.homework.findMany({
                where: { tutorProfileId: tutor.id },
                orderBy: { createdAt: 'desc' },
                include: HOMEWORK_INCLUDE,
              })
            : [];
      return this.withExercises(hws);
    }
    if (user.role === 'student') {
      const student = await this.prisma.studentProfile.findUnique({
        where: { userId: user.id },
      });
      if (!student) return [];
      const hws = await this.prisma.homework.findMany({
        where: { studentProfileId: student.id },
        orderBy: { createdAt: 'desc' },
        include: HOMEWORK_INCLUDE,
      });
      return this.withExercises(hws);
    }
    return [];
  }

  async getOne(user: AuthenticatedUser, id: string) {
    const hw = await this.prisma.homework.findUnique({
      where: { id },
      include: HOMEWORK_INCLUDE,
    });
    if (!hw) {
      throw new NotFoundException('Homework not found');
    }
    await this.assertCanView(user, hw);
    const [withEx] = await this.withExercises([hw]);
    return withEx;
  }

  async submit(user: AuthenticatedUser, id: string, dto: SubmitHomeworkDto) {
    const hw = await this.prisma.homework.findUnique({ where: { id } });
    if (!hw) {
      throw new NotFoundException('Homework not found');
    }
    const student = await this.studentProfileForUser(user.id);
    if (hw.studentProfileId !== student.id) {
      throw new ForbiddenException('Not your homework');
    }

    await this.prisma.homeworkSubmission.create({
      data: {
        homeworkId: id,
        content: dto.content,
        fileUrls: dto.fileUrls ? JSON.stringify(dto.fileUrls) : null,
      },
    });
    await this.prisma.homework.update({
      where: { id },
      data: { status: 'submitted' },
    });
    return this.prisma.homework.findUnique({
      where: { id },
      include: HOMEWORK_INCLUDE,
    });
  }

  async grade(user: AuthenticatedUser, id: string, dto: GradeHomeworkDto) {
    const hw = await this.prisma.homework.findUnique({
      where: { id },
      include: HOMEWORK_INCLUDE,
    });
    if (!hw) {
      throw new NotFoundException('Homework not found');
    }
    const tutor = await this.tutorProfileForUser(user.id);
    if (hw.tutorProfileId !== tutor.id) {
      throw new ForbiddenException('Not your homework');
    }

    const submission = dto.submissionId
      ? hw.submissions.find((s) => s.id === dto.submissionId)
      : hw.submissions[0];
    if (!submission) {
      throw new NotFoundException('No submission to grade');
    }

    await this.prisma.homeworkSubmission.update({
      where: { id: submission.id },
      data: { grade: dto.grade, feedback: dto.feedback },
    });
    await this.prisma.homework.update({
      where: { id },
      data: { status: 'graded' },
    });
    return this.prisma.homework.findUnique({
      where: { id },
      include: HOMEWORK_INCLUDE,
    });
  }

  private async assertCanView(
    user: AuthenticatedUser,
    hw: { tutorProfileId: string; studentProfileId: string },
  ): Promise<void> {
    if (user.role === 'admin') {
      return;
    }
    if (user.role === 'tutor') {
      const tutor = await this.prisma.tutorProfile.findUnique({
        where: { userId: user.id },
      });
      if (tutor && tutor.id === hw.tutorProfileId) {
        return;
      }
    }
    if (user.role === 'student') {
      const student = await this.prisma.studentProfile.findUnique({
        where: { userId: user.id },
      });
      if (student && student.id === hw.studentProfileId) {
        return;
      }
    }
    throw new ForbiddenException('Not allowed to access this homework');
  }
}
