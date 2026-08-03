import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const USER_SELECT = {
  id: true,
  email: true,
  role: true,
  firstName: true,
  lastName: true,
  locale: true,
  isActive: true,
  createdAt: true,
} as const;

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  listUsers() {
    return this.prisma.user.findMany({
      select: USER_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async createUser(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);
    return this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        role: dto.role,
        firstName: dto.firstName,
        lastName: dto.lastName,
        locale: dto.locale ?? 'en',
        ...(dto.role === 'tutor' ? { tutorProfile: { create: {} } } : {}),
        ...(dto.role === 'student' ? { studentProfile: { create: {} } } : {}),
      },
      select: USER_SELECT,
    });
  }

  /**
   * Edit another account. Changing the role provisions the matching profile if
   * it does not exist yet (an account promoted to tutor needs a TutorProfile
   * before it can own courses or lessons); the old profile is left in place so
   * its history is never destroyed by a role change.
   */
  async updateUser(currentUserId: string, id: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { tutorProfile: true, studentProfile: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (dto.email && dto.email !== user.email) {
      const taken = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (taken) {
        throw new ConflictException('Email already registered');
      }
    }
    // Guard against an admin locking themselves out of the admin area.
    if (id === currentUserId) {
      if (dto.role && dto.role !== user.role) {
        throw new BadRequestException('You cannot change your own role');
      }
      if (dto.isActive === false) {
        throw new BadRequestException('You cannot deactivate your own account');
      }
    }

    const role = dto.role ?? user.role;
    return this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.role !== undefined ? { role: dto.role } : {}),
        ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
        ...(dto.lastName !== undefined ? { lastName: dto.lastName } : {}),
        ...(dto.locale !== undefined ? { locale: dto.locale } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.password ? { passwordHash: await bcrypt.hash(dto.password, 10) } : {}),
        ...(role === 'tutor' && !user.tutorProfile ? { tutorProfile: { create: {} } } : {}),
        ...(role === 'student' && !user.studentProfile
          ? { studentProfile: { create: {} } }
          : {}),
      },
      select: USER_SELECT,
    });
  }

  async deleteUser(currentUserId: string, id: string) {
    if (id === currentUserId) {
      throw new BadRequestException('You cannot delete your own account');
    }
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    await this.prisma.user.delete({ where: { id } });
    return { deleted: true };
  }
}
