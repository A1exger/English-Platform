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

    const [
      completedLessons,
      upcomingLessons,
      activeStudents,
      attendance,
      trialLessons,
      lessonsThisWeek,
      homeworks,
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
    ]);

    const revenueCents = completedLessons.reduce((s, l) => s + l.priceCents, 0);
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
