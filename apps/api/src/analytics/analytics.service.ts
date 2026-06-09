import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/types/jwt-payload';

@Injectable()
export class AnalyticsService {
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

  /** KPI overview for the tutor dashboard. */
  async overview(user: AuthenticatedUser) {
    const tutor = await this.tutorProfileForUser(user.id);
    const now = new Date();

    const [
      completedLessons,
      upcomingLessons,
      activeStudents,
      attendance,
      trialLessons,
    ] = await Promise.all([
      this.prisma.lesson.findMany({
        where: { tutorProfileId: tutor.id, status: 'completed' },
        select: { priceCents: true },
      }),
      this.prisma.lesson.count({
        where: {
          tutorProfileId: tutor.id,
          status: 'scheduled',
          startsAt: { gte: now },
        },
      }),
      this.prisma.tutorStudent.count({
        where: { tutorProfileId: tutor.id, status: 'active' },
      }),
      this.prisma.attendance.findMany({
        where: { lesson: { tutorProfileId: tutor.id } },
        select: { status: true },
      }),
      this.prisma.lesson.findMany({
        where: { tutorProfileId: tutor.id, type: 'trial' },
        select: { participants: { select: { studentProfileId: true } } },
      }),
    ]);

    const revenueCents = completedLessons.reduce((s, l) => s + l.priceCents, 0);
    const present = attendance.filter((a) => a.status === 'present').length;
    const attendanceRate = attendance.length
      ? Math.round((present / attendance.length) * 100)
      : null;

    // Conversion = share of trial students who later took a paid (non-trial) lesson.
    const trialStudentIds = new Set<string>();
    for (const t of trialLessons) {
      for (const p of t.participants) trialStudentIds.add(p.studentProfileId);
    }
    let converted = 0;
    for (const studentProfileId of trialStudentIds) {
      const paid = await this.prisma.lesson.count({
        where: {
          tutorProfileId: tutor.id,
          type: { not: 'trial' },
          participants: { some: { studentProfileId } },
        },
      });
      if (paid > 0) converted += 1;
    }
    const trialConversionRate = trialStudentIds.size
      ? Math.round((converted / trialStudentIds.size) * 100)
      : null;

    return {
      revenueCents,
      currency: tutor.currency,
      lessonsCompleted: completedLessons.length,
      lessonsUpcoming: upcomingLessons,
      activeStudents,
      attendanceRate,
      trialConversionRate,
    };
  }
}
