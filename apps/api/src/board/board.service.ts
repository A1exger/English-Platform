import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LessonsService } from '../lessons/lessons.service';
import { AuthenticatedUser } from '../auth/types/jwt-payload';
import { UserRole } from '../common/constants/enums';
import { SaveSnapshotDto } from './dto/save-snapshot.dto';

@Injectable()
export class BoardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lessons: LessonsService,
  ) {}

  /** Get (or lazily create) the board for a lesson the user may access. */
  async getForLesson(user: AuthenticatedUser, lessonId: string) {
    await this.lessons.getOne(user, lessonId); // throws if no access
    return this.ensureBoard(lessonId);
  }

  async saveSnapshot(
    user: AuthenticatedUser,
    lessonId: string,
    dto: SaveSnapshotDto,
  ) {
    await this.lessons.getOne(user, lessonId);
    const board = await this.ensureBoard(lessonId);
    const [updated] = await this.prisma.$transaction([
      this.prisma.board.update({
        where: { id: board.id },
        data: { latestSnapshot: dto.snapshot },
      }),
      this.prisma.boardSnapshot.create({
        data: {
          boardId: board.id,
          snapshot: dto.snapshot,
          authorUserId: user.id,
          label: dto.label,
        },
      }),
    ]);
    return updated;
  }

  /** Persist the shared lesson notepad. */
  async saveNotes(user: AuthenticatedUser, lessonId: string, notes: string) {
    await this.lessons.getOne(user, lessonId);
    const board = await this.ensureBoard(lessonId);
    return this.prisma.board.update({
      where: { id: board.id },
      data: { notes },
      select: { id: true, notes: true },
    });
  }

  async history(user: AuthenticatedUser, lessonId: string) {
    await this.lessons.getOne(user, lessonId);
    const board = await this.ensureBoard(lessonId);
    return this.prisma.boardSnapshot.findMany({
      where: { boardId: board.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, authorUserId: true, label: true, createdAt: true },
    });
  }

  /**
   * Lightweight access check for the WebSocket gateway: owning tutor, a booked
   * student, or an admin.
   */
  async canAccessLesson(
    userId: string,
    role: UserRole,
    lessonId: string,
  ): Promise<boolean> {
    if (role === 'admin') {
      return true;
    }
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { participants: true, tutorProfile: true },
    });
    if (!lesson) {
      return false;
    }
    if (role === 'tutor') {
      return lesson.tutorProfile.userId === userId;
    }
    if (role === 'student') {
      const student = await this.prisma.studentProfile.findUnique({
        where: { userId },
      });
      return Boolean(
        student &&
          lesson.participants.some((p) => p.studentProfileId === student.id),
      );
    }
    return false;
  }

  private async ensureBoard(lessonId: string) {
    const existing = await this.prisma.board.findUnique({ where: { lessonId } });
    if (existing) {
      return existing;
    }
    return this.prisma.board.create({ data: { lessonId } });
  }
}
