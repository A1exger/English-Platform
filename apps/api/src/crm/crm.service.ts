import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/types/jwt-payload';
import { AddStudentDto } from './dto/add-student.dto';
import { CreateStudentDto } from './dto/create-student.dto';
import { CreateNoteDto } from './dto/create-note.dto';
import { UpdateStudentDto } from './dto/update-student.dto';

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

  /** Ensure the student is enrolled with this tutor (admins skip this). */
  private async assertAccess(user: AuthenticatedUser, studentProfileId: string) {
    // Single-tutor platform: the tutor (and any admin) may open any student.
    if (user.role === 'admin' || user.role === 'tutor') {
      return;
    }
    void studentProfileId;
    throw new NotFoundException('Student not accessible');
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

  /** All students (for assigning homework/lessons to anyone). */
  listAllStudents() {
    return this.prisma.studentProfile
      .findMany({ include: { user: true }, orderBy: { id: 'desc' } })
      .then((profiles) =>
        profiles.map((sp) => ({
          studentProfileId: sp.id,
          name: `${sp.user.firstName} ${sp.user.lastName}`,
          email: sp.user.email,
        })),
      );
  }

  /** Create a new student account. A tutor also auto-enrolls the new student. */
  async createStudent(user: AuthenticatedUser, dto: CreateStudentDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const created = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        role: 'student',
        firstName: dto.firstName,
        lastName: dto.lastName,
        locale: dto.locale ?? 'en',
        studentProfile: { create: {} },
      },
      include: { studentProfile: true },
    });
    if (user.role === 'tutor') {
      const tutor = await this.prisma.tutorProfile.findUnique({
        where: { userId: user.id },
      });
      if (tutor) {
        await this.prisma.tutorStudent.create({
          data: { tutorProfileId: tutor.id, studentProfileId: created.studentProfile!.id },
        });
      }
    }
    return { studentProfileId: created.studentProfile!.id, email: created.email };
  }

  /** Tutor: unenroll a student. Admin: delete the student account entirely. */
  async removeStudent(user: AuthenticatedUser, studentProfileId: string) {
    const profile = await this.prisma.studentProfile.findUnique({
      where: { id: studentProfileId },
    });
    if (!profile) {
      throw new NotFoundException('Student not found');
    }
    if (user.role === 'admin') {
      await this.prisma.user.delete({ where: { id: profile.userId } });
      return { deleted: true };
    }
    const tutor = await this.tutorProfileForUser(user.id);
    await this.prisma.tutorStudent.deleteMany({
      where: { tutorProfileId: tutor.id, studentProfileId },
    });
    return { unenrolled: true };
  }

  async listStudents(user: AuthenticatedUser) {
    // Single-tutor platform: staff (the tutor and any admin) see every student.
    void user;
    const profiles = await this.prisma.studentProfile.findMany({
      include: { user: true },
      orderBy: { id: 'desc' },
    });

    return Promise.all(
      profiles.map(async (sp) => {
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
          name: `${sp.user.firstName} ${sp.user.lastName}`,
          email: sp.user.email,
          locale: sp.user.locale,
          country: sp.country,
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
    await this.assertAccess(user, studentProfileId);

    const profile = await this.prisma.studentProfile.findUnique({
      where: { id: studentProfileId },
      include: { user: true },
    });
    if (!profile) {
      throw new NotFoundException('Student not found');
    }

    // Single-tutor platform: staff see the student's full lessons/homework/notes.
    const scope = {};

    const [lessons, homework, notes] = await Promise.all([
      this.prisma.lesson.findMany({
        where: { ...scope, participants: { some: { studentProfileId } } },
        orderBy: { startsAt: 'desc' },
      }),
      this.prisma.homework.findMany({
        where: { ...scope, studentProfileId },
        orderBy: { createdAt: 'desc' },
        include: { submissions: { orderBy: { submittedAt: 'desc' } } },
      }),
      this.prisma.tutorNote.findMany({
        where: { ...scope, studentProfileId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return { profile, lessons, homework, notes };
  }

  /** Edit a student's profile + name (tutor for their students, admin for any). */
  async updateStudent(
    user: AuthenticatedUser,
    studentProfileId: string,
    dto: UpdateStudentDto,
  ) {
    await this.assertAccess(user, studentProfileId);
    const profile = await this.prisma.studentProfile.findUnique({
      where: { id: studentProfileId },
    });
    if (!profile) {
      throw new NotFoundException('Student not found');
    }

    if (dto.firstName !== undefined || dto.lastName !== undefined) {
      await this.prisma.user.update({
        where: { id: profile.userId },
        data: {
          ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
          ...(dto.lastName !== undefined ? { lastName: dto.lastName } : {}),
        },
      });
    }

    await this.prisma.studentProfile.update({
      where: { id: studentProfileId },
      data: {
        ...(dto.cefrLevel !== undefined ? { cefrLevel: dto.cefrLevel } : {}),
        ...(dto.goals !== undefined ? { goals: dto.goals } : {}),
        ...(dto.nativeLanguage !== undefined
          ? { nativeLanguage: dto.nativeLanguage }
          : {}),
        ...(dto.country !== undefined ? { country: dto.country } : {}),
        ...(dto.address !== undefined ? { address: dto.address } : {}),
        ...(dto.birthDate !== undefined
          ? { birthDate: dto.birthDate ? new Date(dto.birthDate) : null }
          : {}),
      },
    });

    return this.prisma.studentProfile.findUnique({
      where: { id: studentProfileId },
      include: { user: true },
    });
  }

  async addNote(
    user: AuthenticatedUser,
    studentProfileId: string,
    dto: CreateNoteDto,
  ) {
    const tutor = await this.tutorProfileForUser(user.id);
    await this.assertAccess(user, studentProfileId);
    return this.prisma.tutorNote.create({
      data: { tutorProfileId: tutor.id, studentProfileId, body: dto.body },
    });
  }

  async listNotes(user: AuthenticatedUser, studentProfileId: string) {
    await this.assertAccess(user, studentProfileId);
    const tutor =
      user.role === 'tutor' ? await this.tutorProfileForUser(user.id) : null;
    return this.prisma.tutorNote.findMany({
      where: { ...(tutor ? { tutorProfileId: tutor.id } : {}), studentProfileId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
