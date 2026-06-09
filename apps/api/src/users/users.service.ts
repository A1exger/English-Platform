import { Injectable } from '@nestjs/common';
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

  async updateMe(user: AuthenticatedUser, dto: UpdateMeDto) {
    const userData = {
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
