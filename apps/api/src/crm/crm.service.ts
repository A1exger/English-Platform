import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/types/jwt-payload';
import { AddStudentDto } from './dto/add-student.dto';
import { CreateNoteDto } from './dto/create-note.dto';

@Injectable()
export class CrmService {
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

  /** Ensure the student is enrolled with this tutor. */
  private async assertLinked(tutorProfileId: string, studentProfileId: string) {
    const link = await this.prisma.tutorStudent.findUnique({
      where: {
        tutorProfileId_studentProfileId: { tutorProfileId, studentProfileId },
      },
    });
    if (!link) {
      throw new NotFoundException('Student is not enrolled with you');
    }
    return link;
  }

  async addStudent(user: AuthenticatedUser, dto: AddStudentDto) {
    const tutor = await this.tutorProfileForUser(user.id);
    const studentUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { studentProfile: true },
    });
    if (!studentUser || studentUser.role !== 'student' || !studentUser.studentProfile) {
      throw new BadRequestException('No student account with that email');
    }

    return this.prisma.tutorStudent.upsert({
      where: {
        tutorProfileId_studentProfileId: {
          tutorProfileId: tutor.id,
          studentProfileId: studentUser.studentProfile.id,
        },
      },
      update: { status: 'active' },
      create: {
        tutorProfileId: tutor.id,
        studentProfileId: studentUser.studentProfile.id,
      },
      include: { studentProfile: { include: { user: true } } },
    });
  }

  async listStudents(user: AuthenticatedUser) {
    const tutor = await this.tutorProfileForUser(user.id);
    const links = await this.prisma.tutorStudent.findMany({
      where: { tutorProfileId: tutor.id },
      include: { studentProfile: { include: { user: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return Promise.all(
      links.map(async (link) => {
        const sp = link.studentProfile;
        const [lessonsCount, attendance] = await Promise.all([
          this.prisma.lessonParticipant.count({
            where: { studentProfileId: sp.id },
          }),
          this.prisma.attendance.findMany({
            where: { userId: sp.userId },
            select: { status: true },
          }),
        ]);
        const present = attendance.filter((a) => a.status === 'present').length;
        return {
          studentProfileId: sp.id,
          status: link.status,
          name: `${sp.user.firstName} ${sp.user.lastName}`,
          email: sp.user.email,
          locale: sp.user.locale,
          cefrLevel: sp.cefrLevel,
          balanceCents: sp.balanceCents,
          lessonsCount,
          attendanceRate: attendance.length
            ? Math.round((present / attendance.length) * 100)
            : null,
        };
      }),
    );
  }

  async getStudentCard(user: AuthenticatedUser, studentProfileId: string) {
    const tutor = await this.tutorProfileForUser(user.id);
    await this.assertLinked(tutor.id, studentProfileId);

    const profile = await this.prisma.studentProfile.findUnique({
      where: { id: studentProfileId },
      include: { user: true },
    });
    const [lessons, homework, notes] = await Promise.all([
      this.prisma.lesson.findMany({
        where: {
          tutorProfileId: tutor.id,
          participants: { some: { studentProfileId } },
        },
        orderBy: { startsAt: 'desc' },
      }),
      this.prisma.homework.findMany({
        where: { tutorProfileId: tutor.id, studentProfileId },
        orderBy: { createdAt: 'desc' },
        include: { submissions: { orderBy: { submittedAt: 'desc' } } },
      }),
      this.prisma.tutorNote.findMany({
        where: { tutorProfileId: tutor.id, studentProfileId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return { profile, lessons, homework, notes };
  }

  async addNote(
    user: AuthenticatedUser,
    studentProfileId: string,
    dto: CreateNoteDto,
  ) {
    const tutor = await this.tutorProfileForUser(user.id);
    await this.assertLinked(tutor.id, studentProfileId);
    return this.prisma.tutorNote.create({
      data: { tutorProfileId: tutor.id, studentProfileId, body: dto.body },
    });
  }

  async listNotes(user: AuthenticatedUser, studentProfileId: string) {
    const tutor = await this.tutorProfileForUser(user.id);
    await this.assertLinked(tutor.id, studentProfileId);
    return this.prisma.tutorNote.findMany({
      where: { tutorProfileId: tutor.id, studentProfileId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
