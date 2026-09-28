import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateMeDto } from './dto/update-me.dto';
import { AuthenticatedUser } from '../auth/types/jwt-payload';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  getMe(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        locale: true,
        timezone: true,
        avatarUrl: true,
        isActive: true,
        tutorProfile: true,
        studentProfile: true,
      },
    });
  }

  /**
   * Everything the platform holds about the signed-in person, in one JSON file
   * (GDPR Art. 15 — access, and Art. 20 — portability).
   *
   * Two decisions worth stating, because both are easy to get wrong:
   *
   * A tutor's notes about a student ARE that student's personal data, so a
   * student's export contains them. Art. 15 has no exception for a note being
   * unflattering; the only limit (Art. 15(4)) protects OTHER people's rights,
   * not the author's comfort. Write notes accordingly.
   *
   * Nothing here exposes anyone else. A lesson is listed with its time, title
   * and status but without the other participants, and a tutor's export carries
   * their own account and lessons rather than their students' data — that data
   * belongs to the students, who can ask for it themselves.
   */
  async exportMe(user: AuthenticatedUser) {
    const account = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        locale: true,
        timezone: true,
        avatarUrl: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const [notifications, telegram, transactions, invoices, attendance] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.telegramLink.findMany({ where: { userId: user.id } }),
      this.prisma.transaction.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.invoice.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
      }),
      // Attendance is recorded against the user, not the profile, so it is the
      // same query for a student and for a tutor who marked themselves in.
      this.prisma.attendance.findMany({
        where: { userId: user.id },
        select: { lessonId: true, status: true, joinedAt: true, leftAt: true },
      }),
    ]);

    const student = await this.prisma.studentProfile.findUnique({
      where: { userId: user.id },
    });
    const tutor = await this.prisma.tutorProfile.findUnique({
      where: { userId: user.id },
    });

    const learning = student ? await this.studentExport(student.id) : null;
    const teaching = tutor ? await this.tutorExport(tutor.id) : null;

    return {
      // What this file is, so it can be read years later without this codebase.
      exportedAt: new Date().toISOString(),
      about: 'Personal data held by English Spark Studio about this account.',
      account,
      studentProfile: student,
      tutorProfile: tutor,
      ...(learning ?? {}),
      ...(teaching ?? {}),
      attendance,
      notifications,
      telegram,
      payments: { transactions, invoices },
    };
  }

  private async studentExport(studentProfileId: string) {
    const [
      lessons,
      homework,
      dictionary,
      assignments,
      ledger,
      packages,
      notesAboutMe,
    ] = await Promise.all([
      this.prisma.lessonParticipant.findMany({
        where: { studentProfileId },
        select: {
          bookedAt: true,
          lesson: {
            select: { id: true, title: true, startsAt: true, endsAt: true, status: true },
          },
        },
      }),
      this.prisma.homework.findMany({
        where: { studentProfileId },
        include: { submissions: true },
      }),
      this.prisma.dictionaryEntry.findMany({ where: { studentProfileId } }),
      this.prisma.contentAssignment.findMany({
        where: { studentProfileId },
        include: { result: true },
      }),
      this.prisma.ledgerEntry.findMany({ where: { studentProfileId } }),
      this.prisma.studentPackage.findMany({ where: { studentProfileId } }),
      this.prisma.tutorNote.findMany({
        where: { studentProfileId },
        select: { body: true, createdAt: true },
      }),
    ]);
    return {
      lessons: lessons.map((p) => ({ ...p.lesson, bookedAt: p.bookedAt })),
      homework,
      dictionary,
      assignments,
      balance: { ledger, packages },
      notesWrittenAboutMe: notesAboutMe,
    };
  }

  private async tutorExport(tutorProfileId: string) {
    const [lessons, notesIWrote] = await Promise.all([
      this.prisma.lesson.findMany({
        where: { tutorProfileId },
        select: {
          id: true,
          title: true,
          startsAt: true,
          endsAt: true,
          status: true,
          priceCents: true,
          currency: true,
        },
      }),
      this.prisma.tutorNote.findMany({
        where: { tutorProfileId },
        select: { body: true, createdAt: true },
      }),
    ]);
    return { lessonsTaught: lessons, notesIWrote };
  }

  async updateMe(user: AuthenticatedUser, dto: UpdateMeDto) {
    // Allow changing the login email, enforcing uniqueness.
    if (dto.email !== undefined) {
      const taken = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (taken && taken.id !== user.id) {
        throw new ConflictException('Email already in use');
      }
    }

    const userData = {
      ...(dto.email !== undefined ? { email: dto.email } : {}),
      ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
      ...(dto.lastName !== undefined ? { lastName: dto.lastName } : {}),
      ...(dto.locale !== undefined ? { locale: dto.locale } : {}),
      ...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}),
      ...(dto.avatarUrl !== undefined ? { avatarUrl: dto.avatarUrl } : {}),
    };

    await this.prisma.user.update({
      where: { id: user.id },
      data: userData,
    });

    if (user.role === 'tutor' && (dto.headline !== undefined || dto.bio !== undefined)) {
      await this.prisma.tutorProfile.update({
        where: { userId: user.id },
        data: {
          ...(dto.headline !== undefined ? { headline: dto.headline } : {}),
          ...(dto.bio !== undefined ? { bio: dto.bio } : {}),
        },
      });
    }

    if (
      user.role === 'student' &&
      (dto.cefrLevel !== undefined ||
        dto.goals !== undefined ||
        dto.nativeLanguage !== undefined)
    ) {
      await this.prisma.studentProfile.update({
        where: { userId: user.id },
        data: {
          ...(dto.cefrLevel !== undefined ? { cefrLevel: dto.cefrLevel } : {}),
          ...(dto.goals !== undefined ? { goals: dto.goals } : {}),
          ...(dto.nativeLanguage !== undefined
            ? { nativeLanguage: dto.nativeLanguage }
            : {}),
        },
      });
    }

    return this.getMe(user.id);
  }
}
