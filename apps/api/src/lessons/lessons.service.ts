import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { UpdateLessonDto } from './dto/update-lesson.dto';
import { AttendanceDto } from './dto/attendance.dto';
import { AuthenticatedUser } from '../auth/types/jwt-payload';

const LESSON_INCLUDE = {
  participants: { include: { studentProfile: true } },
  attendance: true,
  tutorProfile: true,
} as const;

@Injectable()
export class LessonsService {
  constructor(private readonly prisma: PrismaService) {}

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

  async create(user: AuthenticatedUser, dto: CreateLessonDto) {
    const tutorProfile = await this.tutorProfileForUser(user.id);

    if (new Date(dto.endsAt) <= new Date(dto.startsAt)) {
      throw new BadRequestException('endsAt must be after startsAt');
    }

    return this.prisma.lesson.create({
      data: {
        tutorProfileId: tutorProfile.id,
        type: dto.type ?? 'individual',
        title: dto.title,
        startsAt: new Date(dto.startsAt),
        endsAt: new Date(dto.endsAt),
        priceCents: dto.priceCents ?? 0,
        currency: dto.currency ?? 'EUR',
        meetingUrl: dto.meetingUrl,
        ...(dto.studentProfileIds && dto.studentProfileIds.length > 0
          ? {
              participants: {
                create: dto.studentProfileIds.map((studentProfileId) => ({
                  studentProfileId,
                })),
              },
            }
          : {}),
      },
      include: LESSON_INCLUDE,
    });
  }

  async list(user: AuthenticatedUser) {
    if (user.role === 'tutor') {
      const tutorProfile = await this.prisma.tutorProfile.findUnique({
        where: { userId: user.id },
      });
      if (!tutorProfile) {
        return [];
      }
      return this.prisma.lesson.findMany({
        where: { tutorProfileId: tutorProfile.id },
        orderBy: { startsAt: 'asc' },
        include: LESSON_INCLUDE,
      });
    }

    if (user.role === 'student') {
      const studentProfile = await this.prisma.studentProfile.findUnique({
        where: { userId: user.id },
      });
      if (!studentProfile) {
        return [];
      }
      return this.prisma.lesson.findMany({
        where: {
          participants: { some: { studentProfileId: studentProfile.id } },
        },
        orderBy: { startsAt: 'asc' },
        include: LESSON_INCLUDE,
      });
    }

    // admin / parent: return all (admin) or empty (parent) for the MVP slice
    if (user.role === 'admin') {
      return this.prisma.lesson.findMany({
        orderBy: { startsAt: 'asc' },
        include: LESSON_INCLUDE,
      });
    }
    return [];
  }

  async getOne(user: AuthenticatedUser, id: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id },
      include: LESSON_INCLUDE,
    });
    if (!lesson) {
      throw new NotFoundException('Lesson not found');
    }
    await this.assertCanView(user, lesson);
    return lesson;
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateLessonDto) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id } });
    if (!lesson) {
      throw new NotFoundException('Lesson not found');
    }
    const tutorProfile = await this.tutorProfileForUser(user.id);
    if (lesson.tutorProfileId !== tutorProfile.id) {
      throw new ForbiddenException('Not your lesson');
    }

    const startsAt = dto.startsAt ? new Date(dto.startsAt) : lesson.startsAt;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : lesson.endsAt;
    if (endsAt <= startsAt) {
      throw new BadRequestException('endsAt must be after startsAt');
    }

    return this.prisma.lesson.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.startsAt !== undefined ? { startsAt } : {}),
        ...(dto.endsAt !== undefined ? { endsAt } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.meetingUrl !== undefined ? { meetingUrl: dto.meetingUrl } : {}),
      },
      include: LESSON_INCLUDE,
    });
  }

  async book(user: AuthenticatedUser, lessonId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { participants: true },
    });
    if (!lesson) {
      throw new NotFoundException('Lesson not found');
    }
    if (lesson.status !== 'scheduled') {
      throw new BadRequestException('Lesson is not open for booking');
    }
    const studentProfile = await this.studentProfileForUser(user.id);

    const already = lesson.participants.some(
      (p) => p.studentProfileId === studentProfile.id,
    );
    if (already) {
      throw new BadRequestException('Already booked');
    }

    await this.prisma.lessonParticipant.create({
      data: { lessonId, studentProfileId: studentProfile.id },
    });

    return this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: LESSON_INCLUDE,
    });
  }

  async markAttendance(
    user: AuthenticatedUser,
    lessonId: string,
    dto: AttendanceDto,
  ) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: LESSON_INCLUDE,
    });
    if (!lesson) {
      throw new NotFoundException('Lesson not found');
    }
    await this.assertCanView(user, lesson);

    const targetUserId = dto.userId ?? user.id;
    // Only the owning tutor can mark attendance for someone else.
    if (targetUserId !== user.id && user.role !== 'tutor' && user.role !== 'admin') {
      throw new ForbiddenException('Cannot mark attendance for another user');
    }

    const existing = await this.prisma.attendance.findFirst({
      where: { lessonId, userId: targetUserId },
    });
    if (existing) {
      return this.prisma.attendance.update({
        where: { id: existing.id },
        data: { status: dto.status ?? 'present', joinedAt: new Date() },
      });
    }
    return this.prisma.attendance.create({
      data: {
        lessonId,
        userId: targetUserId,
        status: dto.status ?? 'present',
        joinedAt: new Date(),
      },
    });
  }

  private async assertCanView(
    user: AuthenticatedUser,
    lesson: { tutorProfileId: string; participants: { studentProfileId: string }[] },
  ): Promise<void> {
    if (user.role === 'admin') {
      return;
    }
    if (user.role === 'tutor') {
      const tutorProfile = await this.prisma.tutorProfile.findUnique({
        where: { userId: user.id },
      });
      if (tutorProfile && tutorProfile.id === lesson.tutorProfileId) {
        return;
      }
    }
    if (user.role === 'student') {
      const studentProfile = await this.prisma.studentProfile.findUnique({
        where: { userId: user.id },
      });
      if (
        studentProfile &&
        lesson.participants.some(
          (p) => p.studentProfileId === studentProfile.id,
        )
      ) {
        return;
      }
    }
    throw new ForbiddenException('Not allowed to access this lesson');
  }
}
