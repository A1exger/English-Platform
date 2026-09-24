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

  /**
   * The user ids whose payments count as this tutor's revenue: their own
   * students. A single-tutor platform in practice, but the link is what says
   * whose money it is, so an admin (no tutor profile) sees everyone's.
   */
  private async payerUserIds(tutorProfileId: string): Promise<string[]> {
    const links = await this.prisma.tutorStudent.findMany({
      where: { tutorProfileId },
      select: { studentProfile: { select: { userId: true } } },
    });
    return links.map((l) => l.studentProfile.userId);
  }

  /**
   * KPI overview. Tutors see their own numbers; admins see platform-wide totals.
   */
  async overview(user: AuthenticatedUser) {
    const now = new Date();
    const isAdmin = user.role === 'admin';
    // Scope lessons to the tutor, or leave open ({}) for an admin.
    const tutor = isAdmin ? null : await this.tutorProfileForUser(user.id);
    const scope = tutor ? { tutorProfileId: tutor.id } : {};
    const attendanceScope = tutor ? { lesson: { tutorProfileId: tutor.id } } : {};
    const homeworkScope = tutor ? { tutorProfileId: tutor.id } : {};

    // Current calendar week [Monday 00:00 .. next Monday) for the "this week" stat.
    const weekStart = new Date(now);
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    // Revenue is money the tutor has CONFIRMED receiving — a succeeded "topup"
    // transaction, which is what confirming a transfer (or a card webhook)
    // writes. It used to be the price of every completed lesson, which counted
    // a lesson as income the moment it was taught, whether or not the student
    // had paid for it, and a lesson taught on credit looked exactly like one
    // paid up front.
    const payerIds = tutor ? await this.payerUserIds(tutor.id) : null;
    const paid = {
      type: 'topup',
      status: 'succeeded',
      ...(payerIds ? { userId: { in: payerIds } } : {}),
    };
    // Two years of months: the chart shows up to twelve and compares them with
    // the twelve before, so that is as far back as it can ask.
    const seriesFrom = new Date(now.getFullYear(), now.getMonth() - 23, 1);

    const [
      completedLessons,
      upcomingLessons,
      activeStudents,
      attendance,
      trialLessons,
      lessonsThisWeek,
      homeworks,
      paidTotal,
      paidPayments,
    ] = await Promise.all([
      this.prisma.lesson.findMany({
        where: { ...scope, status: 'completed' },
        select: { priceCents: true },
      }),
      this.prisma.lesson.count({
        where: { ...scope, status: 'scheduled', startsAt: { gte: now } },
      }),
      isAdmin
        ? this.prisma.studentProfile.count()
        : this.prisma.tutorStudent.count({
            where: { tutorProfileId: tutor!.id, status: 'active' },
          }),
      this.prisma.attendance.findMany({
        where: attendanceScope,
        select: { status: true },
      }),
      this.prisma.lesson.findMany({
        where: { ...scope, type: 'trial' },
        select: { participants: { select: { studentProfileId: true } } },
      }),
      // Teaching hours booked this week (excludes cancelled / no-show).
      this.prisma.lesson.findMany({
        where: {
          ...scope,
          status: { in: ['scheduled', 'completed'] },
          startsAt: { gte: weekStart, lt: weekEnd },
        },
        select: { startsAt: true, endsAt: true },
      }),
      this.prisma.homework.findMany({
        where: homeworkScope,
        select: { status: true },
      }),
      this.prisma.transaction.aggregate({ where: paid, _sum: { amountCents: true } }),
      this.prisma.transaction.findMany({
        where: { ...paid, createdAt: { gte: seriesFrom } },
        select: { amountCents: true, createdAt: true },
      }),
    ]);

    const revenueCents = paidTotal._sum.amountCents ?? 0;
    // One bucket per month, so a month with no payments is a gap in the chart
    // rather than a missing column.
    const revenueMonths = Array.from({ length: 24 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 23 + i, 1);
      return { month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, amountCents: 0 };
    });
    const monthIndex = new Map(revenueMonths.map((b, i) => [b.month, i]));
    for (const p of paidPayments) {
      const key = `${p.createdAt.getFullYear()}-${String(p.createdAt.getMonth() + 1).padStart(2, '0')}`;
      const i = monthIndex.get(key);
      if (i !== undefined) revenueMonths[i].amountCents += p.amountCents;
    }
    const weekMs = lessonsThisWeek.reduce(
      (s, l) => s + (l.endsAt.getTime() - l.startsAt.getTime()),
      0,
    );
    const hoursThisWeek = Math.round((weekMs / 3_600_000) * 10) / 10;
    const gradedHw = homeworks.filter((h) => h.status === 'graded').length;
    const assignmentsGradedPct = homeworks.length
      ? Math.round((gradedHw / homeworks.length) * 100)
      : null;
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
        where: { ...scope, type: { not: 'trial' }, participants: { some: { studentProfileId } } },
      });
      if (paid > 0) converted += 1;
    }
    const trialConversionRate = trialStudentIds.size
      ? Math.round((converted / trialStudentIds.size) * 100)
      : null;

    return {
      revenueCents,
      revenueMonths,
      currency: tutor?.currency ?? 'EUR',
      lessonsCompleted: completedLessons.length,
      lessonsUpcoming: upcomingLessons,
      activeStudents,
      hoursThisWeek,
      assignmentsGradedPct,
      attendanceRate,
      trialConversionRate,
    };
  }

  /** Learning progress + achievements for the signed-in student. */
  async progress(user: AuthenticatedUser) {
    const student = await this.prisma.studentProfile.findUnique({
      where: { userId: user.id },
    });
    if (!student) {
      return {
        cefrLevel: null,
        lessonsCompleted: 0,
        lessonsUpcoming: 0,
        attendanceRate: null,
        homeworkGraded: 0,
        achievements: [],
      };
    }
    const now = new Date();
    const [lessonsCompleted, lessonsUpcoming, attendance, homeworkGraded] =
      await Promise.all([
        this.prisma.lesson.count({
          where: {
            status: 'completed',
            participants: { some: { studentProfileId: student.id } },
          },
        }),
        this.prisma.lesson.count({
          where: {
            status: 'scheduled',
            startsAt: { gte: now },
            participants: { some: { studentProfileId: student.id } },
          },
        }),
        this.prisma.attendance.findMany({
          where: { userId: user.id },
          select: { status: true },
        }),
        this.prisma.homework.count({
          where: { studentProfileId: student.id, status: 'graded' },
        }),
      ]);

    const present = attendance.filter((a) => a.status === 'present').length;
    const attendanceRate = attendance.length
      ? Math.round((present / attendance.length) * 100)
      : null;

    // Simple achievement badges derived from activity.
    const achievements: { key: string; earned: boolean }[] = [
      { key: 'first_lesson', earned: lessonsCompleted >= 1 },
      { key: 'five_lessons', earned: lessonsCompleted >= 5 },
      { key: 'ten_lessons', earned: lessonsCompleted >= 10 },
      { key: 'homework_hero', earned: homeworkGraded >= 5 },
      { key: 'perfect_attendance', earned: attendance.length >= 5 && attendanceRate === 100 },
    ];

    return {
      cefrLevel: student.cefrLevel,
      lessonsCompleted,
      lessonsUpcoming,
      attendanceRate,
      homeworkGraded,
      achievements,
    };
  }
}
